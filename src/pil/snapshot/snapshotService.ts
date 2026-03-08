/**
 * Snapshot Service (PIL-002)
 *
 * Persistence layer for repos, snapshots, and files.
 * All writes go through this module so the rest of the codebase never
 * touches raw SQL — making it easy to swap storage backends later.
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoRecord {
  id: string;
  name: string;
  root_path: string;
  default_branch: string | null;
  created_at: string;
  updated_at: string;
}

export interface SnapshotRecord {
  id: string;
  repo_id: string;
  commit_sha: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  repo_id: string;
  path: string;
  language: string | null;
  hash: string;
  last_indexed_at: string | null;
  metadata_json: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random UUID v4 for use as primary keys. */
function uuid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Repo operations
// ---------------------------------------------------------------------------

/**
 * Create a new repo record or return the existing one if a repo with the
 * same root_path already exists. This makes the operation idempotent —
 * callers don't need to check existence first.
 */
export function upsertRepo(
  db: Database.Database,
  name: string,
  rootPath: string,
  defaultBranch?: string
): RepoRecord {
  // Check if a repo with this root_path already exists
  const existing = db
    .prepare('SELECT * FROM repos WHERE root_path = ?')
    .get(rootPath) as RepoRecord | undefined;

  if (existing) {
    // Update the timestamp so we know when the repo was last touched
    db.prepare('UPDATE repos SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      existing.id
    );
    return { ...existing, updated_at: new Date().toISOString() };
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO repos (id, name, root_path, default_branch)
     VALUES (?, ?, ?, ?)`
  ).run(id, name, rootPath, defaultBranch ?? null);

  return db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as RepoRecord;
}

/**
 * Look up a repo by its root_path. Returns undefined if not found.
 */
export function getRepoByPath(
  db: Database.Database,
  rootPath: string
): RepoRecord | undefined {
  return db
    .prepare('SELECT * FROM repos WHERE root_path = ?')
    .get(rootPath) as RepoRecord | undefined;
}

// ---------------------------------------------------------------------------
// Snapshot operations
// ---------------------------------------------------------------------------

/**
 * Create a new snapshot record tied to a repo.
 * Each snapshot represents one point-in-time scan of the repo.
 */
export function createSnapshot(
  db: Database.Database,
  repoId: string,
  commitSha?: string
): SnapshotRecord {
  const id = uuid();
  db.prepare(
    `INSERT INTO snapshots (id, repo_id, commit_sha)
     VALUES (?, ?, ?)`
  ).run(id, repoId, commitSha ?? null);

  return db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRecord;
}

/**
 * Get the most recent snapshot for a repo (by created_at descending).
 * Returns undefined if the repo has never been snapshotted.
 */
export function getLatestSnapshot(
  db: Database.Database,
  repoId: string
): SnapshotRecord | undefined {
  return db
    .prepare(
      'SELECT * FROM snapshots WHERE repo_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(repoId) as SnapshotRecord | undefined;
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * Insert or update a file record. Uses the UNIQUE(repo_id, path) constraint
 * to decide whether to insert or update. On conflict the hash, language,
 * and last_indexed_at are refreshed.
 */
export function upsertFile(
  db: Database.Database,
  repoId: string,
  filePath: string,
  hash: string,
  language: string | null
): FileRecord {
  const id = uuid();
  db.prepare(
    `INSERT INTO files (id, repo_id, path, language, hash, last_indexed_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (repo_id, path) DO UPDATE SET
       hash = excluded.hash,
       language = excluded.language,
       last_indexed_at = CURRENT_TIMESTAMP`
  ).run(id, repoId, filePath, language, hash);

  return db
    .prepare('SELECT * FROM files WHERE repo_id = ? AND path = ?')
    .get(repoId, filePath) as FileRecord;
}

/**
 * Remove a file record (used when a file is deleted from the repo).
 */
export function deleteFile(
  db: Database.Database,
  repoId: string,
  filePath: string
): void {
  db.prepare('DELETE FROM files WHERE repo_id = ? AND path = ?').run(
    repoId,
    filePath
  );
}

/**
 * Get all file records for a repo. Used to build the "previous state"
 * for snapshot diffing.
 */
export function getFilesForRepo(
  db: Database.Database,
  repoId: string
): FileRecord[] {
  return db
    .prepare('SELECT * FROM files WHERE repo_id = ?')
    .all(repoId) as FileRecord[];
}

// ---------------------------------------------------------------------------
// Change event operations
// ---------------------------------------------------------------------------

/**
 * Record a change event (new / changed / deleted) for a file in a snapshot.
 * This gives later phases a queryable log of what happened.
 */
export function recordChangeEvent(
  db: Database.Database,
  repoId: string,
  snapshotId: string,
  entityType: string,
  entityId: string,
  changeType: string
): void {
  const id = uuid();
  db.prepare(
    `INSERT INTO change_events (id, repo_id, snapshot_id, entity_type, entity_id, change_type)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, repoId, snapshotId, entityType, entityId, changeType);
}
