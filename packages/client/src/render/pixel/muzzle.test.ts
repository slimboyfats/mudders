import { describe, expect, it } from 'vitest';
import { flashTicks, MuzzleKick, recoilAt } from './muzzle';
import { PKind, type Emit } from './particles';

/** Flat ground with its surface on row 100. */
const ground = { solid: (_x: number, y: number) => y >= 100, dust: () => 0x806040 };

function fire(heft: number, angle: number): Emit[] {
  const out: Emit[] = [];
  const k = new MuzzleKick();
  k.fire(
    206,
    86,
    angle,
    heft,
    10,
    [{ player: 0, x: 200, y: 100, alive: true }],
    ground,
    { add: (e) => out.push(e) },
    1,
  );
  return out;
}

describe('firing kick', () => {
  it('blows more dust off the ground for bigger guns', () => {
    const pea = fire(0.1, 30).filter((e) => e.kind === PKind.Dust).length;
    const nuke = fire(1, 30).filter((e) => e.kind === PKind.Dust);
    if (process.env.KICK_DUMP)
      console.log(pea, nuke.length, nuke.map((e) => `${e.x}:${e.vx.toFixed(2)}`).join(' '));
    expect(nuke.length).toBeGreaterThan(pea * 2);
    // on both sides of the tank, never under the hull
    expect(nuke.some((e) => e.x < 194)).toBe(true);
    expect(nuke.some((e) => e.x > 207)).toBe(true);
    expect(nuke.every((e) => Math.abs(e.x - 200.5) > 6)).toBe(true);
  });

  it('slams the barrel back and eases it out again', () => {
    expect(recoilAt(1, 0)).toBe(4);
    expect(recoilAt(0.2, 0)).toBe(2);
    expect(recoilAt(1, 40)).toBe(0);
    for (let a = 1; a < 40; a++) expect(recoilAt(1, a)).toBeLessThanOrEqual(recoilAt(1, a - 1));
    const k = new MuzzleKick();
    k.fire(
      206,
      86,
      30,
      1,
      10,
      [{ player: 3, x: 200, y: 100, alive: true }],
      ground,
      { add: () => {} },
      1,
    );
    expect(k.recoil(3, 11)).toBe(4);
    expect(k.recoil(0, 11)).toBe(0);
    expect(k.jolt(3, 11)).toBe(-1);
  });

  it('burns the flash longer for bigger guns', () => {
    expect(flashTicks(1)).toBeGreaterThan(flashTicks(0.1));
  });
});
