import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';

describe('UsersController', () => {
  let controller: UsersController;
  let mockService: UsersService;

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
    } as unknown as UsersService;
    controller = new UsersController(mockService);
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

    vi.mocked(mockService.getProfile).mockResolvedValue(expectedProfile);

    const result = await controller.getProfile(mockUser);

    expect(result).toBe(expectedProfile);
    expect(mockService.getProfile).toHaveBeenCalledWith('u-123');
  });

  it('delega changePassword para o UsersService', async () => {
    const expectedResult = { message: 'Password changed successfully' };
    vi.mocked(mockService.changePassword).mockResolvedValue(expectedResult);

    const dto = {
      currentPassword: 'oldPassword12',
      newPassword: 'newPassword123!',
    };

    const result = await controller.changePassword(mockUser, dto);

    expect(result).toBe(expectedResult);
    expect(mockService.changePassword).toHaveBeenCalledWith(mockUser, dto);
  });
});
