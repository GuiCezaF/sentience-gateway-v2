import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AUTH_PROVIDER, type AuthProvider } from './auth-provider.interface.js';
import {
  AUTH_ADMIN_PROVIDER,
  type AuthAdminProvider,
} from './auth-admin-provider.interface.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { SupabaseAuthProvider } from './supabase-auth.provider.js';
import { SupabaseAuthAdminProvider } from './supabase-auth-admin.provider.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

export const authProviderFactory: Provider = {
  provide: AUTH_PROVIDER,
  useFactory: async (
    config: ConfigService<Env, true>,
  ): Promise<AuthProvider> => {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    const authProviderEnv = process.env.AUTH_PROVIDER;

    if (authProviderEnv === 'fake') {
      if (nodeEnv === 'production') {
        throw new Error('FakeAuthProvider is not allowed in production');
      }
      const fakePath = '../../test/fake-auth.provider.js';
      const { FakeAuthProvider } = await import(fakePath);
      return new FakeAuthProvider();
    }

    const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
    return new SupabaseAuthProvider(supabaseUrl);
  },
  inject: [ConfigService],
};

export const authAdminProviderFactory: Provider = {
  provide: AUTH_ADMIN_PROVIDER,
  useFactory: async (
    config: ConfigService<Env, true>,
  ): Promise<AuthAdminProvider> => {
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    const authProviderEnv = process.env.AUTH_PROVIDER;

    if (authProviderEnv === 'fake') {
      if (nodeEnv === 'production') {
        throw new Error('FakeAuthAdminProvider is not allowed in production');
      }
      const fakePath = '../../test/fake-auth-admin.provider.js';
      const { FakeAuthAdminProvider } = await import(fakePath);
      return new FakeAuthAdminProvider();
    }

    const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
    const serviceRoleKey = config.get('SUPABASE_SERVICE_ROLE_KEY', {
      infer: true,
    });
    return new SupabaseAuthAdminProvider(supabaseUrl, serviceRoleKey);
  },
  inject: [ConfigService],
};

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    authProviderFactory,
    authAdminProviderFactory,
    AuthGuard,
    RolesGuard,
    AuthService,
  ],
  exports: [
    AUTH_PROVIDER,
    AUTH_ADMIN_PROVIDER,
    AuthGuard,
    RolesGuard,
    AuthService,
  ],
})
export class AuthModule {}
