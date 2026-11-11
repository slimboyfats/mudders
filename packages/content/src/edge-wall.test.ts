import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, flatWorld, launchAt } from './testing';

describe('edge walls swallow shells', () => {
  it('takes a shell flying off the map edge without a blast', () => {
    const w = flatWorld(150);
    const before = countCells(w);
    launchAt(w, 'weapon.missile', w.grid.width - 30, 80, 3, -0.5);
    const hits = effectsOf(w, 'wallAbsorb');
    expect(hits.length).toBe(1);
    expect(hits[0]!.x).toBe(w.grid.width);
    expect(countCells(w)).toBe(before);
  });

  it('takes a shell flying into the sudden-death wall where it stands', () => {
    const w = flatWorld(150);
    w.edge = 60;
    const before = countCells(w);
    launchAt(w, 'weapon.missile', 90, 100, -3, 0);
    const hits = effectsOf(w, 'wallAbsorb');
    expect(hits.length).toBe(1);
    expect(hits[0]!.x).toBe(60);
    expect(countCells(w)).toBe(before);
  });

  it('lets a shell fired from inside the zone fly on', () => {
    const w = flatWorld(150);
    w.edge = 60;
    const before = countCells(w);
    launchAt(w, 'weapon.missile', 30, 120, 2, 0);
    expect(effectsOf(w, 'wallAbsorb').length).toBe(0);
    expect(countCells(w)).toBeLessThan(before);
  });
});
