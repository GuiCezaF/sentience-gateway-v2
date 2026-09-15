import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { SyncsService } from './syncs.service.js';
import type { DrizzleDb } from '../db/db.module.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import type { SyncEnvelopeDto } from './dto/sync-envelope.dto.js';

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

    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    const receipt = await service.createSync(user, validPulse);

    expect(receipt).toEqual({
      syncId: fakeRow.id,
      health: 'ok',
      receivedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
    });
    expect(warnSpy).not.toHaveBeenCalled();
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
