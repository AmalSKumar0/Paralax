import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function migrate() {
  if (!connectionString) {
    console.log('No DATABASE_URL or POSTGRES_URL configured.');
    console.log('Skipping Neon Postgres migration (local memory database will be used).');
    return;
  }

  console.log('Connecting to Neon Postgres to apply schema...');
  const sql = neon(connectionString);

  // Create tables and indexes
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id VARCHAR(64) PRIMARY KEY,
      kind VARCHAR(16) NOT NULL DEFAULT 'utterance',
      device_id VARCHAR(64),
      conversation_id VARCHAR(64),
      status VARCHAR(32) NOT NULL,
      source_language VARCHAR(16) NOT NULL,
      detected_language VARCHAR(16),
      target_language VARCHAR(16) NOT NULL,
      transcript TEXT,
      translation TEXT,
      audio_input_blob_path TEXT,
      audio_output_blob_path TEXT,
      can_retry BOOLEAN NOT NULL DEFAULT FALSE,
      duration_sec REAL,
      stt_ms REAL,
      translate_ms REAL,
      synthesize_ms REAL,
      total_ms REAL,
      error_code VARCHAR(64),
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS jobs_device_id_idx ON jobs (device_id);`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_conversation_id_idx ON jobs (conversation_id);`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at);`;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id VARCHAR(64) PRIMARY KEY,
      device_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_utterance_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      utterance_count INTEGER NOT NULL DEFAULT 1
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS conv_device_id_idx ON conversations (device_id);`;
  await sql`CREATE INDEX IF NOT EXISTS conv_last_utterance_idx ON conversations (last_utterance_at);`;

  console.log('Neon Postgres migration completed successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
