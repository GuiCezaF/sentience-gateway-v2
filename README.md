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
| `SUPABASE_SERVICE_ROLE_KEY` | sim | — | Chave de serviço (secret/service_role) do Supabase para administração de usuários via REST. |
| `AUTH_PROVIDER` | não | — | Provedor de autenticação: omitir = Supabase real | `fake` = FakeAuthProvider (desenvolvimento/testes). |
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
| `Authorization` | sim | `Bearer <token>`. Padrão: access token emitido pelo Supabase Auth (JWT ES256) obtido via `POST /v1/auth/login`. Em testes e desenvolvimento local com `AUTH_PROVIDER=fake`: `Bearer user:<uuid>`. |
| `Content-Type` | sim | `application/json` |

### Autenticação Real com Supabase Auth (ADR 0002 e ADR 0009)

O Gateway valida access tokens do Supabase Auth localmente contra o endpoint JWKS (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), exigindo assinatura assimétrica ES256, issuer `${SUPABASE_URL}/auth/v1` e audience `authenticated`. O `user_id` associado às Sincronizações e Classificações é extraído do claim `sub`.

Conforme o [ADR 0009](docs/adr/0009-autenticacao-centralizada-no-gateway.md), clientes nunca devem conhecer nem acessar diretamente a infraestrutura ou credenciais do Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). O Gateway é a porta de entrada única de autenticação (BFF).

#### Verificação manual com usuário real

1. Obtenha um access token autenticando-se diretamente na API do Gateway:

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario-teste@exemplo.com",
    "password": "senha-do-usuario"
  }'
```

A resposta conterá `accessToken`, `refreshToken`, `tokenType`, `expiresIn` e o perfil do usuário em `camelCase`.

2. Envie um Pulso para o Gateway com o token obtido:

```bash
curl -X POST http://localhost:3000/v1/syncs \
  -H "Authorization: Bearer <accessToken>" \
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
> O Agente (Sentience App) ainda não implementa autenticação via Gateway (`POST /v1/auth/login`) nem o envio do header `Authorization: Bearer <accessToken>` com renovação automática de sessão via Gateway (`POST /v1/auth/refresh`).
>
> Até que essa pendência seja implementada no Agente, a execução ponta a ponta integrada depende de `AUTH_PROVIDER=fake` ou de tokens obtidos via Gateway (`POST /v1/auth/login`) como exemplificado acima.

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

---

## Contrato da API: `/v1/auth`

Ponto centralizado de autenticação no Gateway (ADR 0009). Permite que o Portal e o Agente realizem login e obtenham sessões sem conhecer a infraestrutura ou as credenciais do Supabase Auth.

### `POST /v1/auth/login`

Valida credenciais (`email` e `password`) no Supabase Auth via REST, enriquece com os dados locais do Usuário (`gateway.users`), Papéis (`gateway.user_roles`) e Empresa (`gateway.companies`), e retorna os tokens e o perfil de negócio em padrão `camelCase`.

- **Autenticação**: Pública (não exige token).
- **Rastreabilidade**: O cabeçalho `X-Forwarded-For` com o IP original do cliente é automaticamente repassado ao Supabase Auth para auditoria e controle de taxa upstream.
- **Prevenção de Enumeração**: Credenciais inválidas (email inexistente, senha incorreta ou usuário sem cadastro no banco local) retornam sempre `401 Unauthorized` genérico (`{"statusCode": 401, "message": "Invalid email or password"}`).
- **Bloqueio de Inativos**: Usuários com `status !== 'active'` são bloqueados com `403 Forbidden` (`{"error": "user_inactive"}`).
- **Primeiro Acesso**: Usuários criados recentemente com `mustChangePassword: true` realizam login com sucesso (`200 OK`) e recebem seus tokens normais acompanhados da flag `mustChangePassword: true`. O Portal deve direcioná-los para a tela de primeiro acesso (`PATCH /v1/users/me/password`).

**Headers**:
| Header | Obrigatório | Descrição |
| --- | --- | --- |
| `Content-Type` | sim | `application/json` |
| `X-Forwarded-For` | não | IP original do cliente repassado para auditoria no Supabase Auth. |

**Exemplo de requisição**:
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 203.0.113.195" \
  -d '{
    "email": "maria@exemplo.com.br",
    "password": "SenhaDoUsuario123!"
  }'
