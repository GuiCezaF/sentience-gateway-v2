---
status: accepted
---

# Idempotência só por Classificação; o Gateway nunca rejeita de forma permanente o que o Agente vai reenviar

O Agente gera um `sent_at` novo a cada tentativa, não faz retry HTTP e, em qualquer resposta não-2xx, mantém **todo** o Lote na fila para reenviar 30 minutos depois junto com o que acumulou. Por isso não existe chave de idempotência por Sincronização (`sent_at`, `Idempotency-Key`): ela nunca dispararia. A única unicidade é `(usuário, classification_id)`; reenvio vira Duplicata contada, não erro.

O mesmo comportamento do Agente torna qualquer 4xx determinístico uma armadilha: a fila cresce e o erro se repete para sempre. Daí as regras:

- O teto de itens por Sincronização (10 000) e o limite de corpo (5 MB) são folgados o bastante para nunca serem atingidos em operação normal (máximo real: 360 Classificações a cada 30 minutos; ~17 000 após 24 h sem Gateway). Não existe 422 separado: toda falha de validação é 400.
- `emotion` e `health` são validados como enum no contrato, mas guardados como `text`. Uma Emoção nova entra **primeiro** no Gateway e só depois no Agente.
- Não há validação semântica de tempo (`sent_at` no futuro, `occurred_at > sent_at`): relógio de desktop errado não pode prender a fila. `received_at` do servidor fica guardado para detectar drift depois.

## Consequences

- O Agente precisa, do lado dele, distinguir 4xx (lote envenenado: quarentena) de 5xx (retry) e limitar itens por envio. Isso é trabalho no app, registrado como pendência.
- Se o Agente ganhar retry de rede com `sent_at` estável, um índice único por Sincronização pode voltar com migration aditiva.
