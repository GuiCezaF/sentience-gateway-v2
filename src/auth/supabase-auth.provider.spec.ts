import { describe, it, expect, beforeAll } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  SignJWT,
  type KeyLike,
  type JWTVerifyGetKey,
} from 'jose';
import { SupabaseAuthProvider } from './supabase-auth.provider.js';

describe('SupabaseAuthProvider', () => {
  const supabaseUrl = 'https://test-project.supabase.co';
  const expectedIssuer = 'https://test-project.supabase.co/auth/v1';
  const expectedAudience = 'authenticated';
  const keyId = 'test-key-id-es256';

  let privateKey: KeyLike;
  let localKeyResolver: JWTVerifyGetKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = keyId;
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';

    localKeyResolver = createLocalJWKSet({
      keys: [publicJwk],
    });
  });

  it('inicializa o resolvedor remoto padrão quando keyResolver não é fornecido', () => {
    const provider = new SupabaseAuthProvider(supabaseUrl);
    expect(provider).toBeInstanceOf(SupabaseAuthProvider);
  });

  it('normaliza a URL do Supabase removendo barras no final', () => {
    const provider = new SupabaseAuthProvider(
      `${supabaseUrl}/`,
      localKeyResolver,
    );
    expect(provider).toBeInstanceOf(SupabaseAuthProvider);
  });

  it('token válido assinado com ES256 → devolve userId igual ao sub', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);
    const userId = 'b3f572a1-1234-4b56-8c7d-9e0f1a2b3c4d';

    const token = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await provider.verify(token);
    expect(result).toEqual({ userId });
  });

  it('token expirado → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({ sub: 'user-expired' })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('-10s')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('iss errado → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({ sub: 'user-wrong-iss' })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer('https://other-project.supabase.co/auth/v1')
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('aud errado → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({ sub: 'user-wrong-aud' })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(expectedIssuer)
      .setAudience('wrong-audience')
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('kid desconhecido → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({ sub: 'user-unknown-kid' })
      .setProtectedHeader({ alg: 'ES256', kid: 'non-existent-kid' })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('token HS256 assinado com segredo qualquer → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);
    const secret = new TextEncoder().encode(
      'some-symmetric-secret-key-that-is-at-least-256-bits-long!!',
    );

    const token = await new SignJWT({ sub: 'user-hs256' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(secret);

    await expect(provider.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('token sem claim sub → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(
      new UnauthorizedException('Token missing sub claim'),
    );
  });

  it('token com claim sub em branco → falha com UnauthorizedException', async () => {
    const provider = new SupabaseAuthProvider(supabaseUrl, localKeyResolver);

    const token = await new SignJWT({ sub: '   ' })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(provider.verify(token)).rejects.toThrow(
      new UnauthorizedException('Token missing sub claim'),
    );
  });
});
