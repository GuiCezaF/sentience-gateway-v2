import { z } from 'zod';

export const rawLoginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const loginSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  return {
    email: obj.email,
    password: obj.password,
  };
}, rawLoginSchema);

export type LoginDto = z.infer<typeof rawLoginSchema>;

export interface LoginCompanyResponse {
  id: string;
  cnpj: string;
  legalName: string;
  emailDomain: string;
}

export interface LoginUserResponse {
  id: string;
  authId: string;
  companyId: string;
  name: string;
  email: string;

  cpf: string;
  status: string;
  mustChangePassword: boolean;
  roles: string[];
  company: LoginCompanyResponse;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: LoginUserResponse;
}
