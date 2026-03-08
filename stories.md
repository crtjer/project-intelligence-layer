# Project Intelligence Layer (PIL) v1
## Repo-Ready Implementation Stories

## Objective

Build a **Project Intelligence Layer (PIL) v1** that gives OpenClaw a persistent, structured understanding of repositories.

PIL v1 must support:

- repository snapshots
- incremental indexing
- AST extraction for TS/JS and Python
- graph-backed structural understanding
- semantic summaries
- hybrid query support
- incomplete work detection
- impact analysis
- stable agent-facing tools

---

# Implementation Principles

- deterministic parsing first
- incremental indexing by default
- relational graph storage for v1
- summaries layered on top of structure
- reusable services over one-off scripts
- agent-friendly interfaces
- evidence-backed answers

---

# Stack Decisions

- Language: TypeScript (Node.js)
- Database: SQLite via `better-sqlite3`
- Vector store: `sqlite-vec` (keep everything in one SQLite file)
- AST parsing: `@typescript-eslint/typescript-estree` for TS/JS, `tree-sitter` with Python grammar for Python
- Embeddings: OpenAI `text-embedding-3-small` (1536 dims)
- LLM for summaries: Anthropic Claude (claude-sonnet-4-5)

---

# Proposed Directory Structure

```text
src/
  pil/
    config/
      pilConfig.ts
    snapshot/
      scanRepo.ts
      diffSnapshots.ts
      snapshotService.ts
    extract/
      types.ts
      extractTsJs.ts
      extractPython.ts
      markerDetection.ts
    graph/
      graphTypes.ts
      graphRepository.ts
      graphIngest.ts
    semantic/
      summaryTypes.ts
      summarizeFile.ts
      summarizeSymbol.ts
      semanticRepository.ts
      embedChunks.ts
    workflows/
      inferWorkflow.ts
    queries/
      queryClassifier.ts
      architectureLookup.ts
      dependencyLookup.ts
      workflowExplain.ts
      incompleteWorkLookup.ts
      impactAnalysis.ts
      recentChanges.ts
    agents/
      pilTools.ts
    db/
      migrations/
      pilSchema.sql
    fixtures/
      sample-ts-repo/
      sample-python-repo/
    __tests__/

scripts/
  pil-index.ts         # CLI: index a repo
  pil-query.ts         # CLI: query a repo

.env.example
```

---

# Delivery Phases

| Phase | Scope |
|---|---|
| 1 | Snapshot engine + scanner + diffing |
| 2 | AST extraction + graph ingestion |
| 3 | Semantic summaries + embeddings (sqlite-vec) |
| 4 | Query engine + incomplete work detection |
| 5 | Impact analysis + workflows + agent tools |

---

