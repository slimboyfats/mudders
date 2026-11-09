import { describe, expect, it } from 'vitest';
import { FP } from '@mudders/sim';
import { flatWorld } from '../../../src/testing';

function orbWorld(enemyCol: number) {
  const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, enemyCol] });
  w.projectiles.push({
    id: 1,
    weapon: w.weaponByIndex('weapon.plasma-orb-core'),
    owner: 0,
    x: 300 * FP,
    y: 149 * FP,
    vx: 0,
    vy: 0,
    age: 0,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  return w;
}

describe('flight.plasma-orb', () => {
  it('climbs out of the impact and hangs in the air, creeping toward the enemy', () => {
    const w = orbWorld(420);
    w.run(40);
    const p = w.projectiles[0]!;
    expect(Math.floor(p.y / FP)).toBeLessThan(149 - 25);
    expect(Math.floor(p.x / FP)).toBeGreaterThan(300);
  });

  it('zaps an enemy in reach with arcs, then bursts', () => {
    const w = orbWorld(340);
    const hp = w.tanks[1]!.health;
    let zaps = 0;
    for (let i = 0; i < 140; i++) {
      w.step();
      for (const e of w.snapshot().effectEvents) if (e.type === 'plasmaZap') zaps++;
    }
    expect(zaps).toBeGreaterThanOrEqual(4);
    expect(w.tanks[1]!.health).toBeLessThan(hp);
    // the owner is never zapped
    expect(w.tanks[0]!.health).toBe(hp);
    w.run(60);
    expect(w.projectiles).toHaveLength(0);
  });

  it('leaves a tank out of reach alone until it bursts', () => {
    const w = orbWorld(590);
    const hp = w.tanks[1]!.health;
    w.run(100);
    expect(w.tanks[1]!.health).toBe(hp);
  });
});
