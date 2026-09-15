export interface CreateAdminUserParams {
  email: string;
  password: string;
  emailConfirm?: boolean;
  userMetadata?: Record<string, unknown>;
}

export interface AdminUserResult {
  id: string;
  email: string;
}

export interface AuthAdminProvider {
  createUser(params: CreateAdminUserParams): Promise<AdminUserResult>;
  deleteUser(id: string): Promise<void>;
  updatePassword(id: string, newPassword: string): Promise<void>;
}

export const AUTH_ADMIN_PROVIDER = Symbol('AUTH_ADMIN_PROVIDER');
