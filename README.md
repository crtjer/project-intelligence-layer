# Project Intelligence Layer (PIL)

PIL v1 — persistent, structured codebase understanding for OpenClaw agents.

PIL scans repositories, builds incremental snapshots, and detects file changes so downstream agents can focus on what actually changed instead of reprocessing everything.

## Stack

- **Language:** TypeScript (strict mode)
- **Database:** SQLite via `better-sqlite3`
- **Runtime:** Node.js 18+
- **Tests:** Jest

## Setup

```bash
# Install dependencies
npm install

# Copy environment config (optional — defaults work out of the box)
cp .env.example .env

# Verify TypeScript compiles
npx tsc --noEmit
```

## Configuration

PIL config is loaded programmatically via `loadConfig()` from `src/pil/config/pilConfig.ts`. Minimal usage:

```typescript
import { loadConfig } from './src/pil/config/pilConfig';

const config = loadConfig({ repoRoot: '/path/to/repo' });
```

Environment variables:
- `PIL_DB_PATH` — Path to the SQLite database file (default: `./pil.db`)

Config options:
- `repoRoot` (required) — Absolute path to the repository
- `dbPath` — SQLite database path
- `excludePatterns` — Glob patterns to exclude (defaults include node_modules, .git, dist, etc.)
- `supportedExtensions` — File extensions to index
- `incremental` — Whether to diff against previous snapshot (default: true)

## CLI Usage

### pil-index — Index a repository

```bash
# Index the current repo (incremental mode)
npx tsx scripts/pil-index.ts --repo .

# Full reindex (ignores previous snapshot)
npx tsx scripts/pil-index.ts --repo . --full

# Custom database path
npx tsx scripts/pil-index.ts --repo . --db ./my-pil.db
```

Output example:
```
PIL Index — scanning repository: .
  Repo root: /path/to/repo
  DB path:   ./pil.db
  Mode:      incremental

Scanning files...
  Found 12 indexable files

Snapshot diff:
  New:       12
  Changed:   0
  Deleted:   0
  Unchanged: 0
  Total:     12

Snapshot abc123 created with 12 change(s).
  Commit: 837a440...

Done.
```

Re-running on an unchanged repo shows 0 changes:
```
Snapshot diff:
  New:       0
  Changed:   0
  Deleted:   0
  Unchanged: 12
  Total:     12

No changes detected. Repository is up to date.
```

## Phase Delivery Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Snapshot engine + scanner + diffing | Done |
| 2 | AST extraction + graph ingestion | Planned |
| 3 | Semantic summaries + embeddings (sqlite-vec) | Planned |
| 4 | Query engine + incomplete work detection | Planned |
| 5 | Impact analysis + workflows + agent tools | Planned |

## Running Tests

```bash
npm test
```
