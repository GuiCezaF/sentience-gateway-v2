import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, '../../drizzle');

export interface MigrateOptions {
  schema?: string;
  databaseUrl?: string;
}

export async function runMigrations(
  options: MigrateOptions = {},
): Promise<void> {
  const explicitSchema = process.env.DB_SCHEMA;
  config();

  const targetSchema =
    options.schema ?? explicitSchema ?? process.env.DB_SCHEMA ?? 'gateway';
  const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const sql = postgres(dbUrl, {
    max: 1,
    connection: {
      search_path: targetSchema,
    },
  });

  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}"`);

    await sql.unsafe(`SET search_path TO "${targetSchema}"`);

    const db = drizzle(sql);
    await migrate(db, {
      migrationsFolder,
      migrationsSchema: targetSchema,
    });

    await sql.unsafe(
      `ALTER TABLE "${targetSchema}"."syncs" ENABLE ROW LEVEL SECURITY`,
    );
    await sql.unsafe(
      `ALTER TABLE "${targetSchema}"."classifications" ENABLE ROW LEVEL SECURITY`,
    );

    console.log(
      `✅ Migrations applied successfully to schema "${targetSchema}"`,
    );
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1]?.endsWith('migrate.ts') ||
  process.argv[1]?.endsWith('migrate.js')
) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
