import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';

describe('UsersController', () => {
  let controller: UsersController;
  let mockService: {
    [K in keyof UsersService]?: ReturnType<typeof vi.fn>;
  };

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
    mockService = {
      getProfile: vi.fn(),
      changePassword: vi.fn(),
    };
    controller = new UsersController(mockService as unknown as UsersService);
  });

  it('delega getProfile para o UsersService', async () => {
    const expectedProfile = {
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (mockService.getProfile as any).mockResolvedValue(expectedProfile);

    const result = await controller.getProfile(mockUser);

    expect(result).toBe(expectedProfile);
    expect(mockService.getProfile).toHaveBeenCalledWith('u-123');
  });

  it('delega changePassword para o UsersService', async () => {
    const expectedResult = { message: 'Password changed successfully' };
    (mockService.changePassword as any).mockResolvedValue(expectedResult);

    const dto = {
      currentPassword: 'oldPassword12',
      newPassword: 'newPassword123!',
    };

    const result = await controller.changePassword(mockUser, dto);

    expect(result).toBe(expectedResult);
    expect(mockService.changePassword).toHaveBeenCalledWith(
      mockUser,
      dto,
      undefined,
    );
  });

  it('extrai clientIp de x-forwarded-for e repassa para o UsersService', async () => {
    const expectedResult = { message: 'Password changed successfully' };
    (mockService.changePassword as any).mockResolvedValue(expectedResult);

    const dto = {
      currentPassword: 'oldPassword12',
      newPassword: 'newPassword123!',
    };

    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
      },
    } as any;

    const result = await controller.changePassword(mockUser, dto, req);

    expect(result).toBe(expectedResult);
    expect(mockService.changePassword).toHaveBeenCalledWith(
      mockUser,
      dto,
      '203.0.113.195',
    );
  });
});
