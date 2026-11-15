import { describe, expect, it } from 'vitest';
import { FLINCH_TICKS, flinchOffset, TankFlinch } from './flinch';
import { type Emit } from './particles';

describe('tank flinch', () => {
  it('shoves the hull away from the blast and hops it, then settles', () => {
    const [dx0] = flinchOffset(0, 1, 1);
    expect(dx0).toBeGreaterThan(0);
    const [, hop] = flinchOffset(Math.round(FLINCH_TICKS / 4), 1, -1);
    expect(hop).toBeLessThan(0);
    expect(flinchOffset(FLINCH_TICKS, 1, 1)).toEqual([0, 0]);
    expect(flinchOffset(-1, 1, 1)).toEqual([0, 0]);
  });

  it('rocks tanks in reach, harder when nearer, and leaves far ones alone', () => {
    const f = new TankFlinch();
    const out: Emit[] = [];
    const tanks = [
      { player: 0, x: 130, y: 100, alive: true },
      { player: 1, x: 900, y: 100, alive: true },
    ];
    f.blast(100, 96, 24, 50, tanks, () => 0x806040, { add: (e) => out.push(e) }, 1);
    let moved = false;
    for (let t = 50; t < 50 + FLINCH_TICKS + 10; t++) {
      const [dx] = f.offset(0, t);
      if (dx !== 0) moved = true;
      expect(dx).toBeGreaterThanOrEqual(0);
      expect(f.offset(1, t)).toEqual([0, 0]);
    }
    expect(moved).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});
