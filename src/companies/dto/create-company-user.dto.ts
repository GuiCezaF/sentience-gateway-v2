import { z } from 'zod';
import {
  isValidCpf,
  sanitizeCpf,
} from '../../common/validators/cpf.validator.js';

export const rawCreateCompanyUserSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().toLowerCase(),
  cpf: z
    .string()
    .refine((val) => isValidCpf(val), {
      message: 'Invalid CPF',
    })
    .transform((val) => sanitizeCpf(val)),
});

export const createCompanyUserSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  const name = obj.name ?? obj.full_name ?? obj.fullName;

  return {
    name,
    email: obj.email,
    cpf: obj.cpf,
  };
}, rawCreateCompanyUserSchema);

export type CreateCompanyUserDto = z.infer<typeof rawCreateCompanyUserSchema>;

export interface CreatedCompanyUserResponse {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  status: string;
  must_change_password: boolean;
  temporary_password: string;
  created_at: string;
}

export interface CompanyUserListItemResponse {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  cpf: string;
  status: string;
  must_change_password: boolean;
  role: string;
  roles: string[];
  created_at: string;
  updated_at: string;
}
