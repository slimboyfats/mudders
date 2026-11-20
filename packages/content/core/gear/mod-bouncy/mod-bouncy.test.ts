import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld } from '../../../src/testing';

function shot(mod: boolean): { x: number; bounces: number } {
  const w = flatWorld(150, {
    tankSetup: [{ inventory: { 'gear.mod-bouncy': 1, 'weapon.missile': 5 } }],
  });
  if (mod) w.applyInput(0, { type: 'useGear', gear: 'gear.mod-bouncy' });
  w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.missile' });
  w.applyInput(0, { type: 'aim', angle: 70, power: 330 });
  w.applyInput(0, { type: 'fire' });
  w.step();
  let x = -1;
  for (let i = 0; i < 1500 && w.projectiles.length > 0; i++) {
    x = Math.floor(w.projectiles[0]!.x / 256);
    w.step();
  }
  return { x, bounces: effectsOf(w, 'modBounce').length };
}

describe('gear.mod-bouncy', () => {
  it('bounces a plain shell off the ground three times before it goes off further on', () => {
    const plain = shot(false);
    const bouncy = shot(true);
    expect(plain.bounces).toBe(0);
    expect(bouncy.bounces).toBe(3);
    expect(bouncy.x).toBeGreaterThan(plain.x + 10);
  });
});
