import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld } from '../../../src/testing';

describe('gear.battery', () => {
  it('restores 30 health while aiming, never past the round-start health', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: { 'gear.battery': 3 } }] });
    const t = w.tanks[0]!;
    const g = w.gear.findIndex((x) => x.id === 'gear.battery');
    t.health = 40;
    w.applyInput(0, { type: 'useGear', gear: 'gear.battery' });
    w.step();
    expect([t.health, t.gear[g], w.phase]).toEqual([70, 2, 'aim']);
    expect(effectsOf(w, 'battery')).toHaveLength(1);
    w.applyInput(0, { type: 'useGear', gear: 'gear.battery' });
    w.step();
    expect(t.health).toBe(100);
    // full health: refused, kept
    w.applyInput(0, { type: 'useGear', gear: 'gear.battery' });
    w.step();
    expect(t.gear[g]).toBe(1);
  });
});
