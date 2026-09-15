import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SyncsController } from './syncs.controller.js';
import { SyncsService } from './syncs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SyncsController],
  providers: [SyncsService],
  exports: [SyncsService],
})
export class SyncsModule {}
