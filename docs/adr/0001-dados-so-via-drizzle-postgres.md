---
status: accepted
---

# Dados só via Drizzle/Postgres; Supabase é hospedagem e Auth

O banco é o Postgres hospedado no Supabase, mas toda leitura e escrita de dados de negócio passa pelo Drizzle ORM sobre a connection string Postgres, com migrations em SQL geradas pelo `drizzle-kit`. O SDK `@supabase/supabase-js` não entra na camada de dados; o Supabase é tratado como um provedor de Postgres e de autenticação. Trocar de hospedagem é apontar `DATABASE_URL` para outro Postgres e aplicar as migrations.

## Considered Options

- **Prisma**: descartado pelo query engine binário, que adiciona atrito sob Bun e não oferece `ON CONFLICT` e transações com o mesmo controle.
- **supabase-js / PostgREST**: descartado por acoplar o serviço à Data API do Supabase e por não expor transações.
