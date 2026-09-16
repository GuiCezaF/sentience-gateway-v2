import { randomUUID } from 'node:crypto';
import type {
  AdminUserResult,
  AuthAdminProvider,
  CreateAdminUserParams,
} from '../src/auth/auth-admin-provider.interface.js';

export interface FakeUserRecord {
  id: string;
  email: string;
  password: string;
  userMetadata?: Record<string, unknown>;
}

export class FakeAuthAdminProvider implements AuthAdminProvider {
  public users = new Map<string, FakeUserRecord>();
  public deleteCalls: string[] = [];
  public updatePasswordCalls: Array<{ id: string; password: string }> = [];

  async createUser(params: CreateAdminUserParams): Promise<AdminUserResult> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === params.email.toLowerCase()) {
        const error = new Error(
          'A user with this email address has already been registered',
        );
        (error as any).status = 422;
        throw error;
      }
    }

    const id = randomUUID();
    const record: FakeUserRecord = {
      id,
      email: params.email,
      password: params.password,
      userMetadata: params.userMetadata,
    };

    this.users.set(id, record);
    return { id, email: params.email };
  }

  async deleteUser(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.users.delete(id);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    this.updatePasswordCalls.push({ id, password: newPassword });
    const user = this.users.get(id);
    if (user) {
      user.password = newPassword;
    }
  }

  async verifyCredentials(email: string, password: string): Promise<boolean> {
    const user = this.getUserByEmail(email);
    if (!user) {
      return false;
    }
    return user.password === password;
  }

  getUser(id: string): FakeUserRecord | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): FakeUserRecord | undefined {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return undefined;
  }

  clear(): void {
    this.users.clear();
    this.deleteCalls = [];
    this.updatePasswordCalls = [];
  }
}
