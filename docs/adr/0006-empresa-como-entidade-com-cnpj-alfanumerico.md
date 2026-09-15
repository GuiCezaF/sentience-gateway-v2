# Empresa como entidade própria com CNPJ alfanumérico

O sistema é exclusivamente corporativo — não existe usuário avulso. Decidimos modelar Empresa como entidade própria (tabela `companies`) com CNPJ único e domínio de email corporativo, ao invés de campo de texto livre no perfil do usuário. O CNPJ é validado com o algoritmo módulo 11 compatível com o formato alfanumérico vigente desde julho/2026 (IN RFB nº 2.229/2024): 12 posições base em `[A-Z0-9]` + 2 dígitos verificadores numéricos, conversão via `ASCII(char) - 48`.

## Consequences

- Constraint `UNIQUE(company_id, cpf)` na tabela `users` garante um CPF por empresa de forma relacional.
- Constraint `UNIQUE(cnpj)` na tabela `companies` garante uma empresa por CNPJ.
- O domínio corporativo (`email_domain`) na tabela `companies` valida que emails dos usuários pertencem à empresa.
- As tabelas existentes (`syncs`, `classifications`) não são alteradas — o vínculo empresa→dados é via `users.company_id` (join).
- O super-admin pertence a uma empresa sentinel (Sentience), eliminando nulls em `company_id`.