```

**Corpo da requisição (`application/json`)**:
```json
{
  "email": "maria@exemplo.com.br",
  "password": "SenhaDoUsuario123!"
}
```

**Resposta `200 OK`**:
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "refresh-token-...",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": {
    "id": "u0000000-0000-0000-0000-000000000001",
    "authId": "a0000000-0000-0000-0000-000000000001",
    "companyId": "c0000000-0000-0000-0000-000000000001",
    "name": "Maria Silva",
    "email": "maria@exemplo.com.br",
    "cpf": "52998224725",
    "status": "active",
    "mustChangePassword": false,
    "roles": ["company_admin"],
    "company": {
      "id": "c0000000-0000-0000-0000-000000000001",
      "cnpj": "12ABC34501DE35",
      "legalName": "Empresa Exemplo Ltda",
      "emailDomain": "exemplo.com.br"
    },
    "createdAt": "2026-09-15T20:00:00.000Z",
    "updatedAt": "2026-09-15T20:00:00.000Z"
  }
}
```

**Respostas e Códigos de Erro**:
- **`400 Bad Request`**: Corpo inválido (email malformado ou campos obrigatórios ausentes). Retorna `{"statusCode": 400, "message": "Validation failed", "issues": [...]}`.
- **`401 Unauthorized`**: Email ou senha incorretos, ou usuário não registrado no banco local. Retorna `{"statusCode": 401, "message": "Invalid email or password"}`.
- **`403 Forbidden`**: Usuário inativo no sistema. Retorna `{"error": "user_inactive"}`.

### `POST /v1/auth/refresh`

Renova a sessão do Usuário junto ao Supabase Auth a partir de um `refreshToken` válido, revalida se o usuário permanece com status ativo no banco local (`gateway.users`), e retorna o novo par de tokens em padrão `camelCase`.

- **Autenticação**: Pública (não exige token no header; o `refreshToken` no corpo atesta a identidade).
- **Rastreabilidade**: O cabeçalho `X-Forwarded-For` com o IP original do cliente é automaticamente repassado ao Supabase Auth para auditoria e controle de taxa upstream.
- **Rejeição de Token Inválido**: Tokens de refresh inválidos, expirados ou pertencentes a usuários não registrados no banco local retornam `401 Unauthorized` (`{"statusCode": 401, "message": "Invalid or expired refresh token"}`).
- **Bloqueio de Inativos**: Se o usuário foi desativado (`status !== 'active'`) após o login, o Gateway aborta a renovação e responde `403 Forbidden` (`{"error": "user_inactive"}`).

**Headers**:
| Header | Obrigatório | Descrição |
| --- | --- | --- |
| `Content-Type` | sim | `application/json` |
| `X-Forwarded-For` | não | IP original do cliente repassado para auditoria no Supabase Auth. |

**Exemplo de requisição**:
```bash
curl -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 203.0.113.195" \
  -d '{
    "refreshToken": "refresh-token-..."
  }'
```

**Corpo da requisição (`application/json`)**:
```json
{
  "refreshToken": "refresh-token-..."
}
```

