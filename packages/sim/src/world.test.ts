import { describe, expect, it } from 'vitest';
import { fixtureContent, fixtureSource, fp } from './__fixtures__/content';
import { resolveContent } from './content/resolve';
import { FP } from './fixed';
import { makeReplay, playReplay, runInputs } from './replay';
import { ScenarioDriver } from './scenario';
import { TANK_H, World, type WorldOptions } from './world';

const content = fixtureContent();
const make = (o: Partial<WorldOptions> = {}) =>
  new World(content, { seed: 5, mode: 'mode.test', players: 2, ...o });

function untilQuiet(w: World, max = 2000): void {
  for (let i = 0; i < max && w.phase === 'resolve'; i++) w.step();
}

function shoot(w: World, angle: number, power: number, weapon = 'weapon.shell'): void {
  const p = w.activePlayer;
  w.applyInput(p, { type: 'selectWeapon', weapon });
  w.applyInput(p, { type: 'aim', angle, power });
  w.applyInput(p, { type: 'fire' });
  w.step();
}

describe('World setup', () => {
  it('generates the map, places tanks on the surface and starts player 0', () => {
    const w = make();
    expect(w.grid.width).toBe(200);
    expect(w.tanks.map((t) => [t.x, t.y])).toEqual([
      [67, 100],
      [133, 100],
    ]);
    expect(w.activePlayer).toBe(0);
    expect(w.phase).toBe('aim');
    expect(w.quiet).toBe(true);
    expect(w.tanks[0]!.inventory).toHaveLength(4);
    const s = w.snapshot();
    expect(s.dirtyRects).toEqual([{ x: 0, y: 0, w: 200, h: 120 }]);
    expect(s.entities.filter((e) => e.kind === 'tank')).toHaveLength(2);
    expect(s.debris.count).toBe(0);
  });

  it('honours map, tank-column, wind and turn-order overrides', () => {
    const w = make({
      map: { width: 300, height: 100 },
      tankColumns: [20, 250],
      wind: 0.01,
      turnOrder: [1, 0],
    });
    expect(w.grid.width).toBe(300);
    expect(w.tanks.map((t) => t.x)).toEqual([20, 250]);
    expect(w.wind).toBe(Math.round(0.01 * FP));
    expect(w.activePlayer).toBe(1);
  });
});

