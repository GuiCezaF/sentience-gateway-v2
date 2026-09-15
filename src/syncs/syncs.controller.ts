import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { User } from '../auth/user.decorator.js';
import type { AuthUser } from '../auth/auth-provider.interface.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  type SyncEnvelopeDto,
  type SyncReceiptDto,
  syncEnvelopeSchema,
} from './dto/sync-envelope.dto.js';
import { SyncsService } from './syncs.service.js';

@Controller('syncs')
@UseGuards(AuthGuard)
export class SyncsController {
  constructor(private readonly syncsService: SyncsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSync(
    @User() user: AuthUser,
    @Body(new ZodValidationPipe(syncEnvelopeSchema))
    body: SyncEnvelopeDto,
  ): Promise<SyncReceiptDto> {
    return this.syncsService.createSync(user, body);
  }
}
