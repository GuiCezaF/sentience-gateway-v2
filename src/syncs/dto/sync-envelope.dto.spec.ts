import { describe, it, expect } from 'vitest';
import {
  createSyncEnvelopeSchema,
  syncEnvelopeSchema,
} from './sync-envelope.dto.js';

describe('syncEnvelopeSchema', () => {
  const validPulse = {
    subject_id: 'sub-1',
    sent_at: '2026-09-15T17:50:00.000Z',
    health: 'ok',
    items: [],
  };

  const validItem = {
    classification_id: '123e4567-e89b-12d3-a456-426614174000',
    occurred_at: '2026-09-15T17:49:59.123Z',
    emotion: 'happy' as const,
  };

  it('aceita Pulso válido com items: []', () => {
    const result = syncEnvelopeSchema.safeParse(validPulse);
    expect(result.success).toBe(true);
  });

  it('aceita envelope com items válidos', () => {
    const result = syncEnvelopeSchema.safeParse({
      ...validPulse,
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('aceita todas as variações permitidas de health ("ok", "camera", "model")', () => {
    for (const health of ['ok', 'camera', 'model'] as const) {
      const result = syncEnvelopeSchema.safeParse({
        ...validPulse,
        health,
      });
      expect(result.success).toBe(true);
    }
  });

  it('aceita todas as variações permitidas de emotion ("angry", "happy", "neutral", "sad")', () => {
    for (const emotion of ['angry', 'happy', 'neutral', 'sad'] as const) {
      const result = syncEnvelopeSchema.safeParse({
        ...validPulse,
        items: [{ ...validItem, emotion }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejeita saúde desconhecida', () => {
    const result = syncEnvelopeSchema.safeParse({
      ...validPulse,
      health: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita emoção desconhecida', () => {
    const result = syncEnvelopeSchema.safeParse({
      ...validPulse,
      items: [{ ...validItem, emotion: 'fear' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita classification_id com UUID inválido', () => {
    const result = syncEnvelopeSchema.safeParse({
      ...validPulse,
      items: [{ ...validItem, classification_id: 'not-a-uuid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejeita sent_at com offset (+00:00) ou sem Z', () => {
    const withOffset = syncEnvelopeSchema.safeParse({
      ...validPulse,
      sent_at: '2026-09-15T17:50:00+00:00',
    });
    expect(withOffset.success).toBe(false);

    const withoutZ = syncEnvelopeSchema.safeParse({
      ...validPulse,
      sent_at: '2026-09-15T17:50:00',
    });
    expect(withoutZ.success).toBe(false);
  });

  it('rejeita occurred_at com offset (+00:00) ou sem Z', () => {
    const withOffset = syncEnvelopeSchema.safeParse({
      ...validPulse,
      items: [{ ...validItem, occurred_at: '2026-09-15T17:49:59+00:00' }],
    });
    expect(withOffset.success).toBe(false);
  });

  it('rejeita subject_id vazio ou maior que 128 caracteres', () => {
    const emptySubject = syncEnvelopeSchema.safeParse({
      ...validPulse,
      subject_id: '',
    });
    expect(emptySubject.success).toBe(false);

    const longSubject = syncEnvelopeSchema.safeParse({
      ...validPulse,
      subject_id: 'a'.repeat(129),
    });
    expect(longSubject.success).toBe(false);
  });

  it('rejeita items acima do teto MAX_SYNC_ITEMS', () => {
    const smallSchema = createSyncEnvelopeSchema(2);
    const result = smallSchema.safeParse({
      ...validPulse,
      items: [validItem, validItem, validItem],
    });
    expect(result.success).toBe(false);
  });
});
