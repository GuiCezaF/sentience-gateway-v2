/**
 * Valida um CPF (Cadastro de Pessoas Físicas) com 11 dígitos numéricos
 * utilizando o algoritmo oficial do Módulo 11.
 */
export function isValidCpf(rawCpf: string | null | undefined): boolean {
  if (!rawCpf || typeof rawCpf !== 'string') {
    return false;
  }

  // Remove caracteres de pontuação comuns (. e -) e espaços
  const cleaned = rawCpf.replace(/\D/g, '');

  if (cleaned.length !== 11) {
    return false;
  }

  // Rejeita sequências de dígitos idênticos (ex: 00000000000, 11111111111)
  if (/^(\d)\1{10}$/.test(cleaned)) {
    return false;
  }

  const digits = cleaned.split('').map(Number);

  // Cálculo do 1º Dígito Verificador (DV1)
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += digits[i] * (10 - i);
  }
  const remainder1 = sum1 % 11;
  const dv1 = remainder1 < 2 ? 0 : 11 - remainder1;

  if (digits[9] !== dv1) {
    return false;
  }

  // Cálculo do 2º Dígito Verificador (DV2)
  let sum2 = 0;
  for (let i = 0; i < 9; i++) {
    sum2 += digits[i] * (11 - i);
  }
  sum2 += dv1 * 2;
  const remainder2 = sum2 % 11;
  const dv2 = remainder2 < 2 ? 0 : 11 - remainder2;

  return digits[10] === dv2;
}

/**
 * Remove formatação de CPF retornando apenas os 11 dígitos numéricos.
 */
export function sanitizeCpf(rawCpf: string): string {
  return rawCpf.replace(/\D/g, '');
}