describe('inputs and turns', () => {
  it('ignores inputs from the wrong player or with no ammo', () => {
    const w = make();
    w.applyInput(1, { type: 'fire' });
    w.step();
    expect(w.phase).toBe('aim');
    w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.unknown' });
    w.applyInput(0, { type: 'aim', angle: 400, power: -5 });
    w.step();
    expect(w.tanks[0]!.angle).toBe(180);
    expect(w.tanks[0]!.power).toBe(0);
    w.tanks[0]!.inventory[w.tanks[0]!.weapon] = 0;
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(w.phase).toBe('aim');
  });

  it('fires, resolves, carves, damages and passes the turn', () => {
    const w = make();
    const solid = () => w.grid.material.reduce((a, m) => a + (m ? 1 : 0), 0);
    const before = solid();
    shoot(w, 60, 300);
    expect(w.phase).toBe('resolve');
    expect(w.projectiles).toHaveLength(1);
    const evts = w.snapshot().effectEvents.map((e) => e.type);
    expect(evts).toContain('muzzle');
    untilQuiet(w);
    expect(solid()).toBeLessThan(before);
    expect(w.phase).toBe('aim');
    expect(w.activePlayer).toBe(1);
    expect(w.turn).toBe(1);
  });

  it('lands a direct hit and attributes damage', () => {
    const w = make({ tankColumns: [60, 100] });
    // power search keeps the test independent of tuning
    let hit = false;
    for (let power = 200; power <= 1000 && !hit; power += 10) {
      const t = make({ tankColumns: [60, 100] });
      shoot(t, 45, power);
      untilQuiet(t);
      if (t.tanks[1]!.health < 100) {
        hit = true;
        expect(t.tanks[0]!.damageDealt).toBe(100 - t.tanks[1]!.health);
        expect(t.tanks[1]!.lastHitBy).toBe(0);
      }
    }
    expect(hit).toBe(true);
    expect(w.tanks[1]!.health).toBe(100);
  });

  it('chains death explosions and credits the original shooter', () => {
    const w = make({ players: 3, tankColumns: [30, 100, 112], turnOrder: [0, 1, 2] });
    w.tanks[1]!.health = 1;
    w.tanks[2]!.health = 1;
    w.projectiles.push({
      id: 99,
      weapon: w.weapons.findIndex((x) => x.id === 'weapon.shell'),
      owner: 0,
      x: 100 * FP,
      y: 90 * FP,
      vx: 0,
      vy: FP,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    untilQuiet(w);
    expect(w.tanks[1]!.alive).toBe(false);
    expect(w.tanks[2]!.alive).toBe(false);
    expect(w.tanks[0]!.kills).toBe(2);
    expect(w.phase).toBe('over');
  });

  it('applies fall damage when the ground goes', () => {
    const w = make();
    const t = w.tanks[0]!;
    for (let y = 100; y < 110; y++) for (let x = t.x - 10; x < t.x + 10; x++) w.grid.set(x, y, 0);
    w.grid.markDirty(t.x - 10, 100, t.x + 10, 110);
    w.run(40);
    expect(t.y).toBe(110);
    expect(t.health).toBe(100 - (10 - 2) * 2);
    expect(w.snapshot().effectEvents.some((e) => e.type === 'land')).toBe(true);
  });

  it('pushes tanks with blast push', () => {
    const w = make({ tankColumns: [60, 140] });
    w.projectiles.push({
      id: 1,
      weapon: 1,
      owner: 0,
      x: 120 * FP,
      y: 95 * FP,
      vx: 0,
      vy: FP,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    untilQuiet(w);
    expect(w.tanks[1]!.x).toBeGreaterThan(140);
  });

  it('runs onTimer and onApex triggers and multi-tick ops', () => {
    const w = make();
    shoot(w, 80, 600, 'weapon.timer');
    w.step();
    w.step();
    expect(w.projectiles).toHaveLength(0);
    expect(w.ops).toHaveLength(1);
    const h = w.hash();
    w.step();
    expect(w.hash()).not.toBe(h);
    untilQuiet(w);
    expect(w.ops).toHaveLength(0);

    const a = make();
    shoot(a, 80, 600, 'weapon.apex');
    let apexY = Infinity;
    for (let i = 0; i < 400 && a.projectiles.length; i++) {
      apexY = Math.min(apexY, a.projectiles[0]!.y / FP);
      a.step();
    }
    expect(apexY).toBeLessThan(100 - TANK_H - 20);
    expect(a.grid.get(a.tanks[0]!.x, Math.floor(apexY))).toBe(0);
  });

  it('ends the round on the turn cap', () => {
    const w = make();
    for (const t of w.tanks) t.health = 1_000_000;
    for (let i = 0; i < 8 && w.phase !== 'over'; i++) {
      shoot(w, 90, 300);
      untilQuiet(w);
    }
    expect(w.phase).toBe('over');
    expect(w.turn).toBe(6);
  });
});

describe('walls', () => {
  const sideShot = (walls: string) => {
    const c = resolveContent(fixtureSource({ 'modes/test': { walls } }));
    const w = new World(c, { seed: 1, mode: 'mode.test', players: 2 });
    w.projectiles.push({
      id: 1,
      weapon: 2,
      owner: 0,
      x: 195 * FP,
      y: 20 * FP,
      vx: fp(8),
      vy: 0,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.step();
    return w;
  };
  it('absorbs, bounces, wraps or explodes', () => {
    expect(sideShot('absorb').projectiles).toHaveLength(0);
    const b = sideShot('bounce').projectiles[0]!;
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBeLessThan(200 * FP);
    expect(sideShot('wrap').projectiles[0]!.x).toBeLessThan(10 * FP);
    const c = sideShot('concrete');
    expect(c.projectiles).toHaveLength(0);
    expect(c.snapshot().effectEvents.some((e) => e.type === 'flash')).toBe(true);
  });
});

describe('determinism', () => {
  it('same seed and inputs give the same hash; replays reproduce it', () => {
    const inputs = [
      { t: 0, player: 0, action: { type: 'aim' as const, angle: 70, power: 450 } },
      { t: 1, player: 0, action: { type: 'fire' as const } },
      { t: 300, player: 1, action: { type: 'aim' as const, angle: 120, power: 500 } },
      { t: 301, player: 1, action: { type: 'fire' as const } },
    ];
    const a = make();
    const b = make();
    runInputs(a, inputs, 600);
    runInputs(b, inputs, 600);
    expect(a.hash()).toBe(b.hash());
    const replay = makeReplay(content, { seed: 5, mode: 'mode.test', players: 2 }, inputs);
    expect(playReplay(content, replay, 600).hash()).toBe(a.hash());
    expect(() => playReplay(content, { ...replay, contentHash: 'nope' }, 1)).toThrow(
      /content hash/,
    );
    expect(make({ seed: 6 }).hash()).not.toBe(make().hash());
  });

  it('launch turns a cell into debris that lands again', () => {
    const w = make();
    const i = 100 * 200 + 20;
    expect(w.launch(i, fp(1), fp(-2))).toBe(true);
    expect(w.launch(i, 0, 0)).toBe(false);
    expect(w.quiet).toBe(false);
    w.run(60);
    expect(w.debris.count).toBe(0);
  });
});

describe('ScenarioDriver', () => {
  it('holds inputs until the player is up, then stops when settled', () => {
    const d = new ScenarioDriver(content, {
      id: 's',
      schemaVersion: 1,
      description: 'd',
      mode: 'mode.test',
      seed: 1,
      players: 2,
      inputs: [
        { t: 0, player: 1, action: { type: 'fire' } },
        { t: 0, player: 0, action: { type: 'fire' } },
      ],
      capture: { maxTicks: 3000, untilSettled: true, extraTicks: 5 },
    });
    while (!d.done) d.step();
    expect(d.world.turn).toBe(2);
    expect(d.world.tick).toBeLessThan(3000);
  });
});

describe('match loop', () => {
  const matchContent = resolveContent(
    fixtureSource({
      'modes/test': {
        rounds: 3,
        turnTimer: 1,
        shopTimer: 2,
        suddenDeath: { fromTurn: 2, damageScale: 2, edgeCells: 10 },
        scoring: { damage: 1, kill: 50, selfDamage: 1, survival: 25, roundWin: 100 },
        economy: { startingCash: 100, moneyPerPoint: 2, interest: 0.1, priceJitter: 0.2 },
        loadout: [{ weapon: 'weapon.shell', count: 2 }],
      },
    }),
  );
  const mk = (o: Partial<WorldOptions> = {}) =>
    new World(matchContent, { seed: 3, mode: 'mode.test', players: 2, ...o });
  const SHELL = mk().weaponByIndex('weapon.shell');

  it('fires on its own when the turn timer runs out', () => {
    const w = mk();
    w.run(59);
    expect(w.phase).toBe('aim');
    w.step();
    expect(w.phase).toBe('resolve');
    expect(w.tanks[0]!.inventory[SHELL]).toBe(1);
  });

  it('scores the round, pays money with interest, then shops and starts a fresh map', () => {
    const w = mk();
    w.tanks[1]!.health = 10;
    const pre = w.grid.material.slice();
    shoot(w, 90, 0);
    w.tanks[1]!.health = 0;
    w.tanks[1]!.alive = false;
    untilQuiet(w);
    expect(w.phase).toBe('shop');
    const r = w.results[0]!;
    expect(r.winner).toBe(0);
    expect(r.points[0]).toBe(25 + 100 - w.tanks[0]!.selfDamage);
    expect(w.tanks[0]!.money).toBe(100 + 10 + r.points[0]! * 2);
    expect(w.tanks[1]!.money).toBe(110);
    // jittered prices within ±20%
    expect(w.prices[SHELL]).toBeGreaterThanOrEqual(1);
    // buying: validation and inventory
    w.tanks[1]!.money = 50;
    const before = w.tanks[1]!.money;
    w.applyInput(1, { type: 'buy', item: 'weapon.shell', packs: 3 });
    w.applyInput(1, { type: 'buy', item: 'weapon.nope', packs: 1 });
    w.applyInput(1, { type: 'buy', item: 'weapon.shell', packs: 99 });
    w.step();
    expect(w.tanks[1]!.money).toBe(before - 3 * w.prices[SHELL]!);
    expect(w.tanks[1]!.inventory[SHELL]).toBe(2 + 3);
    // aim inputs are ignored while shopping
    w.applyInput(0, { type: 'fire' });
    w.applyInput(0, { type: 'ready' });
    w.applyInput(1, { type: 'ready' });
    w.step();
    w.step();
    expect(w.phase).toBe('aim');
    expect(w.round).toBe(1);
    expect(w.tanks.every((t) => t.alive && t.health === 100)).toBe(true);
    expect(w.tanks[1]!.inventory[SHELL]).toBe(5);
    expect(w.grid.material).toEqual(pre);
  });

  it('auto-readies when the shop timer runs out and ends the match after the last round', () => {
    const w = mk({ rules: { rounds: 2, turnTimer: 0 } });
    for (let round = 0; round < 2; round++) {
      w.tanks[1]!.alive = false;
      shoot(w, 90, 0);
      untilQuiet(w);
      if (round === 0) {
        expect(w.phase).toBe('shop');
        w.run(121);
      }
    }
    expect(w.phase).toBe('over');
    expect(w.results).toHaveLength(2);
    expect(w.matchWinner).toBe(0);
  });

  it('opening shop: shops on round 1’s map before the first turn, with the shop timer', () => {
    const plain = mk();
    const w = mk({ rules: { openingShop: true } });
    expect(w.phase).toBe('shop');
    expect(w.round).toBe(0);
    expect(w.timer).toBe(120);
    expect(w.grid.material).toEqual(plain.grid.material);
    w.applyInput(0, { type: 'buy', item: 'weapon.shell', packs: 1 });
    w.step();
    expect(w.tanks[0]!.inventory[SHELL]).toBe(3);
    expect(w.tanks[0]!.money).toBeLessThan(100);
    // the timer runs out: round 1 starts on the same map, nobody's round is counted
    w.run(118);
    expect(w.phase).toBe('shop');
    w.step();
    expect(w.phase).toBe('aim');
    expect(w.round).toBe(0);
    expect(w.results).toHaveLength(0);
    expect(w.tanks.every((t) => !t.ready)).toBe(true);
    expect(w.grid.material).toEqual(plain.grid.material);
  });

  it('opening shop ends early once everyone is ready', () => {
    const w = mk({ rules: { openingShop: true } });
    w.applyInput(0, { type: 'ready' });
    w.step();
    expect(w.phase).toBe('shop');
    w.applyInput(1, { type: 'ready' });
    w.step();
    expect(w.phase).toBe('aim');
    expect(w.timer).toBe(60);
  });

  it('sudden death doubles damage and collapses the map edges into the void', () => {
    const w = mk({ rules: { turnTimer: 0 }, tankColumns: [8, 150] });
    for (const t of w.tanks) t.health = 1000;
    expect(w.suddenDeathActive).toBe(false);
    shoot(w, 90, 0);
    untilQuiet(w);
    shoot(w, 90, 0);
    untilQuiet(w);
    // turn 2 of each player: edges collapse
    expect(w.suddenDeathActive).toBe(true);
    expect(w.edge).toBe(10);
    expect(w.grid.get(5, 110)).toBe(0);
    expect(w.grid.get(w.grid.width - 5, 110)).toBe(0);
    // one more collapse and the tank at the edge falls out of the map
    w.run(30);
    shoot(w, 0, 0);
    untilQuiet(w);
    for (let i = 0; i < 200 && w.tanks[0]!.alive; i++) w.step();
    expect(w.edge).toBe(20);
    expect(w.tanks[0]!.alive).toBe(false);
  });

  it('applies the sudden-death damage scale', () => {
    const hit = (rules: WorldOptions['rules']) => {
      const w = mk({ rules: { turnTimer: 0, ...rules }, tankColumns: [60, 140] });
      w.turn = 2;
      w.projectiles.push({
        id: 1,
        weapon: SHELL,
        owner: 0,
        x: 140 * FP,
        y: 95 * FP,
        vx: 0,
        vy: FP,
        age: 10,
        alive: true,
        data: [],
      });
      w.phase = 'resolve';
      untilQuiet(w);
      return 100 - w.tanks[1]!.health;
    };
    expect(hit({ suddenDeath: true })).toBe(2 * hit({ suddenDeath: false }));
  });
});
