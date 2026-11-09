import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.teleport-shell', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.teleport-shell')).toBe(true);
  });

  it('sends the shooter to where it lands, unhurt, and leaves the ground alone', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    dropAt(w, 'weapon.teleport-shell', 220);
    expect(w.tanks[0]!.x).toBe(220);
    expect(w.tanks[0]!.y).toBe(150);
    expect(w.tanks[0]!.health).toBe(100);
    expect(w.tanks[1]!.x).toBe(360);
    expect(w.tanks[1]!.health).toBe(100);
    const ev = effectsOf(w, 'warpOut');
    expect(ev).toHaveLength(1);
  });
});
