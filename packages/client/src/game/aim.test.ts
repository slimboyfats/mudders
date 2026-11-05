import { describe, expect, it } from 'vitest';
import { clampAim, slingshotAim } from './aim';

describe('slingshotAim', () => {
  it('ignores tiny drags (taps)', () => {
    expect(slingshotAim(2, 3, 200)).toBeNull();
  });
  it('shoots away from the pull', () => {
    // pull down-left → up-right at 45°
    expect(slingshotAim(-100, 100, 1000)).toEqual({ angle: 45, power: 141 });
    // pull straight down → straight up
    expect(slingshotAim(0, 150, 300)?.angle).toBe(90);
    // pull right → shoot left (180°)
    expect(slingshotAim(80, 0, 400)?.angle).toBe(180);
  });
  it('clamps upward pulls to the horizon and power to 1000', () => {
    expect(slingshotAim(-50, -50, 100)).toEqual({ angle: 0, power: 707 });
    expect(slingshotAim(-500, 500, 100)?.power).toBe(1000);
    expect(slingshotAim(50, -50, 100)?.angle).toBe(180);
  });
  it('clampAim rounds and bounds', () => {
    expect(clampAim({ angle: 200.4, power: -3 })).toEqual({ angle: 180, power: 0 });
  });
});
