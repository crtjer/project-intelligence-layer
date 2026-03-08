/**
 * Database Migration Runner (PIL-002)
 *
 * Reads pilSchema.sql and executes it against the SQLite database.
 * All statements use IF NOT EXISTS so the migration is idempotent —
 * safe to run on every startup.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Opens (or creates) the SQLite database at `dbPath` and runs the
 * Phase 1 schema migration. Returns the open database handle.
 *
 * WAL mode is enabled for better concurrent read performance and
 * crash resilience.
 */
export function migrateAndOpen(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // WAL mode gives us concurrent readers + single writer, and is
  // more resilient to crashes than the default rollback journal.
  db.pragma('journal_mode = WAL');

  // Foreign keys are off by default in SQLite — turn them on so our
  // FOREIGN KEY constraints are actually enforced.
  db.pragma('foreign_keys = ON');

  // Read the schema SQL file that lives alongside this module
  const schemaPath = path.join(__dirname, 'pilSchema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // exec() runs multiple statements in one call — perfect for DDL scripts
  db.exec(schemaSql);

  return db;
}
