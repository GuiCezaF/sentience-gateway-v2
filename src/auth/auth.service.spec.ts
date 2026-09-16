import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthAdminProvider } from './auth-admin-provider.interface.js';

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: any;
  let mockAuthAdmin: AuthAdminProvider;

  const now = new Date();

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
    };
    mockAuthAdmin = {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      updatePassword: vi.fn(),
      verifyCredentials: vi.fn(),
      signInWithPassword: vi.fn(),
    };
    service = new AuthService(mockDb, mockAuthAdmin);
  });

  describe('login', () => {
    it('autentica com sucesso e retorna tokens e perfil camelCase', async () => {
      vi.mocked(mockAuthAdmin.signInWithPassword).mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'bearer',
        expiresIn: 3600,
        authId: 'auth-123',
      });

      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 'u-123',
            authId: 'auth-123',
            name: 'Maria Silva',
            email: 'maria@exemplo.com.br',
            cpf: '52998224725',
            status: 'active',
            mustChangePassword: false,
            createdAt: now,
            updatedAt: now,
            company: {
              id: 'c-123',
              cnpj: '12ABC34501DE35',
              legalName: 'Empresa Exemplo Ltda',
              emailDomain: 'exemplo.com.br',
            },
          },
        ]),
      };

      const roleSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ role: 'company_admin' }]),
      };

      mockDb.select
        .mockReturnValueOnce(userSelectBuilder)
        .mockReturnValueOnce(roleSelectBuilder);

      const response = await service.login(
        {
          email: 'maria@exemplo.com.br',
          password: 'Password123!',
        },
        '10.0.0.1',
      );

      expect(mockAuthAdmin.signInWithPassword).toHaveBeenCalledWith({
        email: 'maria@exemplo.com.br',
        password: 'Password123!',
        clientIp: '10.0.0.1',
      });

      expect(response).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'bearer',
        expiresIn: 3600,
        user: {
          id: 'u-123',
          authId: 'auth-123',
          companyId: 'c-123',
          name: 'Maria Silva',
          email: 'maria@exemplo.com.br',
          cpf: '52998224725',
          status: 'active',
          mustChangePassword: false,
          roles: ['company_admin'],
          company: {
            id: 'c-123',
            cnpj: '12ABC34501DE35',
            legalName: 'Empresa Exemplo Ltda',
            emailDomain: 'exemplo.com.br',
          },
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      });
    });

    it('permite login de usuário com mustChangePassword: true retornando a flag', async () => {
      vi.mocked(mockAuthAdmin.signInWithPassword).mockResolvedValue({
        accessToken: 'temp-access-token',
        refreshToken: 'temp-refresh-token',
        tokenType: 'bearer',
        expiresIn: 3600,
        authId: 'auth-temp',
      });

      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 'u-temp',
            authId: 'auth-temp',
            name: 'Novo Usuário',
            email: 'novo@exemplo.com.br',
            cpf: '11144477735',
            status: 'active',
            mustChangePassword: true,
            createdAt: now,
            updatedAt: now,
            company: {
              id: 'c-123',
              cnpj: '12ABC34501DE35',
              legalName: 'Empresa Exemplo Ltda',
              emailDomain: 'exemplo.com.br',
            },
          },
        ]),
      };

      const roleSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ role: 'user' }]),
      };

      mockDb.select
        .mockReturnValueOnce(userSelectBuilder)
        .mockReturnValueOnce(roleSelectBuilder);

      const response = await service.login({
        email: 'novo@exemplo.com.br',
        password: 'TempPassword123',
      });

      expect(response.user.mustChangePassword).toBe(true);
      expect(response.accessToken).toBe('temp-access-token');
    });

    it('lança 401 genérico quando o provedor de auth rejeita as credenciais', async () => {
      vi.mocked(mockAuthAdmin.signInWithPassword).mockResolvedValue(null);

      await expect(
        service.login({
          email: 'wrong@exemplo.com.br',
          password: 'bad-password',
        }),
      ).rejects.toThrow(
        new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid email or password',
        }),
      );

      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('lança 401 genérico quando o usuário autenticou no Auth mas não existe no banco local', async () => {
      vi.mocked(mockAuthAdmin.signInWithPassword).mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenType: 'bearer',
        expiresIn: 3600,
        authId: 'unregistered-auth-id',
      });

      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValueOnce(userSelectBuilder);

      await expect(
        service.login({
          email: 'unregistered@exemplo.com.br',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid email or password',
        }),
      );
    });

    it('lança 403 Forbidden com { error: "user_inactive" } quando usuário está inativo', async () => {
      vi.mocked(mockAuthAdmin.signInWithPassword).mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenType: 'bearer',
        expiresIn: 3600,
        authId: 'inactive-auth-id',
      });

      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 'u-inactive',
            authId: 'inactive-auth-id',
            name: 'Usuário Inativo',
            email: 'inactive@exemplo.com.br',
            cpf: '11144477735',
            status: 'inactive',
            mustChangePassword: false,
            createdAt: now,
            updatedAt: now,
            company: {
              id: 'c-123',
              cnpj: '12ABC34501DE35',
              legalName: 'Empresa Exemplo Ltda',
              emailDomain: 'exemplo.com.br',
            },
          },
        ]),
      };

      mockDb.select.mockReturnValueOnce(userSelectBuilder);

      await expect(
        service.login({
          email: 'inactive@exemplo.com.br',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new ForbiddenException({
          error: 'user_inactive',
        }),
      );
    });
  });
});
