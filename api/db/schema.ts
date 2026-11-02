import {
  pgTable,
  varchar,
  text,
  boolean,
  real,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const jobs = pgTable(
  'jobs',
  {
    jobId: varchar('job_id', { length: 64 }).primaryKey(),
    kind: varchar('kind', { length: 16 }).notNull().default('utterance'),
    deviceId: varchar('device_id', { length: 64 }),
    conversationId: varchar('conversation_id', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull(),
    sourceLanguage: varchar('source_language', { length: 16 }).notNull(),
    detectedLanguage: varchar('detected_language', { length: 16 }),
    targetLanguage: varchar('target_language', { length: 16 }).notNull(),
    transcript: text('transcript'),
    translation: text('translation'),
    audioInputBlobPath: text('audio_input_blob_path'),
    audioOutputBlobPath: text('audio_output_blob_path'),
    canRetry: boolean('can_retry').notNull().default(false),
    durationSec: real('duration_sec'),
    transcribeMs: real('transcribe_ms'),
    translateMs: real('translate_ms'),
    synthesizeMs: real('synthesize_ms'),
    totalMs: real('total_ms'),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('jobs_device_id_idx').on(table.deviceId),
    index('jobs_conversation_id_idx').on(table.conversationId),
    index('jobs_status_idx').on(table.status),
    index('jobs_created_at_idx').on(table.createdAt),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    conversationId: varchar('conversation_id', { length: 64 }).primaryKey(),
    deviceId: varchar('device_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUtteranceAt: timestamp('last_utterance_at', { withTimezone: true }).defaultNow().notNull(),
    utteranceCount: integer('utterance_count').notNull().default(1),
  },
  (table) => [
    index('conv_device_id_idx').on(table.deviceId),
    index('conv_last_utterance_idx').on(table.lastUtteranceAt),
  ]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
