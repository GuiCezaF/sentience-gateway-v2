import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { SyncsService } from './syncs.service.js';
import { syncs, classifications } from '../db/schema.js';
import type { DrizzleDb } from '../db/db.module.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import type { SyncEnvelopeDto, SyncItemDto } from './dto/sync-envelope.dto.js';

describe('SyncsService', () => {
  let service: SyncsService;
  let mockDb: {
    transaction: ReturnType<typeof vi.fn>;
  };

  const user: AuthUser = {
    userId: 'a0000000-0000-0000-0000-000000000001',
  };

  const validPulse: SyncEnvelopeDto = {
    subject_id: 'sub-1',
    sent_at: '2026-09-15T17:50:00.000Z',
    health: 'ok',
    items: [],
  };

  const item1: SyncItemDto = {
    classification_id: 'c0000000-0000-0000-0000-000000000001',
    occurred_at: '2026-09-15T17:49:00.000Z',
    emotion: 'happy',
  };

  const item2: SyncItemDto = {
    classification_id: 'c0000000-0000-0000-0000-000000000002',
    occurred_at: '2026-09-15T17:49:30.000Z',
    emotion: 'neutral',
  };

  beforeEach(() => {
    mockDb = {
      transaction: vi.fn(),
    };
    service = new SyncsService(mockDb as unknown as DrizzleDb);
  });

  it('insere linha de syncs dentro da transação e devolve o recibo com contadores zerados para Pulso', async () => {
    const fakeRow = {
      id: 's0000000-0000-0000-0000-000000000001',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'ok',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    const insertSyncMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([fakeRow]),
      }),
    });

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: insertSyncMock,
        update: vi.fn(),
      };
      return callback(mockTx);
    });

    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    const receipt = await service.createSync(user, validPulse);

    expect(receipt).toEqual({
      syncId: fakeRow.id,
      health: 'ok',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
    });
    expect(insertSyncMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('insere classificações de Lote, atualiza contadores e devolve recibo correto quando todas são novas', async () => {
    const initialSyncRow = {
      id: 's0000000-0000-0000-0000-000000000001',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'ok',
      receivedCount: 2,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    const updatedSyncRow = {
      ...initialSyncRow,
      insertedCount: 2,
      duplicateCount: 0,
    };

    const batchEnvelope: SyncEnvelopeDto = {
      ...validPulse,
      items: [item1, item2],
    };

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn((table) => {
          if (table === syncs) {
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([initialSyncRow]),
              }),
            };
          }
          if (table === classifications) {
            return {
              values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi
                    .fn()
                    .mockResolvedValue([
                      { classificationId: item1.classification_id },
                      { classificationId: item2.classification_id },
                    ]),
                }),
              }),
            };
          }
          throw new Error('Unexpected table');
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([updatedSyncRow]),
            })),
          })),
        })),
      };
      return callback(mockTx);
    });

    const receipt = await service.createSync(user, batchEnvelope);

    expect(receipt).toEqual({
      syncId: initialSyncRow.id,
      health: 'ok',
      receivedCount: 2,
      insertedCount: 2,
      duplicateCount: 0,
    });
  });

  it('calcula duplicateCount corretamente quando parte das classificações já existe', async () => {
    const initialSyncRow = {
      id: 's0000000-0000-0000-0000-000000000001',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'ok',
      receivedCount: 2,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    const updatedSyncRow = {
      ...initialSyncRow,
      insertedCount: 1,
      duplicateCount: 1,
    };

    const batchEnvelope: SyncEnvelopeDto = {
      ...validPulse,
      items: [item1, item2],
    };

    let capturedUpdateSet: unknown;

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn((table) => {
          if (table === syncs) {
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([initialSyncRow]),
              }),
            };
          }
          if (table === classifications) {
            return {
              values: vi.fn().mockReturnValue({
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi
                    .fn()
                    .mockResolvedValue([
                      { classificationId: item1.classification_id },
                    ]),
                }),
              }),
            };
          }
          throw new Error('Unexpected table');
        }),
        update: vi.fn(() => ({
          set: vi.fn((vals) => {
            capturedUpdateSet = vals;
            return {
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([updatedSyncRow]),
              })),
            };
          }),
        })),
      };
      return callback(mockTx);
    });

    const receipt = await service.createSync(user, batchEnvelope);

    expect(receipt).toEqual({
      syncId: initialSyncRow.id,
      health: 'ok',
      receivedCount: 2,
      insertedCount: 1,
      duplicateCount: 1,
    });
    expect(capturedUpdateSet).toEqual({
      insertedCount: 1,
      duplicateCount: 1,
    });
  });

  it('divide inserção de classificações em múltiplos chunks quando items > 1000', async () => {
    const totalItems = 1500;
    const items: SyncItemDto[] = Array.from({ length: totalItems }, (_, i) => ({
      classification_id: `c0000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      occurred_at: '2026-09-15T17:49:00.000Z',
      emotion: 'happy' as const,
    }));

    const initialSyncRow = {
      id: 's0000000-0000-0000-0000-000000000001',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'ok',
      receivedCount: totalItems,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    let classificationsInsertCallCount = 0;

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn((table) => {
          if (table === syncs) {
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([initialSyncRow]),
              }),
            };
          }
          if (table === classifications) {
            classificationsInsertCallCount++;
            return {
              values: vi.fn((batch) => ({
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue(
                    batch.map((b: { classificationId: string }) => ({
                      classificationId: b.classificationId,
                    })),
                  ),
                }),
              })),
            };
          }
          throw new Error('Unexpected table');
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([
                {
                  ...initialSyncRow,
                  insertedCount: totalItems,
                  duplicateCount: 0,
                },
              ]),
            })),
          })),
        })),
      };
      return callback(mockTx);
    });

    const receipt = await service.createSync(user, {
      ...validPulse,
      items,
    });

    expect(receipt.receivedCount).toBe(1500);
    expect(receipt.insertedCount).toBe(1500);
    expect(receipt.duplicateCount).toBe(0);
    expect(classificationsInsertCallCount).toBe(2);
  });

  it('propaga erro lançado durante inserção de classifications para disparar rollback', async () => {
    const initialSyncRow = {
      id: 's0000000-0000-0000-0000-000000000001',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'ok',
      receivedCount: 1,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn((table) => {
          if (table === syncs) {
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([initialSyncRow]),
              }),
            };
          }
          if (table === classifications) {
            throw new Error('Database connection lost');
          }
          throw new Error('Unexpected table');
        }),
        update: vi.fn(),
      };
      return callback(mockTx);
    });

    await expect(
      service.createSync(user, {
        ...validPulse,
        items: [item1],
      }),
    ).rejects.toThrow('Database connection lost');
  });

  it('emite log warn estruturado quando health é "camera" após commit', async () => {
    const fakeRow = {
      id: 's0000000-0000-0000-0000-000000000002',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'camera',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([fakeRow]),
          }),
        }),
      };
      return callback(mockTx);
    });

    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    await service.createSync(user, { ...validPulse, health: 'camera' });

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'agent_health_degraded',
      userId: user.userId,
      subjectId: validPulse.subject_id,
      health: 'camera',
      sentAt: validPulse.sent_at,
    });

    warnSpy.mockRestore();
  });

  it('emite log warn estruturado quando health é "model" após commit', async () => {
    const fakeRow = {
      id: 's0000000-0000-0000-0000-000000000003',
      userId: user.userId,
      subjectId: 'sub-1',
      sentAt: new Date(validPulse.sent_at),
      health: 'model',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      receivedAt: new Date(),
    };

    mockDb.transaction.mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([fakeRow]),
          }),
        }),
      };
      return callback(mockTx);
    });

    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    await service.createSync(user, { ...validPulse, health: 'model' });

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'agent_health_degraded',
      userId: user.userId,
      subjectId: validPulse.subject_id,
      health: 'model',
      sentAt: validPulse.sent_at,
    });

    warnSpy.mockRestore();
  });
});
