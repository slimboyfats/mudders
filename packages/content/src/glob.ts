/// <reference types="vite/client" />
import type { AnyBehaviour, ContentSource, RawManifest } from '@mudders/sim';

/**
 * Content discovery (§2c.1): every `manifest.json` and `behaviour.ts` under a pack folder is picked
 * up by Vite's `import.meta.glob`, so adding a folder registers the item with no other edits.
 * Node tooling loads this module through Vite's module runner (see `scripts/vite-run.ts`).
 */
const packFiles: Record<string, unknown> = import.meta.glob('../*/pack.json', {
  eager: true,
  import: 'default',
});
const manifestFiles: Record<string, unknown> = import.meta.glob('../*/**/manifest.json', {
  eager: true,
  import: 'default',
});
const behaviourFiles: Record<string, AnyBehaviour> = import.meta.glob('../*/**/behaviour.ts', {
  eager: true,
  import: 'default',
});

function packOf(path: string): string {
  return path.split('/')[1] ?? '';
}

/** Sources for every pack in this package, in sorted (deterministic) order. */
export function discoverContent(): ContentSource {
  const packs = Object.keys(packFiles)
    .sort()
    .map((packPath) => {
      const name = packOf(packPath);
      const manifests: RawManifest[] = Object.keys(manifestFiles)
        .filter((p) => packOf(p) === name)
        .sort()
        .map((p) => ({ path: p.slice(3), data: manifestFiles[p] }));
      return { pack: packFiles[packPath], manifests };
    });
  const behaviours = Object.keys(behaviourFiles)
    .sort()
    .map((p) => behaviourFiles[p]!);
  return { packs, behaviours };
}

/** Paths of discovered behaviour modules, for tooling. */
export function behaviourPaths(): string[] {
  return Object.keys(behaviourFiles)
    .sort()
    .map((p) => p.slice(3));
}
