import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { companies, userRoles, users } from '../db/schema.js';
import {
  AUTH_ADMIN_PROVIDER,
  type AuthAdminProvider,
} from './auth-admin-provider.interface.js';
import type { LoginDto, LoginResponse } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
    @Inject(AUTH_ADMIN_PROVIDER)
    private readonly authAdminProvider: AuthAdminProvider,
  ) {}

  async login(dto: LoginDto, clientIp?: string): Promise<LoginResponse> {
    const authSession = await this.authAdminProvider.signInWithPassword({
      email: dto.email,
      password: dto.password,
      clientIp,
    });

    if (!authSession) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }

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
      .where(eq(users.authId, authSession.authId))
      .limit(1);

    if (userRows.length === 0) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }

    const user = userRows[0];

    if (user.status !== 'active') {
      throw new ForbiddenException({ error: 'user_inactive' });
    }

    const roleRows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    const roles = roleRows.map((r) => r.role);

    return {
      accessToken: authSession.accessToken,
      refreshToken: authSession.refreshToken,
      tokenType: authSession.tokenType,
      expiresIn: authSession.expiresIn,
      user: {
        id: user.id,
        authId: user.authId,
        companyId: user.company.id,
        name: user.name,
        email: user.email,
        cpf: user.cpf,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        roles,
        company: {
          id: user.company.id,
          cnpj: user.company.cnpj,
          legalName: user.company.legalName,
          emailDomain: user.company.emailDomain,
        },
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }
}
