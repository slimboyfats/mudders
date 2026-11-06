import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import {
  countCells,
  dropAt,
  flatten,
  launchAt,
  makeWorld,
  passTurns,
  slopeWorld,
} from '../../../src/testing';

/** A flat calm world with player 0 up at x 300; `tarFrom..tarTo` columns of the top are tar. */
function tarWorld(tarFrom: number, tarTo: number): World {
  const w = makeWorld({
    seed: 2,
    map: { width: 800, height: 300 },
    tankColumns: [300, 700],
    turnOrder: [0, 1],
    wind: 0,
    rules: { suddenDeath: false, turnTimer: 0 },
  });
  flatten(w, 200);
  const tar = w.mats.cellOf('material.tar');
  for (let y = 200; y < 206; y++) for (let x = tarFrom; x < tarTo; x++) w.grid.set(x, y, tar);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

/** Hold drive right for `ticks` ticks; returns how far the tank moved. */
function hold(w: World, ticks: number): number {
  const t = w.tanks[0]!;
  const x0 = t.x;
  w.applyInput(0, { type: 'drive', dir: 1 });
  for (let i = 0; i < ticks; i++) w.step();
  return t.x - x0;
}

describe('material.tar', () => {
  it('is sticky ground', () => {
    const w = tarWorld(0, 0);
    expect(w.mats.sticky[w.mats.cellOf('material.tar')]).toBe(3);
    expect(w.mats.sticky[w.mats.cellOf('material.dirt')]).toBe(0);
  });

  it('bogs tanks down: a third of the speed and a third of the range', () => {
    const dirt = tarWorld(0, 0);
    const tar = tarWorld(250, 800);
    const full = dirt.driveCells(dirt.tanks[0]!);
    // same time: a third as far
    expect(hold(tarWorld(250, 800), 60) * 3).toBeLessThanOrEqual(hold(tarWorld(0, 0), 60) + 3);
    // whole turn: the allowance runs out after a third of the cells
    expect(hold(dirt, 2000)).toBe(full);
    expect(hold(tar, 2000)).toBe(Math.ceil(full / 3));
    expect(tar.tanks[0]!.driveLeft).toBe(0);
  });

  it('bots plan with the same rule', () => {
    const w = tarWorld(250, 800);
    const t = w.tanks[0]!;
    expect(w.reach(t, 1).length).toBe(Math.ceil(w.driveCells(t) / 3));
    expect(w.reach(t, -1).length).toBe(Math.ceil(w.driveCells(t) / 3));
  });

  it('catches a roller: it goes off where it reaches the tar instead of rolling on', () => {
    const plain = slopeWorld(100, 4, { tankColumns: [20, 390] });
    dropAt(plain, 'weapon.roller', 120);
    const sticky = slopeWorld(100, 4, { tankColumns: [20, 390] });
    const g = sticky.grid;
    const tar = sticky.mats.cellOf('material.tar');
    for (let x = 140; x < 400; x++) g.set(x, g.surfaceY(x), tar);
    g.clearSettle();
    g.clearReact();
    dropAt(sticky, 'weapon.roller', 120);
    expect(plain.tanks[0]!.lastShotX).toBeGreaterThan(150);
    expect(sticky.tanks[0]!.lastShotX).toBeLessThan(plain.tanks[0]!.lastShotX - 10);
    expect(sticky.tanks[0]!.lastShotX).toBeLessThanOrEqual(142);
  });

  it('a ricochet ball does not bounce off tar', () => {
    const plain = tarWorld(0, 0);
    launchAt(plain, 'weapon.ricochet-ball', 150, 150, 2, 2);
    const sticky = tarWorld(100, 290);
    launchAt(sticky, 'weapon.ricochet-ball', 150, 150, 2, 2);
    // it goes off where it first lands (about 50 cells on), not bounces later
    const hit = sticky.tanks[0]!.lastShotX;
    expect(hit).toBeGreaterThan(170);
    expect(hit).toBeLessThan(210);
    expect(Math.abs(plain.tanks[0]!.lastShotX - hit)).toBeGreaterThan(10);
  });

  it('slows a digger: it bores through tar at half speed', () => {
    const dirt = tarWorld(0, 0);
    const tar = tarWorld(0, 0);
    const t = tar.mats.cellOf('material.tar');
    for (let y = 200; y < 300; y++) for (let x = 150; x < 250; x++) tar.grid.set(x, y, t);
    tar.grid.clearSettle();
    expect(dropAt(tar, 'weapon.digger', 200)).toBeGreaterThan(
      dropAt(dirt, 'weapon.digger', 200) + 10,
    );
  });

  it('catches fire and the whole pool burns, for turns, hurting tanks in it', () => {
    const w = tarWorld(200, 400);
    dropAt(w, 'weapon.napalm', 260);
    const burning = countCells(w, 'material.burning-tar');
    expect(burning).toBeGreaterThan(400);
    const hp = w.tanks[0]!.health;
    passTurns(w, 1);
    expect(countCells(w, 'material.burning-tar')).toBeGreaterThan(400);
    expect(w.tanks[0]!.health).toBeLessThan(hp);
    passTurns(w, 3);
    expect(countCells(w, 'material.burning-tar')).toBe(0);
    expect(countCells(w, 'material.scorch')).toBeGreaterThan(400);
  });
});
