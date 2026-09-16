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

export interface SignInWithPasswordParams {
  email: string;
  password: string;
  clientIp?: string;
}

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  authId: string;
}

export interface AuthAdminProvider {
  createUser(params: CreateAdminUserParams): Promise<AdminUserResult>;
  deleteUser(id: string): Promise<void>;
  updatePassword(id: string, newPassword: string): Promise<void>;
  verifyCredentials(email: string, password: string): Promise<boolean>;
  signInWithPassword(
    params: SignInWithPasswordParams,
  ): Promise<AuthSessionResult | null>;
  refreshToken(
    refreshToken: string,
    clientIp?: string,
  ): Promise<AuthSessionResult | null>;
}

export const AUTH_ADMIN_PROVIDER = Symbol('AUTH_ADMIN_PROVIDER');
