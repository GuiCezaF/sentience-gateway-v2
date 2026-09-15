import { describe, it, expect, vi } from 'vitest';
import { SupabaseAuthAdminProvider } from './supabase-auth-admin.provider.js';

describe('SupabaseAuthAdminProvider', () => {
  const supabaseUrl = 'https://test-project.supabase.co/';
  const serviceRoleKey = 'test-service-role-key';

  describe('createUser', () => {
    it('cria usuário com sucesso chamando POST /auth/v1/admin/users', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'u-123',
          email: 'user@acme.com',
        }),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      const result = await provider.createUser({
        email: 'user@acme.com',
        password: 'temp-password',
      });

      expect(result).toEqual({ id: 'u-123', email: 'user@acme.com' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/auth/v1/admin/users',
        {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'user@acme.com',
            password: 'temp-password',
            email_confirm: true,
            user_metadata: {},
          }),
        },
      );
    });

    it('lança erro quando a API do Supabase retorna erro HTTP', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          msg: 'A user with this email address has already been registered',
        }),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await expect(
        provider.createUser({
          email: 'duplicate@acme.com',
          password: 'temp-password',
        }),
      ).rejects.toThrow(
        'A user with this email address has already been registered',
      );
    });
  });

  describe('deleteUser', () => {
    it('deleta usuário com sucesso chamando DELETE /auth/v1/admin/users/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await provider.deleteUser('u-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/auth/v1/admin/users/u-123',
        {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('ignora silenciosamente quando o usuário já não existe (404)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ msg: 'User not found' }),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await expect(provider.deleteUser('u-not-found')).resolves.toBeUndefined();
    });

    it('lança erro quando ocorre falha 500 no Supabase', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ msg: 'Internal server error' }),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await expect(provider.deleteUser('u-123')).rejects.toThrow(
        'Internal server error',
      );
    });
  });

  describe('updatePassword', () => {
    it('atualiza a senha com sucesso chamando PUT /auth/v1/admin/users/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await provider.updatePassword('u-123', 'new-password');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/auth/v1/admin/users/u-123',
        {
          method: 'PUT',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: 'new-password' }),
        },
      );
    });

    it('lança erro se o update falhar', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Password is too weak' }),
      });

      const provider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
        mockFetch as unknown as typeof fetch,
      );

      await expect(provider.updatePassword('u-123', 'weak')).rejects.toThrow(
        'Password is too weak',
      );
    });
  });
});
