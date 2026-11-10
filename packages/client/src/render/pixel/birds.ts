import type { EffectEvent } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { PKind, type ParticleSink } from './particles';

/**
 * Swallows (§2a living world): the sim flies them (`@mudders/sim` birds, so a shell that hits one
 * goes off there in every client); this draws them as a few map cells each, flapping in bursts and
 * gliding between, and turns the sim's `birdHit` / `birdPulp` events into feathers and a spray of
 * black pixels. Flapping is cosmetic, a function of the tick and the bird's motion.
 */

/** Back, wing and belly tones of a swallow. */
const BACK = 0x1f263a;
const WING = 0x2c3650;
/** Wings under a night sky, catching the moonlight, so the flock still reads against it. */
const WING_LIT = 0x8f9abd;
const BELLY = 0xe8e2d4;
const THROAT = 0xa65a36;
const FEATHERS = [BELLY, BELLY, 0xc9c3b6, WING, BACK, THROAT] as const;
/** A pulverised bird: black pixels with a hint of its blue-black back. */
const SOOT = [0x08090d, 0x0e1018, 0x141824, 0x1f263a] as const;

/**
 * Wing frames, each four cells (x, y) about the body, facing right: wings up (a V), level, down
 * (a roof) and a swept glide.
 */
const FRAMES: readonly (readonly number[])[] = [
  [-2, -2, -1, -1, 1, -1, 2, -2],
  [-2, -1, -1, -1, 1, -1, 2, -1],
  [-2, 1, -1, 0, 1, 0, 2, 1],
  [-2, 0, -1, -1, 1, -1, 2, 0],
];

/** Small seeded generator for particle scatter: cosmetic, replayable from the event. */
class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

const rngFor = (e: EffectEvent): Rng =>
  new Rng(Math.imul(e.tick + 1, 0x9e3779b1) ^ Math.imul(e.x + 7, 0x85ebca6b) ^ (e.y * 131));

/** Wing frame for bird `i` (index in the sim's list) at `tick`: flaps in bursts, glides between. */
export function wingFrame(i: number, tick: number, vy: number, panic: boolean): number {
  if (!panic && Math.sin(tick * 0.045 + i * 2.3) > 0.35) return 3;
  const rate = panic ? 0.55 : vy < -0.25 ? 0.4 : 0.22;
  return Math.floor(tick * rate + i * 1.37) % 3;
}

/**
 * Draw the sim's birds (`RenderSnapshot.birds`: x, y, vx, vy in 1/256 cell, panic ticks) as body,
 * head, forked tail and the wings' frame. Under a dark sky the wings are pale; the body stays
 * dark, so it reads against bright cloud too.
 */
export function drawBirds(
  batch: QuadBatch,
  birds: readonly number[] | undefined,
  tick: number,
  night: boolean,
): void {
  if (!birds) return;
  const wing = night ? WING_LIT : WING;
  for (let o = 0, i = 0; o + 4 < birds.length; o += 5, i++) {
    const bx = Math.floor(birds[o]! / 256) + 0.5;
    const by = Math.floor(birds[o + 1]! / 256) + 0.5;
    const face = birds[o + 2]! >= 0 ? 1 : -1;
    const f = wingFrame(i, tick, birds[o + 3]! / 256, birds[o + 4]! > 0);
    const fr = FRAMES[f]!;
    for (let k = 0; k < fr.length; k += 2) {
      batch.push(bx + fr[k]! * face, by + fr[k + 1]!, 1, 1, wing);
    }
    batch.push(bx, by, 1, 1, BACK);
    batch.push(bx + face, by, 1, 1, BACK);
    // forked tail
    batch.push(bx - face, by + 1, 1, 1, BACK);
    // a pale belly flashes on the downstroke
    if (f === 2) batch.push(bx, by + 1, 1, 1, BELLY);
  }
}

/** A shell flew into a bird (and goes off there): a burst of feathers and black bits. */
export function birdHit(e: EffectEvent, sink: ParticleSink): void {
  const r = rngFor(e);
  const svx = (e.params.vx ?? 0) / 100;
  const svy = (e.params.vy ?? 0) / 100;
  const n = 12 + Math.floor(r.next() * 5);
  for (let k = 0; k < n; k++) {
    const feather = k % 2 === 0;
    sink.add({
      x: e.x + 0.5 + r.range(-1, 1),
      y: e.y + 0.5 + r.range(-1, 1),
      vx: svx * 0.12 + r.range(-1.2, 1.2),
      vy: svy * 0.12 + r.range(-1.6, 0.4),
      life: feather ? r.range(240, 420) : r.range(90, 160),
      size: 1,
      color: feather
        ? FEATHERS[Math.floor(r.next() * FEATHERS.length)]!
        : SOOT[Math.floor(r.next() * SOOT.length)]!,
      kind: feather ? PKind.Leaf : PKind.Chunk,
    });
  }
}

/** A blast's pressure front reached a bird: it bursts into black pixels and a few dark feathers. */
export function birdPulp(e: EffectEvent, sink: ParticleSink): void {
  const r = rngFor(e);
  const dx = e.x - (e.params.ox ?? e.x);
  const dy = e.y - (e.params.oy ?? e.y + 1);
  const d = Math.max(1, Math.hypot(dx, dy));
  const near = (e.params.near ?? 500) / 1000;
  const sp = 0.8 + near * 2.4;
  const n = 14 + Math.floor(r.next() * 6);
  for (let k = 0; k < n; k++) {
    const feather = k % 4 === 0;
    sink.add({
      x: e.x + 0.5 + r.range(-1.5, 1.5),
      y: e.y + 0.5 + r.range(-1, 1),
      vx: (dx / d) * sp * r.range(0.5, 1.3) + r.range(-0.8, 0.8),
      vy: (dy / d) * sp * r.range(0.5, 1.3) + r.range(-1.0, 0.5),
      life: feather ? r.range(220, 400) : r.range(90, 180),
      size: 1,
      color: SOOT[Math.floor(r.next() * SOOT.length)]!,
      kind: feather ? PKind.Leaf : PKind.Chunk,
    });
  }
}
