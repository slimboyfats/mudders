import { describe, expect, it } from 'vitest';
import { DEBRIS_CAP, DebrisPool } from './debris';
import { FP } from './fixed';
import { Grid } from './grid';

describe('DebrisPool', () => {
  it('flies, lands as terrain and is removed', () => {
    const g = new Grid(40, 30);
    for (let x = 0; x < 40; x++) g.set(x, 29, 9);
    const d = new DebrisPool();
    d.spawn(5 * FP, 5 * FP, FP, 0, 3, 0, 0);
    for (let i = 0; i < 100 && d.count; i++) d.step(g, FP / 4);
    expect(d.count).toBe(0);
    let found = -1;
    for (let x = 0; x < 40; x++) if (g.get(x, 28) === 3) found = x;
    expect(found).toBeGreaterThan(5);
  });

  it('loses particles that leave the map sideways', () => {
    const g = new Grid(10, 10);
    const d = new DebrisPool();
    d.spawn(8 * FP, 1 * FP, 4 * FP, 0, 1, 0, 0);
    d.spawn(1 * FP, 1 * FP, 0, 0, 1, 0, 0);
    d.step(g, 0);
    expect(d.count).toBe(1);
  });

  it('rolls off a peak and refuses spawns when full', () => {
    const g = new Grid(21, 12);
    for (let y = 2; y < 12; y++) g.set(10, y, 1);
    for (let x = 0; x < 21; x++) g.set(x, 11, 1);
    const d = new DebrisPool();
    d.spawn(10 * FP, 0, 0, FP, 2, 0, 0);
    for (let i = 0; i < 20 && d.count; i++) d.step(g, FP / 4);
    expect(g.get(10, 1)).toBe(0);
    let n = 0;
    for (let x = 0; x < 21; x++) for (let y = 0; y < 12; y++) if (g.get(x, y) === 2) n++;
    expect(n).toBe(1);

    d.count = DEBRIS_CAP;
    expect(d.spawn(0, 0, 0, 0, 1, 0, 0)).toBe(false);
  });
});
