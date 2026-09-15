import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let mockDb: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockDb = {
      select: vi.fn(),
    };
    guard = new RolesGuard(reflector, mockDb);
  });

  function createMockContext(user?: { userId: string }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('permite acesso quando nenhum papel é exigido pela rota', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ userId: 'u-1' });

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
  });

  it('lança UnauthorizedException quando o usuário não está autenticado', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lança ForbiddenException quando o usuário não possui papéis no banco', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({ userId: 'u-1' });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lança ForbiddenException quando o usuário não possui o papel exigido', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({ userId: 'u-1' });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ role: 'company_admin' }]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('permite acesso quando o usuário possui o papel exigido', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({ userId: 'u-1' });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ role: 'super_admin' }]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
  });
});
