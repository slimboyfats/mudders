import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, resolved from this file's location. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Output directory for captures (gitignored except `reference/`). */
export function capturesDir(): string {
  const dir = resolve(REPO_ROOT, 'captures');
  mkdirSync(dir, { recursive: true });
  return dir;
}
