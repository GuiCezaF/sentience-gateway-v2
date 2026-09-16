# Sentience Gateway

Porta de entrada central do Sentience: recebe as Sincronizações do Agente, autentica o Usuário e guarda Classificações e Saúde para consumo posterior. Não classifica nada e nunca recebe imagem.

## Language

### Quem envia

**Agente**:
O Sentience App: instância de bandeja que classifica expressão facial localmente e sincroniza só o resultado com o Gateway.
_Avoid_: cliente, front-end, app desktop, dispositivo

**Usuário**:
Pessoa autenticada pela credencial que acompanha cada Sincronização; dona de tudo que o Gateway guarda. Pertence a exatamente uma Empresa. Identidade vive no Supabase Auth; perfil de negócio (nome, CPF, Papel) vive no banco local.
_Avoid_: conta, account, sujeito

**Instalação**:
Uma cópia do Agente rodando numa máquina de um Usuário. Um Usuário pode ter várias; Saúde é propriedade da Instalação, não do Usuário.
_Avoid_: device, máquina, dispositivo (como sinônimo de pessoa)

**Sujeito**:
Identificador opaco que o Agente envia em `subject_id`. Herdado da fase sem autenticação; hoje não participa de nenhuma regra e está destinado a identificar a Instalação.
_Avoid_: usuário, user id, account

### O que chega

**Sincronização**:
Um envio do Agente recebido pelo Gateway: carrega a Saúde da Instalação e zero ou mais Classificações. Toda Sincronização é registrada, mesmo sem Classificações.
_Avoid_: tick, sync request, lote (como sinônimo do envio), request genérico

**Lote**:
As Classificações de uma Sincronização, quando há alguma.
_Avoid_: batch, payload, itens (como termo de negócio)

**Pulso**:
Sincronização sem Classificações: o Agente está vivo e reporta Saúde.
_Avoid_: heartbeat, ping, health check

**Classificação**:
Registro de uma expressão facial reconhecida pelo Agente num instante UTC: identidade estável (`classification_id`), instante e Emoção vencedora. É o único dado de negócio sobre o rosto que o Gateway guarda.
_Avoid_: evento de emoção, emotion event, item, detecção, inferência

**Emoção**:
Uma das classes que o Agente reconhece, na grafia do fio: `angry`, `happy`, `neutral`, `sad`.
_Avoid_: sentimento, humor, mood, rótulo em português

**Saúde**:
Condição operacional da Instalação no momento da Sincronização: `ok`, `camera` (câmera indisponível; prevalece sobre as demais) ou `model` (falha de modelo ou de armazenamento local).
_Avoid_: status, estado, health check, falha (como valor do fio)

**Duplicata**:
Classificação recebida numa Sincronização que o Gateway já guardava para o mesmo Usuário. Consequência normal do reenvio at-least-once do Agente; não é erro.
_Avoid_: conflito, erro de duplicidade, replay

### Quem consome

**Portal**:
Aplicação web onde Usuários e Donos da Empresa realizam login, gestão de cadastros e acompanhamento. Comunica-se exclusivamente com a API do Gateway e nunca acessa o Supabase diretamente.
_Avoid_: front-end, frontend, painel web, cliente web, site

**Relatório**:
Visão do dia seguinte gerada a partir do que o Gateway guarda. Consumidor futuro; fora do escopo atual.
_Avoid_: dashboard, analytics, histórico

### Organização

**Empresa**:
Entidade jurídica que contrata o Sentience e à qual os Usuários pertencem. Identificada por CNPJ (único no sistema) e restringe emails ao seu domínio corporativo.
_Avoid_: organização, tenant, cliente (como sinônimo de empresa), conta corporativa

**CNPJ**:
Identificador fiscal da Empresa, 14 caracteres alfanuméricos (12 posições base em `[A-Z0-9]` + 2 dígitos verificadores numéricos). Validado por módulo 11 com conversão ASCII-48. Compatível com o formato alfanumérico vigente desde julho/2026.
_Avoid_: registro, inscrição, código da empresa

**CPF**:
Identificador fiscal da pessoa física, 11 dígitos numéricos com 2 dígitos verificadores (módulo 11). Único por Empresa no sistema. Não é alfanumérico — apenas o CNPJ mudou de formato.
_Avoid_: documento, identidade, RG

**Domínio Corporativo**:
Domínio de email associado à Empresa (ex: `acme.com.br`). Todo Usuário da Empresa deve ter email nesse domínio.
_Avoid_: domínio de email, email domain (como termo solto)

### Acesso e Papéis

**Papel**:
Nível de permissão de um Usuário no sistema. Armazenado no banco local (tabela `user_roles`), não no Supabase Auth. Valores no MVP: `super_admin`, `company_admin`, `user`.
_Avoid_: role, permissão, nível de acesso

**Super-admin**:
Papel que permite criar Empresas e seus Donos. Pertence à Empresa sentinel (Sentience).
_Avoid_: root, system admin, god mode

**Dono da Empresa**:
Usuário com Papel `company_admin` criado atomicamente junto com a Empresa. Recebe Senha Temporária e cadastra os demais Usuários.
_Avoid_: owner, proprietário, administrador (como termo genérico)

**Senha Temporária**:
Senha alfanumérica curta (8-12 caracteres) gerada automaticamente no Cadastro. O Usuário é obrigado a trocá-la no primeiro acesso. Comunicada manualmente pelo RH ou admin.
_Avoid_: senha provisória, one-time password, OTP

**Cadastro**:
Ato de criar um Usuário no sistema: gera identidade no Supabase Auth (com Senha Temporária), insere perfil no banco local, e atribui Papel. Executado por um `super_admin` (para Donos) ou `company_admin` (para Usuários comuns).
_Avoid_: registro, signup, onboarding
