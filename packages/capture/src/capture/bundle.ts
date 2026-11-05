import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { REPO_ROOT } from '../paths';

export interface RendererBundle {
  path: string;
  /** Hash of the bundled renderer code: part of the capture cache key ("renderer version"). */
  hash: string;
}

/**
 * Bundle the real renderer + capture page entry from `@mudders/client` into one IIFE script that
 * the headless page loads (§2d: captures use the game's renderer, not a lookalike).
 */
export async function buildRendererBundle(outDir: string): Promise<RendererBundle> {
  const client = resolve(REPO_ROOT, 'packages/client');
  await build({
    configFile: false,
    root: client,
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      lib: {
        entry: resolve(client, 'src/capture/entry.ts'),
        formats: ['iife'],
        name: 'MuddersCapture',
        fileName: () => 'capture.js',
      },
    },
  });
  const path = resolve(outDir, 'capture.js');
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
  return { path, hash };
}
