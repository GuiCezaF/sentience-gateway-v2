# Autenticação centralizada no Gateway

Clientes (Portal e Agente) não devem conhecer a existência ou a infraestrutura do Supabase. O Gateway deve ser o ponto único de entrada, auditoria e falha para autenticação.

## Contexto

O ADR 0002 previa a verificação local de JWTs emitidos pelo Supabase Auth, mas deixava a obtenção do token a cargo do cliente via requisição direta à API do Supabase. Essa abordagem vazava a infraestrutura e credenciais do Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) para as aplicações clientes, descentralizava o ponto de falha e acoplava os clientes ao provedor de identidade.

## Decisão

1. **Endpoints de Autenticação no Gateway**:
   - `POST /v1/auth/login`: recebe `{ email, password }`, valida no Supabase Auth via REST (`POST /auth/v1/token?grant_type=password`), enriquece com dados do banco local (`gateway.users`) e retorna tokens e perfil em `camelCase` (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `user`).
   - `POST /v1/auth/refresh`: recebe `{ refreshToken }`, renova a sessão no Supabase Auth via REST (`POST /auth/v1/token?grant_type=refresh_token`), revalida se o usuário permanece ativo no banco local (`status === 'active'`) e retorna os novos tokens.

2. **Isolamento de Infraestrutura e Rastreabilidade**:
   - O Portal e o Agente comunicam-se exclusivamente com a API do Gateway. Nenhuma chave (`anon` ou `service_role`) ou URL do Supabase é exposta aos clientes.
   - As requisições server-to-server enviadas pelo Gateway ao Supabase Auth repassam o cabeçalho `X-Forwarded-For` com o IP original do cliente para garantir auditoria fidedigna.

3. **Segurança e Regras de Negócio**:
   - Credenciais inválidas (email inexistente ou senha incorreta) retornam `401 Unauthorized` genérico (`{"statusCode": 401, "message": "Invalid email or password"}`) para prevenir enumeração de contas.
   - Usuários inativos (`status !== 'active'`) são bloqueados no login e no refresh com `403 Forbidden` (`{"error": "user_inactive"}`).
   - Usuários com `must_change_password: true` recebem os tokens acompanhados do metadado no objeto `user`. O cliente deve redirecioná-los à tela de primeiro acesso, enquanto o `AuthGuard` bloqueia chamadas a quaisquer outros recursos protegidos.

## Consequências

- O Gateway assume a responsabilidade de proxy/facade de autenticação.
- O desacoplamento é total: migrações de provedor de identidade (ex: Keycloak, Cognito) afetam unicamente o Gateway, sem impacto nos clientes.
- Testes locais e integrados continuam exercitáveis sem Supabase via `FakeAuthAdminProvider`.
