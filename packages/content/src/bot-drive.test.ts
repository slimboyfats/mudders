import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { flatten, makeWorld } from './testing';

/** A flat calm world: player 0 (a bot) is up at `x0`, the other tank sits at `x1`. */
function flat(bots: [string, string], x0: number, x1: number, width = 800): World {
  const w = makeWorld({
    seed: 4,
    map: { width, height: 300 },
    tankColumns: [x0, x1],
    turnOrder: [0, 1],
    wind: 0,
    bots,
    rules: { suddenDeath: false, rounds: 2 },
  });
  flatten(w, 200);
  return w;
}

/** Step through player 0's aim phase (thinking, driving); returns once it has fired. */
function playTurn(w: World): void {
  for (let i = 0; i < 2000 && w.phase === 'aim' && w.activePlayer === 0; i++) w.step();
}

/** Run until the shell and everything it set off have settled. */
function settle(w: World): void {
  for (let i = 0; i < 4000 && w.phase === 'resolve'; i++) w.step();
}

describe('bots drive (§3.2, §3.7)', () => {
  it('reach() plans like real driving: climbs a low step, stops before a drop', () => {
    const w = flat(['ai.moron', 'ai.moron'], 300, 700);
    const g = w.grid;
    // a 2-cell step up at x 310.., then a 12-cell pit from x 330
    const dirt = g.material[250 * g.width + 10]!;
    for (let x = 310; x < 800; x++)
      for (let y = 198; y < 200; y++) g.material[y * g.width + x] = dirt;
    for (let x = 330; x < 360; x++) for (let y = 198; y < 212; y++) g.material[y * g.width + x] = 0;
    const t = w.tanks[0]!;
    const right = w.reach(t, 1);
    expect(right.length).toBeGreaterThan(5);
    expect(right.some((s) => s.y === 198)).toBe(true);
    // never past the lip: the tank's right edge stays on the ledge
    expect(Math.max(...right.map((s) => s.x))).toBeLessThan(330 + t.half);
    const left = w.reach(t, -1);
    expect(left).toHaveLength(Math.min(t.driveLeft, t.fuel));
    expect(left.every((s) => s.y === 200)).toBe(true);
    // and the fuel caps it
    t.fuel = 5;
    expect(w.reach(t, -1)).toHaveLength(5);
  });

  it('Cyborg drives out from under a rock roof to get its shot, and hits', () => {
    const w = flat(['ai.cyborg', 'ai.moron'], 300, 600);
    const g = w.grid;
    const rock = w.mats.cellOf('material.rock');
    for (let x = 230; x < 330; x++)
      for (let y = 172; y < 178; y++) g.material[y * g.width + x] = rock;
    const t = w.tanks[0]!;
    const fuel = t.fuel;
    playTurn(w);
    expect(t.x).toBeGreaterThan(305);
    expect(t.fuel).toBe(fuel - (t.x - 300));
    settle(w);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });

  it('Cyborg stays put when it already has a clean shot', () => {
    const w = flat(['ai.cyborg', 'ai.moron'], 300, 600);
    playTurn(w);
    expect(w.tanks[0]!.x).toBe(300);
  });

  it('Tosser backs away from a tank that is too close for a lob', () => {
    const w = flat(['ai.tosser', 'ai.moron'], 300, 360);
    const t = w.tanks[0]!;
    playTurn(w);
    expect(t.x).toBe(300 - w.driveCells(t));
  });

  it('Shooter closes in on a far target, and never with more fuel than it has', () => {
    const w = flat(['ai.shooter', 'ai.moron'], 100, 900, 1000);
    const t = w.tanks[0]!;
    t.fuel = 12;
    playTurn(w);
    expect(t.x).toBe(112);
    expect(t.fuel).toBe(0);
  });

  it('a frosted Cyborg aims within its power cap and still hits', () => {
    const w = flat(['ai.cyborg', 'ai.moron'], 300, 470);
    w.tanks[0]!.chill = 1;
    playTurn(w);
    expect(w.tanks[0]!.power).toBeLessThanOrEqual(1000);
    settle(w);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });

  it('bots top up their fuel in the shop', () => {
    const w = flat(['ai.cyborg', 'ai.poolshark'], 200, 600);
    for (const t of w.tanks) {
      t.fuel = 10;
      t.money = 50_000;
      t.health = 1;
    }
    for (let i = 0; i < 20_000 && w.phase !== 'shop'; i++) w.step();
    expect(w.phase).toBe('shop');
    // cyborg tops up to 120, poolshark to 100 (whatever it drove this round, in 40-unit packs)
    expect(w.tanks[0]!.fuel).toBeGreaterThanOrEqual(120);
    expect(w.tanks[1]!.fuel).toBeGreaterThanOrEqual(100);
  });

  it('every personality plays a whole match, driving and shopping, deterministically', () => {
    const bots = ['ai.moron', 'ai.shooter', 'ai.poolshark', 'ai.tosser', 'ai.cyborg'];
    const run = () => {
      const w = makeWorld({
        seed: 12,
        map: { width: 900, height: 320 },
        players: 5,
        bots,
        rules: { rounds: 2 },
      });
      const x0 = w.tanks.map((t) => t.x);
      let drove = 0;
      for (let i = 0; i < 80_000 && w.phase !== 'over'; i++) {
        w.step();
        for (const t of w.tanks) if (t.driving !== 0) drove |= 1 << t.player;
      }
      return { w, x0, drove };
    };
    const a = run();
    const b = run();
    expect(a.w.phase).toBe('over');
    expect(a.w.hash()).toBe(b.w.hash());
    // the Moron wanders, and the solvers move when they need to
    let n = 0;
    for (let p = 0; p < bots.length; p++) if (a.drove & (1 << p)) n++;
    expect(a.drove & 1).toBe(1);
    expect(n).toBeGreaterThanOrEqual(2);
  });
});
