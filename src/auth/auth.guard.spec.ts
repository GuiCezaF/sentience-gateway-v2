import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { AuthProvider } from './auth-provider.interface.js';

function createMockContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  req: AuthenticatedRequest;
} {
  const req = {
    headers,
  } as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('AuthGuard', () => {
  const mockAuthProvider: AuthProvider = {
    verify: vi.fn(),
  };

  const guard = new AuthGuard(mockAuthProvider);

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

  it('anexa o usuário à requisição e permite o acesso quando o token é válido', async () => {
    const user = { userId: 'a0000000-0000-0000-0000-000000000001' };
    vi.mocked(mockAuthProvider.verify).mockResolvedValueOnce(user);

    const { context, req } = createMockContext({
      authorization: 'Bearer user:a0000000-0000-0000-0000-000000000001',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toEqual(user);
    expect(mockAuthProvider.verify).toHaveBeenCalledWith(
      'user:a0000000-0000-0000-0000-000000000001',
    );
  });
});
