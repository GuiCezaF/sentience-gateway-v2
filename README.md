# Sentience Gateway

Porta de entrada central do Sentience: recebe as Sincronizações do Agente, autentica o Usuário e guarda Classificações e Saúde para consumo posterior. Não classifica nada e nunca recebe imagem.

## Variáveis de ambiente

A subida valida o ambiente com Zod e falha imediatamente se alguma variável estiver ausente ou inválida, nomeando o que está errado. Valores do `.env` prevalecem sobre variáveis já presentes no processo (por exemplo um `PORT` herdado do shell).

Copie o exemplo e preencha os valores reais:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Default | Papel |
| --- | --- | --- | --- |
| `NODE_ENV` | não | `development` | `development`, `test` ou `production`. Em `production` o log sai em JSON. |
| `PORT` | não | `3000` | Porta HTTP (1–65535). |
| `DATABASE_URL` | sim | — | URL Postgres (`postgres` ou `postgresql`). |
| `DB_SCHEMA` | não | `gateway` | Schema dedicado (`^[a-z_][a-z0-9_]*$`). |
| `SUPABASE_URL` | sim | — | URL do projeto Supabase (`http` ou `https`); barra final é removida. |
| `MAX_SYNC_ITEMS` | não | `10000` | Teto de Classificações por Sincronização. |
| `BODY_LIMIT` | não | `5mb` | Limite do body JSON (formato body-parser: `5mb`, `100kb`, …). |

Comentários e valores de exemplo estão em `.env.example`.

## Como rodar

```bash
bun install
cp .env.example .env
bun run start:dev
```

Liveness: `GET /healthz` → `{"status":"ok"}` (fora do prefixo `/v1`, sem acesso ao banco).

## Contrato da API: `POST /v1/syncs`

Recebe Sincronizações enviadas pelo Agente, autentica o Usuário via `AuthProvider` e registra os dados em banco.

### Headers

| Header | Obrigatório | Formato / Descrição |
| --- | --- | --- |
| `Authorization` | sim | `Bearer <token>`. Padrão: access token emitido pelo Supabase Auth (JWT ES256). Em testes e desenvolvimento local com `AUTH_PROVIDER=fake`: `Bearer user:<uuid>`. |
| `Content-Type` | sim | `application/json` |

### Autenticação Real com Supabase Auth (ADR 0002)

O Gateway valida access tokens do Supabase Auth localmente contra o endpoint JWKS (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), exigindo assinatura assimétrica ES256, issuer `${SUPABASE_URL}/auth/v1` e audience `authenticated`. O `user_id` associado às Sincronizações e Classificações é extraído do claim `sub`.

#### Verificação manual com usuário real do Supabase

1. Obtenha um access token via REST API de Auth do projeto Supabase (com as credenciais de um usuário de teste criado no Supabase Auth):

```bash
curl -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario-teste@exemplo.com",
    "password": "senha-do-usuario"
  }'
```

A resposta conterá `access_token` e o objeto de usuário com o `id` (`sub`).

2. Envie um Pulso para o Gateway com o token real:

```bash
curl -X POST http://localhost:3000/v1/syncs \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "inst-teste",
    "sent_at": "2026-09-15T20:00:00.000Z",
    "health": "ok",
    "items": []
  }'
```

O Gateway responderá `201 Created` e registrará a Sincronização no banco com `user_id` correspondente ao `sub` do token.

#### Pendência do Agente

> [!NOTE]
> O Agente (Sentience App) ainda não implementa login no Supabase Auth nem o envio do header `Authorization: Bearer <access_token>` com renovação automática de sessão (refresh token).
>
> Até que essa pendência seja implementada no Agente, a execução ponta a ponta integrada depende de `AUTH_PROVIDER=fake` ou de tokens obtidos manualmente como exemplificado acima.

### Corpo da requisição (Envelope)

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `subject_id` | string (1–128) | sim | Identificador opaco da Instalação do Agente. |
| `sent_at` | string (ISO UTC com `Z`) | sim | Instante do envio (ex: `2026-09-15T20:00:00.000Z`). Offsets numéricos (como `+00:00`) são rejeitados. |
| `health` | string | sim | Condição operacional da Instalação: `ok`, `camera` ou `model`. |
| `items` | array | sim | Lista de Classificações (máximo: `MAX_SYNC_ITEMS`, padrão 10 000). Vazio no caso de Pulso. |

#### Item (`items[]`)

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `classification_id` | string (UUID) | sim | Identificador único da Classificação. |
| `occurred_at` | string (ISO UTC com `Z`) | sim | Instante em que a expressão ocorreu. Offsets numéricos são rejeitados. |
| `emotion` | string | sim | Emoção reconhecida: `angry`, `happy`, `neutral` ou `sad`. |

### Respostas e Códigos HTTP

- **`201 Created`**: Sincronização aceita e registrada. Devolve o recibo:
  ```json
  {
    "syncId": "s0000000-0000-0000-0000-000000000001",
    "health": "ok",
    "receivedCount": 0,
    "insertedCount": 0,
    "duplicateCount": 0
  }
  ```
