import { describe, expect, it } from 'vitest';
import { blastLoss, dropAt, flatten, makeWorld } from '../../../src/testing';

describe('tank.bulwark', () => {
  it('its shield soaks a hit before its health, and refills next round', () => {
    const w = makeWorld({
      seed: 3,
      map: { width: 800, height: 400 },
      tankColumns: [150, 500],
      tanks: [null, 'tank.bulwark'],
      turnOrder: [0, 1],
      wind: 0,
      rules: { suddenDeath: false, rounds: 2 },
    });
    flatten(w, 300);
    const t = w.tanks[1]!;
    expect([t.health, t.shield]).toEqual([100, 50]);
    dropAt(w, 'weapon.missile', t.x + 16);
    expect(t.shield).toBeLessThan(50);
    expect(t.health).toBe(100);
    const events = w.snapshot().effectEvents.filter((e) => e.type === 'shieldHit');
    expect(events.length).toBeGreaterThan(0);
    // a fresh round brings the shield back
    t.health = 0;
    t.alive = false;
    for (let i = 0; i < 9000 && !(w.round === 1 && w.phase === 'aim'); i++) w.step();
    expect(w.round).toBe(1);
    expect(w.tanks[1]!.shield).toBe(50);
  });

  it('its shells hit 15% softer', () => {
    const base = blastLoss('tank.classic', 'tank.bruiser', 14);
    const soft = blastLoss('tank.bulwark', 'tank.bruiser', 14);
    expect(soft).toBeLessThan(base);
    expect(soft).toBeGreaterThanOrEqual(Math.trunc(base * 0.8));
  });
});
