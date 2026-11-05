/**
 * pnpm bench [--update] [--runs N]
 *
 * Runs the §9 benchmark cases, prints a table (median of N runs: average and worst tick), and
 * compares against `bench/baseline.json`. A case fails when its average regresses by more than
 * 15% (plus a 0.05 ms noise floor), or its worst tick exceeds the x86 budget of 2 ms (§9: phones
 * get 6 ms, x86 is held to a third of that). `--update` rewrites the baseline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CASES, PENDING } from './cases';

const BASELINE = resolve(import.meta.dirname, 'baseline.json');
const REGRESSION = 0.15;
const NOISE_MS = 0.05;
const WORST_BUDGET_MS = 2;

interface Row {
  avgMs: number;
  worstMs: number;
  ticks: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const fmt = (n: number) => n.toFixed(3).padStart(8);

export function main(args: string[]): number {
  const update = args.includes('--update');
  const runsArg = args.indexOf('--runs');
  const runs = runsArg >= 0 ? Number(args[runsArg + 1]) : 5;
  const now = () => performance.now();
  let baseline: Record<string, Row> = {};
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Row>;
  } catch {
    // first run
  }

  const results: Record<string, Row> = {};
  for (const c of CASES) c.run(now); // warm up the JIT
  for (const c of CASES) {
    const avgs: number[] = [];
    const worsts: number[] = [];
    let ticks = 0;
    for (let r = 0; r < runs; r++) {
      const t = c.run(now).ticks;
      ticks = t.length;
      avgs.push(t.reduce((a, b) => a + b, 0) / t.length);
      worsts.push(Math.max(...t));
    }
    results[c.id] = { avgMs: median(avgs), worstMs: median(worsts), ticks };
  }

  let failed = 0;
  console.log(`| case                 |  avg ms  | worst ms |  ticks | baseline avg | status |`);
  console.log(`| -------------------- | -------- | -------- | ------ | ------------ | ------ |`);
  for (const c of CASES) {
    const r = results[c.id]!;
    const b = baseline[c.id];
    let status = 'ok';
    if (b && r.avgMs > b.avgMs * (1 + REGRESSION) + NOISE_MS)
      status = `SLOWER +${Math.round((r.avgMs / b.avgMs - 1) * 100)}%`;
    if (r.worstMs > WORST_BUDGET_MS) status = `OVER ${WORST_BUDGET_MS}ms`;
    if (status !== 'ok' && !update) failed++;
    console.log(
      `| ${c.id.padEnd(20)} | ${fmt(r.avgMs)} | ${fmt(r.worstMs)} | ${String(r.ticks).padStart(6)} | ${b ? fmt(b.avgMs) + '    ' : '     (none)  '} | ${status} |`,
    );
  }
  for (const p of PENDING)
    console.log(
      `| ${p.id.padEnd(20)} |        – |        – |      – |            – | pending: ${p.reason} |`,
    );
  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`baseline written: ${BASELINE}`);
  }
  if (failed) console.error(`${failed} benchmark case(s) failed`);
  return failed ? 1 : 0;
}
