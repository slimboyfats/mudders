import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.plasma-orb', () => {
  it('lets loose an orb that wears down a nearby tank and bursts, throwing it', () => {
    const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 340] });
    const t = w.tanks[1]!;
    // tough, so it lives to be thrown
    t.health = 1000;
    const x0 = t.x;
    let zaps = 0;
    let flung = false;
    const emit = w.emit.bind(w);
    w.emit = (type, x, y, r, params) => {
      if (type === 'plasmaZap') zaps++;
      if (type === 'shockFling' && params?.['player'] === 1) flung = true;
      emit(type, x, y, r, params);
    };
    dropAt(w, 'weapon.plasma-orb', 300);
    expect(zaps).toBeGreaterThanOrEqual(4);
    expect(t.health).toBeLessThan(1000 - 60);
    // the burst's shockwave threw it well away
    expect(flung).toBe(true);
    expect(Math.abs(t.x - x0)).toBeGreaterThan(30);
  });
});
