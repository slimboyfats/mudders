import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.meteor-shower', () => {
  it('calls down a dozen meteors that pound the ground around the mark', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.meteor-shower', 200);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'meteorCall')).toHaveLength(1);
    const hits = ev.filter((e) => e.type === 'fireball');
    expect(hits).toHaveLength(12);
    const xs = hits.map((h) => h.x);
    expect(Math.min(...xs)).toBeLessThan(170);
    expect(Math.max(...xs)).toBeGreaterThan(230);
    expect(Math.min(...xs)).toBeGreaterThan(100);
    expect(Math.max(...xs)).toBeLessThan(300);
  });

  it('spreads the strikes out over time instead of landing all at once', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.meteor-shower', 200);
    const ticks = w
      .snapshot()
      .effectEvents.filter((e) => e.type === 'fireball')
      .map((e) => e.tick);
    expect(Math.max(...ticks) - Math.min(...ticks)).toBeGreaterThan(40);
  });

  it('leaves glowing slag craters that cool to meteorite by the next turn', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.meteor-shower', 200);
    expect(countCells(w, 'material.slag')).toBeGreaterThan(100);
  });

  it('hurts a tank standing near the mark', () => {
    const w = flatWorld(150, { tankColumns: [20, 205] });
    dropAt(w, 'weapon.meteor-shower', 200);
    expect(w.tanks[1]!.health).toBeLessThan(80);
  });
});
