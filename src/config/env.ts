import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default('gateway'),
  SUPABASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/$/, '')),
  MAX_SYNC_ITEMS: z.coerce.number().int().positive().default(10000),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(b|kb|mb|gb)?$/i)
    .default('5mb'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }
  return parsed.data;
}
