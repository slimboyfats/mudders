import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ScenarioSchema } from '@mudders/shared';
import { ScenarioDriver } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';

/**
 * Golden determinism tests (§9): every scenario's seed + input log must produce the same final
 * state hash on every run and every machine. Regenerate deliberately with
 * `UPDATE_GOLDEN=1 pnpm test` after a change that is *meant* to alter results (and bump the pack
 * or behaviour version, §2c.4).
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const GOLDEN = resolve(import.meta.dirname, '../golden.json');

interface Golden {
  contentHash: string;
  scenarios: Record<string, { ticks: number; hash: string }>;
}

function runAll(): Golden {
  const content = loadContent();
  const scenarios: Golden['scenarios'] = {};
  const dir = resolve(ROOT, 'scenarios');
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const sc = ScenarioSchema.parse(JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
    const d = new ScenarioDriver(content, sc);
    while (!d.done) d.step();
    scenarios[sc.id] = { ticks: d.world.tick, hash: d.world.hash() };
  }
  return { contentHash: content.hash, scenarios };
}

describe('golden determinism', () => {
  const actual = runAll();

  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);

  it('content hash matches golden.json', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
    expect(actual.contentHash).toBe(golden.contentHash);
  });

  it('every scenario reproduces its golden state hash', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
    expect(actual.scenarios).toEqual(golden.scenarios);
  });

  // ~140 scenarios: allow for coverage instrumentation on a slow machine
  it('is identical when run twice in one process', { timeout: 720_000 }, () => {
    expect(runAll()).toEqual(actual);
  });
});
