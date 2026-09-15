import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { SupabaseAuthAdminProvider } from '../auth/supabase-auth-admin.provider.js';
import type { AuthAdminProvider } from '../auth/auth-admin-provider.interface.js';
import { companies, userRoles, users } from './schema.js';

export interface SeedOptions {
  schema?: string;
  databaseUrl?: string;
  authAdminProvider?: AuthAdminProvider;
}

export async function runSeed(options: SeedOptions = {}): Promise<void> {
  const explicitSchema = process.env.DB_SCHEMA;
  config();

  const targetSchema =
    options.schema ?? explicitSchema ?? process.env.DB_SCHEMA ?? 'gateway';
  const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to run seed');
  }

  const sentinelName = process.env.SENTINEL_COMPANY_NAME || 'Sentience';
  const sentinelCnpj = process.env.SENTINEL_COMPANY_CNPJ || '00000000000191';
  const sentinelDomain =
    process.env.SENTINEL_COMPANY_DOMAIN || 'sentience.internal';

  const superAdminName =
    process.env.SUPER_ADMIN_NAME || 'Super Admin Sentience';
  const superAdminEmail =
    process.env.SUPER_ADMIN_EMAIL || 'admin@sentience.internal';
  const superAdminPassword =
    process.env.SUPER_ADMIN_PASSWORD || 'SentienceAdmin123!';
  const superAdminCpf = process.env.SUPER_ADMIN_CPF || '52998224725';

  const sql = postgres(dbUrl, {
    max: 1,
    connection: {
      search_path: targetSchema,
    },
  });

  try {
    const db = drizzle(sql);

    // 1. Garantir Empresa Sentinel
    let company = (
      await db
        .select()
        .from(companies)
        .where(eq(companies.cnpj, sentinelCnpj))
        .limit(1)
    )[0];

    if (!company) {
      [company] = await db
        .insert(companies)
        .values({
          cnpj: sentinelCnpj,
          legalName: sentinelName,
          emailDomain: sentinelDomain,
        })
        .returning();
      console.log(
        `🏢 Created sentinel company "${sentinelName}" (${company.id})`,
      );
    } else {
      console.log(`🏢 Sentinel company "${sentinelName}" already exists`);
    }

    // 2. Garantir Super-admin no Auth Provider
    let authId: string;
    const authProviderEnv = process.env.AUTH_PROVIDER;

    if (options.authAdminProvider) {
      try {
        const created = await options.authAdminProvider.createUser({
          email: superAdminEmail,
          password: superAdminPassword,
          emailConfirm: true,
          userMetadata: { name: superAdminName },
        });
        authId = created.id;
      } catch (error: any) {
        // Se já existe, tenta recuperar do banco local
        const existing = await db
          .select({ authId: users.authId })
          .from(users)
          .where(eq(users.email, superAdminEmail))
          .limit(1);
        if (existing.length > 0) {
          authId = existing[0].authId;
        } else {
          throw error;
        }
      }
    } else if (authProviderEnv === 'fake') {
      // Em modo fake determinístico
      const existing = await db
        .select({ authId: users.authId })
        .from(users)
        .where(eq(users.email, superAdminEmail))
        .limit(1);
      authId = existing[0]?.authId ?? '00000000-0000-0000-0000-000000000001';
    } else {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
          'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for real seed',
        );
      }

      const realAdminProvider = new SupabaseAuthAdminProvider(
        supabaseUrl,
        serviceRoleKey,
      );

      try {
        const created = await realAdminProvider.createUser({
          email: superAdminEmail,
          password: superAdminPassword,
          emailConfirm: true,
          userMetadata: { name: superAdminName },
        });
        authId = created.id;
      } catch (error: any) {
        // Se o usuário já existe no Supabase Auth, busca o authId no banco local se existir
        const existing = await db
          .select({ authId: users.authId })
          .from(users)
          .where(eq(users.email, superAdminEmail))
          .limit(1);

        if (existing.length > 0) {
          authId = existing[0].authId;
        } else {
          throw error;
        }
      }
    }

    // 3. Garantir Super-admin no banco local
    let user = (
      await db
        .select()
        .from(users)
        .where(eq(users.email, superAdminEmail))
        .limit(1)
    )[0];

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          authId,
          companyId: company.id,
          name: superAdminName,
          email: superAdminEmail,
          cpf: superAdminCpf,
          status: 'active',
          mustChangePassword: false,
        })
        .returning();
      console.log(
        `👤 Created super-admin user "${superAdminEmail}" (${user.id})`,
      );
    } else {
      console.log(`👤 Super-admin user "${superAdminEmail}" already exists`);
    }

    // 4. Garantir Papel super_admin
    const existingRoles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    const hasSuperAdminRole = existingRoles.some(
      (r) => r.role === 'super_admin',
    );

    if (!hasSuperAdminRole) {
      await db.insert(userRoles).values({
        userId: user.id,
        role: 'super_admin',
      });
      console.log(`🔑 Assigned role "super_admin" to user ${user.email}`);
    } else {
      console.log(`🔑 Role "super_admin" already assigned`);
    }

    console.log('✅ Seed completed successfully');
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js')
) {
  runSeed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
