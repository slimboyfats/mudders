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