# SQL Schema

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_branch TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  commit_sha TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE TABLE files (
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

CREATE TABLE symbols (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER,
  end_line INTEGER,
  exported INTEGER NOT NULL DEFAULT 0,
  body_hash TEXT,
  summary TEXT,
  metadata_json TEXT,
  UNIQUE (repo_id, stable_key),
  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  external_key TEXT,
  display_name TEXT NOT NULL,
  file_id TEXT,
  symbol_id TEXT,
  metadata_json TEXT,
  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (file_id) REFERENCES files(id),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (from_node_id) REFERENCES nodes(id),
  FOREIGN KEY (to_node_id) REFERENCES nodes(id)
);

CREATE TABLE change_events (
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

CREATE TABLE incomplete_markers (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  marker_type TEXT NOT NULL,
  line INTEGER,
  text TEXT,
  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (file_id) REFERENCES files(id)
);
```

---

# PHASE 1 — Snapshot Engine and Incremental Indexing

## Story PIL-001 — Add PIL config and bootstrap

**Problem**
PIL needs a stable configuration and entrypoint pattern before indexing logic can be added.

**Scope**
Create the foundational config and bootstrap modules for PIL.

**Files**
- `src/pil/config/pilConfig.ts`
- optionally `src/pil/index.ts`

**Tasks**
- define PIL config model
- support repo root, include/exclude patterns, supported languages
- support incremental mode and full reindex override
- expose helper to load validated config

**Acceptance Criteria**
- PIL config can be loaded from existing repo config/env conventions
- invalid config fails with a clear error
- config is typed and validates at startup

**Definition of Done**
- `pilConfig.ts` implemented
- config type exported
- validation added
- usage example in README

---

## Story PIL-002 — Create repository manifest model and persistence

**Problem**
PIL must persist repo and snapshot metadata to support incremental indexing.

**Files**
- `src/pil/db/pilSchema.sql`
- `src/pil/snapshot/snapshotService.ts`

**Tasks**
- implement schema for `repos`, `snapshots`, `files` tables
- implement persistence functions: create repo, create snapshot, upsert file
- implement query: get latest snapshot, get files for repo

**Acceptance Criteria**
- a repo record can be created and retrieved
- a snapshot record stores repo_id, commit_sha, created_at
- indexed file metadata stores path, language, hash, and last_indexed_at
- system can compare latest snapshot to new scan target

**Definition of Done**
- schema + migration created
- persistence layer implemented
- validation added for required fields
- example snapshot can be stored from a real repo

---

## Story PIL-003 — Implement file scanner with ignore support

**Problem**
PIL needs a deterministic file scanner that respects .gitignore and configured exclusions.

**Files**
- `src/pil/snapshot/scanRepo.ts`

**Tasks**
- walk repo directory tree
- respect `.gitignore` using `ignore` package (or similar)
- respect PIL configured exclusions (node_modules, .git, dist, build, etc.)
- classify files by language (ts, tsx, js, jsx, py, etc.)
- output: list of { path, language, hash } for each eligible file

**Acceptance Criteria**
- ignored files and folders are skipped
- supported file types are classified
- unsupported file types are ignored
- scanner output is stable between repeated runs on unchanged repo state

**Definition of Done**
- scanner implemented
- ignore handling verified
- output format documented
- sample scan result tested

---

## Story PIL-004 — Implement snapshot diffing

**Problem**
PIL must detect changed files to avoid full reprocessing on every run.

**Files**
- `src/pil/snapshot/diffSnapshots.ts`

**Tasks**
- compare current scan results against latest snapshot
- detect new files (in scan, not in snapshot)
- detect changed files (hash differs)
- detect deleted files (in snapshot, not in scan)
- detect unchanged files (hash matches)
- return structured diff result

**Acceptance Criteria**
- new files are detected
- changed files are detected by hash
- deleted files are detected
- unchanged files are not scheduled for re-index

**Definition of Done**
- diff engine implemented
- new/changed/deleted/unchanged states exposed cleanly
- re-index scope minimized
- test coverage or fixture validation added

---

## Story PIL-005 — Wire Phase 1 into indexing CLI

**Problem**
Phase 1 components need a working CLI entrypoint to validate end-to-end flow.

**Files**
- `scripts/pil-index.ts`

**Tasks**
- accept repo path as argument
- load PIL config
- run file scanner
- run snapshot diff
- persist new snapshot + file records
- print summary: N new, N changed, N deleted, N unchanged

**Acceptance Criteria**
- CLI runs against a real repo (e.g. this repo itself)
- output is human-readable and accurate
- re-running on unchanged repo shows 0 changed files

**Definition of Done**
- CLI implemented
- tested against fixture or real repo
- README updated with usage example

---

# PHASE 2 — AST Extraction and Graph Build

## Story PIL-006 — Define extraction schema and types

**Files**: `src/pil/extract/types.ts`

Define shared TypeScript types for extraction output: ExtractedFile, ExtractedSymbol, ExtractedImport, ExtractionMarker, ExtractionResult.

## Story PIL-007 — Implement TS/JS extractor

**Files**: `src/pil/extract/extractTsJs.ts`

Use `@typescript-eslint/typescript-estree` to extract functions, classes, methods, imports, exports, TODO/FIXME markers, env var usage.

## Story PIL-008 — Implement Python extractor

**Files**: `src/pil/extract/extractPython.ts`

Use `tree-sitter` with Python grammar to extract functions, classes, imports, TODO/FIXME markers, decorators.

## Story PIL-009 — Define graph schema

**Files**: `src/pil/graph/graphTypes.ts`, `src/pil/db/pilSchema.sql`

Add `nodes` and `edges` tables. Node types: file, symbol, route, model, workflow, integration, config_variable. Edge types: imports, calls, uses_env, belongs_to, depends_on, exposes_route.

## Story PIL-010 — Build graph ingestion pipeline

**Files**: `src/pil/graph/graphIngest.ts`, `src/pil/graph/graphRepository.ts`

Convert extraction output into nodes + edges. Handle cleanup of stale nodes/edges on re-index. Verify idempotency.

---

# PHASE 3 — Semantic Summaries and Vector Retrieval

## Story PIL-011 — Add sqlite-vec to the database

**Files**: `src/pil/db/`, `src/pil/semantic/semanticRepository.ts`

Load `sqlite-vec` extension. Create vector tables for file and symbol embeddings. Use OpenAI `text-embedding-3-small` (1536 dims).

## Story PIL-012 — Generate file summaries

**Files**: `src/pil/semantic/summarizeFile.ts`, `src/pil/semantic/summaryTypes.ts`

Use Claude to generate machine-readable file summaries: purpose, responsibilities, key dependencies, feature tags. Only regenerate for changed files.

## Story PIL-013 — Generate symbol summaries

**Files**: `src/pil/semantic/summarizeSymbol.ts`

Generate summaries for exported functions, classes, and other high-value symbols. Link to stable symbol IDs.

## Story PIL-014 — Embed summaries and support semantic search

**Files**: `src/pil/semantic/embedChunks.ts`, `src/pil/semantic/semanticRepository.ts`

Embed file and symbol summaries. Support semantic similarity search that returns chunks with file/symbol references.

---

# PHASE 4 — Query Engine and Incomplete Work Detection

## Story PIL-015 — Build query classifier

**Files**: `src/pil/queries/queryClassifier.ts`

Classify queries: graph-first (dependency), semantic-first (conceptual), hybrid (architecture/workflow).

## Story PIL-016 — Implement architecture lookup

**Files**: `src/pil/queries/architectureLookup.ts`

Answer: "Where are X created/handled?" Returns primary files, symbols, call chains, evidence-backed explanation.

## Story PIL-017 — Implement dependency lookup

**Files**: `src/pil/queries/dependencyLookup.ts`

Answer: "What depends on X?" Returns direct callers/dependents, upstream/downstream neighbors. Handles cycles.

## Story PIL-018 — Implement workflow explanation

**Files**: `src/pil/queries/workflowExplain.ts`

Answer: "Explain the X flow." Identifies entrypoints, major steps, core files/symbols. Combines structural + semantic evidence.

## Story PIL-019 — Incomplete work detection

**Files**: `src/pil/queries/incompleteWorkLookup.ts`

Expose: TODO/FIXME markers by file, large untested modules, duplicate logic candidates. Used by Auditor agent.

---

# PHASE 5 — Impact Analysis, Workflows, Agent Tools

## Story PIL-020 — Symbol impact analysis

**Files**: `src/pil/queries/impactAnalysis.ts`

Given a symbol: return callers, dependent files, related routes/workflows.

## Story PIL-021 — File impact analysis

Given a file: return inbound/outbound dependencies, related tests, nearby workflows.

## Story PIL-022 — Track recent changes

**Files**: `src/pil/queries/recentChanges.ts`

Store change events between snapshots. Query: what changed since last snapshot?

## Story PIL-023 — Expose agent tools

**Files**: `src/pil/agents/pilTools.ts`

Stable tool interfaces for Auditor, Planner, and Reviewer agents. Structured output. Integration documentation.

## Story PIL-024 — Wire Phase 5 into query CLI

**Files**: `scripts/pil-query.ts`

CLI: `pil-query --repo <path> --ask "Where is X handled?"` — routes through classifier, returns evidence-backed answer.

---

# README Requirements

- What PIL is and why
- Stack overview (TypeScript, SQLite, sqlite-vec, OpenAI, Claude)
- Setup instructions
- CLI usage (pil-index, pil-query)
- .env.example keys explained
- Phase delivery status table
