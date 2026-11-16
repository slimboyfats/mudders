import { describe, expect, it } from 'vitest';
import { placeMarker } from './markers';

const inset = { top: 50, right: 30, bottom: 30, left: 30 };

describe('placeMarker', () => {
  it('puts the chip right above a tank on the screen', () => {
    const s = placeMarker({ x: 200, y: 150 }, 800, 400, inset);
    expect(s.off).toBe(false);
    expect(s.x).toBe(200);
    expect(s.y).toBeLessThan(150);
  });

  it('pins an off-screen tank to the nearest edge, pointing at it', () => {
    const right = placeMarker({ x: 2000, y: 220 }, 800, 400, inset);
    expect(right.off).toBe(true);
    expect(right.x).toBeCloseTo(770);
    expect(Math.abs(right.angle)).toBeLessThan(0.1);
    const left = placeMarker({ x: -500, y: 220 }, 800, 400, inset);
    expect(left.x).toBeCloseTo(30);
    expect(Math.abs(Math.abs(left.angle) - Math.PI)).toBeLessThan(0.1);
    const below = placeMarker({ x: 400, y: 3000 }, 800, 400, inset);
    expect(below.y).toBeCloseTo(370);
    expect(below.angle).toBeCloseTo(Math.PI / 2);
  });

  it('keeps a corner tank inside the inset box', () => {
    const s = placeMarker({ x: -900, y: -900 }, 800, 400, inset);
    expect(s.x).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(s.y).toBeGreaterThanOrEqual(50 - 1e-9);
    expect(s.x).toBeLessThan(400);
  });
});
