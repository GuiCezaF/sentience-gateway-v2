import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { LoginResponse } from './dto/login.dto.js';
import type { RefreshResponse } from './dto/refresh.dto.js';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: AuthService;

  const mockLoginResponse: LoginResponse = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenType: 'bearer',
    expiresIn: 3600,
    user: {
      id: 'u-1',
      authId: 'auth-1',
      companyId: 'c-1',
      name: 'Test User',
      email: 'user@example.com',
      cpf: '52998224725',
      status: 'active',
      mustChangePassword: false,
      roles: ['user'],
      company: {
        id: 'c-1',
        cnpj: '12ABC34501DE35',
        legalName: 'Test Corp',
        emailDomain: 'example.com',
      },
      createdAt: '2026-09-15T20:00:00.000Z',
      updatedAt: '2026-09-15T20:00:00.000Z',
    },
  };

  const mockRefreshResponse: RefreshResponse = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    tokenType: 'bearer',
    expiresIn: 3600,
  };

  beforeEach(() => {
    mockAuthService = {
      login: vi.fn().mockResolvedValue(mockLoginResponse),
      refresh: vi.fn().mockResolvedValue(mockRefreshResponse),
    } as unknown as AuthService;
    controller = new AuthController(mockAuthService);
  });

  describe('login', () => {
    it('chama authService.login extraindo clientIp de x-forwarded-for (string separada por vírgula)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
      } as unknown as Request;

      const body = {
        email: 'user@example.com',
        password: 'Password123!',
      };

      const result = await controller.login(body, req);

      expect(mockAuthService.login).toHaveBeenCalledWith(body, '203.0.113.195');
      expect(result).toEqual(mockLoginResponse);
    });

    it('chama authService.login extraindo clientIp de x-forwarded-for (array)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': ['198.51.100.1'],
        },
      } as unknown as Request;

      const body = {
        email: 'user@example.com',
        password: 'Password123!',
      };

      await controller.login(body, req);

      expect(mockAuthService.login).toHaveBeenCalledWith(body, '198.51.100.1');
    });

    it('chama authService.login com req.ip quando header x-forwarded-for está ausente', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.10',
      } as unknown as Request;

      const body = {
        email: 'user@example.com',
        password: 'Password123!',
      };

      await controller.login(body, req);

      expect(mockAuthService.login).toHaveBeenCalledWith(body, '192.168.1.10');
    });

    it('chama authService.login com socket.remoteAddress quando ip está ausente', async () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '10.0.0.5' },
      } as unknown as Request;

      const body = {
        email: 'user@example.com',
        password: 'Password123!',
      };

      await controller.login(body, req);

      expect(mockAuthService.login).toHaveBeenCalledWith(body, '10.0.0.5');
    });
  });

  describe('refresh', () => {
    it('chama authService.refresh extraindo clientIp de x-forwarded-for (string separada por vírgula)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
      } as unknown as Request;

      const body = {
        refreshToken: 'valid-refresh-token',
      };

      const result = await controller.refresh(body, req);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        body,
        '203.0.113.195',
      );
      expect(result).toEqual(mockRefreshResponse);
    });

    it('chama authService.refresh extraindo clientIp de x-forwarded-for (array)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': ['198.51.100.1'],
        },
      } as unknown as Request;

      const body = {
        refreshToken: 'valid-refresh-token',
      };

      await controller.refresh(body, req);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        body,
        '198.51.100.1',
      );
    });

    it('chama authService.refresh com req.ip quando header x-forwarded-for está ausente', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.10',
      } as unknown as Request;

      const body = {
        refreshToken: 'valid-refresh-token',
      };

      await controller.refresh(body, req);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        body,
        '192.168.1.10',
      );
    });

    it('chama authService.refresh com socket.remoteAddress quando ip está ausente', async () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '10.0.0.5' },
      } as unknown as Request;

      const body = {
        refreshToken: 'valid-refresh-token',
      };

      await controller.refresh(body, req);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(body, '10.0.0.5');
    });
  });
});
