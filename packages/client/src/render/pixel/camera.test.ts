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

  it('stops panning at the map edge, so the map always fills the screen', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    c.zoomBy(1);
    c.pan(-100000, -100000);
    // the map's bottom-right corner sits in the bottom-right corner of the screen
    expect(c.unproject({ x: 800, y: 400 }).x).toBeCloseTo(800);
    expect(c.unproject({ x: 800, y: 400 }).y).toBeCloseTo(400);
    c.pan(100000, 100000);
    expect(c.unproject({ x: 0, y: 0 }).x).toBeCloseTo(0);
    expect(c.unproject({ x: 0, y: 0 }).y).toBeCloseTo(0);
  });

  it('keeps the map centred along an axis where it fits the screen', () => {
    // 2:1 map on a wider 3:1 screen: the height fills, the width has bars at fit
    const c = new Camera(800, 400);
    c.setViewport(1200, 400, 1);
    c.zoomTo(1.2, { x: 600, y: 200 }, false);
    c.pan(-100000, -50);
    // 960 px of map on a 1200 px screen: it stays centred sideways but pans vertically
    expect(c.unproject({ x: 600, y: 200 }).x).toBeCloseTo(400);
    expect(c.cy).toBeGreaterThan(200);
  });
});

describe('Camera touch motion', () => {
  it('follows a pinch at fractional scales, then settles to a whole scale on DPR 1', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    const at = { x: 200, y: 100 };
    const m = c.unproject(at);
    c.zoomTo(2.4, at, false);
    expect(c.scale).toBeCloseTo(2.4);
    c.settle(at);
    for (let i = 0; i < 30; i++) c.update(16);
    expect(c.scale).toBe(2);
    const after = c.unproject(at);
    expect(Math.abs(after.x - m.x)).toBeLessThan(1);
    expect(Math.abs(after.y - m.y)).toBeLessThan(1);
  });

  it('keeps a fractional pinch scale on high-density screens', () => {
    const c = new Camera(800, 400);
    c.setViewport(400, 200, 3);
    c.zoomTo(4.3, { x: 100, y: 50 }, false);
    c.settle();
    c.update(500);
    expect(c.scale).toBeCloseTo(4.3);
  });

  it('glides wheel steps over several frames', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    c.glideBy(2);
    c.update(16);
    expect(c.scale).toBeGreaterThan(1);
    expect(c.scale).toBeLessThan(3);
    for (let i = 0; i < 30; i++) c.update(16);
    expect(c.scale).toBe(3);
    // a second step while gliding counts from the target, not the half-way scale
    c.glideBy(1);
    for (let i = 0; i < 30; i++) c.update(16);
    expect(c.scale).toBe(4);
  });

  it('flings with decaying momentum, and a touch stops it', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    c.zoomBy(3);
    const x0 = c.cx;
    c.fling(1, 0);
    c.update(16);
    const x1 = c.cx;
    expect(x1).toBeLessThan(x0);
    c.update(16);
    expect(x1 - c.cx).toBeLessThan(x0 - x1);
    c.hold();
    const x2 = c.cx;
    c.update(16);
    expect(c.cx).toBe(x2);
  });

  it('does not slide the whole-map view off the screen; fit recentres a zoomed view', () => {
    const c = new Camera(800, 400);
    c.setViewport(800, 400, 1);
    c.pan(300, 0);
    expect(c.unproject({ x: 400, y: 200 }).x).toBeCloseTo(400);
    c.zoomBy(1);
    c.pan(300, 0);
    expect(c.isFit).toBe(false);
    c.fit();
    expect(c.unproject({ x: 400, y: 200 }).x).toBeCloseTo(400);
  });
});
