import { describe, expect, it } from 'vitest';
import { TEMP_MAX, TEMP_MIN, tempChill, tempHeat } from '@mudders/shared';
import type { World } from '@mudders/sim';
import { flatten, makeWorld } from './testing';

function flat(temperature?: number, extra: Record<string, unknown> = {}): World {
  const w = makeWorld({
    seed: 2,
    map: { width: 800, height: 300 },
    tankColumns: [300, 700],
    turnOrder: [0, 1],
    wind: 0,
    rules: { suddenDeath: false, turnTimer: 0 },
    ...(temperature !== undefined ? { temperature } : {}),
    ...extra,
  });
  flatten(w, 200);
  return w;
}

/** Hold drive right until the tank stops; returns [cells moved, fuel used]. */
function drive(w: World): [number, number] {
  const t = w.tanks[0]!;
  const x0 = t.x;
  const f0 = t.fuel;
  w.applyInput(0, { type: 'drive', dir: 1 });
  for (let i = 0; i < 600; i++) w.step();
  return [t.x - x0, f0 - t.fuel];
}

describe('temperature (§3.4)', () => {
  it('scales from the mild band to the extremes', () => {
    expect(tempHeat(30)).toBe(0);
    expect(tempHeat(TEMP_MAX)).toBe(1000);
    expect(tempChill(0)).toBe(0);
    expect(tempChill(TEMP_MIN)).toBe(1000);
  });

  it('plays exactly as before in mild air', () => {
    const [cells, fuel] = drive(flat(15));
    expect(fuel).toBe(cells);
  });

  it('burns fuel faster in scorching air', () => {
    const [cells, fuel] = drive(flat(TEMP_MAX));
    expect(fuel).toBeGreaterThanOrEqual(Math.floor(cells * 1.5) - 1);
  });

  it('shortens the drive and burns more fuel in freezing air', () => {
    const mild = flat(15);
    const cold = flat(TEMP_MIN);
    expect(cold.driveCells(cold.tanks[0]!)).toBeLessThan(mild.driveCells(mild.tanks[0]!));
    const [cells, fuel] = drive(cold);
    expect(fuel).toBeGreaterThan(cells);
  });

  it('starts at the map base plus the weather shift, and drifts within bounds', () => {
    const snowy = flat(undefined, { map: { width: 800, height: 300, generator: 'gen.glacier' } });
    expect(snowy.temperature).toBeLessThanOrEqual(-12 + 4);
    const w = flat(undefined, { weather: 'weather.snow' });
    expect(w.temperature).toBeLessThanOrEqual(15 - 18 + 4);
    const seen = new Set<number>();
    for (let turn = 0; turn < 40; turn++) {
      const turn0 = w.turn;
      w.applyInput(w.activePlayer, { type: 'fire' });
      for (let i = 0; i < 3000 && w.turn === turn0 && w.phase !== 'shop'; i++) w.step();
      seen.add(w.temperature);
      expect(Math.abs(w.temperature - w.tempBase)).toBeLessThanOrEqual(13);
      if (w.phase === 'shop' || w.phase === 'over') break;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps a forced temperature', () => {
    const w = flat(40);
    w.applyInput(0, { type: 'fire' });
    for (let i = 0; i < 3000 && w.turn === 0; i++) w.step();
    expect(w.turn).toBe(1);
    expect(w.temperature).toBe(40);
  });
});
