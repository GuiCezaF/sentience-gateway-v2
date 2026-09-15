import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AUTH_PROVIDER, type AuthProvider } from './auth-provider.interface.js';
import { AuthGuard } from './auth.guard.js';
import { SupabaseAuthProvider } from './supabase-auth.provider.js';

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

@Global()
@Module({
  providers: [authProviderFactory, AuthGuard],
  exports: [AUTH_PROVIDER, AuthGuard],
})
export class AuthModule {}
