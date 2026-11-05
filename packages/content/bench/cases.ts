import type { MaterialManifest } from '@mudders/shared';
import { FP, MaterialTable, Prng, World, settleStep } from '@mudders/sim';
import { loadContent } from '../src/index';

/**
 * Benchmark cases (§9). Each returns per-tick timings in ms. Cases that need content from later
 * milestones (water for the flood dune, props for the house collapse) are listed as pending.
 */
export interface Timings {
  ticks: number[];
}

export interface BenchCase {
  id: string;
  description: string;
  run(now: () => number): Timings;
}

export const PENDING = [
  { id: 'flood-dune-120', reason: 'needs material.water + weapon.flood (milestone 3)' },
  { id: 'house-collapse', reason: 'needs props and integrity groups (milestone 3)' },
];

function medium(players = 4, seed = 1): World {
  return new World(loadContent(), {
    seed,
    mode: 'mode.classic',
    players,
    map: { width: 1200, height: 600 },
  });
}

function flat(w: World, surface: number): void {
  const dirt = w.mats.cellOf('material.dirt');
  w.grid.material.fill(0);
  w.grid.material.fill(dirt, surface * w.grid.width);
  w.grid.clearSettle();
  for (const t of w.tanks) t.y = surface;
}

function stepUntilQuiet(w: World, now: () => number, max = 2000): number[] {
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const t0 = now();
    w.step();
    out.push(now() - t0);
    if (w.quiet) break;
  }
  return out;
}

/** Fire a shell straight down onto (x, y) on the next tick. */
function drop(w: World, weapon: string, x: number, y: number): void {
  w.projectiles.push({
    id: 1,
    weapon: w.weapons.findIndex((k) => k.id === weapon),
    owner: 0,
    x: x * FP,
    y: (y - 2) * FP,
    vx: 0,
    vy: 2 * FP,
    age: 10,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
}

const OIL: MaterialManifest = {
  id: 'material.bench-oil',
  schemaVersion: 1,
  meta: {
    name: 'Bench oil',
    description: 'Synthetic cohesive coating for the blob benchmark.',
    since: 'core@0.1.0',
  },
  cell: 250,
  settle: 'fall',
  density: 1,
  strength: {},
  cohesion: 0.6,
  coating: true,
};

export const CASES: BenchCase[] = [
  {
    id: 'settle-200x100',
    description: 'settle a floating 200×100 dirt block onto a medium map',
    run(now) {
      const w = medium();
      flat(w, 500);
      const dirt = w.mats.cellOf('material.dirt');
      for (let y = 100; y < 200; y++) w.grid.material.fill(dirt, y * 1200 + 500, y * 1200 + 700);
      w.grid.markDirty(500, 100, 699, 199);
      const ticks: number[] = [];
      for (let i = 0; i < 2000 && w.grid.settling; i++) {
        const t0 = now();
        settleStep(w.grid, w.mats, i, 60000);
        ticks.push(now() - t0);
      }
      return { ticks };
    },
  },
  {
    id: 'carve-r60',
    description: 'carve r=60 into a medium map (the op alone)',
    run(now) {
      const w = medium();
      const op = loadContent().behaviours.getKind('terrainop.carve', 'terrainop');
      const t0 = now();
      op.start(
        w,
        {},
        { x: 600, y: 400, radius: 60, damageType: 'blast', damageTypeIndex: 0, owner: 0 },
      );
      return { ticks: [now() - t0] };
    },
  },
  {
    id: 'shockwave-r90',
    description: 'displace r=90 into plain dirt: whole resolution (ring, debris, settle), per tick',
    run(now) {
      const w = medium();
      flat(w, 300);
      drop(w, 'weapon.shockwave', 600, 300);
      // weapon.shockwave is r=80; this bench pins r=90 per §9
      const imp = w.weapons.find((k) => k.id === 'weapon.shockwave')!.impacts[0]!;
      if (imp.kind === 'explosion') imp.e.radius = 90;
      return { ticks: stepUntilQuiet(w, now) };
    },
  },
  {
    id: 'shockwave-r90-oil30',
    description: 'displace r=90 with 30% of cells under a cohesive coating (blob path), per tick',
    run(now) {
      const w = medium();
      Object.defineProperty(w, 'mats', {
        value: new MaterialTable([...loadContent().list('material'), OIL]),
      });
      flat(w, 300);
      const rng = new Prng(9);
      for (let i = 300 * 1200; i < w.grid.size; i++)
        if (rng.int(10) < 3) w.grid.coating[i] = OIL.cell;
      drop(w, 'weapon.shockwave', 600, 300);
      const imp = w.weapons.find((k) => k.id === 'weapon.shockwave')!.impacts[0]!;
      if (imp.kind === 'explosion') imp.e.radius = 90;
      return { ticks: stepUntilQuiet(w, now) };
    },
  },
  {
    id: 'round-4p',
    description: '4-player round on gen.hills with scripted random shots until it ends, per tick',
    run(now) {
      const w = medium(4, 3);
      const rng = new Prng(77);
      const weapons = ['weapon.missile', 'weapon.baby-missile', 'weapon.shockwave'];
      const ticks: number[] = [];
      for (let i = 0; i < 20000 && w.round === 0; i++) {
        if (w.phase === 'aim') {
          const p = w.activePlayer;
          w.applyInput(p, { type: 'selectWeapon', weapon: weapons[rng.int(3)]! });
          w.applyInput(p, { type: 'aim', angle: rng.range(30, 150), power: rng.range(350, 800) });
          w.applyInput(p, { type: 'fire' });
        }
        const t0 = now();
        w.step();
        ticks.push(now() - t0);
      }
      return { ticks };
    },
  },
];
