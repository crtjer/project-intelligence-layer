/**
 * Snapshot Diff Engine (PIL-004)
 *
 * Compares the current scan results against previously persisted file records
 * to determine which files are new, changed, deleted, or unchanged.
 *
 * This is the core of incremental indexing — only files that actually changed
 * need to be reprocessed by downstream extractors and summarizers.
 */

import { ScannedFile } from './scanRepo';
import { FileRecord } from './snapshotService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A file that exists in the current scan but not in the previous snapshot.
 * It needs full processing.
 */
export interface NewFile {
  status: 'new';
  relativePath: string;
  language: string | null;
  hash: string;
}

/**
 * A file that exists in both scan and snapshot but whose hash differs.
 * It needs reprocessing.
 */
export interface ChangedFile {
  status: 'changed';
  relativePath: string;
  language: string | null;
  hash: string;
  previousHash: string;
}

/**
 * A file that exists in the previous snapshot but not in the current scan.
 * Its records should be cleaned up.
 */
export interface DeletedFile {
  status: 'deleted';
  relativePath: string;
  previousHash: string;
}

/**
 * A file whose hash matches between scan and snapshot.
 * No reprocessing needed.
 */
export interface UnchangedFile {
  status: 'unchanged';
  relativePath: string;
  language: string | null;
  hash: string;
}

/** Union of all possible file diff states. */
export type DiffEntry = NewFile | ChangedFile | DeletedFile | UnchangedFile;

/**
 * The complete result of comparing a scan against a snapshot.
 * Provides both the categorized lists and a convenience summary.
 */
export interface DiffResult {
  newFiles: NewFile[];
  changedFiles: ChangedFile[];
  deletedFiles: DeletedFile[];
  unchangedFiles: UnchangedFile[];

  /** Quick counts for logging and CLI output. */
  summary: {
    newCount: number;
    changedCount: number;
    deletedCount: number;
    unchangedCount: number;
    totalScanned: number;
  };
}

// ---------------------------------------------------------------------------
// Diff Logic
// ---------------------------------------------------------------------------

/**
 * Compare the current scan output against previously stored file records.
 *
 * Algorithm:
 *  1. Build a lookup map from the previous files (keyed by relative path).
 *  2. Walk through each scanned file:
 *     - If it's not in the map → new file.
 *     - If it's in the map and hash matches → unchanged.
 *     - If it's in the map and hash differs → changed.
 *     - Remove matched entries from the map.
 *  3. Any entries remaining in the map are deleted files.
 *
 * This runs in O(n + m) where n = scanned files, m = previous files.
 *
 * @param scannedFiles - Output from scanRepo() for the current state.
 * @param previousFiles - FileRecord[] from the database (last known state).
 * @returns Categorized diff result.
 */
export function diffSnapshots(
  scannedFiles: ScannedFile[],
  previousFiles: FileRecord[]
): DiffResult {
  // Build a map of previous files by their relative path for O(1) lookups
  const previousMap = new Map<string, FileRecord>();
  for (const file of previousFiles) {
    previousMap.set(file.path, file);
  }

  const newFiles: NewFile[] = [];
  const changedFiles: ChangedFile[] = [];
  const unchangedFiles: UnchangedFile[] = [];

  // Walk through each scanned file and categorize it
  for (const scanned of scannedFiles) {
    const previous = previousMap.get(scanned.relativePath);

    if (!previous) {
      // File doesn't exist in the previous snapshot — it's new
      newFiles.push({
        status: 'new',
        relativePath: scanned.relativePath,
        language: scanned.language,
        hash: scanned.hash,
      });
    } else if (previous.hash !== scanned.hash) {
      // File exists but content has changed
      changedFiles.push({
        status: 'changed',
        relativePath: scanned.relativePath,
        language: scanned.language,
        hash: scanned.hash,
        previousHash: previous.hash,
      });
      // Remove from map so it's not counted as deleted
      previousMap.delete(scanned.relativePath);
    } else {
      // File exists and hash matches — unchanged
      unchangedFiles.push({
        status: 'unchanged',
        relativePath: scanned.relativePath,
        language: scanned.language,
        hash: scanned.hash,
      });
      previousMap.delete(scanned.relativePath);
    }
  }

  // Any files still in the map were in the previous snapshot but not scanned
  // — they've been deleted from the repo
  const deletedFiles: DeletedFile[] = [];
  for (const [relativePath, record] of previousMap) {
    deletedFiles.push({
      status: 'deleted',
      relativePath,
      previousHash: record.hash,
    });
  }

  return {
    newFiles,
    changedFiles,
    deletedFiles,
    unchangedFiles,
    summary: {
      newCount: newFiles.length,
      changedCount: changedFiles.length,
      deletedCount: deletedFiles.length,
      unchangedCount: unchangedFiles.length,
      totalScanned: scannedFiles.length,
    },
  };
}
