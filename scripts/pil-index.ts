/**
 * PIL Index CLI (PIL-005)
 *
 * Entrypoint that wires together the Phase 1 components:
 *  1. Load and validate config
 *  2. Open/migrate the database
 *  3. Upsert the repo record
 *  4. Scan the repo for indexable files
 *  5. Diff against the previous snapshot
 *  6. Persist updated file records and change events
 *  7. Print a human-readable summary
 *
 * Usage:
 *   npx tsx scripts/pil-index.ts --repo <path> [--db <db-path>] [--full]
 */

import * as path from 'path';
import * as child_process from 'child_process';
import { loadConfig } from '../src/pil/config/pilConfig';
import { migrateAndOpen } from '../src/pil/db/migrate';
import {
  upsertRepo,
  createSnapshot,
  getFilesForRepo,
  upsertFile,
  deleteFile,
  recordChangeEvent,
} from '../src/pil/snapshot/snapshotService';
import { scanRepo } from '../src/pil/snapshot/scanRepo';
import { diffSnapshots } from '../src/pil/snapshot/diffSnapshots';

// ---------------------------------------------------------------------------
// Argument parsing (minimal — no deps needed for this)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  repoPath: string;
  dbPath?: string;
  full: boolean;
} {
  let repoPath: string | undefined;
  let dbPath: string | undefined;
  let full = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repo' && argv[i + 1]) {
      repoPath = argv[++i];
    } else if (arg === '--db' && argv[i + 1]) {
      dbPath = argv[++i];
    } else if (arg === '--full') {
      full = true;
    }
  }

  if (!repoPath) {
    console.error('Usage: pil-index --repo <path> [--db <db-path>] [--full]');
    process.exit(1);
  }

  return { repoPath, dbPath, full };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Try to get the current git commit SHA for the repo.
 * Returns undefined if git isn't available or the path isn't a git repo.
 */
function getCurrentCommitSha(repoRoot: string): string | undefined {
  try {
    const result = child_process.execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * Try to get the repo name from the git remote or fall back to the
 * directory name.
 */
function getRepoName(repoRoot: string): string {
  try {
    const result = child_process.execSync('git remote get-url origin', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Extract repo name from URL like git@github.com:org/repo.git
    const url = result.trim();
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // Not a git repo or no remote — fall through
  }
  return path.basename(repoRoot);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);

  // 1. Load and validate config
  console.log(`PIL Index — scanning repository: ${args.repoPath}`);

  const config = loadConfig({
    repoRoot: args.repoPath,
    dbPath: args.dbPath,
    incremental: !args.full,
  });

  console.log(`  Repo root: ${config.repoRoot}`);
  console.log(`  DB path:   ${config.dbPath}`);
  console.log(`  Mode:      ${config.incremental ? 'incremental' : 'full reindex'}`);

  // 2. Open and migrate the database
  const db = migrateAndOpen(config.dbPath);

  try {
    // 3. Upsert the repo record
    const repoName = getRepoName(config.repoRoot);
    const repo = upsertRepo(db, repoName, config.repoRoot);
    console.log(`  Repo:      ${repo.name} (${repo.id})`);

    // 4. Scan the repo
    console.log('\nScanning files...');
    const scannedFiles = scanRepo(config);
    console.log(`  Found ${scannedFiles.length} indexable files`);

    // 5. Get previous files and compute diff
    const previousFiles = config.incremental ? getFilesForRepo(db, repo.id) : [];
    const diff = diffSnapshots(scannedFiles, previousFiles);

    console.log('\nSnapshot diff:');
    console.log(`  New:       ${diff.summary.newCount}`);
    console.log(`  Changed:   ${diff.summary.changedCount}`);
    console.log(`  Deleted:   ${diff.summary.deletedCount}`);
    console.log(`  Unchanged: ${diff.summary.unchangedCount}`);
    console.log(`  Total:     ${diff.summary.totalScanned}`);

    // 6. Persist changes inside a transaction for atomicity
    const commitSha = getCurrentCommitSha(config.repoRoot);
    const snapshot = createSnapshot(db, repo.id, commitSha);

    const persist = db.transaction(() => {
      // Upsert new and changed files
      for (const file of diff.newFiles) {
        upsertFile(db, repo.id, file.relativePath, file.hash, file.language);
        recordChangeEvent(db, repo.id, snapshot.id, 'file', file.relativePath, 'new');
      }

      for (const file of diff.changedFiles) {
        upsertFile(db, repo.id, file.relativePath, file.hash, file.language);
        recordChangeEvent(
          db,
          repo.id,
          snapshot.id,
          'file',
          file.relativePath,
          'changed'
        );
      }

      // Remove deleted files
      for (const file of diff.deletedFiles) {
        deleteFile(db, repo.id, file.relativePath);
        recordChangeEvent(
          db,
          repo.id,
          snapshot.id,
          'file',
          file.relativePath,
          'deleted'
        );
      }
    });

    persist();

    // 7. Summary
    const changesTotal =
      diff.summary.newCount + diff.summary.changedCount + diff.summary.deletedCount;

    if (changesTotal === 0) {
      console.log('\nNo changes detected. Repository is up to date.');
    } else {
      console.log(`\nSnapshot ${snapshot.id} created with ${changesTotal} change(s).`);
    }

    if (commitSha) {
      console.log(`  Commit: ${commitSha}`);
    }

    console.log('\nDone.');
  } finally {
    // Always close the database handle
    db.close();
  }
}

main();
