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
  let mockAuthAdmin: {
    createUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };

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
    service = new CompaniesService(
      mockDb,
      mockAuthAdmin as unknown as AuthAdminProvider,
    );
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
    mockAuthAdmin.createUser.mockResolvedValue({
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

    mockAuthAdmin.createUser.mockResolvedValue({
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

  describe('createCompanyUser', () => {
    const companyId = 'c-123';
    const validUserDto = {
      name: 'Carlos Oliveira',
      email: 'carlos@acme.com.br',
      cpf: '11144477735',
    };

    const companyAdminUser: any = {
      userId: 'admin-1',
      authId: 'auth-1',
      companyId: 'c-123',
      roles: ['company_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@acme.com.br',
      name: 'Admin',
    };

    const superAdminUser: any = {
      userId: 'super-1',
      authId: 'auth-super',
      companyId: 'c-sentinel',
      roles: ['super_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@sentience.internal',
      name: 'Super Admin',
    };

    it('cria usuário com papel user e senha temporária de 10 caracteres com sucesso', async () => {
      // 1. Target company exists
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };

      // 2. CPF does not exist in company
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      // 3. Email does not exist in local db
      const emailSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect)
        .mockReturnValueOnce(emailSelect);

      // 4. AuthAdmin creates user
      mockAuthAdmin.createUser.mockResolvedValue({
        id: 'auth-new-user',
        email: validUserDto.email,
      });

      // 5. DB transaction persists user & role
      const now = new Date();
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockImplementation(() => {
                return [
                  {
                    id: 'u-new',
                    authId: 'auth-new-user',
                    companyId,
                    name: validUserDto.name,
                    email: validUserDto.email,
                    cpf: validUserDto.cpf,
                    status: 'active',
                    mustChangePassword: true,
                    role: 'user',
                    createdAt: now,
                  },
                ];
              }),
            }),
          }),
        };
        return callback(tx);
      });

      const res = await service.createCompanyUser(
        companyId,
        validUserDto,
        companyAdminUser,
      );

      expect(res.id).toBe('u-new');
      expect(res.auth_id).toBe('auth-new-user');
      expect(res.role).toBe('user');
      expect(res.status).toBe('active');
      expect(res.must_change_password).toBe(true);
      expect(res.temporary_password).toHaveLength(10);
      expect(res.temporary_password).toMatch(/^[A-Za-z0-9]+$/);
      expect(mockAuthAdmin.deleteUser).not.toHaveBeenCalled();
    });

    it('permite super_admin cadastrar usuário em qualquer empresa', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const emailSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect)
        .mockReturnValueOnce(emailSelect);

      mockAuthAdmin.createUser.mockResolvedValue({
        id: 'auth-super-created',
        email: validUserDto.email,
      });

      const now = new Date();
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockReturnValue([
                {
                  id: 'u-super',
                  authId: 'auth-super-created',
                  companyId,
                  name: validUserDto.name,
                  email: validUserDto.email,
                  cpf: validUserDto.cpf,
                  status: 'active',
                  mustChangePassword: true,
                  role: 'user',
                  createdAt: now,
                },
              ]),
            }),
          }),
        };
        return callback(tx);
      });

      const res = await service.createCompanyUser(
        companyId,
        validUserDto,
        superAdminUser,
      );

      expect(res.id).toBe('u-super');
    });

    it('lança ForbiddenException (403) se admin tentar cadastrar em outra empresa', async () => {
      const otherCompanyAdmin: any = {
        ...companyAdminUser,
        companyId: 'c-other',
      };

      await expect(
        service.createCompanyUser(companyId, validUserDto, otherCompanyAdmin),
      ).rejects.toThrow('Access denied: user does not belong to this company');

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
    });

    it('lança NotFoundException (404) se a empresa alvo não existir', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(companySelect);

      await expect(
        service.createCompanyUser(companyId, validUserDto, companyAdminUser),
      ).rejects.toThrow('Company not found');
    });

    it('lança UnprocessableEntityException (422) se o domínio do email for divergente', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      mockDb.select.mockReturnValueOnce(companySelect);

      const invalidDomainDto = {
        ...validUserDto,
        email: 'carlos@outro.com.br',
      };

      await expect(
        service.createCompanyUser(
          companyId,
          invalidDomainDto,
          companyAdminUser,
        ),
      ).rejects.toThrow('User email must belong to company email domain');
      expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
    });

    it('lança ConflictException (409) se o CPF já estiver cadastrado na mesma empresa', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 'existing-u' }]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect);

      await expect(
        service.createCompanyUser(companyId, validUserDto, companyAdminUser),
      ).rejects.toThrow('User with this CPF already exists in this company');
      expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
    });

    it('lança ConflictException (409) se o email já estiver cadastrado no banco local', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const emailSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 'existing-u' }]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect)
        .mockReturnValueOnce(emailSelect);

      await expect(
        service.createCompanyUser(companyId, validUserDto, companyAdminUser),
      ).rejects.toThrow('User with this email already exists');
      expect(mockAuthAdmin.createUser).not.toHaveBeenCalled();
    });

    it('lança ConflictException (409) se o email já existir no Supabase Auth', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const emailSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect)
        .mockReturnValueOnce(emailSelect);

      const authErr = new Error('already been registered');
      (authErr as any).status = 422;
      mockAuthAdmin.createUser.mockRejectedValueOnce(authErr);

      await expect(
        service.createCompanyUser(companyId, validUserDto, companyAdminUser),
      ).rejects.toThrow('User with this email already exists in Auth');
    });

    it('executa compensação de saga (deleteUser) se a transação do banco falhar', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue([{ id: companyId, emailDomain: 'acme.com.br' }]),
      };
      const cpfSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const emailSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(cpfSelect)
        .mockReturnValueOnce(emailSelect);

      mockAuthAdmin.createUser.mockResolvedValue({
        id: 'auth-user-rollback',
        email: validUserDto.email,
      });

      mockDb.transaction.mockRejectedValueOnce(
        new Error('Simulated database failure'),
      );

      await expect(
        service.createCompanyUser(companyId, validUserDto, companyAdminUser),
      ).rejects.toThrow('Simulated database failure');

      expect(mockAuthAdmin.deleteUser).toHaveBeenCalledWith(
        'auth-user-rollback',
      );
    });
  });

  describe('findCompanyUsers', () => {
    const companyId = 'c-123';
    const companyAdminUser: any = {
      userId: 'admin-1',
      authId: 'auth-1',
      companyId: 'c-123',
      roles: ['company_admin'],
      mustChangePassword: false,
      status: 'active',
      email: 'admin@acme.com.br',
      name: 'Admin',
    };

    it('lista os usuários da empresa agregando papéis', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: companyId }]),
      };

      const now = new Date();
      const usersSelect = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 'u-1',
            authId: 'a-1',
            name: 'Carlos Oliveira',
            email: 'carlos@acme.com.br',
            cpf: '11144477735',
            status: 'active',
            mustChangePassword: true,
            role: 'user',
            createdAt: now,
            updatedAt: now,
          },
        ]),
      };

      mockDb.select
        .mockReturnValueOnce(companySelect)
        .mockReturnValueOnce(usersSelect);

      const users = await service.findCompanyUsers(companyId, companyAdminUser);

      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({
        id: 'u-1',
        auth_id: 'a-1',
        name: 'Carlos Oliveira',
        email: 'carlos@acme.com.br',
        cpf: '11144477735',
        status: 'active',
        must_change_password: true,
        role: 'user',
        roles: ['user'],
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    });

    it('lança ForbiddenException (403) se admin tentar listar usuários de outra empresa', async () => {
      const otherAdmin: any = {
        ...companyAdminUser,
        companyId: 'c-other',
      };

      await expect(
        service.findCompanyUsers(companyId, otherAdmin),
      ).rejects.toThrow('Access denied: user does not belong to this company');
    });

    it('lança NotFoundException (404) se a empresa não existir', async () => {
      const companySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(companySelect);

      await expect(
        service.findCompanyUsers(companyId, companyAdminUser),
      ).rejects.toThrow('Company not found');
    });
  });
});
