import {
  FP,
  toFixed,
  type ContactResult,
  type FlightHit,
  type Projectile,
  type SimApi,
} from '@mudders/sim';

/**
 * Shared helpers for `flight.*` behaviours. Everything is fixed-point integer maths plus
 * `Math.sqrt` (§6.3). Flights never draw from the match RNG: the AI's predictor runs them too.
 */

/** One semi-implicit Euler step under gravity, wind and weather drag (the ballistic arc, §3.4). */
export function ballisticStep(
  api: SimApi,
  p: Projectile,
  gravityScale: number,
  windScale: number,
): void {
  p.vx += Math.trunc((api.wind * toFixed(windScale)) / FP);
  p.vy += Math.trunc((api.gravity * toFixed(gravityScale)) / FP);
  // weather drag (rain, snow): a share of the speed lost every tick; none in clear skies, and
  // none for what the air doesn't touch (beams ignore wind)
  if (api.drag !== 0 && windScale !== 0) {
    p.vx -= Math.trunc((p.vx * api.drag) / FP);
    p.vy -= Math.trunc((p.vy * api.drag) / FP);
  }
  p.x += p.vx;
  p.y += p.vy;
}

/** Scale (vx, vy) to length `speed` (all fixed-point); straight up when it has no direction. */
export function withSpeed(vx: number, vy: number, speed: number): [number, number] {
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 1) return [0, -speed];
  return [Math.trunc((vx * speed) / len), Math.trunc((vy * speed) / len)];
}

/** Put the shell in the middle of a cell. */
export function placeAt(p: Projectile, x: number, y: number): void {
  p.x = x * FP + FP / 2;
  p.y = y * FP + FP / 2;
}

export function cellX(p: Projectile): number {
  return Math.floor(p.x / FP);
}

export function cellY(p: Projectile): number {
  return Math.floor(p.y / FP);
}

/** Solid at (x, y)? Off the sides counts as solid, above the map as air, below as solid. */
export function solidAt(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  if (x < 0 || x >= g.width || y >= g.height) return true;
  if (y < 0) return false;
  return g.material[y * g.width + x] !== 0;
}

/** True when (x, y) is sticky ground (tar): rolling and bouncing shells stick to it. */
export function stickyAt(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  return api.mats.sticky[g.material[y * g.width + x]!] !== 0;
}

/**
 * The live enemy decoy (`api.lures`, not on `team`) nearest (x, y) within `range` cells: its
 * centre and squared distance, or null. Homing warheads go for a decoy over a real tank unless the
 * tank is less than half as far (a decoy runs hot on purpose).
 */
export function lureNear(
  api: SimApi,
  team: number,
  x: number,
  y: number,
  range: number,
): { x: number; y: number; d2: number; index: number } | null {
  let best: { x: number; y: number; d2: number; index: number } | null = null;
  let bd = range * range;
  for (let i = 0; i < api.lures.length; i++) {
    const l = api.lures[i]!;
    if (!l.alive || l.team === team) continue;
    const cy = l.y - (l.h >> 1);
    const dx = l.x - x;
    const dy = cy - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = { x: l.x, y: cy, d2: d, index: i };
    }
  }
  return best;
}

/** Shell physics (`rules.shells`): what a plain shell does about the ground it meets. */
const SHELL = {
  /** Static ground this heavy (rock, steel, concrete, ice) turns a flat hit. */
  hardDensity: 150,
  /** A hit is flat when the speed into the surface is under this share of the whole (×256). */
  glance: 108,
  /** Slowest shell that glances or skips, in cells per tick. */
  minSpeed: 3,
  /** Speed kept into and along the surface on a glance (×256). */
  restitution: 128,
  friction: 205,
  /** A skip on water: how flat (|vy| × this ≤ |vx|), and the speed kept up and along (×256). */
  skipFlat: 3,
  skipUp: 154,
  skipAlong: 192,
  maxSkips: 2,
} as const;

/** What the last contact did (`data[1]`), for `shellContacted`. */
const SHELL_SKIP = 1;
const SHELL_GLANCE = 2;
const SHELL_BURY = 3;

/** How many cells deep a shell digs into this material before it goes off (0 = not soft). */
function softDepth(api: SimApi, m: number): number {
  const k = api.mats.settle[m]!;
  // 1 = fall, 2 = slide: loose ground only
  if (k !== 1 && k !== 2) return 0;
  const d = api.mats.density[m]!;
  if (d <= 45) return 8; // snow
  if (d <= 70) return 5; // ash, moss, leaves
  if (api.mats.wet[m]! !== 0) return 5; // mud, wet clay
  if (k === 2 && d <= 95) return 3; // sand
  return 0;
}

/**
 * Contact for plain shells while the match rule `shells` is on (kernel 0.64.0); `data[0]` counts
 * the glances and skips so far and `data[1]` says what this contact did. It only moves the shell,
 * as the aim predictor runs it too (bots plan their skips and glances); what shows is left to
 * `shellContacted`. By the cell hit:
 *
 * - **Hard ground** (static, density ≥ 150: rock, steel, concrete, ice): a fast shell that comes
 *   in flat, under about 25° to the surface, glances off once, keeping half its speed into the
 *   surface and four fifths along it. A square hit goes off as ever.
 * - **Liquid**: a fast, flat shell (under about 18° to level) skips, up to twice. A steeper one
 *   goes off on the surface as ever.
 * - **Soft ground** (snow, ash, sand, mud): the shell digs on along its path, deeper the softer
 *   the ground, and goes off down there.
 *
 * A tank, sticky ground or the rule being off: `impact`. Integer maths plus `Math.sqrt` (§6.3).
 */
