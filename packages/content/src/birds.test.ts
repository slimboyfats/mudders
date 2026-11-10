import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { dropAt, flatWorld } from './testing';

const FP = 65536;
const birdy = (seed = 1): World =>
  flatWorld(300, { seed, map: { width: 800, height: 400 }, rules: { birds: true } });

function birds(w: World): { x: number; y: number }[] {
  const b = w.snapshot().birds ?? [];
  const out: { x: number; y: number }[] = [];
  for (let o = 0; o < b.length; o += 5) out.push({ x: b[o]! / 256, y: b[o + 1]! / 256 });
  return out;
}

describe('swallows (rules.birds)', () => {
  it('fly in flocks in the open sky and stay off the ground', () => {
    const w = birdy();
    expect(birds(w).length).toBeGreaterThanOrEqual(12);
    w.run(900);
    const now = birds(w);
    expect(now.length).toBeGreaterThanOrEqual(12);
    for (const p of now) if (p.x >= 0 && p.x < 800) expect(p.y).toBeLessThan(300 - 4);
  });

  it('are deterministic and part of the state hash', () => {
    const a = birdy(5);
    const b = birdy(5);
    a.run(400);
    b.run(400);
    expect(a.hash()).toBe(b.hash());
    expect(birds(a)).toEqual(birds(b));
    expect(birdy(5).hash()).not.toBe(
      flatWorld(300, { seed: 5, map: { width: 800, height: 400 } }).hash(),
    );
  });

  it('are off unless the rules ask for them', () => {
    const w = flatWorld(300, { map: { width: 800, height: 400 } });
    w.run(50);
    expect(w.snapshot().birds).toBeUndefined();
  });

  it('a shell that flies into a bird goes off right there', () => {
    const w = birdy(3);
    w.run(30);
    w.snapshot();
    const b = birds(w)[0]!;
    // a fast shell from just left of the bird, straight at it
    const weapon = w.weaponByIndex('weapon.missile');
    w.throwShell(weapon, 0, Math.round((b.x - 5) * FP), Math.round(b.y * FP), 6 * FP, 0);
    w.phase = 'resolve';
    const events = [];
    for (let i = 0; i < 6; i++) {
      w.step();
      events.push(...w.snapshot().effectEvents);
    }
    const hit = events.find((e) => e.type === 'birdHit');
    expect(hit).toBeDefined();
    expect(w.birds.hits).toBe(1);
    // the missile exploded at the bird, high above the ground
    const flash = events.find((e) => e.type === 'flash');
    expect(flash).toBeDefined();
    expect(Math.abs(flash!.x - hit!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(flash!.y - hit!.y)).toBeLessThanOrEqual(1);
    expect(flash!.y).toBeLessThan(250);
  });

  it("a blast's pressure front tears apart the birds it reaches; the rest scatter and live", () => {
    const w = birdy(3);
    w.run(30);
    const under = Math.max(0, Math.min(799, Math.round(birds(w)[0]!.x)));
    dropAt(w, 'weapon.shockwave', under);
    w.run(60);
    expect(w.birds.pulped).toBeGreaterThan(0);
    const pulps = w.birds.pulped;
    expect(w.birds.alive).toBe(16 - pulps);
    // a small blast nowhere near a bird kills none
    const v = birdy(3);
    v.run(30);
    const far = birds(v).every((p) => Math.abs(p.x - 790) > 80) ? 790 : 10;
    dropAt(v, 'weapon.baby-missile', far);
    v.run(60);
    expect(v.birds.pulped).toBe(0);
  });
});
