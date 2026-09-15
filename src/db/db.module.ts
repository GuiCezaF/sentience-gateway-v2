import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');
export const DRIZZLE = Symbol('DRIZZLE');
export type DrizzleDb = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      useFactory: (config: ConfigService<Env, true>) => {
        const dbSchema = config.get('DB_SCHEMA', { infer: true });
        const dbUrl = config.get('DATABASE_URL', { infer: true });
        return postgres(dbUrl, {
          connection: {
            search_path: dbSchema,
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE,
      useFactory: (sql: postgres.Sql) => drizzle(sql, { schema }),
      inject: [POSTGRES_CLIENT],
    },
  ],
  exports: [POSTGRES_CLIENT, DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_CLIENT) private readonly sql: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end();
  }
}
