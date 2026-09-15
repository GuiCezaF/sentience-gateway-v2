import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { classifications, syncs } from '../db/schema.js';
import { chunk } from '../common/chunk.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import type {
  SyncEnvelopeDto,
  SyncReceiptDto,
} from './dto/sync-envelope.dto.js';

export const CLASSIFICATION_CHUNK_SIZE = 1000;

@Injectable()
export class SyncsService {
  private readonly logger = new Logger(SyncsService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
  ) {}

  async createSync(
    user: AuthUser,
    envelope: SyncEnvelopeDto,
  ): Promise<SyncReceiptDto> {
    const updatedSync = await this.db.transaction(async (tx) => {
      const [insertedSync] = await tx
        .insert(syncs)
        .values({
          userId: user.userId,
          subjectId: envelope.subject_id,
          sentAt: new Date(envelope.sent_at),
          health: envelope.health,
          receivedCount: envelope.items.length,
          insertedCount: 0,
          duplicateCount: 0,
        })
        .returning();

      if (envelope.items.length === 0) {
        return insertedSync;
      }

      let insertedCount = 0;
      const batches = chunk(envelope.items, CLASSIFICATION_CHUNK_SIZE);

      for (const batch of batches) {
        const insertedRows = await tx
          .insert(classifications)
          .values(
            batch.map((item) => ({
              userId: user.userId,
              classificationId: item.classification_id,
              syncId: insertedSync.id,
              subjectId: envelope.subject_id,
              occurredAt: new Date(item.occurred_at),
              emotion: item.emotion,
            })),
          )
          .onConflictDoNothing({
            target: [classifications.userId, classifications.classificationId],
          })
          .returning({ classificationId: classifications.classificationId });

        insertedCount += insertedRows.length;
      }

      const duplicateCount = envelope.items.length - insertedCount;

      const [updated] = await tx
        .update(syncs)
        .set({
          insertedCount,
          duplicateCount,
        })
        .where(eq(syncs.id, insertedSync.id))
        .returning();

      return updated;
    });

    if (envelope.health !== 'ok') {
      this.logger.warn({
        event: 'agent_health_degraded',
        userId: user.userId,
        subjectId: envelope.subject_id,
        health: envelope.health,
        sentAt: envelope.sent_at,
      });
    }

    return {
      syncId: updatedSync.id,
      health: updatedSync.health,
      receivedCount: updatedSync.receivedCount,
      insertedCount: updatedSync.insertedCount,
      duplicateCount: updatedSync.duplicateCount,
    };
  }
}
