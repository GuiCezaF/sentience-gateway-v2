import { parseEnv } from './env.js';

const validSource = {
  DATABASE_URL: 'postgresql://gateway:gateway@127.0.0.1:5432/gateway',
  SUPABASE_URL: 'https://example.supabase.co',
};

describe('parseEnv', () => {
  it('nomeia DATABASE_URL quando ela está ausente', () => {
    expect(() => parseEnv({ SUPABASE_URL: validSource.SUPABASE_URL })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('nomeia SUPABASE_URL quando ela está ausente', () => {
    expect(() => parseEnv({ DATABASE_URL: validSource.DATABASE_URL })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it('aplica defaults e remove a barra final de SUPABASE_URL', () => {
    const env = parseEnv({
      ...validSource,
      SUPABASE_URL: 'https://example.supabase.co/',
    });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validSource.DATABASE_URL,
      DB_SCHEMA: 'gateway',
      SUPABASE_URL: 'https://example.supabase.co',
      MAX_SYNC_ITEMS: 10000,
      BODY_LIMIT: '5mb',
    });
  });

  it.each(['Gateway', '1abc', 'a-b'])(
    'rejeita DB_SCHEMA inválido (%s)',
    (schema) => {
      expect(() => parseEnv({ ...validSource, DB_SCHEMA: schema })).toThrow(
        /DB_SCHEMA/,
      );
    },
  );
});