- **`400 Bad Request`**: Envelope ou itens inválidos (ex: data sem `Z`, UUID malformado, emoção/saúde desconhecida, teto de itens excedido). Retorna `{ statusCode: 400, message: "Validation failed", issues: [...] }`.
- **`401 Unauthorized`**: Header `Authorization` ausente, malformado ou recusado pelo `AuthProvider`. Nenhuma operação é feita no banco.
- **`413 Payload Too Large`**: Corpo da requisição excede o limite configurado em `BODY_LIMIT` (padrão 5 MB).

### Exemplo: Pulso

Um Pulso é uma Sincronização sem Classificações (`items: []`), indicando que o Agente está ativo e reportando a Saúde da Instalação:

```bash
curl -X POST http://localhost:3000/v1/syncs \
  -H "Authorization: Bearer user:a0000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "inst-123",
    "sent_at": "2026-09-15T20:00:00.000Z",
    "health": "ok",
    "items": []
  }'
```

### Exemplo: Lote

Uma Sincronização com Classificações reconhecidas pelo Agente:

```bash
curl -X POST http://localhost:3000/v1/syncs \
  -H "Authorization: Bearer user:a0000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "inst-123",
    "sent_at": "2026-09-15T20:00:00.000Z",
    "health": "ok",
    "items": [
      {
        "classification_id": "b0000000-0000-4000-8000-000000000001",
        "occurred_at": "2026-09-15T19:59:30.000Z",
        "emotion": "happy"
      },
      {
        "classification_id": "b0000000-0000-4000-8000-000000000002",
        "occurred_at": "2026-09-15T19:59:45.000Z",
        "emotion": "neutral"
      }
    ]
  }'
```

Resposta 201:
```json
{
  "syncId": "s0000000-0000-0000-0000-000000000001",
  "health": "ok",
  "receivedCount": 2,
  "insertedCount": 2,
  "duplicateCount": 0
}
```

### Duplicatas e Idempotência (ADR 0003)

O Agente envia em regime at-least-once: se uma requisição anterior falhou por timeout ou rede, o Agente reenviará o Lote na tentativa seguinte com um novo `sent_at`. O Gateway garante unicidade por `(user_id, classification_id)`. Quando recebe uma Classificação já gravada:
- A linha existente não é alterada nem sobrescrita.
- A Classificação repetida é contabilizada em `duplicateCount`.
- O Gateway responde **`201 Created`**, nunca erro (evita que a fila do Agente trave).
- Duplicatas dentro do mesmo Lote (`items[]` com o mesmo `classification_id`) também são absorvidas silenciosamente e contadas em `duplicateCount`.

### Limites e Datas

- **Teto de Classificações (`MAX_SYNC_ITEMS`)**: padrão 10 000 itens. Se excedido, o Gateway responde `400 Bad Request` sem gravar nada no banco.
- **Tamanho do corpo (`BODY_LIMIT`)**: padrão 5 MB. Se excedido, o Gateway responde `413 Payload Too Large`.
- **Sem validação semântica de datas**: `sent_at` no futuro ou `occurred_at > sent_at` são aceitos. Relógios de desktop desajustados não podem impedir a sincronização de dados.
- **Evolução de Emoções**: `emotion` é validada como enum no contrato Zod e persistida como `text` no banco. Uma nova Emoção entra **primeiro** no Gateway e só depois no Agente, sem exigir migration no banco.



## Migrations

O banco é gerenciado pelo Drizzle ORM com migrations SQL versionadas.

### Fluxo: alterar o schema

1. Edite as tabelas em `src/db/schema.ts`
2. Gere a migration: `bun run db:generate`
3. Aplique ao banco: `bun run db:migrate`

### Regras

- **Nunca edite tabelas pelo dashboard do Supabase.** Toda alteração passa pelo Drizzle e por migrations versionadas.
- O schema Postgres usado é definido por `DB_SCHEMA` (default: `gateway`).
- Migrations rodam como passo explícito (`db:migrate`), nunca no boot da aplicação.
- Para preparar o schema de testes: `DB_SCHEMA=test bun run db:migrate`

## Scripts

| Script | O que faz |
| --- | --- |
| `bun run start` | Sobe a fonte com Bun (`src/main.ts`). |
| `bun run start:dev` | Sobe com reload (`bun --watch`). |
| `bun run start:debug` | Sobe com inspector e reload. |
| `bun run build` | Type-check (`tsc --noEmit`). Não emite `dist`. |
| `bun run db:generate` | Gera migration SQL a partir do schema Drizzle. |
| `bun run db:migrate` | Aplica migrations ao schema `DB_SCHEMA`. |
| `bun run test` | Testes unitários (sem rede). |
| `bun run test:e2e` | Testes e2e. Exige `.env`. |
| `bun run test:cov` | Unitários com cobertura. |
| `bun run lint` | Oxlint em `src/` e `test/`. |
| `bun run format` | Prettier em `src/` e `test/`. |

