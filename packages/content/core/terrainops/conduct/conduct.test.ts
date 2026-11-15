import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

/** A flat world with a long pool 8 deep from 150 to 330; tank 1 stands in it at 300. */
function pond(wet: boolean) {
  const w = flatWorld(150, { tankColumns: [40, 300] });
  const water = w.mats.cellOf('material.water');
  for (let x = 150; x < 330; x++) for (let y = 150; y < 158; y++) w.grid.set(x, y, wet ? water : 0);
  w.grid.markDirty(150, 140, 330, 160);
  const t = w.tanks[1]!;
  t.y = 157;
  w.run(60);
  return w;
}

describe('terrainop.conduct', () => {
  it('shocks a tank standing in the water a lightning bolt hits, far from the blast', () => {
    const w = pond(true);
    const hp = w.tanks[1]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[1]!.health).toBeLessThan(hp);
    expect(w.snapshot().effectEvents.some((e) => e.type === 'charge')).toBe(true);
  });

  it('does nothing without water to carry it', () => {
    const w = pond(false);
    const hp = w.tanks[1]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[1]!.health).toBe(hp);
  });

  it('spares a tank on dry ground beside the lake', () => {
    const w = pond(true);
    const hp = w.tanks[0]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[0]!.health).toBe(hp);
  });
});
