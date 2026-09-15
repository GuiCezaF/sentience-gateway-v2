import { describe, it, expect } from 'vitest';
import { isValidCnpj, sanitizeCnpj } from './cnpj.validator.js';

describe('isValidCnpj', () => {
  it('valida o exemplo oficial da IN RFB nº 2.229/2024 (12.ABC.345/01DE-35)', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
  });

  it('aceita entrada alfanumérica em letras minúsculas normalizando para maiúsculas', () => {
    expect(isValidCnpj('12.abc.345/01de-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
  });

  it('valida CNPJs tradicionais exclusivamente numéricos', () => {
    // Banco do Brasil: 00.000.000/0001-91
    expect(isValidCnpj('00.000.000/0001-91')).toBe(true);
    expect(isValidCnpj('00000000000191')).toBe(true);

    // Petrobras: 33.000.167/0001-01
    expect(isValidCnpj('33.000.167/0001-01')).toBe(true);
    expect(isValidCnpj('33000167000101')).toBe(true);
  });

  it('rejeita CNPJ com primeiro dígito verificador incorreto', () => {
    expect(isValidCnpj('12ABC34501DE45')).toBe(false);
    expect(isValidCnpj('00000000000181')).toBe(false);
  });

  it('rejeita CNPJ com segundo dígito verificador incorreto', () => {
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
    expect(isValidCnpj('00000000000192')).toBe(false);
  });

  it('rejeita letras nos dígitos verificadores', () => {
    expect(isValidCnpj('12ABC34501DEAA')).toBe(false);
    expect(isValidCnpj('12ABC34501DE3A')).toBe(false);
  });

  it('rejeita sequências de 14 caracteres idênticos', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('AAAAAAAAAAAAAA')).toBe(false);
    expect(isValidCnpj('ZZZZZZZZZZZZZZ')).toBe(false);
  });

  it('rejeita valores com tamanho incorreto', () => {
    expect(isValidCnpj('12ABC34501DE3')).toBe(false); // 13 chars
    expect(isValidCnpj('12ABC34501DE350')).toBe(false); // 15 chars
    expect(isValidCnpj('')).toBe(false);
  });

  it('rejeita caracteres especiais na base', () => {
    expect(isValidCnpj('12@BC34501DE35')).toBe(false);
    expect(isValidCnpj('12_BC34501DE35')).toBe(false);
  });

  it('rejeita valores nulos ou indefinidos', () => {
    expect(isValidCnpj(null)).toBe(false);
    expect(isValidCnpj(undefined)).toBe(false);
  });
});

describe('sanitizeCnpj', () => {
  it('remove pontuações e converte para maiúsculas', () => {
    expect(sanitizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(sanitizeCnpj(' 00.000.000/0001-91 ')).toBe('00000000000191');
  });
});
