import { describe, it, expect } from 'vitest';
import { generateTemporaryPassword } from './temporary-password.js';

describe('generateTemporaryPassword', () => {
  it('gera senha com exatamente 10 caracteres por padrão', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(10);
  });

  it('gera apenas caracteres alfanuméricos', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('contém pelo menos uma maiúscula, uma minúscula e um dígito', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword(10);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it('respeita comprimentos customizados', () => {
    expect(generateTemporaryPassword(8)).toHaveLength(8);
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });

  it('lança erro para comprimento menor que 3', () => {
    expect(() => generateTemporaryPassword(2)).toThrow(
      'Password length must be at least 3',
    );
  });

  it('gera senhas distintas em chamadas consecutivas', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateTemporaryPassword(10));
    }
    expect(passwords.size).toBe(100);
  });
});
