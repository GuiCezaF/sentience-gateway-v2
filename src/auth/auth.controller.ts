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
    const forwarded = req.headers['x-forwarded-for'];
    let clientIp: string | undefined;

    if (typeof forwarded === 'string') {
      clientIp = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      clientIp = forwarded[0].trim();
    } else if (req.ip) {
      clientIp = req.ip;
    } else if (req.socket?.remoteAddress) {
      clientIp = req.socket.remoteAddress;
    }

    return this.authService.login(body, clientIp);
  }
}
