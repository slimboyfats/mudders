import { z } from '@mudders/shared';
import {
  defineFlight,
  defineGenerator,
  defineMode,
  defineTerrainOp,
  type AnyBehaviour,
} from '../behaviours';
import { resolveContent, type ContentSource, type RawManifest } from '../content/resolve';
import { FP } from '../fixed';

/**
 * Synthetic content for kernel tests: the kernel must be testable without `@mudders/content`.
 * A flat generator, a plain ballistic flight, a carve op and a round-robin mode.
 */
export const fixtureBehaviours: AnyBehaviour[] = [
  defineGenerator({
    kind: 'gen',
    id: 'gen.flat',
    version: 1,
    params: z.strictObject({ level: z.number().int() }),
    generate(api, p, players) {
      const g = api.grid;
      const dirt = api.mats.cellOf('material.dirt');
      g.material.fill(dirt, p.level * g.width);
      const spawns: number[] = [];
      for (let i = 0; i < players; i++)
        spawns.push(Math.round(((i + 1) * g.width) / (players + 1)));
      return { spawns };
    },
  }),
  defineFlight({
    kind: 'flight',
    id: 'flight.simple',
    version: 1,
    params: z.strictObject({ maxTicks: z.number().int() }),
    maxTicks: (p) => p.maxTicks,
    step(api, proj) {
      proj.vx += api.wind;
      proj.vy += api.gravity;
      proj.x += proj.vx;
      proj.y += proj.vy;
    },
  }),
  defineTerrainOp({
    kind: 'terrainop',
    id: 'terrainop.hole',
    version: 1,
    params: z.strictObject({}),
    start(api, _p, c) {
      const g = api.grid;
      for (let y = c.y - c.radius; y <= c.y + c.radius; y++) {
        for (let x = c.x - c.radius; x <= c.x + c.radius; x++) {
          const dx = x - c.x;
          const dy = y - c.y;
          if (dx * dx + dy * dy <= c.radius * c.radius) g.set(x, y, 0);
        }
      }
      g.markDirty(c.x - c.radius, c.y - c.radius, c.x + c.radius, c.y + c.radius);
      return null;
    },
  }),
  defineTerrainOp({
    kind: 'terrainop',
    id: 'terrainop.slow',
    version: 1,
    params: z.strictObject({ ticks: z.number().int() }),
    start(_api, p) {
      return [p.ticks];
    },
    step(_api, _p, inst) {
      inst.data[0] = inst.data[0]! - 1;
      return inst.data[0]! > 0;
    },
  }),
  defineMode({
    kind: 'mode',
    id: 'mode.test',
    version: 1,
    params: z.strictObject({ firstPlayer: z.number().int() }),
    turnOrder(api, p) {
      const o: number[] = [];
      for (let i = 0; i < api.players; i++) o.push((p.firstPlayer + i) % api.players);
      return o;
    },
    onRoundStart(api) {
      api.setWind(0);
    },
    onTurnStart(api) {
      if (api.windType === 'perTurn') api.setWind(api.rng.range(-api.windMax, api.windMax));
    },
  }),
];

const S = 'test@1.0.0';
const meta = (name: string) => ({ name, description: `${name} (fixture)`, since: S });

