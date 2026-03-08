/**
 * Repository File Scanner (PIL-003)
 *
 * Walks the repository directory tree and returns a list of indexable files
 * with their content hashes. Respects .gitignore rules and PIL's configured
 * exclusion patterns so we never waste time on node_modules, build artifacts,
 * or other irrelevant files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ignore, { Ignore } from 'ignore';
import { PilConfig, SupportedLanguage } from '../config/pilConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The output for a single scanned file. */
export interface ScannedFile {
  /** Path relative to the repo root (forward-slash separated). */
  relativePath: string;

  /** Detected language, or null if the extension isn't in the language map. */
  language: SupportedLanguage | null;

  /**
   * SHA-256 hex digest of the file's contents.
   * Used for change detection — if the hash matches, the file hasn't changed.
   */
  hash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of a file's contents.
 * We read the entire file into memory because the files we index (source code)
 * are almost always small enough for this to be fine.
 */
function hashFileContents(absolutePath: string): string {
  const content = fs.readFileSync(absolutePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Try to read a .gitignore file and return its rules.
 * Returns an empty array if the file doesn't exist.
 */
function readGitignoreRules(dirPath: string): string[] {
  const gitignorePath = path.join(dirPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  // Split into lines, strip comments and blank lines
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Determine the language of a file from its extension.
 * Returns null for extensions not in the config's language map.
 */
function classifyLanguage(
  filePath: string,
  extensionMap: Record<string, SupportedLanguage>
): SupportedLanguage | null {
  const ext = path.extname(filePath).slice(1).toLowerCase(); // remove the dot
  return extensionMap[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Recursively scan the repository and return all indexable files.
 *
 * The scanner builds an `ignore` instance that combines:
 *  1. The repo's root .gitignore rules
 *  2. PIL's configured exclusion patterns
 *
 * Then it walks the tree, skipping ignored directories early (so we never
 * descend into node_modules, .git, etc.) and collecting files whose
 * extensions match the config's supportedExtensions list.
 *
 * @param config - Validated PIL config (must have repoRoot resolved to absolute).
 * @returns Array of ScannedFile objects sorted by relativePath for determinism.
 */
export function scanRepo(config: PilConfig): ScannedFile[] {
  const results: ScannedFile[] = [];

  // Build the ignore filter from .gitignore + PIL exclusions
  const ig: Ignore = ignore();

  // Add .gitignore rules from the repo root
  const gitignoreRules = readGitignoreRules(config.repoRoot);
  if (gitignoreRules.length > 0) {
    ig.add(gitignoreRules);
  }

  // Add PIL's own exclusion patterns
  ig.add(config.excludePatterns);

  // Normalize supported extensions to lowercase with dot prefix for matching
  const supportedExts = new Set(
    config.supportedExtensions.map((ext) =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    )
  );

  /**
   * Recursive directory walker. We use a stack-based approach instead of
   * recursion to avoid stack overflow on deeply nested repos.
   */
  const dirStack: string[] = [config.repoRoot];

  while (dirStack.length > 0) {
    const currentDir = dirStack.pop()!;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      // Skip directories we can't read (permissions, broken symlinks, etc.)
      console.warn(
        `PIL scanner: skipping unreadable directory: ${currentDir} (${(err as Error).message})`
      );
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      // Compute the path relative to the repo root for ignore matching
      const relativePath = path.relative(config.repoRoot, absolutePath);

      // The `ignore` package expects forward-slash paths
      const normalizedRelative = relativePath.split(path.sep).join('/');

      // Check if this path should be ignored
      if (ig.ignores(normalizedRelative)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Push directory onto the stack for further traversal
        dirStack.push(absolutePath);
      } else if (entry.isFile()) {
        // Check if the file extension is one we care about
        const ext = path.extname(entry.name).toLowerCase();
        if (!supportedExts.has(ext)) {
          continue;
        }

        try {
          const hash = hashFileContents(absolutePath);
          const language = classifyLanguage(entry.name, config.extensionToLanguage);

          results.push({
            relativePath: normalizedRelative,
            language,
            hash,
          });
        } catch (err) {
          // Skip files we can't read
          console.warn(
            `PIL scanner: skipping unreadable file: ${absolutePath} (${(err as Error).message})`
          );
        }
      }
      // Symlinks and other special entries are silently skipped
    }
  }

  // Sort for deterministic output — makes diffing and testing predictable
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return results;
}
