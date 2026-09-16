import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { users, userRoles } from '../db/schema.js';
import {
  AUTH_PROVIDER,
  type AuthProvider,
  type AuthUser,
} from './auth-provider.interface.js';
import { ALLOW_PASSWORD_CHANGE_KEY } from './allow-password-change.decorator.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER)
    private readonly authProvider: AuthProvider,
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers?.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Missing token in Authorization header');
    }

    let identity;
    try {
      identity = await this.authProvider.verify(token);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Invalid token';
      throw new UnauthorizedException(message);
    }

    const userRows = await this.db
      .select({
        id: users.id,
        authId: users.authId,
        companyId: users.companyId,
        name: users.name,
        email: users.email,
        cpf: users.cpf,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        role: userRoles.role,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(users.authId, identity.userId));

    if (userRows.length === 0) {
      throw new UnauthorizedException('User not registered in local database');
    }

    const userRecord = userRows[0];

    if (userRecord.status !== 'active') {
      throw new ForbiddenException('User is inactive');
    }

    if (userRecord.mustChangePassword) {
      const allowPasswordChange = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );

      const reqPath =
        request.path || (request.url ? request.url.split('?')[0] : '');
      const origUrl = request.originalUrl
        ? request.originalUrl.split('?')[0]
        : '';
      const isPatchPasswordEndpoint =
        request.method === 'PATCH' &&
        (reqPath === '/v1/users/me/password' ||
          reqPath === '/users/me/password' ||
          origUrl === '/v1/users/me/password' ||
          origUrl === '/users/me/password');

      if (!allowPasswordChange && !isPatchPasswordEndpoint) {
        throw new ForbiddenException({ error: 'password_change_required' });
      }
    }

    const roles = userRows
      .map((r) => r.role)
      .filter((role): role is string => Boolean(role));

    request.user = {
      userId: userRecord.id,
      authId: userRecord.authId,
      companyId: userRecord.companyId,
      roles,
      mustChangePassword: userRecord.mustChangePassword,
      status: userRecord.status,
      email: userRecord.email,
      name: userRecord.name,
    };

    return true;
  }
}
