import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  it('fits at an integer scale on standard-density screens', () => {
    const c = new Camera(800, 400);
    c.setViewport(1366, 675, 1);
    expect(c.scale).toBe(1);
    expect(c.isFit).toBe(true);
    c.setViewport(1700, 900, 1);
    expect(c.scale).toBe(2);
  });

  it('uses a fractional fit on high-density screens', () => {
    const c = new Camera(800, 400);
    c.setViewport(750, 240, 3);
    expect(c.scale).toBeCloseTo(1.8);
  });

  it('round-trips project/unproject and keeps the point under the cursor when zooming', () => {
    const c = new Camera(800, 400);
    c.setViewport(1600, 800, 1);
    const p = { x: 300, y: 120 };
    const m = c.unproject(p);
    const back = c.project(m);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
    c.zoomBy(1, p);
    expect(c.scale).toBe(3);
    const after = c.unproject(p);
    expect(Math.abs(after.x - m.x)).toBeLessThan(1);
    expect(Math.abs(after.y - m.y)).toBeLessThan(1);
    expect(c.isFit).toBe(false);
    c.zoomBy(-5);
    expect(c.scale).toBe(2);
    expect(c.isFit).toBe(true);
  });

  it('keeps the map on screen while panning', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    c.zoomBy(1);
    c.pan(-100000, -100000);
    expect(c.unproject({ x: 800, y: 400 }).x).toBeCloseTo(800);
    expect(c.unproject({ x: 800, y: 400 }).y).toBeCloseTo(400);
  });
});
