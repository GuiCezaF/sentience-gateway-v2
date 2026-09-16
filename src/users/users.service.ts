import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { companies, userRoles, users } from '../db/schema.js';
import {
  AUTH_ADMIN_PROVIDER,
  type AuthAdminProvider,
} from '../auth/auth-admin-provider.interface.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { UserProfileResponse } from './dto/user-profile.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
    @Inject(AUTH_ADMIN_PROVIDER)
    private readonly authAdminProvider: AuthAdminProvider,
  ) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const userRows = await this.db
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
        company: {
          id: companies.id,
          cnpj: companies.cnpj,
          legalName: companies.legalName,
          emailDomain: companies.emailDomain,
        },
      })
      .from(users)
      .innerJoin(companies, eq(users.companyId, companies.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const roleRows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    const user = userRows[0];
    const roles = roleRows.map((r) => r.role);

    return {
      id: user.id,
      auth_id: user.authId,
      name: user.name,
      email: user.email,
      cpf: user.cpf,
      status: user.status,
      must_change_password: user.mustChangePassword,
      company: {
        id: user.company.id,
        cnpj: user.company.cnpj,
        legal_name: user.company.legalName,
        email_domain: user.company.emailDomain,
      },
      roles,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }

  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    clientIp?: string,
  ): Promise<{ message: string }> {
    const isValid = await this.authAdminProvider.verifyCredentials(
      user.email,
      dto.currentPassword,
      clientIp,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid current password');
    }

    await this.authAdminProvider.updatePassword(user.authId, dto.newPassword);

    await this.db
      .update(users)
      .set({
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.userId));

    return { message: 'Password changed successfully' };
  }
}
