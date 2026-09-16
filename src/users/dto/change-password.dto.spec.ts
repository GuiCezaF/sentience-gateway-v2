import { describe, it, expect } from 'vitest';
import { changePasswordSchema } from './change-password.dto.js';

describe('changePasswordSchema', () => {
  it('valida com sucesso payload em camelCase válido', () => {
    const valid = {
      currentPassword: 'oldPassword123!',
      newPassword: 'newPassword123!',
    };

    const parsed = changePasswordSchema.parse(valid);
    expect(parsed).toEqual({
      currentPassword: 'oldPassword123!',
      newPassword: 'newPassword123!',
    });
  });

  it('valida com sucesso payload em snake_case válido (preprocess)', () => {
    const valid = {
      current_password: 'oldPassword123!',
      new_password: 'newPassword123!',
    };

    const parsed = changePasswordSchema.parse(valid);
    expect(parsed).toEqual({
      currentPassword: 'oldPassword123!',
      newPassword: 'newPassword123!',
    });
  });

  it('rejeita quando currentPassword está ausente ou vazio', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: '',
        newPassword: 'newPassword123!',
      }),
    ).toThrow();

    expect(() =>
      changePasswordSchema.parse({
        newPassword: 'newPassword123!',
      }),
    ).toThrow();
  });

  it('rejeita quando newPassword tem menos de 8 caracteres', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'oldPassword123!',
        newPassword: 'short',
      }),
    ).toThrow();
  });
});
