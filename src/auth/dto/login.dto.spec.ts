import { describe, it, expect } from 'vitest';
import { loginSchema } from './login.dto.js';

describe('loginSchema', () => {
  it('valida com sucesso payload válido e normaliza email', () => {
    const input = {
      email: '  USER@EXAMPLE.COM  ',
      password: 'mypassword123',
    };

    const parsed = loginSchema.parse(input);
    expect(parsed).toEqual({
      email: 'user@example.com',
      password: 'mypassword123',
    });
  });

  it('rejeita quando email está ausente ou inválido', () => {
    expect(() =>
      loginSchema.parse({
        password: 'mypassword123',
      }),
    ).toThrow();

    expect(() =>
      loginSchema.parse({
        email: 'not-an-email',
        password: 'mypassword123',
      }),
    ).toThrow();
  });

  it('rejeita quando password está ausente ou vazio', () => {
    expect(() =>
      loginSchema.parse({
        email: 'user@example.com',
      }),
    ).toThrow();

    expect(() =>
      loginSchema.parse({
        email: 'user@example.com',
        password: '',
      }),
    ).toThrow();
  });

  it('retorna input inalterado se input não for objeto', () => {
    expect(() => loginSchema.parse(null)).toThrow();
    expect(() => loginSchema.parse('invalid')).toThrow();
  });
});
