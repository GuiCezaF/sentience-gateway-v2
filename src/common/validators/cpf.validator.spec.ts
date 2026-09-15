import { describe, it, expect } from 'vitest';
import { isValidCpf, sanitizeCpf } from './cpf.validator.js';

describe('isValidCpf', () => {
  // CPFs válidos matematicamente conhecidos
  const validCpfs = [
    '52998224725',
    '71428793860',
    '11144477735',
    '01234567890', // DV1 = 9, DV2 = 0
  ];

  it('valida CPFs válidos sem formatação', () => {
    for (const cpf of validCpfs) {
      expect(isValidCpf(cpf)).toBe(true);
    }
  });

  it('valida CPFs válidos com pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('714.287.938-60')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejeita CPFs com primeiro dígito verificador incorreto', () => {
    expect(isValidCpf('52998224705')).toBe(false);
    expect(isValidCpf('71428793800')).toBe(false);
  });

  it('rejeita CPFs com segundo dígito verificador incorreto', () => {
    expect(isValidCpf('52998224720')).toBe(false);
    expect(isValidCpf('71428793861')).toBe(false);
  });

  it('rejeita sequências de dígitos idênticos', () => {
    const identicalSequences = [
      '00000000000',
      '11111111111',
      '22222222222',
      '33333333333',
      '44444444444',
      '55555555555',
      '66666666666',
      '77777777777',
      '88888888888',
      '99999999999',
    ];

    for (const seq of identicalSequences) {
      expect(isValidCpf(seq)).toBe(false);
    }
  });

  it('rejeita valores com tamanho incorreto', () => {
    expect(isValidCpf('1234567890')).toBe(false); // 10 dígitos
    expect(isValidCpf('123456789012')).toBe(false); // 12 dígitos
    expect(isValidCpf('')).toBe(false);
  });

  it('rejeita valores nulos, indefinidos ou tipos não string', () => {
    expect(isValidCpf(null)).toBe(false);
    expect(isValidCpf(undefined)).toBe(false);
    expect(isValidCpf('' as any)).toBe(false);
  });

  it('rejeita strings com caracteres inválidos que não completam 11 dígitos', () => {
    expect(isValidCpf('abc.def.ghi-jk')).toBe(false);
    expect(isValidCpf('529.982.247-XX')).toBe(false);
  });
});

describe('sanitizeCpf', () => {
  it('remove pontos, traços e espaços', () => {
    expect(sanitizeCpf('529.982.247-25')).toBe('52998224725');
    expect(sanitizeCpf(' 529 982 247 25 ')).toBe('52998224725');
  });
});
