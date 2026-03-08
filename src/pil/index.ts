/**
 * PIL public API — re-exports the Phase 1 modules for convenient imports.
 */

export { loadConfig, validateConfig } from './config/pilConfig';
export type { PilConfig, PilConfigInput, SupportedLanguage } from './config/pilConfig';

export { migrateAndOpen } from './db/migrate';

export {
  upsertRepo,
  getRepoByPath,
  createSnapshot,
  getLatestSnapshot,
  upsertFile,
  deleteFile,
  getFilesForRepo,
  recordChangeEvent,
} from './snapshot/snapshotService';
export type { RepoRecord, SnapshotRecord, FileRecord } from './snapshot/snapshotService';

export { scanRepo } from './snapshot/scanRepo';
export type { ScannedFile } from './snapshot/scanRepo';

export { diffSnapshots } from './snapshot/diffSnapshots';
export type {
  DiffResult,
  DiffEntry,
  NewFile,
  ChangedFile,
  DeletedFile,
  UnchangedFile,
} from './snapshot/diffSnapshots';
