import { DROP_AIR, DROP_CHUTE, DROP_FREE, DROP_REST, type World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { dropAt, flatten, makeWorld } from './testing';

const MAP = { width: 600, height: 300 };

function live(w: World): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.drops.state.length; i++) if (w.drops.state[i] !== DROP_FREE) out.push(i);
  return out;
}

function cx(w: World, i: number): number {
  return Math.floor(w.drops.x[i]! / 65536);
}

/** Bottom row of crate `i`. */
function bottom(w: World, i: number): number {
  return Math.floor(w.drops.y[i]! / 65536) + 4;
}

describe('supply drops', () => {
  it('stay off unless the rules turn them on, and keep the hash', () => {
    const a = makeWorld({ seed: 3, map: MAP });
    const b = makeWorld({ seed: 3, map: MAP, rules: { drops: 'off' } });
    a.run(300);
    b.run(300);
    expect(a.hash()).toBe(b.hash());
    expect(live(a)).toEqual([]);
  });

  it('come down under a canopy, land on the ground and lie still', () => {
    const w = makeWorld({
      seed: 3,
      map: MAP,
      wind: 0,
      tankColumns: [60, 540],
      rules: { drops: 'normal', turnTimer: 0 },
      dropAt: [{ t: 1, x: 300 }],
    });
    flatten(w, 200);
    w.run(3);
    const [i] = live(w);
    expect(i).toBeDefined();
    expect(w.drops.state[i!]).toBe(DROP_CHUTE);
    const y0 = w.drops.y[i!]!;
    w.run(30);
    expect(w.drops.y[i!]!).toBeGreaterThan(y0);
    // well under free-fall speed: 30 ticks of free fall would be ~50 cells
    expect(w.drops.y[i!]! - y0).toBeLessThan(30 * 65536);
    for (let k = 0; k < 600 && w.drops.state[i!] !== DROP_REST; k++) w.step();
    expect(w.drops.state[i!]).toBe(DROP_REST);
    expect(bottom(w, i!)).toBe(200);
    expect(Math.abs(cx(w, i!) - 300)).toBeLessThan(10);
  });

  it('tip over a ledge and tumble down a slope', () => {
    const w = makeWorld({
      seed: 3,
      map: MAP,
      wind: 0,
      tankColumns: [60, 540],
      rules: { drops: 'normal', turnTimer: 0 },
      dropAt: [{ t: 1, x: 302 }],
    });
    flatten(w, 250);
    // a staircase going down to the right from column 300: one cell down every cell
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    for (let x = 0; x < g.width; x++) {
      const top = x < 300 ? 150 : Math.min(250, 150 + (x - 300));
      for (let y = top; y < 250; y++) g.material[y * g.width + x] = dirt;
    }
    for (const t of w.tanks) t.y = g.surfaceY(t.x);
    g.clearSettle();
    w.run(3);
    const [i] = live(w);
    let rolled = 0;
    let last = DROP_CHUTE as number;
    for (let k = 0; k < 2000; k++) {
      w.step();
      const s = w.drops.state[i!]!;
      if (s === 4 && last !== 4) rolled++;
      last = s;
      if (s === DROP_REST && cx(w, i!) > 380) break;
    }
    expect(rolled).toBeGreaterThan(2);
    expect(cx(w, i!)).toBeGreaterThan(360);
  });

  it('go to the tank that touches them', () => {
    const w = makeWorld({
      seed: 3,
      map: MAP,
      wind: 0,
      tankColumns: [300, 540],
      rules: { drops: 'normal', turnTimer: 0 },
      // loot 12 in mode.classic: 40 health
      dropAt: [{ t: 1, x: 300, loot: 12 }],
    });
    flatten(w, 200);
    const t = w.tanks[0]!;
    t.health = 30;
    w.run(3);
    for (let k = 0; k < 800 && live(w).length > 0; k++) w.step();
    expect(live(w)).toEqual([]);
    expect(t.health).toBe(70);
    expect(w.lastPickup?.player).toBe(0);
    expect(w.lastPickup?.kind).toBe('health');
  });

  it('are thrown by a blast and smashed by a close one', () => {
    const w = makeWorld({
      seed: 3,
      map: MAP,
      wind: 0,
      tankColumns: [60, 540],
      rules: { drops: 'normal', turnTimer: 0 },
      dropAt: [
        { t: 1, x: 200 },
        { t: 1, x: 400 },
      ],
    });
    flatten(w, 200);
    for (let k = 0; k < 600; k++) w.step();
    const ids = live(w);
    expect(ids.length).toBe(2);
    const [a, b] = ids as [number, number];
    expect(w.drops.state[a]).toBe(DROP_REST);
    // a missile beside crate b throws it; one on crate a breaks it
    const bx = cx(w, b);
    dropAt(w, 'weapon.missile', bx + 22);
    expect(Math.abs(cx(w, b) - bx)).toBeGreaterThan(2);
    w.drops.hp[a] = 1;
    dropAt(w, 'weapon.missile', cx(w, a));
    expect(w.drops.state[a]).toBe(DROP_FREE);
    // and nothing is left flying when the shot is over
    expect([DROP_REST, DROP_FREE]).toContain(w.drops.state[b]);
  });

  it('come down every few turns somewhere away from the tank that is up', () => {
    const w = makeWorld({
      seed: 5,
      map: MAP,
      rules: { drops: 'often', turnTimer: 0 },
      tankSetup: [{ health: 1000 }, { health: 1000 }],
    });
    const seen = new Set<number>();
    for (let turn = 0; turn < 10; turn++) {
      const t = w.tanks[w.activePlayer]!;
      for (const i of live(w)) {
        if (seen.has(w.drops.id[i]!)) continue;
        seen.add(w.drops.id[i]!);
        expect(w.drops.state[i]).toBe(DROP_CHUTE);
        expect(Math.abs(cx(w, i) - t.x)).toBeGreaterThanOrEqual(120);
      }
      w.applyInput(w.activePlayer, { type: 'aim', angle: 90, power: 10 });
      w.applyInput(w.activePlayer, { type: 'fire' });
      for (let k = 0; k < 1500 && (w.phase === 'resolve' || k < 2); k++) w.step();
    }
    expect(seen.size).toBeGreaterThan(2);
    void DROP_AIR;
  });

  it('are worth a detour to a bot', () => {
    const w = makeWorld({
      seed: 3,
      map: MAP,
      wind: 0,
      tankColumns: [200, 500],
      bots: ['ai.cyborg', null],
      turnOrder: [1, 0],
      rules: { drops: 'normal', turnTimer: 0 },
      // fuel
      dropAt: [{ t: 1, x: 228, loot: 13 }],
    });
    flatten(w, 200);
    for (let k = 0; k < 400; k++) w.step();
    expect(live(w).length).toBe(1);
    const bot = w.tanks[0]!;
    const fuel = bot.fuel;
    w.applyInput(1, { type: 'aim', angle: 90, power: 10 });
    w.applyInput(1, { type: 'fire' });
    for (let k = 0; k < 1500 && w.activePlayer !== 0; k++) w.step();
    for (let k = 0; k < 400 && w.lastPickup === null; k++) w.step();
    expect(w.lastPickup?.player).toBe(0);
    expect(w.lastPickup?.kind).toBe('fuel');
    expect(bot.fuel).toBeGreaterThan(fuel - 40);
  });
});
