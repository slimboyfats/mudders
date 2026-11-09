import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

const CALTROPS = 'weapon.caltrop-field';

/** Drive the active tank in `dir` until it stops; returns cells moved. */
function driveOut(w: ReturnType<typeof flatWorld>, dir: -1 | 1): number {
  const t = w.tanks[w.activePlayer]!;
  const x0 = t.x;
  w.applyInput(w.activePlayer, { type: 'drive', dir });
  w.step();
  for (let n = 0; n < 600 && t.driving !== 0; n++) w.step();
  return Math.abs(t.x - x0);
}

describe('weapon.caltrop-field', () => {
  it('lays a spiked strip that lasts eight turns and hurts nobody standing still', () => {
    const w = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(w, CALTROPS, 300);
    expect(w.zones).toHaveLength(1);
    expect(w.snapshot().entities.some((e) => e.kind === 'zone' && e.look === 'caltrops')).toBe(
      true,
    );
    passTurns(w, 6);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.zones).toHaveLength(1);
    passTurns(w, 2);
    expect(w.zones).toHaveLength(0);
  });

  it('driving across the spikes costs health, drive and fuel', () => {
    const clean = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(clean, 'weapon.tracer', 100);
    clean.tanks[1]!.fuel = 200;
    const fuelClean = clean.tanks[1]!.fuel;
    const farClean = driveOut(clean, -1);
    const usedClean = fuelClean - clean.tanks[1]!.fuel;

    const w = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(w, CALTROPS, 300);
    const t = w.tanks[1]!;
    t.fuel = 200;
    w.snapshot();
    const far = driveOut(w, -1);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(farClean / 2);
    expect(t.health).toBeLessThan(100);
    expect(t.health).toBeGreaterThan(65);
    expect(200 - t.fuel).toBeGreaterThanOrEqual(usedClean * 0.9);
    expect(effectsOf(w, 'spiked').length).toBe(far);
  });

  it('bots never plan a drive onto the spikes', () => {
    const w = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(w, CALTROPS, 250);
    const t = w.tanks[1]!;
    t.fuel = 200;
    t.driveLeft = 200;
    const spots = w.reach(t, -1);
    for (const s of spots) expect(s.x - t.half).toBeGreaterThanOrEqual(250 + 34);
    // off the spikes the other way is fine
    expect(w.reach(t, 1).length).toBeGreaterThan(0);
  });
});
