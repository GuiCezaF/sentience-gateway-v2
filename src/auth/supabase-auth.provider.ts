import { UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthProvider, AuthIdentity } from './auth-provider.interface.js';

export class SupabaseAuthProvider implements AuthProvider {
  private readonly keyResolver: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(supabaseUrl: string, keyResolver?: JWTVerifyGetKey) {
    const normalizedUrl = supabaseUrl.replace(/\/$/, '');
    this.issuer = `${normalizedUrl}/auth/v1`;
    this.audience = 'authenticated';

    if (keyResolver) {
      this.keyResolver = keyResolver;
    } else {
      const jwksUrl = new URL(`${normalizedUrl}/auth/v1/.well-known/jwks.json`);
      this.keyResolver = createRemoteJWKSet(jwksUrl, {
        cacheMaxAge: 10 * 60 * 1000,
      });
    }
  }

  async verify(token: string): Promise<AuthIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.keyResolver, {
        algorithms: ['ES256'],
        issuer: this.issuer,
        audience: this.audience,
      });

      const sub = payload.sub;
      if (!sub || typeof sub !== 'string' || sub.trim() === '') {
        throw new UnauthorizedException('Token missing sub claim');
      }

      return { userId: sub };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Invalid token';
      throw new UnauthorizedException(message);
    }
  }
}
