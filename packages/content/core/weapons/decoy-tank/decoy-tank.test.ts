import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, launchAt, makeWorld } from '../../../src/testing';

describe('weapon.decoy-tank', () => {
  it('soaks blasts and pops once its 60 hit points are gone', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    const i = w.addLure(200, 150, 1, 60);
    dropAt(w, 'weapon.baby-missile', 200);
    expect(w.lures[i]!.alive).toBe(true);
    expect(w.lures[i]!.hp).toBeLessThan(60);
    dropAt(w, 'weapon.missile', 200);
    expect(w.lures[i]!.alive).toBe(false);
  });

  it('stops shells like a tank: a laser goes off on it, sparing the tank behind', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    w.addLure(200, 150, 1, 60);
    launchAt(w, 'weapon.laser', 100, 145, 1, 0);
    expect(w.tanks[1]!.health).toBe(100);
    expect(w.lures[0]!.hp).toBeLessThan(60);
  });

  it('draws a Heat Seeker off the real tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 300] });
    w.addLure(220, 150, 1, 60);
    launchAt(w, 'weapon.heat-seeker', 60, 120, 2.4, -4.5);
    expect(w.tanks[1]!.health).toBe(100);
    expect(Math.abs(w.tanks[0]!.lastShotX - 220)).toBeLessThan(12);
  });

  it('fools bots: a Cyborg shoots the decoy in front of it, not the tank behind', () => {
    const w = makeWorld({
      seed: 3,
      map: { width: 800, height: 400 },
      players: 2,
      tankColumns: [150, 650],
      wind: 0,
      turnOrder: [0, 1],
      bots: ['ai.cyborg', null],
      tankSetup: [undefined, { health: 100 }],
    });
    const g = w.grid;
    w.addLure(400, g.surfaceY(400), 1, 60);
    for (let i = 0; i < 600 && w.tanks[0]!.lastShotX < 0; i++) w.step();
    expect(Math.abs(w.tanks[0]!.lastShotX - 400)).toBeLessThan(20);
    expect(w.tanks[1]!.health).toBe(100);
  });
});

describe('weapon.decoy-tank vs other homing warheads', () => {
  it('a V3 Rocket dives on the decoy instead of the tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 330] });
    w.addLure(250, 150, 1, 60);
    launchAt(w, 'weapon.v3-rocket', 40, 120, 2, -3);
    // only the edge of the warhead's blast reaches the tank 80 cells away
    expect(w.tanks[1]!.health).toBeGreaterThan(90);
    expect(w.lures[0]!.alive).toBe(false);
  });

  it('a Plasma Orb drifts to the decoy and zaps it', () => {
    const w = flatWorld(150, { tankColumns: [20, 360] });
    w.addLure(240, 150, 1, 200);
    dropAt(w, 'weapon.plasma-orb', 200);
    expect(w.lures[0]!.hp).toBeLessThan(200);
  });
});
