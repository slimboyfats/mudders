import { World, runInputs, type WorldOptions } from '@mudders/sim';
import type { TimedInput } from '@mudders/shared';
import { loadContent } from './index';

/** Helpers for content item tests. */
export function makeWorld(opts: Partial<WorldOptions> = {}): World {
  return new World(loadContent(), { seed: 1, mode: 'mode.classic', players: 2, ...opts });
}

/** Count cells of a material id (or all solid cells when omitted). */
export function countCells(world: World, materialId?: string): number {
  const m = world.grid.material;
  const want = materialId ? world.mats.cellOf(materialId) : -1;
  let n = 0;
  for (let i = 0; i < m.length; i++) if (want < 0 ? m[i] !== 0 : m[i] === want) n++;
  return n;
}

/** Fire `weapon` from the active player with the given aim, then run until quiet (or `max` ticks). */
export function fireAndSettle(
  world: World,
  weapon: string,
  angle: number,
  power: number,
  max = 1200,
): number {
  const p = world.activePlayer;
  const inputs: TimedInput[] = [
    { t: world.tick, player: p, action: { type: 'selectWeapon', weapon } },
    { t: world.tick, player: p, action: { type: 'aim', angle, power } },
    { t: world.tick, player: p, action: { type: 'fire' } },
  ];
  runInputs(world, inputs, 1);
  let n = 1;
  while (n < max && world.phase === 'resolve') {
    world.step();
    n++;
  }
  return n;
}

/** A flat test map: replace the grid with dirt below `surface`, re-seat tanks, clear settle. */
export function flatten(world: World, surface: number, materialId = 'material.dirt'): void {
  const g = world.grid;
  const cell = world.mats.cellOf(materialId);
  g.material.fill(0);
  g.material.fill(cell, surface * g.width);
  g.group.fill(0);
  g.groupMat.fill(0);
  world.groups.reset();
  g.clearSettle();
  for (const t of world.tanks) t.y = surface;
}

/** Drop a shell of `weapon` (owned by the active player) straight down onto column x, then settle. */
export function dropAt(world: World, weapon: string, x: number, max = 2000): number {
  const idx = world.weaponByIndex(weapon);
  if (idx < 0) throw new Error(`unknown weapon ${weapon}`);
  const y = Math.max(0, world.grid.surfaceY(x) - 6);
  world.projectiles.push({
    id: 1000 + world.tick,
    weapon: idx,
    owner: world.activePlayer,
    x: x * 65536 + 32768,
    y: y * 65536,
    vx: 0,
    vy: 65536,
    age: 10,
    alive: true,
    data: [],
  });
  world.phase = 'resolve';
  let n = 0;
  while (n < max && world.phase === 'resolve') {
    world.step();
    n++;
  }
  return n;
}

/** A small flat dirt world with two tanks far apart and no wind or timers. */
export function flatWorld(surface = 150, opts: Partial<WorldOptions> = {}): World {
  const w = makeWorld({
    map: { width: 400, height: 200 },
    tankColumns: [40, 360],
    wind: 0,
    turnOrder: [0, 1],
    rules: { turnTimer: 0, suddenDeath: false },
    ...opts,
  });
  flatten(w, surface);
  return w;
}

/** `flatWorld` with one prop centred on column x, settled and still. */
export function propWorld(
  prop: string,
  x = 200,
  surface = 150,
  opts: Partial<WorldOptions> = {},
): World {
  const w = flatWorld(surface, opts);
  w.groups.placeAt(w.grid, prop, x);
  w.grid.clearSettle();
  w.grid.clearReact();
  return w;
}

/** Cells that still belong to an intact prop group. */
export function groupCells(world: World): number {
  let n = 0;
  for (let i = 0; i < world.grid.group.length; i++) if (world.grid.group[i] !== 0) n++;
  return n;
}

/**
 * Launch a shell of `weapon` (owned by the active player) from cell (x, y) with velocity (vx, vy)
 * in cells/tick, then run until the shot resolves (or `max` ticks). Returns ticks run.
 */
export function launchAt(
  world: World,
  weapon: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  max = 2000,
): number {
  const idx = world.weaponByIndex(weapon);
  if (idx < 0) throw new Error(`unknown weapon ${weapon}`);
  world.projectiles.push({
    id: 2000 + world.tick,
    weapon: idx,
    owner: world.activePlayer,
    x: x * 65536 + 32768,
    y: y * 65536 + 32768,
    vx: Math.round(vx * 65536),
    vy: Math.round(vy * 65536),
    age: 10,
    alive: true,
    data: [],
  });
  world.phase = 'resolve';
  let n = 0;
  while (n < max && world.phase === 'resolve') {
    world.step();
    n++;
  }
  return n;
}

