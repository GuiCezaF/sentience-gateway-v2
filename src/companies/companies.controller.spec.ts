import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompaniesController } from './companies.controller.js';
import type { CompaniesService } from './companies.service.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let mockService: CompaniesService;

  beforeEach(() => {
    mockService = {
      createCompany: vi.fn(),
      findAllCompanies: vi.fn(),
    } as unknown as CompaniesService;
    controller = new CompaniesController(mockService);
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

    vi.mocked(mockService.createCompany).mockResolvedValue(expectedResponse);

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

    vi.mocked(mockService.findAllCompanies).mockResolvedValue(expectedList);

    const res = await controller.listCompanies();
    expect(res).toBe(expectedList);
    expect(mockService.findAllCompanies).toHaveBeenCalled();
  });
});
