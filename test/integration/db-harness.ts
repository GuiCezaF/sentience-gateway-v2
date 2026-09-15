import { config } from 'dotenv';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema.js';
import { runMigrations } from '../../src/db/migrate.js';

config();

export const TEST_SCHEMA = 'test';

export interface TestDatabase {
  sql: postgres.Sql;
  db: PostgresJsDatabase<typeof schema>;
}

export function createTestDb(): TestDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for integration tests');
  }

  const sql = postgres(url, {
    max: 1,
    connection: {
      search_path: TEST_SCHEMA,
    },
  });

  const db = drizzle(sql, { schema });
  return { sql, db };
}

export async function migrateTestSchema(): Promise<void> {
  await runMigrations({ schema: TEST_SCHEMA });
}

export async function truncateAll(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    `TRUNCATE "${TEST_SCHEMA}"."classifications", "${TEST_SCHEMA}"."syncs" CASCADE;`,
  );
}
