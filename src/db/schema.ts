import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  index,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const syncs = pgTable(
  'syncs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    subjectId: text('subject_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    health: text('health').notNull(),
    receivedCount: integer('received_count').notNull(),
    insertedCount: integer('inserted_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('syncs_user_received_idx').on(t.userId, t.receivedAt)],
);

export const classifications = pgTable(
  'classifications',
  {
    userId: uuid('user_id').notNull(),
    classificationId: uuid('classification_id').notNull(),
    syncId: uuid('sync_id')
      .notNull()
      .references(() => syncs.id, { onDelete: 'restrict' }),
    subjectId: text('subject_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    emotion: text('emotion').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.classificationId] }),
    index('classifications_user_occurred_idx').on(t.userId, t.occurredAt),
  ],
);

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cnpj: text('cnpj').notNull().unique(),
    legalName: text('legal_name').notNull(),
    emailDomain: text('email_domain').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('companies_cnpj_idx').on(t.cnpj)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authId: uuid('auth_id').notNull().unique(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    cpf: text('cpf').notNull(),
    status: text('status').notNull().default('active'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('users_company_cpf_unique').on(t.companyId, t.cpf),
    index('users_company_id_idx').on(t.companyId),
    index('users_auth_id_idx').on(t.authId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('user_roles_user_role_unique').on(t.userId, t.role),
    index('user_roles_user_id_idx').on(t.userId),
  ],
);

export type Sync = typeof syncs.$inferSelect;
export type NewSync = typeof syncs.$inferInsert;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
