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

## Scripts

| Script | O que faz |
| --- | --- |
| `bun run start` | Sobe a fonte com Bun (`src/main.ts`). |
| `bun run start:dev` | Sobe com reload (`bun --watch`). |
| `bun run start:debug` | Sobe com inspector e reload. |
| `bun run build` | Type-check (`tsc --noEmit`). Não emite `dist`. |
| `bun run test` | Testes unitários (sem rede). |
| `bun run test:e2e` | Testes e2e. Exige `.env`. |
| `bun run test:cov` | Unitários com cobertura. |
| `bun run lint` | Oxlint em `src/` e `test/`. |
| `bun run format` | Prettier em `src/` e `test/`. |
