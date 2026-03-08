-- PIL Phase 1 Schema
-- Tables: repos, snapshots, files
-- Additional tables (symbols, nodes, edges, etc.) will be added in later phases.

CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_branch TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  commit_sha TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  path TEXT NOT NULL,
  language TEXT,
  hash TEXT NOT NULL,
  last_indexed_at TIMESTAMP,
  metadata_json TEXT,
  UNIQUE (repo_id, path),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

-- change_events tracks what changed between snapshots (Phase 1 uses this
-- to persist diff results so later phases can query "what changed last time").
CREATE TABLE IF NOT EXISTS change_events (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_snapshots_repo_id ON snapshots(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id);
CREATE INDEX IF NOT EXISTS idx_change_events_snapshot_id ON change_events(snapshot_id);
