import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAuthAdminProvider } from './fake-auth-admin.provider.js';

describe('FakeAuthAdminProvider', () => {
  let provider: FakeAuthAdminProvider;

  beforeEach(() => {
    provider = new FakeAuthAdminProvider();
  });

  it('cria usuário e armazena em memória', async () => {
    const res = await provider.createUser({
      email: 'admin@acme.com',
      password: 'password123',
    });

    expect(res.id).toBeDefined();
    expect(res.email).toBe('admin@acme.com');

    const stored = provider.getUser(res.id);
    expect(stored).toBeDefined();
    expect(stored?.email).toBe('admin@acme.com');
    expect(stored?.password).toBe('password123');
  });

  it('rejeita criação com email duplicado (case insensitive)', async () => {
    await provider.createUser({
      email: 'admin@acme.com',
      password: 'p1',
    });

    await expect(
      provider.createUser({
        email: 'ADMIN@acme.com',
        password: 'p2',
      }),
    ).rejects.toThrow(
      'A user with this email address has already been registered',
    );
  });

  it('remove usuário e registra a chamada em deleteCalls', async () => {
    const user = await provider.createUser({
      email: 'user@acme.com',
      password: 'p1',
    });

    await provider.deleteUser(user.id);

    expect(provider.deleteCalls).toEqual([user.id]);
    expect(provider.getUser(user.id)).toBeUndefined();
  });

  it('atualiza senha e registra em updatePasswordCalls', async () => {
    const user = await provider.createUser({
      email: 'user@acme.com',
      password: 'old-password',
    });

    await provider.updatePassword(user.id, 'new-password');

    expect(provider.updatePasswordCalls).toEqual([
      { id: user.id, password: 'new-password' },
    ]);
    expect(provider.getUser(user.id)?.password).toBe('new-password');
  });

  it('limpa estado com clear', async () => {
    const user = await provider.createUser({
      email: 'user@acme.com',
      password: 'p1',
    });
    await provider.deleteUser(user.id);
    provider.clear();

    expect(provider.users.size).toBe(0);
    expect(provider.deleteCalls).toHaveLength(0);
  });

  describe('verifyCredentials', () => {
    it('retorna true quando as credenciais conferem', async () => {
      await provider.createUser({
        email: 'user@acme.com',
        password: 'correct-password',
      });

      const result = await provider.verifyCredentials(
        'user@acme.com',
        'correct-password',
      );
      expect(result).toBe(true);
    });

    it('retorna false quando a senha está errada', async () => {
      await provider.createUser({
        email: 'user@acme.com',
        password: 'correct-password',
      });

      const result = await provider.verifyCredentials(
        'user@acme.com',
        'wrong-password',
      );
      expect(result).toBe(false);
    });

    it('retorna false quando o usuário não existe', async () => {
      const result = await provider.verifyCredentials(
        'nonexistent@acme.com',
        'any-password',
      );
      expect(result).toBe(false);
    });
  });

  describe('signInWithPassword', () => {
    it('retorna AuthSessionResult com tokens e authId no login com sucesso', async () => {
      const created = await provider.createUser({
        email: 'user@acme.com',
        password: 'password123',
      });

      const session = await provider.signInWithPassword({
        email: 'user@acme.com',
        password: 'password123',
        clientIp: '127.0.0.1',
      });

      expect(session).toEqual({
        accessToken: `user:${created.id}`,
        refreshToken: `refresh:${created.id}`,
        tokenType: 'bearer',
        expiresIn: 3600,
        authId: created.id,
      });

      expect(provider.signInCalls).toEqual([
        {
          email: 'user@acme.com',
          password: 'password123',
          clientIp: '127.0.0.1',
        },
      ]);
    });

    it('retorna null se a senha estiver incorreta', async () => {
      await provider.createUser({
        email: 'user@acme.com',
        password: 'correctPassword',
      });

      const session = await provider.signInWithPassword({
        email: 'user@acme.com',
        password: 'wrongPassword',
      });

      expect(session).toBeNull();
    });

    it('retorna null se o usuário não existir', async () => {
      const session = await provider.signInWithPassword({
        email: 'unknown@acme.com',
        password: 'anyPassword',
      });

      expect(session).toBeNull();
    });
  });
});
