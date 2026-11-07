import { describe, expect, it } from 'vitest';
import type { QuadBatch } from './batch';
import { Chunks } from './chunks';

/** Flat ground: rows ≥ `top` are solid; a hole where `hole` says. */
function ground(top: number, hole?: (x: number, y: number) => boolean) {
  return { solid: (x: number, y: number) => y >= top && !(hole?.(x, y) ?? false) };
}

/** Lowest drawn cell row of each chunk (via a recording batch). */
function bottoms(c: Chunks): number[] {
  const out: number[] = [];
  const rec = {
    push: (_x: number, y: number, _w: number, h: number) => {
      out.push(y + h / 2);
    },
  } as unknown as QuadBatch;
  c.draw(rec);
  return out;
}

describe('Chunks', () => {
  it('bounces, then settles on the ground without sinking into it', () => {
    const thuds: number[] = [];
    const c = new Chunks(8, ground(50), (_x, _y, s) => thuds.push(s));
    c.add({ x: 20, y: 10, vx: 0.5, vy: -2, w: 3, h: 2, color: 0x806040, rest: 500 });
    for (let t = 0; t < 200; t++) c.step(0.12, 100);
    expect(c.n).toBe(1);
    expect(thuds.length).toBeGreaterThanOrEqual(2); // bounced at least once before sticking
    expect(Math.max(...bottoms(c))).toBe(50); // resting right on the surface row
  });

  it('crumbles away after its rest time', () => {
    const c = new Chunks(8, ground(50));
    c.add({ x: 20, y: 46, vx: 0, vy: 0, w: 2, h: 2, color: 0x806040, rest: 30 });
    for (let t = 0; t < 40; t++) c.step(0.12, 100);
    expect(c.n).toBe(1);
    for (let t = 0; t < 40; t++) c.step(0.12, 100);
    expect(c.n).toBe(0);
  });

  it('falls again when the ground under it goes away', () => {
    let dug = false;
    const c = new Chunks(
      8,
      ground(50, (x, y) => dug && x >= 10 && x < 30 && y < 70),
    );
    c.add({ x: 20, y: 46, vx: 0, vy: 0, w: 2, h: 2, color: 0x806040, rest: 500 });
    for (let t = 0; t < 30; t++) c.step(0.12, 100);
    expect(Math.max(...bottoms(c))).toBe(50);
    dug = true;
    for (let t = 0; t < 120; t++) c.step(0.12, 100);
    expect(Math.max(...bottoms(c))).toBe(70);
  });

  it('never spawns inside solid ground and drops chunks that leave the map', () => {
    const c = new Chunks(8, ground(50));
    c.add({ x: 5, y: 80, vx: 0, vy: 0, w: 2, h: 2, color: 0, rest: 10 }); // deep underground
    expect(c.n).toBe(0);
    const open = new Chunks(8, { solid: () => false });
    open.add({ x: 5, y: 5, vx: 0, vy: 0, w: 2, h: 2, color: 0, rest: 10 });
    for (let t = 0; t < 200; t++) open.step(0.12, 40);
    expect(open.n).toBe(0);
  });
});
