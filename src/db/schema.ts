import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  index,
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

export type Sync = typeof syncs.$inferSelect;
export type NewSync = typeof syncs.$inferInsert;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
