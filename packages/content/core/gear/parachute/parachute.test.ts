import { describe, expect, it } from 'vitest';
import { dropTank, effectsOf, flatWorld } from '../../../src/testing';

describe('gear.parachute', () => {
  it('opens by itself on a long fall: no fall damage, one used up, a slower drift', () => {
    const plain = flatWorld(100);
    const fast = dropTank(plain, 0, 60);
    expect(plain.tanks[0]!.health).toBeLessThan(50);

    const w = flatWorld(100, { tankSetup: [{ inventory: { 'gear.parachute': 2 } }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.parachute');
    const slow = dropTank(w, 0, 60);
    expect(effectsOf(w, 'chute')).toHaveLength(1);
    expect([t.health, t.gear[g], t.chute, t.falling]).toEqual([100, 1, false, false]);
    expect(slow).toBeGreaterThan(fast * 2);
  });

  it('stays packed for a short drop that would not hurt', () => {
    const w = flatWorld(100, { tankSetup: [{ inventory: { 'gear.parachute': 1 } }] });
    dropTank(w, 0, 4);
    expect(w.tanks[0]!.gear[w.gear.findIndex((x) => x.id === 'gear.parachute')]).toBe(1);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('shows on the falling tank in the snapshot', () => {
    const w = flatWorld(100, { tankSetup: [{ inventory: { 'gear.parachute': 1 } }] });
    const g = w.grid;
    const t = w.tanks[0]!;
    for (let y = t.y; y < t.y + 60; y++)
      for (let x = t.x - 12; x < t.x + 12; x++) g.material[y * g.width + x] = 0;
    let seen = false;
    for (let i = 0; i < 200; i++) {
      w.step();
      const e = w.snapshot().entities[0];
      if (e?.kind === 'tank' && e.chute) seen = true;
    }
    expect(seen).toBe(true);
  });
});
