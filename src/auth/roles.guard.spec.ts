import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import type { AuthUser } from './auth-provider.interface.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user?: Partial<AuthUser>): ExecutionContext {
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
    const context = createMockContext({ userId: 'u-1', roles: ['user'] });

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

  it('lança ForbiddenException quando o usuário não possui papéis', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({ userId: 'u-1', roles: [] });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lança ForbiddenException quando o usuário não possui o papel exigido', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({
      userId: 'u-1',
      roles: ['company_admin'],
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('permite acesso quando o usuário possui o papel exigido', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['super_admin']);
    const context = createMockContext({
      userId: 'u-1',
      roles: ['super_admin'],
    });

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
  });
});
