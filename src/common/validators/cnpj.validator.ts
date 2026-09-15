const CNPJ_REGEX = /^[A-Z0-9]{12}[0-9]{2}$/;

const DV1_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const DV2_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Remove pontuações comuns de CNPJ (. / -) e espaços, retornando em caixa alta.
 */
export function sanitizeCnpj(rawCnpj: string): string {
  return rawCnpj.replace(/[./\-\s]/g, '').toUpperCase();
}

/**
 * Valida um CNPJ de 14 posições alfanumérico ou numérico conforme a
 * Instrução Normativa RFB nº 2.229/2024 (vigente desde julho/2026):
 * - 12 posições base em [A-Z0-9]
 * - 2 dígitos verificadores numéricos [0-9]
 * - Conversão de cada caractere via ASCII(char) - 48
 * - Algoritmo Módulo 11 com pesos decrescentes
 */
export function isValidCnpj(rawCnpj: string | null | undefined): boolean {
  if (!rawCnpj || typeof rawCnpj !== 'string') {
    return false;
  }

  const cleaned = sanitizeCnpj(rawCnpj);

  if (cleaned.length !== 14 || !CNPJ_REGEX.test(cleaned)) {
    return false;
  }

  // Rejeita sequências de 14 caracteres idênticos (ex: 00000000000000, AAAAAAAAAAAAAA)
  if (/^([A-Z0-9])\1{13}$/.test(cleaned)) {
    return false;
  }

  // Conversão de caracteres para valores numéricos via ASCII - 48
  // '0' -> 0, '9' -> 9, 'A' -> 17, 'Z' -> 42
  const values: number[] = [];
  for (let i = 0; i < 12; i++) {
    values.push(cleaned.charCodeAt(i) - 48);
  }

  // 1º Dígito Verificador (DV1)
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += values[i] * DV1_WEIGHTS[i];
  }
  const remainder1 = sum1 % 11;
  const dv1 = remainder1 < 2 ? 0 : 11 - remainder1;

  if (Number(cleaned[12]) !== dv1) {
    return false;
  }

  // 2º Dígito Verificador (DV2)
  let sum2 = 0;
  for (let i = 0; i < 12; i++) {
    sum2 += values[i] * DV2_WEIGHTS[i];
  }
  sum2 += dv1 * DV2_WEIGHTS[12]; // DV2_WEIGHTS[12] é 2
  const remainder2 = sum2 % 11;
  const dv2 = remainder2 < 2 ? 0 : 11 - remainder2;

  return Number(cleaned[13]) === dv2;
}
