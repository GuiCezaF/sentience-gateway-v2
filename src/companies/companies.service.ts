import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  AUTH_ADMIN_PROVIDER,
  type AdminUserResult,
  type AuthAdminProvider,
} from '../auth/auth-admin-provider.interface.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import { generateTemporaryPassword } from '../common/crypto/temporary-password.js';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { companies, userRoles, users } from '../db/schema.js';
import type {
  CompanyListItemResponse,
  CreateCompanyDto,
  CreatedCompanyResponse,
} from './dto/create-company.dto.js';
import type {
  CompanyUserListItemResponse,
  CreateCompanyUserDto,
  CreatedCompanyUserResponse,
} from './dto/create-company-user.dto.js';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
    @Inject(AUTH_ADMIN_PROVIDER)
    private readonly authAdminProvider: AuthAdminProvider,
  ) {}

  async createCompany(dto: CreateCompanyDto): Promise<CreatedCompanyResponse> {
    // 1. Validação de conflito de CNPJ
    const existingCompany = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.cnpj, dto.cnpj))
      .limit(1);

    if (existingCompany.length > 0) {
      throw new ConflictException('Company with this CNPJ already exists');
    }

    // 2. Validação do domínio corporativo do dono
    const emailParts = dto.owner.email.split('@');
    const emailDomain = emailParts[1]?.toLowerCase();
    if (emailDomain !== dto.email_domain.toLowerCase()) {
      throw new UnprocessableEntityException(
        'Owner email must belong to company email domain',
      );
    }

    // 3. Geração de senha temporária segura de 10 caracteres
    const temporaryPassword = generateTemporaryPassword(10);

    // 4. Saga Passo 1: Criação da identidade no Supabase Auth
    let authUser: AdminUserResult;
    try {
      authUser = await this.authAdminProvider.createUser({
        email: dto.owner.email,
        password: temporaryPassword,
        emailConfirm: true,
        userMetadata: { name: dto.owner.name },
      });
    } catch (error: any) {
      if (
        error?.status === 422 ||
        error?.message?.includes('already been registered')
      ) {
        throw new ConflictException(
          'User with this email already exists in Auth',
        );
      }
      throw error;
    }

    // 5. Saga Passo 2: Persistência no banco local em transação
    try {
      const result = await this.db.transaction(async (tx) => {
        const [createdCompany] = await tx
          .insert(companies)
          .values({
            cnpj: dto.cnpj,
            legalName: dto.legal_name,
            emailDomain: dto.email_domain,
          })
          .returning();

        const [createdUser] = await tx
          .insert(users)
          .values({
            authId: authUser.id,
            companyId: createdCompany.id,
            name: dto.owner.name,
            email: dto.owner.email,
            cpf: dto.owner.cpf,
            status: 'active',
            mustChangePassword: true,
          })
          .returning();

        const [createdRole] = await tx
          .insert(userRoles)
          .values({
            userId: createdUser.id,
            role: 'company_admin',
          })
          .returning();

        return {
          company: createdCompany,
          user: createdUser,
          role: createdRole,
        };
      });

      return {
        company: {
          id: result.company.id,
          cnpj: result.company.cnpj,
          legal_name: result.company.legalName,
          email_domain: result.company.emailDomain,
          created_at: result.company.createdAt.toISOString(),
        },
        owner: {
          id: result.user.id,
          auth_id: result.user.authId,
          name: result.user.name,
          email: result.user.email,
          cpf: result.user.cpf,
          role: result.role.role,
        },
        temporary_password: temporaryPassword,
      };
    } catch (dbError) {
      // Compensação da Saga: Deleta o usuário criado no Supabase Auth
      this.logger.warn(
        `Database transaction failed for company ${dto.cnpj}. Compensating Auth user ${authUser.id}...`,
      );
      try {
        await this.authAdminProvider.deleteUser(authUser.id);
      } catch (deleteError) {
        this.logger.error(
          `Failed to compensate auth user ${authUser.id} after database transaction failure`,
          deleteError,
        );
      }
      throw dbError;
    }
  }

  async findAllCompanies(): Promise<CompanyListItemResponse[]> {
    const rows = await this.db
      .select()
      .from(companies)
      .orderBy(desc(companies.createdAt));

    return rows.map((c) => ({
      id: c.id,
      cnpj: c.cnpj,
      legal_name: c.legalName,
      email_domain: c.emailDomain,
      created_at: c.createdAt.toISOString(),
    }));
  }

  async createCompanyUser(
    companyId: string,
    dto: CreateCompanyUserDto,
    currentUser: AuthUser,
  ): Promise<CreatedCompanyUserResponse> {
    // 1. Autorização Tenant: apenas super_admin ou admin da própria empresa
    const isSuperAdmin = currentUser.roles.includes('super_admin');
    if (!isSuperAdmin && currentUser.companyId !== companyId) {
      throw new ForbiddenException(
        'Access denied: user does not belong to this company',
      );
    }

    // 2. Existência da empresa alvo
    const [targetCompany] = await this.db
      .select({
        id: companies.id,
        emailDomain: companies.emailDomain,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!targetCompany) {
      throw new NotFoundException('Company not found');
    }

    // 3. Validação do domínio corporativo
    const emailParts = dto.email.split('@');
    const emailDomain = emailParts[1]?.toLowerCase();
    if (emailDomain !== targetCompany.emailDomain.toLowerCase()) {
      throw new UnprocessableEntityException(
        'User email must belong to company email domain',
      );
    }

    // 4. Validação de conflito de CPF na mesma empresa
    const existingCpf = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.cpf, dto.cpf)))
      .limit(1);

    if (existingCpf.length > 0) {
      throw new ConflictException(
        'User with this CPF already exists in this company',
      );
    }

    // 5. Validação de conflito de email no banco local
    const existingEmail = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    // 6. Geração de senha temporária segura de 10 caracteres
    const temporaryPassword = generateTemporaryPassword(10);

    // 7. Saga Passo 1: Criação da identidade no Supabase Auth
    let authUser: AdminUserResult;
    try {
      authUser = await this.authAdminProvider.createUser({
        email: dto.email,
        password: temporaryPassword,
        emailConfirm: true,
        userMetadata: { name: dto.name },
      });
    } catch (error: any) {
      if (
        error?.status === 422 ||
        error?.message?.includes('already been registered')
      ) {
        throw new ConflictException(
          'User with this email already exists in Auth',
        );
      }
      throw error;
    }

    // 8. Saga Passo 2: Persistência no banco local em transação
    try {
      const result = await this.db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(users)
          .values({
            authId: authUser.id,
            companyId: targetCompany.id,
            name: dto.name,
            email: dto.email,
            cpf: dto.cpf,
            status: 'active',
            mustChangePassword: true,
          })
          .returning();

        const [createdRole] = await tx
          .insert(userRoles)
          .values({
            userId: createdUser.id,
            role: 'user',
          })
          .returning();

        return {
          user: createdUser,
          role: createdRole,
        };
      });

      return {
        id: result.user.id,
        auth_id: result.user.authId,
        name: result.user.name,
        email: result.user.email,
        cpf: result.user.cpf,
        role: result.role.role,
        status: result.user.status,
        must_change_password: result.user.mustChangePassword,
        temporary_password: temporaryPassword,
        created_at: result.user.createdAt.toISOString(),
      };
    } catch (dbError) {
      // Compensação da Saga: Deleta o usuário criado no Supabase Auth
      this.logger.warn(
        `Database transaction failed for user ${dto.email} in company ${companyId}. Compensating Auth user ${authUser.id}...`,
      );
      try {
        await this.authAdminProvider.deleteUser(authUser.id);
      } catch (deleteError) {
        this.logger.error(
          `Failed to compensate auth user ${authUser.id} after database transaction failure`,
          deleteError,
        );
      }
      throw dbError;
    }
  }

  async findCompanyUsers(
    companyId: string,
    currentUser: AuthUser,
  ): Promise<CompanyUserListItemResponse[]> {
    // 1. Autorização Tenant: apenas super_admin ou admin da própria empresa
    const isSuperAdmin = currentUser.roles.includes('super_admin');
    if (!isSuperAdmin && currentUser.companyId !== companyId) {
      throw new ForbiddenException(
        'Access denied: user does not belong to this company',
      );
    }

    // 2. Existência da empresa alvo
    const [targetCompany] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!targetCompany) {
      throw new NotFoundException('Company not found');
    }

    // 3. Consulta de usuários com seus papéis
    const rows = await this.db
      .select({
        id: users.id,
        authId: users.authId,
        name: users.name,
        email: users.email,
        cpf: users.cpf,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: userRoles.role,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(users.companyId, companyId))
      .orderBy(desc(users.createdAt));

    const usersMap = new Map<string, CompanyUserListItemResponse>();
    for (const row of rows) {
      let u = usersMap.get(row.id);
      if (!u) {
        u = {
          id: row.id,
          auth_id: row.authId,
          name: row.name,
          email: row.email,
          cpf: row.cpf,
          status: row.status,
          must_change_password: row.mustChangePassword,
          roles: [],
          role: row.role ?? 'user',
          created_at: row.createdAt.toISOString(),
          updated_at: row.updatedAt.toISOString(),
        };
        usersMap.set(row.id, u);
      }
      if (row.role && !u.roles.includes(row.role)) {
        u.roles.push(row.role);
        u.role = u.roles[0];
      }
    }

    return Array.from(usersMap.values());
  }
}
