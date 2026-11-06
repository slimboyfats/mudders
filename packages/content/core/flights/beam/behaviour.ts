import { z } from '@mudders/shared';
import { defineFlight, toFixed, type FlightHit, type Projectile, type SimApi } from '@mudders/sim';
import { ballisticStep, placeAt, withSpeed } from '../../../src/flight';

const params = z.strictObject({
  /** Cells per tick along the aim line; power only sets the direction. */
  speed: z.number().min(1).max(8),
  maxTicks: z.number().int().min(1),
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  /** Run the weapon's pulse impacts every N ticks in flight (a stream); 0 = only on contact. */
  pulseEvery: z.number().int().min(0).max(60),
  /** Cut on through terrain (pulse at each cell hit) instead of going off on it. */
  throughSolid: z.boolean(),
  /** Materials that mirror the beam (crystal): it bounces off them instead of cutting in. */
  mirror: z.array(z.string().startsWith('material.')).default([]),
  /** Most bounces off mirrors before the beam goes off where it is. */
  maxBounces: z.number().int().min(0).max(32).default(8),
});

/** `proj.data` slot for the bounce count (slot 0 marks the beam as started). */
const BOUNCES = 1;

/**
 * Bounce a beam off a mirroring cell (shared with the orbital lance): flip the velocity along
 * whichever axis the beam crossed into the mirror, put it back in the last free cell, and tell the
 * renderer. Returns false when `hit` is not a mirror (or the beam is out of bounces).
 */
export function mirrorBounce(
  api: SimApi,
  proj: Projectile,
  hit: FlightHit,
  mirror: readonly string[],
  maxBounces: number,
  slot: number,
): boolean {
  if (mirror.length === 0 || hit.tank >= 0) return false;
  const g = api.grid;
  const m = g.material[hit.y * g.width + hit.x]!;
  let is = false;
  for (const id of mirror) if (api.mats.cellOf(id) === m) is = true;
  if (!is) return false;
  while (proj.data.length <= slot) proj.data.push(0);
  if (proj.data[slot]! >= maxBounces) return false;
  proj.data[slot] = proj.data[slot]! + 1;
  const solidAt = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= g.width || y >= g.height || g.material[y * g.width + x] !== 0;
  const sx = hit.x !== hit.freeX;
  const sy = hit.y !== hit.freeY;
  let flipX = sx && !sy;
  let flipY = sy && !sx;
  if (sx && sy) {
    // came in on a diagonal: the open side tells which face it struck (both shut: a corner)
    const side = solidAt(hit.x, hit.freeY);
    const top = solidAt(hit.freeX, hit.y);
    flipX = side || !top;
    flipY = top || !side;
  }
  if (!sx && !sy) {
    flipX = true;
    flipY = true;
  }
  if (flipX) proj.vx = -proj.vx;
  if (flipY) proj.vy = -proj.vy;
  placeAt(proj, hit.freeX, hit.freeY);
  api.emit('reflect', hit.x, hit.y, 3, { vx: proj.vx >> 8, vy: proj.vy >> 8 });
  return true;
}

/**
 * Beam (§5.1 lasers, Water Cannon): leaves the barrel at a fixed speed along the aim, whatever the
 * power, and (for a laser) ignores gravity and wind. A cutting beam pulses where it meets terrain
 * and carries on, so it slices a thin channel; a tank stops it. A `mirror` material (crystal)
 * bounces it like a mirror instead: the beam keeps going the other way, maybe back at you.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.beam',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data.length === 0) {
      const [vx, vy] = withSpeed(proj.vx, proj.vy, toFixed(p.speed));
      proj.vx = vx;
      proj.vy = vy;
      proj.data.push(1);
    }
    ballisticStep(api, proj, p.gravityScale, p.windScale);
    return p.pulseEvery > 0 && proj.age % p.pulseEvery === 0 ? 'pulse' : undefined;
  },
  contact(api, proj, p, hit) {
    if (mirrorBounce(api, proj, hit, p.mirror, p.maxBounces, BOUNCES)) return 'continue';
    if (hit.tank >= 0 || !p.throughSolid) return 'impact';
    placeAt(proj, hit.x, hit.y);
    return 'pulse';
  },
});
