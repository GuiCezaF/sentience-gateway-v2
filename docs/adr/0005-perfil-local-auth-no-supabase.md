# Perfil de negócio no banco local, identidade no Supabase Auth

O cadastro de usuários precisa de campos de negócio (nome, CPF, empresa, papéis) que não existem no Supabase Auth. Decidimos manter o Supabase Auth como provedor de identidade (login, senha, JWT — conforme ADR 0002) e criar tabelas locais (`users`, `user_roles`, `companies`) no schema `gateway` para os dados de perfil. A alternativa era implementar autenticação completa localmente (hashing de senha, emissão de JWT, refresh tokens), mas isso reinventaria o que o Supabase Auth já resolve e invalidaria o ADR 0002.

## Considered Options

- **Autenticação completa local**: descartada por custo de implementação e manutenção, e por contradizer o ADR 0002.
- **`supabase-js` para admin**: descartada por manter o espírito do ADR 0001 (sem coupling com `supabase-js`). Operações admin (criar usuário, trocar senha) são feitas via REST API direta do Supabase Auth, atrás de uma interface `AuthAdminProvider`.

## Consequences

- Papéis e flag `must_change_password` vivem no banco local, não no `app_metadata` do Supabase Auth — evita dependência do Supabase para lógica de negócio.
- O `AuthGuard` passa a consultar o banco local a cada request para obter papéis e status do usuário (query indexada por `auth_id`, sub-milissegundo).
- A criação de usuário é uma saga: cria no Supabase Auth primeiro (obtém `auth_id`), depois insere no banco local em transação. Se o banco falhar, compensa deletando o usuário do Supabase Auth.