export function fixtureManifests(
  overrides: Record<string, Record<string, unknown>> = {},
  omit: readonly string[] = [],
): RawManifest[] {
  const items: Record<string, Record<string, unknown>> = {
    'materials/dirt': {
      id: 'material.dirt',
      schemaVersion: 1,
      meta: meta('Dirt'),
      cell: 1,
      settle: 'fall',
      density: 100,
      strength: {},
      cohesion: 0,
      coating: false,
    },
    'materials/stone': {
      id: 'material.stone',
      schemaVersion: 1,
      meta: meta('Stone'),
      cell: 2,
      settle: 'static',
      density: 200,
      strength: { blast: 2 },
      cohesion: 0,
      coating: false,
    },
    'generators/flat': {
      id: 'gen.flat',
      schemaVersion: 1,
      meta: meta('Flat'),
      behaviour: 'gen.flat',
      level: 100,
    },
    'flights/simple': {
      id: 'flight.simple',
      schemaVersion: 1,
      meta: meta('Simple'),
      behaviour: 'flight.simple',
      maxTicks: 600,
    },
    'terrainops/hole': {
      id: 'terrainop.hole',
      schemaVersion: 1,
      meta: meta('Hole'),
      behaviour: 'terrainop.hole',
    },
    'terrainops/slow': {
      id: 'terrainop.slow',
      schemaVersion: 1,
      meta: meta('Slow'),
      behaviour: 'terrainop.slow',
      ticks: 5,
    },
    'explosions/boom': {
      id: 'explosion.boom',
      schemaVersion: 1,
      meta: meta('Boom'),
      radius: 10,
      damage: 50,
      damageType: 'blast',
      falloff: 'linear',
      push: 0,
      terrainOp: { use: 'terrainop.hole' },
      effects: { flash: { strength: 1 }, burst: { count: 3 } },
    },
    'weapons/shell': {
      id: 'weapon.shell',
      schemaVersion: 1,
      meta: meta('Shell'),
      flight: { use: 'flight.simple' },
      triggers: ['onSolid', 'onTank'],
      impact: [{ explosion: { use: 'explosion.boom' } }],
      shop: { price: 1, pack: 1, tier: 0 },
      ai: { expectedDamage: 1, terrainValue: 0 },
    },
    'weapons/big-shell': {
      id: 'weapon.big-shell',
      schemaVersion: 1,
      extends: 'weapon.shell',
      meta: meta('Big shell'),
      impact: [{ explosion: { use: 'explosion.boom', radius: 30, damage: 200, push: 10 } }],
    },
    'weapons/timer': {
      id: 'weapon.timer',
      schemaVersion: 1,
      extends: 'weapon.shell',
      meta: meta('Timer'),
      triggers: [{ onTimer: 3 }],
      impact: [{ terrainOp: { use: 'terrainop.slow' }, radius: 1, damageType: 'blast' }],
    },
    'weapons/apex': {
      id: 'weapon.apex',
      schemaVersion: 1,
      extends: 'weapon.shell',
      meta: meta('Apex'),
      triggers: ['onApex'],
    },
    'modes/test': {
      id: 'mode.test',
      schemaVersion: 1,
      meta: meta('Test'),
      behaviour: 'mode.test',
      firstPlayer: 0,
      rounds: 1,
      turnCap: 3,
      startingHealth: 100,
      physics: { gravity: 0.1, maxSpeed: 10 },
      wind: { type: 'none', max: 0 },
      walls: 'absorb',
      fallDamage: { safeCells: 2, perCell: 2 },
      map: { generator: 'gen.flat', width: 200, height: 120 },
      settle: { maxCellsPerTick: 100000 },
      loadout: [
        { weapon: 'weapon.shell', count: -1 },
        { weapon: 'weapon.big-shell', count: 1 },
        { weapon: 'weapon.timer', count: 1 },
        { weapon: 'weapon.apex', count: 1 },
      ],
      deathExplosion: { use: 'explosion.boom', radius: 12, damage: 40 },
    },
  };
  for (const [k, v] of Object.entries(overrides)) items[k] = { ...items[k], ...v };
  return Object.keys(items)
    .sort()
    .filter((k) => !omit.includes(k))
    .map((k) => ({ path: `test/${k}/manifest.json`, data: items[k] }));
}

export function fixtureSource(
  overrides: Record<string, Record<string, unknown>> = {},
  omit: readonly string[] = [],
): ContentSource {
  const manifests = fixtureManifests(overrides, omit);
  return {
    packs: [
      {
        pack: {
          name: 'test',
          version: '1.0.0',
          schemaVersion: 1,
          items: manifests.map((m) => (m.data as { id: string }).id).sort(),
        },
        manifests,
      },
    ],
    behaviours: fixtureBehaviours,
  };
}

export const fixtureContent = () => resolveContent(fixtureSource());

/** Velocity helpers for tests. */
export const fp = (v: number) => Math.round(v * FP);
