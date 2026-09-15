import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDb } from '../db/db.module.js';
import { users, userRoles } from '../db/schema.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE)
    private readonly db: DrizzleDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authId = request.user?.userId;

    if (!authId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const userRoleRows = await this.db
      .select({ role: userRoles.role })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(users.authId, authId));

    if (userRoleRows.length === 0) {
      throw new ForbiddenException('Access denied: user has no assigned roles');
    }

    const hasRequiredRole = userRoleRows.some((r) =>
      requiredRoles.includes(r.role),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('Access denied: insufficient permissions');
    }

    return true;
  }
}
