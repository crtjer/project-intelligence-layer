/**
 * Snapshot Tests (PIL-004)
 *
 * Tests for the diffSnapshots function — the core logic that determines
 * which files need reprocessing during incremental indexing.
 */

import { diffSnapshots } from '../snapshot/diffSnapshots';
import { ScannedFile } from '../snapshot/scanRepo';
import { FileRecord } from '../snapshot/snapshotService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ScannedFile for testing. */
function scanned(
  relativePath: string,
  hash: string,
  language: string | null = 'typescript'
): ScannedFile {
  return { relativePath, hash, language: language as ScannedFile['language'] };
}

/** Create a minimal FileRecord for testing (only fields diffSnapshots uses). */
function fileRecord(relativePath: string, hash: string): FileRecord {
  return {
    id: `id-${relativePath}`,
    repo_id: 'test-repo',
    path: relativePath,
    language: 'typescript',
    hash,
    last_indexed_at: null,
    metadata_json: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diffSnapshots', () => {
  it('should detect all files as new when there are no previous files', () => {
    const scannedFiles = [
      scanned('src/a.ts', 'hash-a'),
      scanned('src/b.ts', 'hash-b'),
    ];

    const result = diffSnapshots(scannedFiles, []);

    expect(result.newFiles).toHaveLength(2);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);
    expect(result.unchangedFiles).toHaveLength(0);
    expect(result.summary.newCount).toBe(2);
    expect(result.summary.totalScanned).toBe(2);
  });

  it('should detect all files as unchanged when hashes match', () => {
    const scannedFiles = [
      scanned('src/a.ts', 'hash-a'),
      scanned('src/b.ts', 'hash-b'),
    ];
    const previousFiles = [
      fileRecord('src/a.ts', 'hash-a'),
      fileRecord('src/b.ts', 'hash-b'),
    ];

    const result = diffSnapshots(scannedFiles, previousFiles);

    expect(result.newFiles).toHaveLength(0);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);
    expect(result.unchangedFiles).toHaveLength(2);
    expect(result.summary.unchangedCount).toBe(2);
  });

  it('should detect changed files when hashes differ', () => {
    const scannedFiles = [
      scanned('src/a.ts', 'new-hash-a'),
    ];
    const previousFiles = [
      fileRecord('src/a.ts', 'old-hash-a'),
    ];

    const result = diffSnapshots(scannedFiles, previousFiles);

    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].relativePath).toBe('src/a.ts');
    expect(result.changedFiles[0].hash).toBe('new-hash-a');
    expect(result.changedFiles[0].previousHash).toBe('old-hash-a');
    expect(result.newFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);
  });

  it('should detect deleted files that are in previous but not in scan', () => {
    const scannedFiles: ScannedFile[] = [];
    const previousFiles = [
      fileRecord('src/old.ts', 'hash-old'),
    ];

    const result = diffSnapshots(scannedFiles, previousFiles);

    expect(result.deletedFiles).toHaveLength(1);
    expect(result.deletedFiles[0].relativePath).toBe('src/old.ts');
    expect(result.deletedFiles[0].previousHash).toBe('hash-old');
    expect(result.newFiles).toHaveLength(0);
    expect(result.changedFiles).toHaveLength(0);
  });

  it('should handle a mix of new, changed, deleted, and unchanged files', () => {
    const scannedFiles = [
      scanned('src/unchanged.ts', 'hash-1'),
      scanned('src/changed.ts', 'new-hash-2'),
      scanned('src/brand-new.ts', 'hash-3'),
    ];
    const previousFiles = [
      fileRecord('src/unchanged.ts', 'hash-1'),
      fileRecord('src/changed.ts', 'old-hash-2'),
      fileRecord('src/removed.ts', 'hash-4'),
    ];

    const result = diffSnapshots(scannedFiles, previousFiles);

    expect(result.newFiles).toHaveLength(1);
    expect(result.newFiles[0].relativePath).toBe('src/brand-new.ts');

    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].relativePath).toBe('src/changed.ts');

    expect(result.deletedFiles).toHaveLength(1);
    expect(result.deletedFiles[0].relativePath).toBe('src/removed.ts');

    expect(result.unchangedFiles).toHaveLength(1);
    expect(result.unchangedFiles[0].relativePath).toBe('src/unchanged.ts');

    expect(result.summary).toEqual({
      newCount: 1,
      changedCount: 1,
      deletedCount: 1,
      unchangedCount: 1,
      totalScanned: 3,
    });
  });

  it('should handle empty inputs gracefully', () => {
    const result = diffSnapshots([], []);

    expect(result.newFiles).toHaveLength(0);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.deletedFiles).toHaveLength(0);
    expect(result.unchangedFiles).toHaveLength(0);
    expect(result.summary.totalScanned).toBe(0);
  });

  it('should preserve language information in diff entries', () => {
    const scannedFiles = [
      scanned('src/app.py', 'hash-py', 'python'),
      scanned('src/index.ts', 'hash-ts', 'typescript'),
    ];

    const result = diffSnapshots(scannedFiles, []);

    expect(result.newFiles[0].language).toBe('python');
    expect(result.newFiles[1].language).toBe('typescript');
  });
});
