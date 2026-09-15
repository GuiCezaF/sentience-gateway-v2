export interface AuthUser {
  userId: string;
}

export interface AuthProvider {
  verify(token: string): Promise<AuthUser>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
