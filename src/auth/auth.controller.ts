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
    const clientIp = this.extractClientIp(req);
    return this.authService.login(body, clientIp);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
  ): Promise<RefreshResponse> {
    const clientIp = this.extractClientIp(req);
    return this.authService.refresh(body, clientIp);
  }

  private extractClientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];

    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
    if (req.ip) {
      return req.ip;
    }
    if (req.socket?.remoteAddress) {
      return req.socket.remoteAddress;
    }
    return undefined;
  }
}
