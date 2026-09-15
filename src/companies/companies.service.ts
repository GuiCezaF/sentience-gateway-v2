import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import {
  AUTH_ADMIN_PROVIDER,
  type AdminUserResult,
  type AuthAdminProvider,
} from '../auth/auth-admin-provider.interface.js';
import { generateTemporaryPassword } from '../common/crypto/temporary-password.js';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { companies, userRoles, users } from '../db/schema.js';
import type {
  CompanyListItemResponse,
  CreateCompanyDto,
  CreatedCompanyResponse,
} from './dto/create-company.dto.js';

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
}