export function shellContact(api: SimApi, proj: Projectile, hit: FlightHit): ContactResult {
  if (!api.shellPhysics || hit.tank >= 0) return 'impact';
  const g = api.grid;
  if (hit.x < 0 || hit.y < 0 || hit.x >= g.width || hit.y >= g.height) return 'impact';
  const m = g.material[hit.y * g.width + hit.x]!;
  if (m === 0 || api.mats.sticky[m]! !== 0) return 'impact';
  const kind = api.mats.settle[m]!;
  const speed2 = proj.vx * proj.vx + proj.vy * proj.vy;
  const fast = speed2 >= SHELL.minSpeed * SHELL.minSpeed * FP * FP;
  const bounced = proj.data[0] ?? 0;

  // liquid (3 = flow): skip like a flat stone
  if (kind === 3) {
    if (!fast || bounced >= SHELL.maxSkips || proj.vy <= 0) return 'impact';
    if (proj.vy * SHELL.skipFlat > Math.abs(proj.vx)) return 'impact';
    placeAt(proj, hit.freeX, hit.freeY);
    proj.vy = -((proj.vy * SHELL.skipUp) >> 8) - (FP >> 1);
    proj.vx = Math.trunc((proj.vx * SHELL.skipAlong) / 256);
    proj.data[0] = bounced + 1;
    proj.data[1] = SHELL_SKIP;
    return 'continue';
  }

  // hard ground (0 = static): glance off on a flat hit
  if (kind === 0 && api.mats.density[m]! >= SHELL.hardDensity) {
    if (!fast || bounced >= 1) return 'impact';
    let sx = 0;
    let sy = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (solidAt(api, hit.x + dx, hit.y + dy)) {
          sx -= dx;
          sy -= dy;
        }
      }
    }
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 1) return 'impact';
    const nx = Math.trunc((sx * FP) / len);
    const ny = Math.trunc((sy * FP) / len);
    const vn = Math.trunc((proj.vx * nx + proj.vy * ny) / FP);
    if (vn >= 0) return 'impact';
    // flat enough? |vn| ≤ glance × |v|
    if (vn * vn * 65536 > SHELL.glance * SHELL.glance * speed2) return 'impact';
    const tx = proj.vx - Math.trunc((vn * nx) / FP);
    const ty = proj.vy - Math.trunc((vn * ny) / FP);
    const back = Math.trunc((vn * SHELL.restitution) / 256);
    placeAt(proj, hit.freeX, hit.freeY);
    proj.vx = Math.trunc((tx * SHELL.friction) / 256) - Math.trunc((back * nx) / FP);
    proj.vy = Math.trunc((ty * SHELL.friction) / 256) - Math.trunc((back * ny) / FP);
    proj.data[0] = bounced + 1;
    proj.data[1] = SHELL_GLANCE;
    return 'continue';
  }

  // soft ground: dig on along the path, then go off down there
  const depth = softDepth(api, m);
  if (depth > 0 && speed2 >= FP * FP) {
    const len = Math.sqrt(speed2);
    let x = hit.x;
    let y = hit.y;
    for (let k = 1; k <= depth; k++) {
      const nx = hit.x + Math.trunc((proj.vx * k) / len);
      const ny = hit.y + Math.trunc((proj.vy * k) / len);
      if (nx < 0 || ny < 0 || nx >= g.width || ny >= g.height) break;
      const c = g.material[ny * g.width + nx]!;
      if (c === 0 || softDepth(api, c) === 0) break;
      x = nx;
      y = ny;
    }
    if (x !== hit.x || y !== hit.y) {
      proj.data[1] = SHELL_BURY;
      proj.data[2] = hit.x;
      proj.data[3] = hit.y;
      hit.x = x;
      hit.y = y;
    }
  }
  return 'impact';
}

/**
 * What a `shellContact` shows, on a real shot only: a skip throws a few real drops of the liquid
 * on ahead and rings the surface (`ripple`), a glance strikes sparks (`ricochet`), and a shell
 * that buried itself kicks dirt out of the hole it went in by (`dirtBurst`).
 */
export function shellContacted(api: SimApi, proj: Projectile, hit: FlightHit): void {
  const what = proj.data[1] ?? 0;
  if (what === 0) return;
  proj.data[1] = 0;
  const g = api.grid;
  if (what === SHELL_SKIP) {
    const m = g.material[hit.y * g.width + hit.x]!;
    const dir = proj.vx > 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const x = hit.x + dir * k;
      if (x < 0 || x >= g.width) break;
      const i = hit.y * g.width + x;
      if (m !== 0 && g.material[i] === m) {
        api.launch(i, (proj.vx >> 2) + dir * k * (FP >> 2), -FP - k * (FP >> 1));
      }
    }
    api.emit('ripple', hit.x, hit.y, 6, { strength: 0.6 });
  } else if (what === SHELL_GLANCE) {
    api.emit('ricochet', hit.x, hit.y, 4, { strength: 1 });
  } else if (what === SHELL_BURY) {
    api.emit('dirtBurst', proj.data[2] ?? hit.x, proj.data[3] ?? hit.y, 5, {});
  }
}
