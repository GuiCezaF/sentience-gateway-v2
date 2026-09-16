import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractClientIp } from '../common/utils/client-ip.js';
import { AuthService } from './auth.service.js';
import {
  loginSchema,
  type LoginDto,
  type LoginResponse,
} from './dto/login.dto.js';
import {
  refreshSchema,
  type RefreshDto,
  type RefreshResponse,
} from './dto/refresh.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    const clientIp = extractClientIp(req);
    return this.authService.login(body, clientIp);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
  ): Promise<RefreshResponse> {
    const clientIp = extractClientIp(req);
    return this.authService.refresh(body, clientIp);
  }
}
