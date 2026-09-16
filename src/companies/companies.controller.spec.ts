import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompaniesController } from './companies.controller.js';
import type { CompaniesService } from './companies.service.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let mockService: {
    [K in keyof CompaniesService]?: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockService = {
      createCompany: vi.fn(),
      findAllCompanies: vi.fn(),
    };
    controller = new CompaniesController(
      mockService as unknown as CompaniesService,
    );
  });

  it('delega createCompany para o CompaniesService', async () => {
    const dto: CreateCompanyDto = {
      cnpj: '12ABC34501DE35',
      legal_name: 'Acme Corp',
      email_domain: 'acme.com.br',
      owner: {
        name: 'Maria',
        email: 'maria@acme.com.br',
        cpf: '52998224725',
      },
    };

    const expectedResponse = {
      company: {
        id: 'c-1',
        cnpj: dto.cnpj,
        legal_name: dto.legal_name,
        email_domain: dto.email_domain,
        created_at: new Date().toISOString(),
      },
      owner: {
        id: 'u-1',
        auth_id: 'a-1',
        name: dto.owner.name,
        email: dto.owner.email,
        cpf: dto.owner.cpf,
        role: 'company_admin',
      },
      temporary_password: 'tempPass12',
    };

    (mockService.createCompany as any).mockResolvedValue(expectedResponse);

    const res = await controller.createCompany(dto);
    expect(res).toBe(expectedResponse);
    expect(mockService.createCompany).toHaveBeenCalledWith(dto);
  });

  it('delega listCompanies para o CompaniesService', async () => {
    const expectedList = [
      {
        id: 'c-1',
        cnpj: '12ABC34501DE35',
        legal_name: 'Acme Corp',
        email_domain: 'acme.com.br',
        created_at: new Date().toISOString(),
      },
    ];

    (mockService.findAllCompanies as any).mockResolvedValue(expectedList);

    const res = await controller.listCompanies();
    expect(res).toBe(expectedList);
    expect(mockService.findAllCompanies).toHaveBeenCalled();
  });

  it('delega createCompanyUser para o CompaniesService', async () => {
    const dto = {
      name: 'Carlos Oliveira',
      email: 'carlos@acme.com.br',
      cpf: '11144477735',
    };

    const mockCurrentUser = {
      userId: 'admin-1',
      authId: 'auth-1',
      companyId: 'c-1',
      roles: ['company_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@acme.com.br',
      name: 'Admin',
    };

    const expectedResponse = {
      id: 'u-2',
      auth_id: 'a-2',
      name: dto.name,
      email: dto.email,
      cpf: dto.cpf,
      role: 'user',
      status: 'active',
      must_change_password: true,
      temporary_password: 'tempPass12',
      created_at: new Date().toISOString(),
    };

    mockService.createCompanyUser = vi.fn().mockResolvedValue(expectedResponse);

    const res = await controller.createCompanyUser('c-1', dto, mockCurrentUser);
    expect(res).toBe(expectedResponse);
    expect(mockService.createCompanyUser).toHaveBeenCalledWith(
      'c-1',
      dto,
      mockCurrentUser,
    );
  });

  it('delega listCompanyUsers para o CompaniesService', async () => {
    const mockCurrentUser = {
      userId: 'admin-1',
      authId: 'auth-1',
      companyId: 'c-1',
      roles: ['company_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@acme.com.br',
      name: 'Admin',
    };

    const expectedUsers = [
      {
        id: 'u-2',
        auth_id: 'a-2',
        name: 'Carlos Oliveira',
        email: 'carlos@acme.com.br',
        cpf: '11144477735',
        status: 'active',
        must_change_password: true,
        role: 'user',
        roles: ['user'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    mockService.findCompanyUsers = vi.fn().mockResolvedValue(expectedUsers);

    const res = await controller.listCompanyUsers('c-1', mockCurrentUser);
    expect(res).toBe(expectedUsers);
    expect(mockService.findCompanyUsers).toHaveBeenCalledWith(
      'c-1',
      mockCurrentUser,
    );
  });
});