/** Effect events of one type emitted since the last snapshot (drains the snapshot queue). */
export function effectsOf(world: World, type: string): { x: number; y: number }[] {
  return world
    .snapshot()
    .effectEvents.filter((e) => e.type === type)
    .map((e) => ({ x: e.x, y: e.y }));
}

/** End turns by firing a harmless shell into the sky until `turns` turns have passed. */
export function passTurns(world: World, turns: number): void {
  const idx = world.weaponByIndex('weapon.tracer');
  for (let k = 0; k < turns; k++) {
    const t = world.tanks[world.activePlayer]!;
    t.inventory[idx] = 1;
    t.weapon = idx;
    t.angle = 90;
    t.power = 0;
    world.applyInput(world.activePlayer, { type: 'fire' });
    let n = 0;
    world.step();
    while (n < 2000 && world.phase === 'resolve') {
      world.step();
      n++;
    }
  }
}

/** A world whose surface slopes down to the right: row `top` at x = 0, one row per `run` columns. */
export function slopeWorld(top: number, run: number, opts: Partial<WorldOptions> = {}): World {
  const w = flatWorld(top, opts);
  const g = w.grid;
  const dirt = w.mats.cellOf('material.dirt');
  g.material.fill(0);
  for (let x = 0; x < g.width; x++) {
    const s = Math.min(g.height - 2, top + Math.floor(x / run));
    for (let y = s; y < g.height; y++) g.material[y * g.width + x] = dirt;
  }
  g.clearSettle();
  for (const t of w.tanks) t.y = g.surfaceY(t.x);
  return w;
}

/**
 * Health plus shield that player 1's tank (type `target`) loses when player 0's tank (type
 * `attacker`) has `weapon` dropped `offset` columns from it, on a flat calm map. null = default tank.
 */
export function blastLoss(
  attacker: string | null,
  target: string | null,
  offset: number,
  weapon = 'weapon.missile',
): number {
  const w = makeWorld({
    seed: 3,
    map: { width: 800, height: 400 },
    tankColumns: [150, 500],
    tanks: [attacker, target],
    turnOrder: [0, 1],
    wind: 0,
    rules: { suddenDeath: false },
  });
  flatten(w, 300);
  const t = w.tanks[1]!;
  const before = t.health + t.shield;
  dropAt(w, weapon, t.x + offset);
  return before - Math.max(0, t.health) - t.shield;
}

/** Dig a pit `depth` cells deep under a tank and let it fall; returns ticks taken (gear tests). */
export function dropTank(world: World, player: number, depth: number, max = 600): number {
  const g = world.grid;
  const t = world.tanks[player]!;
  for (let y = t.y; y < Math.min(g.height, t.y + depth); y++)
    for (let x = t.x - t.half - 2; x < t.x + t.half + 2; x++) g.material[y * g.width + x] = 0;
  let n = 0;
  world.step();
  while (n < max && t.falling) {
    world.step();
    n++;
  }
  return n;
}

/**
 * Fire `weapon` from player 0 (given one), let it fly `pressAt` ticks, then press fire again (an
 * `onCommand` trigger). Returns where the shell was when the press went in, or null if it had
 * already gone.
 */
export function fireAndPress(
  world: World,
  weapon: string,
  angle: number,
  power: number,
  pressAt: number,
): { x: number; y: number; vx: number; vy: number } | null {
  const idx = world.weaponByIndex(weapon);
  world.tanks[0]!.inventory[idx] = 1;
  world.applyInput(0, { type: 'selectWeapon', weapon });
  world.applyInput(0, { type: 'aim', angle, power });
  world.applyInput(0, { type: 'fire' });
  world.step();
  for (let n = 0; n < pressAt; n++) world.step();
  const p = world.projectiles.find((s) => s.alive && s.weapon === idx);
  if (!p) return null;
  const at = { x: Math.floor(p.x / 65536), y: Math.floor(p.y / 65536), vx: p.vx, vy: p.vy };
  world.applyInput(0, { type: 'fire' });
  world.step();
  return at;
}
