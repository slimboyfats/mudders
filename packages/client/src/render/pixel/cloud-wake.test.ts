import { describe, expect, it } from 'vitest';
import { cloudAt, CloudWake, skyAt, type CloudSky } from './cloud-wake';
import type { QuadBatch } from './batch';

const sky: CloudSky = {
  cover: 0.8,
  drift: 0,
  boil: 0,
  camX: 400,
  mapW: 800,
  mapH: 400,
  horizon: 240,
  offX: 0,
  offY: 400,
  light: 0xffffff,
  shadow: 0x808080,
  top: 0x102040,
  bottom: 0x6080a0,
};

/** Every map point with a cloud on it, on the scenery's 2-cell grid. */
function cloudCells(s: CloudSky): [number, number][] {
  const out: [number, number][] = [];
  for (let y = -100; y < 240; y += 2)
    for (let x = 0; x < 800; x += 2) if (cloudAt(x, y, s)) out.push([x, y]);
  return out;
}

function recorder(): { batch: QuadBatch; n: () => number } {
  let n = 0;
  const batch = { push: () => n++ } as unknown as QuadBatch;
  return { batch, n: () => n };
}

describe('cloud wake', () => {
  it('finds clouds only when the sky has some, and never below the decks', () => {
    expect(cloudAt(400, 50, { ...sky, cover: 0 })).toBe(0);
    const cells = cloudCells(sky);
    expect(cells.length).toBeGreaterThan(100);
    for (const [, y] of cells) expect(y).toBeLessThanOrEqual(240 * 0.7);
  });

  it('shifts the clouds with the drift', () => {
    const a = cloudCells(sky);
    const b = cloudCells({ ...sky, drift: 40 });
    expect(b).not.toEqual(a);
  });

  it('tears a cloud a shell flies through, and the tear heals', () => {
    const [cx, cy] = cloudCells(sky)[200]!;
    const w = new CloudWake();
    const solid = (): boolean => false;
    w.shell(1, cx - 6, cy, 0, sky, solid);
    w.shell(1, cx + 6, cy, 1, sky, solid);
    const early = recorder();
    w.draw(3, sky, early.batch);
    expect(early.n()).toBeGreaterThan(5);
    for (let t = 2; t < 200; t++) w.step(t, 0);
    const late = recorder();
    w.draw(200, sky, late.batch);
    expect(late.n()).toBe(0);
  });

  it('leaves open sky alone', () => {
    const w = new CloudWake();
    w.shell(1, 400, 300, 0, sky, () => false);
    w.shell(1, 410, 300, 1, sky, () => false);
    w.blast(400, 300, 20, 1, sky);
    const r = recorder();
    w.draw(3, sky, r.batch);
    expect(r.n()).toBe(0);
  });

  it('paints tunnels in the sky colour of their row', () => {
    expect(skyAt(-50, sky)).toBe(0x102040);
  });
});
