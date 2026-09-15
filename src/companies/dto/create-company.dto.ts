import { z } from 'zod';
import {
  isValidCpf,
  sanitizeCpf,
} from '../../common/validators/cpf.validator.js';
import {
  isValidCnpj,
  sanitizeCnpj,
} from '../../common/validators/cnpj.validator.js';

export const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const ownerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().toLowerCase(),
  cpf: z
    .string()
    .refine((val) => isValidCpf(val), {
      message: 'Invalid CPF',
    })
    .transform((val) => sanitizeCpf(val)),
});

export const rawCreateCompanySchema = z.object({
  cnpj: z
    .string()
    .refine((val) => isValidCnpj(val), {
      message: 'Invalid CNPJ',
    })
    .transform((val) => sanitizeCnpj(val)),
  legal_name: z.string().trim().min(1).max(255),
  email_domain: z
    .string()
    .trim()
    .regex(DOMAIN_REGEX, { message: 'Invalid email domain format' })
    .transform((val) => val.toLowerCase()),
  owner: ownerSchema,
});

export const createCompanySchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  const obj = input as Record<string, unknown>;

  const legal_name = obj.legal_name ?? obj.legalName;
  const email_domain = obj.email_domain ?? obj.emailDomain;

  let owner = obj.owner;
  if (!owner && (obj.owner_name || obj.ownerName)) {
    owner = {
      name: obj.owner_name ?? obj.ownerName,
      email: obj.owner_email ?? obj.ownerEmail,
      cpf: obj.owner_cpf ?? obj.ownerCpf,
    };
  }

  return {
    cnpj: obj.cnpj,
    legal_name,
    email_domain,
    owner,
  };
}, rawCreateCompanySchema);

export type CreateCompanyDto = z.infer<typeof rawCreateCompanySchema>;

export interface CreatedCompanyResponse {
  company: {
    id: string;
    cnpj: string;
    legal_name: string;
    email_domain: string;
    created_at: string;
  };
  owner: {
    id: string;
    auth_id: string;
    name: string;
    email: string;
    cpf: string;
    role: string;
  };
  temporary_password: string;
}

export interface CompanyListItemResponse {
  id: string;
  cnpj: string;
  legal_name: string;
  email_domain: string;
  created_at: string;
}
