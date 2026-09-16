import { UnauthorizedException } from '@nestjs/common';
import type {
  AuthProvider,
  AuthIdentity,
} from '../src/auth/auth-provider.interface.js';

const FAKE_TOKEN_REGEX =
  /^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export class FakeAuthProvider implements AuthProvider {
  async verify(token: string): Promise<AuthIdentity> {
    const match = FAKE_TOKEN_REGEX.exec(token);
    if (!match) {
      throw new UnauthorizedException('Invalid fake token format');
    }

    return {
      userId: match[1].toLowerCase(),
    };
  }
}
