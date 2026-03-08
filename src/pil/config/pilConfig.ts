/**
 * PIL Configuration Module (PIL-001)
 *
 * Defines the configuration model for the Project Intelligence Layer.
 * Config controls which files get scanned, which patterns are excluded,
 * and how the indexing pipeline behaves (incremental vs full reindex).
 */

import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Languages PIL knows how to analyze in later phases. */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python';

/**
 * Core configuration for a PIL indexing run.
 * Every field has a sensible default so callers only need to provide repoRoot.
 */
export interface PilConfig {
  /** Absolute path to the repository root directory. */
  repoRoot: string;

  /** SQLite database file path. Defaults to `./pil.db`. */
  dbPath: string;

  /**
   * Glob patterns for directories/files to always exclude from scanning.
   * These are applied *on top of* .gitignore rules.
   */
  excludePatterns: string[];

  /**
   * File extensions PIL considers "indexable".
   * Anything not matching these extensions is skipped during scanning.
   */
  supportedExtensions: string[];

  /**
   * Map from file extension (without dot) to the language enum.
   * Used to tag each file with its language for downstream extractors.
   */
  extensionToLanguage: Record<string, SupportedLanguage>;

  /**
   * When true, PIL compares against the previous snapshot and only
   * reprocesses files whose content hash has changed.
   * When false, every file is treated as "new" regardless of prior state.
   */
  incremental: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Directories and patterns that should always be excluded from scanning. */
const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '*.min.js',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/** File extensions PIL can meaningfully process. */
const DEFAULT_SUPPORTED_EXTENSIONS: string[] = [
  '.ts', '.tsx', '.js', '.jsx', '.py',
  '.json', '.md', '.sql', '.yaml', '.yml',
  '.html', '.css', '.scss',
];

/** Mapping from extension (no dot) to language identifier. */
const DEFAULT_EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a PilConfig and throws a descriptive error if anything is wrong.
 * Called automatically by `loadConfig` but can also be used standalone.
 */
export function validateConfig(config: PilConfig): void {
  // repoRoot must be an absolute path that exists on disk
  if (!path.isAbsolute(config.repoRoot)) {
    throw new Error(
      `PIL config error: repoRoot must be an absolute path, got "${config.repoRoot}"`
    );
  }

  if (!fs.existsSync(config.repoRoot)) {
    throw new Error(
      `PIL config error: repoRoot directory does not exist: "${config.repoRoot}"`
    );
  }

  const stat = fs.statSync(config.repoRoot);
  if (!stat.isDirectory()) {
    throw new Error(
      `PIL config error: repoRoot is not a directory: "${config.repoRoot}"`
    );
  }

  // dbPath must be non-empty
  if (!config.dbPath || config.dbPath.trim().length === 0) {
    throw new Error('PIL config error: dbPath must not be empty');
  }

  // supportedExtensions must have at least one entry
  if (config.supportedExtensions.length === 0) {
    throw new Error(
      'PIL config error: supportedExtensions must contain at least one extension'
    );
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Partial config that callers provide. Only `repoRoot` is mandatory;
 * everything else falls back to sensible defaults.
 */
export type PilConfigInput = Partial<PilConfig> & { repoRoot: string };

/**
 * Builds a fully-resolved PilConfig by merging caller-provided values
 * with defaults, then validates the result.
 *
 * Environment variable overrides:
 *  - PIL_DB_PATH → config.dbPath
 *
 * @param input - Partial config; at minimum `{ repoRoot }`.
 * @returns A validated PilConfig ready for use.
 * @throws If validation fails.
 */
export function loadConfig(input: PilConfigInput): PilConfig {
  // Resolve repoRoot to an absolute path relative to cwd
  const resolvedRoot = path.resolve(input.repoRoot);

  const config: PilConfig = {
    repoRoot: resolvedRoot,
    dbPath: input.dbPath ?? process.env.PIL_DB_PATH ?? './pil.db',
    excludePatterns: input.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
    supportedExtensions: input.supportedExtensions ?? DEFAULT_SUPPORTED_EXTENSIONS,
    extensionToLanguage: input.extensionToLanguage ?? DEFAULT_EXTENSION_TO_LANGUAGE,
    incremental: input.incremental ?? true,
  };

  validateConfig(config);
  return config;
}
