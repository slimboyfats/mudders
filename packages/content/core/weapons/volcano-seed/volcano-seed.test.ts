import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld, flatten, makeWorld } from '../../../src/testing';

describe('weapon.volcano-seed', () => {
  it('grows a cinder cone, then erupts lava at the end of this turn and the next three', () => {
    const w = flatWorld();
    const surface = w.grid.surfaceY(300);
    dropAt(w, 'weapon.volcano-seed', 300, 3000);
    // a cone stands where the seed landed, with its crater at the top
    expect(countCells(w, 'material.cinder')).toBeGreaterThan(800);
    expect(surface - w.grid.surfaceY(300 - 8)).toBeGreaterThan(20);
    const fx = () => w.snapshot().effectEvents;
    expect(fx().filter((e) => e.type === 'volcanoGrow')).toHaveLength(1);
    // the first eruption already ran this turn; lava landed all around the cone
    expect(w.debris.count).toBe(0);
    const lava = countCells(w, 'material.lava');
    expect(lava).toBeGreaterThan(150);
    expect(w.zones).toHaveLength(1);
    expect(w.zones[0]!.turns).toBe(3);
  });

  it('keeps erupting for four turns in all, then goes quiet', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.volcano-seed', 300, 3000);
    let erupts = 0;
    for (let turn = 0; turn < 6; turn++) {
      erupts += w.snapshot().effectEvents.filter((e) => e.type === 'volcanoErupt').length;
      // the next player passes: fire a harmless shot off the map
      dropAt(w, 'weapon.baby-missile', 5, 3000);
    }
    expect(erupts).toBe(4);
    expect(w.zones).toHaveLength(0);
  });
});

describe('weapon.volcano-seed in a bot match', () => {
  it('a Cyborg that owns one plants it near the enemy', () => {
    const w = makeWorld({
      seed: 4,
      map: { width: 800, height: 300 },
      tankColumns: [200, 600],
      turnOrder: [0, 1],
      wind: 0,
      bots: ['ai.cyborg', 'ai.moron'],
      rules: { suddenDeath: false },
    });
    flatten(w, 200);
    w.tanks[0]!.inventory[w.weaponByIndex('weapon.volcano-seed')] = 1;
    const grow = [];
    for (let i = 0; i < 6000 && w.activePlayer === 0; i++) {
      w.step();
      for (const e of w.snapshot().effectEvents) if (e.type === 'volcanoGrow') grow.push(e);
    }
    expect(grow).toHaveLength(1);
    expect(Math.abs(grow[0]!.x - 600)).toBeLessThan(60);
  });
});
