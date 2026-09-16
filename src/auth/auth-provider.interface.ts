export interface AuthIdentity {
  userId: string;
}

export interface AuthUser {
  userId: string;
  authId: string;
  companyId: string;
  roles: string[];
  mustChangePassword: boolean;
  status: string;
  email: string;
  name: string;
}

export interface AuthProvider {
  verify(token: string): Promise<AuthIdentity>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
