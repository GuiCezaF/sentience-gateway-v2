# Sentience Gateway

Porta de entrada central do Sentience: recebe as Sincronizações do Agente, autentica o Usuário e guarda Classificações e Saúde para consumo posterior. Não classifica nada e nunca recebe imagem.

## Language

### Quem envia

**Agente**:
O Sentience App: instância de bandeja que classifica expressão facial localmente e sincroniza só o resultado com o Gateway.
_Avoid_: cliente, front-end, app desktop, dispositivo

**Usuário**:
Pessoa autenticada pela credencial que acompanha cada Sincronização; dona de tudo que o Gateway guarda.
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

**Relatório**:
Visão do dia seguinte gerada a partir do que o Gateway guarda. Consumidor futuro; fora do escopo atual.
_Avoid_: dashboard, analytics, histórico
