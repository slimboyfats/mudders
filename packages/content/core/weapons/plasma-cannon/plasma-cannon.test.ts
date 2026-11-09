import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.plasma-cannon', () => {
  const landing = (weapon: string, wind = 0) => {
    const w = flatWorld(150, { tankColumns: [20, 390], wind });
    launchAt(w, weapon, 40, 140, 2, -2);
    const ev = w.snapshot().effectEvents;
    return { w, ev, x: ev.find((e) => e.type === 'flash')!.x };
  };

  it('flies flatter than a shell and splashes a plasma pool where it hits', () => {
    const { w, ev, x } = landing('weapon.plasma-cannon');
    expect(x).toBeGreaterThan(landing('weapon.missile').x + 40);
    expect(ev.some((e) => e.type === 'plasmaSplash')).toBe(true);
    expect(ev.some((e) => e.type === 'ripple')).toBe(true);
    // the pool has burnt out by the end of the shot and left its glass behind
    expect(countCells(w, 'material.plasma')).toBe(0);
    expect(countCells(w, 'material.glass')).toBeGreaterThan(20);
  });

  it('ignores the wind', () => {
    expect(landing('weapon.plasma-cannon', 0.05).x).toBe(landing('weapon.plasma-cannon').x);
  });
});
