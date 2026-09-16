# Enforcement de primeiro acesso e troca de senha

Usuários criados com senha temporária precisam ser obrigados a definir uma nova senha permanente antes de executar qualquer ação no sistema.

## Decisão

1. **Enforcement no AuthGuard**:
   - O `AuthGuard` consulta os dados locais do usuário (`users`) e papéis (`user_roles`) indexados por `auth_id`.
   - Usuários inativos (`status !== 'active'`) são bloqueados com `403 Forbidden`.
   - Usuários com `must_change_password: true` são bloqueados com `403 Forbidden` e payload padronizado `{"error": "password_change_required"}` em qualquer rota protegida.
   - A única exceção permitida para usuários com pendência de troca de senha é o endpoint `PATCH /v1/users/me/password` (marcado com o decorator `@AllowPasswordChange()`).

2. **Verificação de Credenciais via REST**:
   - Para validar a senha atual informada pelo usuário, utilizamos uma requisição REST ao endpoint de token do Supabase Auth (`POST /auth/v1/token?grant_type=password`) através do `AuthAdminProvider`, sem acoplamento a bibliotecas externas.
   - Após a validação positiva das credenciais atuais, a nova senha é atualizada no Supabase Auth (`PUT /auth/v1/admin/users/:id`) e a flag `must_change_password` é desmarcada atomicamente no banco local.

3. **RolesGuard Otimizado**:
   - O `RolesGuard` consome a lista de papéis já populada pelo `AuthGuard` em `request.user.roles`, eliminando consultas adicionais ao banco de dados em rotas protegidas por papéis.
