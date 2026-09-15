import { randomInt } from 'node:crypto';

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS;

/**
 * Gera uma senha temporária alfanumérica segura com o comprimento solicitado (padrão 10).
 * Garante a presença de pelo menos uma letra maiúscula, uma minúscula e um dígito.
 */
export function generateTemporaryPassword(length = 10): string {
  if (length < 3) {
    throw new Error('Password length must be at least 3');
  }

  // Garante ao menos 1 de cada classe obrigatória
  const chars: string[] = [
    UPPERCASE[randomInt(UPPERCASE.length)],
    LOWERCASE[randomInt(LOWERCASE.length)],
    DIGITS[randomInt(DIGITS.length)],
  ];

  for (let i = 3; i < length; i++) {
    chars.push(ALL_CHARS[randomInt(ALL_CHARS.length)]);
  }

  // Embaralha o array com Fisher-Yates usando randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}
