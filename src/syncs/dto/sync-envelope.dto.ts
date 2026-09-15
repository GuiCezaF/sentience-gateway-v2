import { z } from 'zod';

export const HEALTH_VALUES = ['ok', 'camera', 'model'] as const;
export const EMOTION_VALUES = ['angry', 'happy', 'neutral', 'sad'] as const;

export const DEFAULT_MAX_SYNC_ITEMS = 10000;

export const syncItemSchema = z.object({
  classification_id: z.string().uuid(),
  occurred_at: z.string().datetime({ offset: false }),
  emotion: z.enum(EMOTION_VALUES),
});

export function createSyncEnvelopeSchema(
  maxItems: number = DEFAULT_MAX_SYNC_ITEMS,
) {
  return z.object({
    subject_id: z.string().min(1).max(128),
    sent_at: z.string().datetime({ offset: false }),
    health: z.enum(HEALTH_VALUES),
    items: z.array(syncItemSchema).max(maxItems),
  });
}

export const syncEnvelopeSchema = createSyncEnvelopeSchema();

export type SyncItemDto = z.infer<typeof syncItemSchema>;
export type SyncEnvelopeDto = z.infer<typeof syncEnvelopeSchema>;

export interface SyncReceiptDto {
  syncId: string;
  health: string;
  receivedCount: number;
  insertedCount: number;
  duplicateCount: number;
}
