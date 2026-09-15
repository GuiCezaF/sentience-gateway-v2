import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { FakeAuthProvider } from './fake-auth.provider.js';

describe('FakeAuthProvider', () => {
  const provider = new FakeAuthProvider();

  it('aceita exatamente user:<uuid> e devolve o userId em lowercase', async () => {
    const uuid = 'a0000000-0000-0000-0000-000000000001';
    const result = await provider.verify(`user:${uuid}`);
    expect(result).toEqual({ userId: uuid });

    const upperUuid = 'A0000000-0000-0000-0000-000000000002';
    const upperResult = await provider.verify(`user:${upperUuid}`);
    expect(upperResult).toEqual({ userId: upperUuid.toLowerCase() });
  });

  it('rejeita tokens sem o prefixo user:', async () => {
    await expect(
      provider.verify('a0000000-0000-0000-0000-000000000001'),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      provider.verify('bearer:a0000000-0000-0000-0000-000000000001'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita tokens com uuid malformado ou inválido', async () => {
    await expect(provider.verify('user:invalid-uuid')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      provider.verify('user:a0000000-0000-0000-0000-00000000000z'),
    ).rejects.toThrow(UnauthorizedException);
    await expect(provider.verify('user:')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita string vazia e tokens aleatórios', async () => {
    await expect(provider.verify('')).rejects.toThrow(UnauthorizedException);
    await expect(
      provider.verify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
