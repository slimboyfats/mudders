import { FP, z } from '@mudders/shared';
import { defineTerrainOp, isqrt, type OpCall, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Ticks it takes to open up after landing, and to collapse at the end. */
  rise: z.number().int().min(1).max(240),
  sink: z.number().int().min(1).max(240),
  /** How long it stays: this many full turn rotations (every tank alive when it opens, once). */
  rounds: z.number().int().min(1).max(10),
  /** Cells it floats above the ground where it landed. */
  hover: z.number().int().min(0).max(120),
  /**
   * Pull on an enemy shell (cells/tick²) inside `core * 2` cells; further out it falls off as
   * 1/distance, fading to nothing over the outer quarter of the call's radius.
   */
  pull: z.number().min(0).max(4),
  /** A shell that comes within this many cells of the centre is swallowed. */
  core: z.number().int().min(1).max(40),
  /**
   * Share of a shell's speed (per 256, per tick) the well soaks up right at its centre, falling
   * off linearly to nothing at the rim: it makes caught shells spiral in instead of slingshotting.
   */
  damp: z.number().int().min(0).max(64),
});
type Params = z.infer<typeof params>;

// states
const RISE = 0;
const OPEN = 1;
const SINK = 2;

// data slots
const AGE = 0;
const STATE = 1;
const TIMER = 2;
const START = 3;
const LIFE = 4;
const EATEN = 5;
const SIZE = 6;

const scratchIds = new Int32Array(64);

function teamOf(api: SimApi, player: number): number {
  return api.tanks[player]?.team ?? player;
}

/** Bend every enemy shell inside the field toward the centre; swallow those that reach it. */
function bend(api: SimApi, p: Params, c: OpCall, d: number[], s256: number): void {
  if (api.projectiles.length === 0 || s256 <= 0) return;
  const team = teamOf(api, c.owner);
  const R16 = c.radius * 16;
  const K16 = p.core * 32;
  const core16 = p.core * 16;
  const pullFP = Math.trunc((p.pull * FP * s256) / 256);
  const ox = c.x * FP + (FP >> 1);
  const oy = c.y * FP + (FP >> 1);
  // ids first: swallowing changes the list
  let n = 0;
  for (const s of api.projectiles) {
    if (!s.alive || teamOf(api, s.owner) === team || n >= scratchIds.length) continue;
    scratchIds[n++] = s.id;
  }
  for (let k = 0; k < n; k++) {
    const id = scratchIds[k]!;
    let shell: { x: number; y: number; vx: number; vy: number } | undefined;
    for (const s of api.projectiles) if (s.id === id) shell = s;
    if (!shell) continue;
    const dx = (ox - shell.x) >> 12;
    const dy = (oy - shell.y) >> 12;
    const d2 = dx * dx + dy * dy;
    if (d2 >= R16 * R16) continue;
    const dist = Math.max(1, isqrt(d2));
    if (dist <= core16) {
      if (api.catchShell(id)) {
        d[EATEN] = d[EATEN]! + 1;
        api.emit('wellSwallow', Math.floor(shell.x / FP), Math.floor(shell.y / FP), p.core, {
          eaten: d[EATEN]!,
        });
      }
      continue;
    }
    // 1/r inside the field, flat inside the inner zone, faded to zero over the outer quarter
    const fade = Math.min(R16 >> 2, R16 - dist);
    const a = Math.trunc((((pullFP * K16) / Math.max(dist, K16)) * fade) / (R16 >> 2));
    const damp = Math.trunc((p.damp * (R16 - dist)) / R16);
    let vx = shell.vx - Math.trunc((shell.vx * damp) / 256);
    let vy = shell.vy - Math.trunc((shell.vy * damp) / 256);
    vx += Math.trunc((a * dx) / dist);
    vy += Math.trunc((a * dy) / dist);
    api.steerShell(id, vx, vy);
  }
}

/**
 * Gravity Well (weapon.gravity-well): a defensive pocket of collapsed space that floats where the
 * shell lands and stays for `rounds` full turn rotations, a resident op that never holds up a
 * turn. Every enemy shell that flies into its field is pulled toward it (1/r, fading to nothing at
 * the rim), loses speed the deeper it goes so it spirals in, and is swallowed whole without going
 * off once it reaches the core. Its owner's side's shells pass through untouched. It doesn't touch
 * the ground or tanks.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.gravity-well',
  version: 1,
  params,
  start(api, p, c) {
    const g = api.grid;
    const d = new Array<number>(SIZE).fill(0);
    let alive = 0;
    for (const t of api.tanks) if (t.alive) alive++;
    // float above the ground under the impact
    let y = Math.max(0, Math.min(g.height - 1, c.y));
    while (y > 0 && g.material[y * g.width + c.x] !== 0) y--;
    c.y = Math.max(p.core + 4, y - p.hover);
    d[STATE] = RISE;
    d[START] = api.turn;
    d[LIFE] = p.rounds * Math.max(1, alive);
    api.emit('wellOpen', c.x, c.y, c.radius, { rise: p.rise });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    d[AGE] = d[AGE]! + 1;
    d[TIMER] = d[TIMER]! + 1;
    let state = d[STATE]!;
    if (state === RISE && d[TIMER]! >= p.rise) {
      state = OPEN;
      d[STATE] = OPEN;
      d[TIMER] = 0;
    } else if (state === OPEN && api.turn - d[START]! >= d[LIFE]!) {
      state = SINK;
      d[STATE] = SINK;
      d[TIMER] = 0;
      api.emit('wellClose', c.x, c.y, c.radius, { sink: p.sink, eaten: d[EATEN]! });
    }
    const t = d[TIMER]!;
    // 0..256 strength: ramps up while it opens, down while it collapses
    const s256 =
      state === RISE
        ? Math.trunc((t * 256) / p.rise)
        : state === SINK
          ? Math.max(0, 256 - Math.trunc((t * 256) / p.sink))
          : 256;
    bend(api, p, c, d, s256);
    const left = Math.max(0, d[LIFE]! - (api.turn - d[START]!));
    api.emit('gravityWell', c.x, c.y, c.radius, {
      state,
      t,
      age: d[AGE]!,
      core: p.core,
      strength: s256,
      eaten: d[EATEN]!,
      left,
    });
    if (state === SINK) return t < p.sink ? 'idle' : false;
    return state === RISE ? true : 'idle';
  },
});
