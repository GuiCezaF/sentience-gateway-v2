import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CompaniesService } from './companies.service.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';
import type { AuthAdminProvider } from '../auth/auth-admin-provider.interface.js';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let mockDb: any;
  let mockAuthAdmin: AuthAdminProvider;

  const validDto: CreateCompanyDto = {
    cnpj: '12ABC34501DE35',
    legal_name: 'Acme Corp Ltda',
    email_domain: 'acme.com.br',
    owner: {
      name: 'Maria Silva',
      email: 'maria@acme.com.br',
      cpf: '52998224725',
    },
  };

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      transaction: vi.fn(),
    };
    mockAuthAdmin = {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      updatePassword: vi.fn(),
    };
    service = new CompaniesService(mockDb, mockAuthAdmin);
  });

  it('cria empresa e dono com sucesso retornando dados e senha temporária de 10 caracteres', async () => {
    // 1. CNPJ não existe
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    // 2. AuthAdmin cria usuário
    vi.mocked(mockAuthAdmin.createUser).mockResolvedValue({
      id: 'auth-user-123',
      email: validDto.owner.email,
    });

    // 3. Transação do banco persiste entidades
    const now = new Date();
    mockDb.transaction.mockImplementation(async (callback: any) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              // Retorna dummy baseado no número de chamadas
              return [
                {
                  id: 'c-1',
                  cnpj: validDto.cnpj,
                  legalName: validDto.legal_name,
                  emailDomain: validDto.email_domain,
                  createdAt: now,
                  authId: 'auth-user-123',
                  name: validDto.owner.name,
                  email: validDto.owner.email,
                  cpf: validDto.owner.cpf,
                  role: 'company_admin',
                },
              ];
            }),
          }),
        }),
      };
      return callback(tx);
    });

    const result = await service.createCompany(validDto);

    expect(result.company.cnpj).toBe(validDto.cnpj);
    expect(result.company.legal_name).toBe(validDto.legal_name);
    expect(result.owner.email).toBe(validDto.owner.email);
    expect(result.owner.auth_id).toBe('auth-user-123');
    expect(result.temporary_password).toHaveLength(10);
    expect(result.temporary_password).toMatch(/^[A-Za-z0-9]+$/);
    expect(mockAuthAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('lança ConflictException (409) se o CNPJ já estiver cadastrado', async () => {
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'c-existing' }]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    await expect(service.createCompany(validDto)).rejects.toThrow(
      ConflictException,
    );
    expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
  });

  it('lança UnprocessableEntityException (422) se o email não pertencer ao domínio corporativo', async () => {
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    const invalidEmailDto: CreateCompanyDto = {
      ...validDto,
      owner: {
        ...validDto.owner,
        email: 'maria@gmail.com', // diferente de acme.com.br
      },
    };

    await expect(service.createCompany(invalidEmailDto)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
  });

  it('executa compensação de saga (deleteUser) quando a transação no banco falha', async () => {
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    vi.mocked(mockAuthAdmin.createUser).mockResolvedValue({
      id: 'auth-user-123',
      email: validDto.owner.email,
    });

    mockDb.transaction.mockRejectedValueOnce(
      new Error('Simulated database failure'),
    );

    await expect(service.createCompany(validDto)).rejects.toThrow(
      'Simulated database failure',
    );

    expect(mockAuthAdmin.deleteUser).toHaveBeenCalledWith('auth-user-123');
  });

  it('lista empresas cadastradas via findAllCompanies', async () => {
    const now = new Date();
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: 'c-1',
          cnpj: '12ABC34501DE35',
          legalName: 'Acme Corp Ltda',
          emailDomain: 'acme.com.br',
          createdAt: now,
        },
      ]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    const companiesList = await service.findAllCompanies();
    expect(companiesList).toHaveLength(1);
    expect(companiesList[0].cnpj).toBe('12ABC34501DE35');
    expect(companiesList[0].created_at).toBe(now.toISOString());
  });
});
