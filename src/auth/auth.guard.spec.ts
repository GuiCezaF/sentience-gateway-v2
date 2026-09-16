import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { AuthProvider } from './auth-provider.interface.js';

function createMockContext(
  headers: Record<string, string | undefined>,
  options?: {
    method?: string;
    path?: string;
    url?: string;
  },
): {
  context: ExecutionContext;
  req: AuthenticatedRequest;
} {
  const req = {
    headers,
    method: options?.method ?? 'GET',
    path: options?.path ?? '/v1/some-resource',
    url: options?.url ?? '/v1/some-resource',
  } as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('AuthGuard', () => {
  let mockAuthProvider: AuthProvider;
  let mockDb: any;
  let reflector: Reflector;
  let guard: AuthGuard;

  beforeEach(() => {
    mockAuthProvider = {
      verify: vi.fn(),
    };
    mockDb = {
      select: vi.fn(),
    };
    reflector = new Reflector();
    guard = new AuthGuard(mockAuthProvider, mockDb, reflector);
  });

  it('rejeita requisição quando o header Authorization está ausente', async () => {
    const { context } = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing Authorization header'),
    );
  });

  it('rejeita requisição quando o header Authorization não começa com "Bearer "', async () => {
    const { context } = createMockContext({
      authorization: 'Basic dXNlcjpwYXNz',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid Authorization header format'),
    );
  });

  it('rejeita requisição quando o token está vazio após "Bearer "', async () => {
    const { context } = createMockContext({
      authorization: 'Bearer   ',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing token in Authorization header'),
    );
  });

  it('rejeita requisição quando o AuthProvider lança erro', async () => {
    vi.mocked(mockAuthProvider.verify).mockRejectedValueOnce(
      new Error('Token rejected by provider'),
    );

    const { context } = createMockContext({
      authorization: 'Bearer user:invalid',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita requisição quando o usuário não existe no banco de dados local', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-999',
    });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context } = createMockContext({
      authorization: 'Bearer user:auth-id-999',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('User not registered in local database'),
    );
  });

  it('bloqueia usuário inativo com 403 Forbidden', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-inactive',
    });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: 'u-1',
          authId: 'auth-id-inactive',
          companyId: 'c-1',
          name: 'Inactive User',
          email: 'inactive@example.com',
          cpf: '12345678901',
          status: 'inactive',
          mustChangePassword: false,
          role: 'user',
        },
      ]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context } = createMockContext({
      authorization: 'Bearer user:auth-id-inactive',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User is inactive'),
    );
  });

  it('bloqueia com 403 {"error": "password_change_required"} quando must_change_password é true em rota protegida comum', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-must-change',
    });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: 'u-1',
          authId: 'auth-id-must-change',
          companyId: 'c-1',
          name: 'New User',
          email: 'new@example.com',
          cpf: '12345678901',
          status: 'active',
          mustChangePassword: true,
          role: 'company_admin',
        },
      ]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context } = createMockContext(
      { authorization: 'Bearer user:auth-id-must-change' },
      { method: 'GET', path: '/v1/users/me' },
    );

    try {
      await guard.canActivate(context);
      expect.fail('Deveria ter lançado ForbiddenException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toEqual({ error: 'password_change_required' });
    }
  });

  it('permite acesso quando must_change_password é true no endpoint PATCH /v1/users/me/password', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-must-change',
    });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: 'u-1',
          authId: 'auth-id-must-change',
          companyId: 'c-1',
          name: 'New User',
          email: 'new@example.com',
          cpf: '12345678901',
          status: 'active',
          mustChangePassword: true,
          role: 'company_admin',
        },
      ]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context, req } = createMockContext(
      { authorization: 'Bearer user:auth-id-must-change' },
      { method: 'PATCH', path: '/v1/users/me/password' },
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toEqual({
      userId: 'u-1',
      authId: 'auth-id-must-change',
      companyId: 'c-1',
      roles: ['company_admin'],
      mustChangePassword: true,
      status: 'active',
      email: 'new@example.com',
      name: 'New User',
    });
  });

  it('permite acesso quando o decorator AllowPasswordChange está presente mesmo em rota diferente', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-must-change',
    });
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: 'u-1',
          authId: 'auth-id-must-change',
          companyId: 'c-1',
          name: 'New User',
          email: 'new@example.com',
          cpf: '12345678901',
          status: 'active',
          mustChangePassword: true,
          role: 'company_admin',
        },
      ]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context } = createMockContext(
      { authorization: 'Bearer user:auth-id-must-change' },
      { method: 'POST', path: '/v1/custom-change-password' },
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('enriquece request.user com perfil e múltiplos papéis quando usuário é ativo e válido', async () => {
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce({
      userId: 'auth-id-valid',
    });

    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          id: 'u-10',
          authId: 'auth-id-valid',
          companyId: 'c-10',
          name: 'Super Admin User',
          email: 'admin@sentience.internal',
          cpf: '52998224725',
          status: 'active',
          mustChangePassword: false,
          role: 'super_admin',
        },
        {
          id: 'u-10',
          authId: 'auth-id-valid',
          companyId: 'c-10',
          name: 'Super Admin User',
          email: 'admin@sentience.internal',
          cpf: '52998224725',
          status: 'active',
          mustChangePassword: false,
          role: 'company_admin',
        },
      ]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const { context, req } = createMockContext({
      authorization: 'Bearer user:auth-id-valid',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toEqual({
      userId: 'u-10',
      authId: 'auth-id-valid',
      companyId: 'c-10',
      roles: ['super_admin', 'company_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@sentience.internal',
      name: 'Super Admin User',
    });
  });
});
