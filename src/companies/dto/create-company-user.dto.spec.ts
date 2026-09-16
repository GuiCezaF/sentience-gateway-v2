import { describe, it, expect } from 'vitest';
import { createCompanyUserSchema } from './create-company-user.dto.js';

describe('createCompanyUserSchema', () => {
  const validPayload = {
    name: 'João da Silva',
    email: 'joao@alphacorp.com.br',
    cpf: '111.444.777-35',
  };

  it('valida payload correto com nome, email e CPF formatado', () => {
    const parsed = createCompanyUserSchema.parse(validPayload);
    expect(parsed).toEqual({
      name: 'João da Silva',
      email: 'joao@alphacorp.com.br',
      cpf: '11144477735',
    });
  });

  it('suporta full_name e fullName via preprocess', () => {
    const snakeCase = createCompanyUserSchema.parse({
      full_name: 'João da Silva',
      email: 'joao@alphacorp.com.br',
      cpf: '11144477735',
    });
    expect(snakeCase.name).toBe('João da Silva');

    const camelCase = createCompanyUserSchema.parse({
      fullName: 'João da Silva',
      email: 'joao@alphacorp.com.br',
      cpf: '11144477735',
    });
    expect(camelCase.name).toBe('João da Silva');
  });

  it('normaliza o email para minúsculas e remove espaços', () => {
    const parsed = createCompanyUserSchema.parse({
      name: '  João Silva  ',
      email: '  JOAO@ALPHACORP.COM.BR  ',
      cpf: '11144477735',
    });
    expect(parsed.name).toBe('João Silva');
    expect(parsed.email).toBe('joao@alphacorp.com.br');
  });

  it('rejeita CPF inválido com erro no Zod', () => {
    expect(() =>
      createCompanyUserSchema.parse({
        ...validPayload,
        cpf: '111.444.777-00', // DV inválido
      }),
    ).toThrow();
  });

  it('rejeita email inválido', () => {
    expect(() =>
      createCompanyUserSchema.parse({
        ...validPayload,
        email: 'nao-e-um-email',
      }),
    ).toThrow();
  });

  it('rejeita nome vazio ou ausente', () => {
    expect(() =>
      createCompanyUserSchema.parse({
        ...validPayload,
        name: '   ',
      }),
    ).toThrow();
  });
});
