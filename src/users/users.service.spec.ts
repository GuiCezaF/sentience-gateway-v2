import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { AuthAdminProvider } from '../auth/auth-admin-provider.interface.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: any;
  let mockAuthAdmin: AuthAdminProvider;

  const mockUser: AuthUser = {
    userId: 'u-123',
    authId: 'auth-123',
    companyId: 'c-123',
    name: 'Carlos Oliveira',
    email: 'carlos@alphacorp.com.br',
    status: 'active',
    mustChangePassword: true,
    roles: ['company_admin'],
  };

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      update: vi.fn(),
    };
    mockAuthAdmin = {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      updatePassword: vi.fn(),
      verifyCredentials: vi.fn(),
    };
    service = new UsersService(mockDb, mockAuthAdmin);
  });

  describe('getProfile', () => {
    it('retorna o perfil completo do usuário incluindo empresa e papéis', async () => {
      const now = new Date();
      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 'u-123',
            authId: 'auth-123',
            name: 'Carlos Oliveira',
            email: 'carlos@alphacorp.com.br',
            cpf: '11144477735',
            status: 'active',
            mustChangePassword: false,
            createdAt: now,
            updatedAt: now,
            company: {
              id: 'c-123',
              cnpj: '12ABC34501DE35',
              legalName: 'Alpha Corp Ltda',
              emailDomain: 'alphacorp.com.br',
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

      const profile = await service.getProfile('u-123');

      expect(profile).toEqual({
        id: 'u-123',
        auth_id: 'auth-123',
        name: 'Carlos Oliveira',
        email: 'carlos@alphacorp.com.br',
        cpf: '11144477735',
        status: 'active',
        must_change_password: false,
        company: {
          id: 'c-123',
          cnpj: '12ABC34501DE35',
          legal_name: 'Alpha Corp Ltda',
          email_domain: 'alphacorp.com.br',
        },
        roles: ['company_admin'],
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    });

    it('lança NotFoundException quando o usuário não é encontrado', async () => {
      const userSelectBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValueOnce(userSelectBuilder);

      await expect(service.getProfile('u-not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('changePassword', () => {
    it('troca a senha com sucesso, atualiza no Supabase Auth e desmarca mustChangePassword no banco', async () => {
      vi.mocked(mockAuthAdmin.verifyCredentials).mockResolvedValue(true);
      vi.mocked(mockAuthAdmin.updatePassword).mockResolvedValue(undefined);

      const updateBuilder = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValue(updateBuilder);

      const result = await service.changePassword(mockUser, {
        currentPassword: 'oldTempPassword12',
        newPassword: 'newPermanentPassword123!',
      });

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockAuthAdmin.verifyCredentials).toHaveBeenCalledWith(
        'carlos@alphacorp.com.br',
        'oldTempPassword12',
        undefined,
      );
      expect(mockAuthAdmin.updatePassword).toHaveBeenCalledWith(
        'auth-123',
        'newPermanentPassword123!',
      );
      expect(mockDb.update).toHaveBeenCalled();
      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          mustChangePassword: false,
        }),
      );
    });

    it('repassa clientIp para authAdminProvider.verifyCredentials quando informado', async () => {
      vi.mocked(mockAuthAdmin.verifyCredentials).mockResolvedValue(true);
      vi.mocked(mockAuthAdmin.updatePassword).mockResolvedValue(undefined);

      const updateBuilder = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValue(updateBuilder);

      await service.changePassword(
        mockUser,
        {
          currentPassword: 'oldTempPassword12',
          newPassword: 'newPermanentPassword123!',
        },
        '198.51.100.22',
      );

      expect(mockAuthAdmin.verifyCredentials).toHaveBeenCalledWith(
        'carlos@alphacorp.com.br',
        'oldTempPassword12',
        '198.51.100.22',
      );
    });

    it('lança BadRequestException quando a senha atual é inválida', async () => {
      vi.mocked(mockAuthAdmin.verifyCredentials).mockResolvedValue(false);

      await expect(
        service.changePassword(mockUser, {
          currentPassword: 'wrongPassword',
          newPassword: 'newPermanentPassword123!',
        }),
      ).rejects.toThrow(new BadRequestException('Invalid current password'));

      expect(mockAuthAdmin.updatePassword).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
