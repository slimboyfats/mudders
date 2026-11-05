/**
 * Browser half of `pnpm determinism:browsers`: runs every scenario in `scenarios/` through the
 * shipped sim + content (bundled by Vite exactly as the client is) and POSTs the final state
 * hashes back to the CLI, which compares them with `packages/content/golden.json`.
 */
import { loadContent } from '@mudders/content';
import { ScenarioSchema } from '@mudders/shared';
import { ScenarioDriver } from '@mudders/sim';
import type { BrowserRun, GoldenHashes } from './protocol';

// `import.meta.glob` is typed by the global declaration in @mudders/content (src/glob.ts).
const scenarioFiles = import.meta.glob<unknown>('../../../../scenarios/*.json', {
  eager: true,
  import: 'default',
});

function runAll(): GoldenHashes {
  const content = loadContent();
  const scenarios: GoldenHashes['scenarios'] = {};
  for (const path of Object.keys(scenarioFiles).sort()) {
    const sc = ScenarioSchema.parse(scenarioFiles[path]);
    const d = new ScenarioDriver(content, sc);
    while (!d.done) d.step();
    scenarios[sc.id] = { ticks: d.world.tick, hash: d.world.hash() };
  }
  return { contentHash: content.hash, scenarios };
}

async function main(): Promise<void> {
  const out = document.getElementById('out');
  let run: BrowserRun;
  try {
    const t0 = performance.now();
    const first = runAll();
    const again = runAll();
    run = {
      userAgent: navigator.userAgent,
      ms: Math.round(performance.now() - t0),
      result: first,
      repeatMatches: JSON.stringify(first) === JSON.stringify(again),
    };
  } catch (err) {
    run = {
      userAgent: navigator.userAgent,
      error: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
    };
  }
  if (out) out.textContent = JSON.stringify(run, null, 2);
  await fetch('/result', { method: 'POST', body: JSON.stringify(run) });
}

void main();
