import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { syncs } from '../db/schema.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import type {
  SyncEnvelopeDto,
  SyncReceiptDto,
} from './dto/sync-envelope.dto.js';

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
    const [insertedSync] = await this.db.transaction(async (tx) => {
      return tx
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
      syncId: insertedSync.id,
      health: insertedSync.health,
      receivedCount: insertedSync.receivedCount,
      insertedCount: insertedSync.insertedCount,
      duplicateCount: insertedSync.duplicateCount,
    };
  }
}
