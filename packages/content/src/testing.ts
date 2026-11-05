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
  g.clearSettle();
  for (const t of world.tanks) t.y = surface;
}
