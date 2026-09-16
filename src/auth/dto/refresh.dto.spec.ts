import { describe, it, expect } from 'vitest';
import { refreshSchema } from './refresh.dto.js';

describe('refreshSchema', () => {
  it('valida com sucesso payload válido com refreshToken camelCase', () => {
    const input = {
      refreshToken: 'valid-refresh-token-123',
    };

    const parsed = refreshSchema.parse(input);
    expect(parsed).toEqual({
      refreshToken: 'valid-refresh-token-123',
    });
  });

  it('suporta snake_case refresh_token e normaliza para refreshToken', () => {
    const input = {
      refresh_token: 'valid-refresh-token-snake',
    };

    const parsed = refreshSchema.parse(input);
    expect(parsed).toEqual({
      refreshToken: 'valid-refresh-token-snake',
    });
  });

  it('faz trim de espaços no refreshToken', () => {
    const input = {
      refreshToken: '   trimmed-token   ',
    };

    const parsed = refreshSchema.parse(input);
    expect(parsed).toEqual({
      refreshToken: 'trimmed-token',
    });
  });

  it('rejeita quando refreshToken está ausente ou vazio', () => {
    expect(() => refreshSchema.parse({})).toThrow();
    expect(() => refreshSchema.parse({ refreshToken: '' })).toThrow();
    expect(() => refreshSchema.parse({ refreshToken: '   ' })).toThrow();
    expect(() => refreshSchema.parse({ refresh_token: '' })).toThrow();
  });

  it('retorna erro se input não for objeto', () => {
    expect(() => refreshSchema.parse(null)).toThrow();
    expect(() => refreshSchema.parse('invalid')).toThrow();
    expect(() => refreshSchema.parse(123)).toThrow();
  });
});