**Resposta `200 OK`**:
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "new-refresh-token-...",
  "tokenType": "bearer",
  "expiresIn": 3600
}
```

**Respostas e Códigos de Erro**:
- **`400 Bad Request`**: Corpo inválido (`refreshToken` ausente ou vazio). Retorna `{"statusCode": 400, "message": "Validation failed", "issues": [...]}`.
- **`401 Unauthorized`**: Token de refresh inválido, expirado ou não encontrado. Retorna `{"statusCode": 401, "message": "Invalid or expired refresh token"}`.
- **`403 Forbidden`**: Usuário inativo no sistema (`status !== 'active'`). Retorna `{"error": "user_inactive"}`.

---

## Contrato da API: `/v1/companies`


Gerenciamento de Empresas e seus Donos, restrito a usuários com o papel `super_admin`.

### `POST /v1/companies`

Cria atomicamente uma nova Empresa e seu respectivo Usuário Dono (`company_admin`).

- **Autenticação**: `Bearer <token>` de um usuário com papel `super_admin`.
- **Validação de CNPJ**: Aceita formato de 14 caracteres alfanuméricos (`12 posições [A-Z0-9] + 2 DVs [0-9]`) conforme IN RFB nº 2.229/2024 ou numérico tradicional, validado via Módulo 11 (ASCII-48).
- **Validação de CPF**: 11 dígitos numéricos com validação oficial de Módulo 11.
- **Domínio Corporativo**: O email do Dono obrigatoriamente deve pertencer ao `email_domain` informado. Se for diferente, retorna `422 Unprocessable Entity`.
- **Unicidade de CNPJ**: Se o CNPJ já estiver cadastrado, retorna `409 Conflict`.
- **Saga e Compensação**: O usuário é criado no Supabase Auth via REST API (`/auth/v1/admin/users`) com uma senha temporária segura de 10 caracteres e persistido no banco de dados local. Em caso de falha no banco, a criação no Supabase Auth é desfeita automaticamente (compensação de saga).

**Corpo da requisição (`application/json`)**:
```json
{
  "cnpj": "12ABC34501DE35",
  "legal_name": "Empresa Exemplo Ltda",
  "email_domain": "exemplo.com.br",
  "owner": {
    "name": "Maria Silva",
    "email": "maria@exemplo.com.br",
    "cpf": "52998224725"
  }
}
```

**Resposta `201 Created`**:
```json
{
  "company": {
    "id": "c0000000-0000-0000-0000-000000000001",
    "cnpj": "12ABC34501DE35",
    "legal_name": "Empresa Exemplo Ltda",
    "email_domain": "exemplo.com.br",
    "created_at": "2026-09-15T20:00:00.000Z"
  },
  "owner": {
    "id": "u0000000-0000-0000-0000-000000000001",
    "auth_id": "a0000000-0000-0000-0000-000000000001",
    "name": "Maria Silva",
    "email": "maria@exemplo.com.br",
    "cpf": "52998224725",
    "role": "company_admin"
  },
  "temporary_password": "xK9pL2mQ8w"
}
```

### `GET /v1/companies`

Lista todas as empresas cadastradas no sistema. Exige autenticação com papel `super_admin`.

**Resposta `200 OK`**:
```json
[
  {
    "id": "c0000000-0000-0000-0000-000000000001",
    "cnpj": "12ABC34501DE35",
    "legal_name": "Empresa Exemplo Ltda",
    "email_domain": "exemplo.com.br",
    "created_at": "2026-09-15T20:00:00.000Z"
  }
]
```

### `POST /v1/companies/:companyId/users`

Cadastra um novo Usuário dentro de uma Empresa existente, criando o registro de identidade no Supabase Auth com Senha Temporária e perfil no banco local.

- **Permissões**: Exige papel `company_admin` pertencente à mesma empresa ou `super_admin`.
- **Domínio Corporativo**: O email informado obrigatoriamente deve pertencer ao `email_domain` da empresa. Se divergir, retorna `422 Unprocessable Entity`.
- **Validação de CPF**: 11 dígitos numéricos com validação oficial de Módulo 11.
- **Unicidade de CPF**: Único por empresa (`UNIQUE(company_id, cpf)`). Se duplicado, retorna `409 Conflict`.
- **Papel atribuído**: `user` (padrão) ou `company_admin`.

**Corpo da requisição (`application/json`)**:
```json
{
  "name": "João Operador",
  "email": "joao@exemplo.com.br",
  "cpf": "11144477735",
  "role": "user"
}
```

**Resposta `201 Created`**:
```json
{
  "id": "u0000000-0000-0000-0000-000000000002",
  "auth_id": "a0000000-0000-0000-0000-000000000002",
  "name": "João Operador",
  "email": "joao@exemplo.com.br",
  "cpf": "11144477735",
  "role": "user",
  "status": "active",
  "must_change_password": true,
  "temporary_password": "kL8mP0xQ2w",
  "created_at": "2026-09-15T20:00:00.000Z"
}
```

### `GET /v1/companies/:companyId/users`

Lista todos os usuários pertencentes à empresa informada.

- **Permissões**: Exige papel `company_admin` da mesma empresa ou `super_admin`.

**Resposta `200 OK`**:
```json
[
  {
    "id": "u0000000-0000-0000-0000-000000000002",
    "auth_id": "a0000000-0000-0000-0000-000000000002",
    "name": "João Operador",
    "email": "joao@exemplo.com.br",
    "cpf": "11144477735",
    "status": "active",
    "must_change_password": false,
    "role": "user",
    "roles": ["user"],
    "created_at": "2026-09-15T20:00:00.000Z",
    "updated_at": "2026-09-15T20:00:00.000Z"
  }
]
```

---

## Contrato da API: `/v1/users`

### `GET /v1/users/me`

Retorna o perfil completo do usuário autenticado no sistema, incluindo dados da sua empresa vinculada e lista de papéis.

- **Autenticação**: `Bearer <token>` de qualquer usuário ativo com troca de senha realizada.
- Se o usuário estiver com `must_change_password: true`, a requisição é bloqueada com `403 Forbidden` (`{"error": "password_change_required"}`).

**Resposta `200 OK`**:
```json
{
  "id": "u0000000-0000-0000-0000-000000000001",
  "auth_id": "a0000000-0000-0000-0000-000000000001",
  "name": "Maria Silva",
  "email": "maria@exemplo.com.br",
  "cpf": "52998224725",
  "status": "active",
  "must_change_password": false,
  "company": {
    "id": "c0000000-0000-0000-0000-000000000001",
    "cnpj": "12ABC34501DE35",
    "legal_name": "Empresa Exemplo Ltda",
    "email_domain": "exemplo.com.br"
  },
  "roles": ["company_admin"],
  "created_at": "2026-09-15T20:00:00.000Z",
  "updated_at": "2026-09-15T20:00:00.000Z"
}
```

### `PATCH /v1/users/me/password`

Permite a qualquer usuário autenticado definir uma nova senha permanente. É a **única rota liberada** para usuários com pendência de primeiro acesso (`must_change_password: true`).

- Valida a senha atual via Supabase Auth REST (`POST /auth/v1/token?grant_type=password`).
- Atualiza a nova senha no Supabase Auth (`PUT /auth/v1/admin/users/:id`).
- Desmarca a flag `must_change_password` para `false` no banco local de forma atômica.

**Corpo da requisição (`application/json`)**:
```json
{
  "currentPassword": "senhaTemporariaOuAtual",
  "newPassword": "NovaSenhaSegura123!"
}
```

**Resposta `200 OK`**:
```json
{
  "message": "Password changed successfully"
}
```

---

## Enforcement de Primeiro Acesso (ADR 0008)

Usuários criados pelo Super-admin ou pelo Dono da Empresa recebem uma Senha Temporária e são criados com `must_change_password: true`.

1. **Bloqueio Global**: O `AuthGuard` intercepta qualquer chamada com token válido. Se `must_change_password` for `true`, responde imediatamente `403 Forbidden` com payload `{"error": "password_change_required"}`.
2. **Exceção de Primeiro Acesso**: Apenas a rota `PATCH /v1/users/me/password` (decorada com `@AllowPasswordChange()`) é permitida.
3. **Liberação**: Após trocar a senha com sucesso, o usuário passa a ter acesso liberado às rotas condizentes com seus papéis e pode enviar Sincronizações (`POST /v1/syncs`).

---

## Como Testar o Fluxo da Aplicação

O projeto possui diferentes formas de teste, automatizadas e manuais:

### 1. Testes Unitários
Testa lógica isolada, DTOs Zod, validações de CNPJ alfanumérico e CPF, e serviços com mocks:
```bash
bun run test
```

### 2. Testes End-to-End com Fakes (`test:e2e`)
Executa 72 testes e2e contra o banco real em um schema isolado (`test`), utilizando os provedores determinísticos `FakeAuthProvider` e `FakeAuthAdminProvider`:
```bash
bun run test:e2e
```

### 3. Teste Manual no Supabase Real (Sem Fakes)

Para validar todo o ciclo de vida da aplicação diretamente contra o Supabase Auth e Banco real:

1. Garanta que `AUTH_PROVIDER=fake` esteja comentado no `.env`.
2. Aplique as migrations e o seed: `bun run db:migrate && bun run db:seed`.
3. Inicie o servidor: `bun run start:dev`.
4. Siga o roteiro passo a passo:

#### Passo 1: Obter o access token do super-admin
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sentience.internal",
    "password": "SentienceAdmin123!"
  }'
```
A resposta conterá `accessToken`, `refreshToken` e o perfil do usuário em `camelCase`.

