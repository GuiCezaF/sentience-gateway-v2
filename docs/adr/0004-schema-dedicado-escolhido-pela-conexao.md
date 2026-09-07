---
status: accepted
---

# Schema dedicado escolhido pela conexão, RLS ligada sem policies, testes no schema `test` do mesmo projeto

As tabelas ficam fora de `public` porque, no Supabase, tudo em `public` sem RLS é legível e gravável pela Data API com a chave publishable. As tabelas são declaradas **sem schema** no Drizzle (`pgTable`); o schema real vem do `search_path` da conexão, definido pela env `DB_SCHEMA` (`gateway` em desenvolvimento e produção, `test` nos testes). Um único script de migration cria o schema se preciso e aplica os mesmos arquivos SQL gerados pelo `drizzle-kit generate`, com a tabela de controle dentro do próprio schema. Todas as tabelas têm RLS ligada e nenhuma policy: o Gateway conecta como dono das tabelas e não é afetado; qualquer outro caminho (Data API, chave vazada) recebe zero linhas mesmo que o schema venha a ser exposto.

Os testes de integração rodam contra o schema `test` do mesmo projeto Supabase, não contra um Postgres local em Docker: a máquina de desenvolvimento não roda Docker pelo agente, e com o schema vindo da conexão os testes exercitam exatamente as migrations que vão para produção.

## Consequences

- `drizzle-kit migrate` (CLI) não é usado; migrations rodam por `bun run db:migrate`, como passo explícito antes do start, nunca no boot.
- Os testes de integração compartilham um schema remoto: rodam em série e truncam as tabelas antes de cada caso.
- `search_path` como parâmetro de startup é garantido na conexão direta. Se a produção precisar do pooler (Supavisor), o repasse do parâmetro deve ser validado antes.
