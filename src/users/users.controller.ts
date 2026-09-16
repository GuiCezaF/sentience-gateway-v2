import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/user.decorator.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import { AllowPasswordChange } from '../auth/allow-password-change.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractClientIp } from '../common/utils/client-ip.js';
import { UsersService } from './users.service.js';
import {
  type ChangePasswordDto,
  changePasswordSchema,
} from './dto/change-password.dto.js';
import type { UserProfileResponse } from './dto/user-profile.dto.js';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(
    @CurrentUser() user: AuthUser,
  ): Promise<UserProfileResponse> {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me/password')
  @AllowPasswordChange()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const clientIp = extractClientIp(req);
    return this.usersService.changePassword(user, body, clientIp);
  }
}