#### Passo 1b: Renovar a sessão via refresh token
```bash
curl -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<REFRESH_TOKEN>"
  }'
```
A resposta conterá um novo par de `accessToken` e `refreshToken` em `camelCase`.

#### Passo 2: Criar uma Empresa e seu Dono (com CNPJ alfanumérico válido)

```bash
   curl -i -X POST http://localhost:3000/v1/companies \
     -H "Authorization: Bearer <ACCESS_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "cnpj": "REAL123456AB51",
       "legal_name": "Empresa Teste Ltda",
       "email_domain": "empresateste.com.br",
       "owner": {
         "name": "Maria Silva",
         "email": "maria@empresateste.com.br",
         "cpf": "52998224725"
       }
     }'
   ```

---

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

## Seed

Inicializa de forma idempotente a empresa sentinel ("Sentience") e o primeiro Super-admin:

```bash
bun run db:seed
```

Em ambiente de testes:
```bash
DB_SCHEMA=test AUTH_PROVIDER=fake bun run db:seed
```

## Scripts

| Script | O que faz |
| --- | --- |
| `bun run start` | Sobe a fonte com Bun (`src/main.ts`). |
| `bun run start:dev` | Sobe com reload (`bun --watch`). |
| `bun run start:debug` | Sobe com inspector e reload. |
| `bun run build` | Type-check (`tsc --noEmit`). Não emite `dist`. |
| `bun run db:generate` | Gera migration SQL a partir do schema Drizzle. |
| `bun run db:migrate` | Aplica migrations ao schema `DB_SCHEMA`. |
| `bun run db:seed` | Inicializa empresa sentinel e super-admin de forma idempotente. |
| `bun run test` | Testes unitários (sem rede). |
| `bun run test:e2e` | Testes e2e (em schema isolado de teste com fakes). Exige `.env`. |
| `bun run test:cov` | Unitários com cobertura. |
| `bun run lint` | Oxlint em `src/` e `test/`. |
| `bun run format` | Prettier em `src/` e `test/`. |

