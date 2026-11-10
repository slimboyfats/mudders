import { describe, expect, it } from 'vitest';
import type { EntityView, RenderSnapshot } from '@mudders/shared';
import { ProcessMeter } from './process-meter';

const W = 16;
const H = 8;
const FIRE = 5;
const LAVA = 6;
const WATER = 7;

function snap(
  tick: number,
  terrain: Uint8Array,
  dirty: RenderSnapshot['dirtyRects'],
  entities: EntityView[] = [],
): RenderSnapshot {
  return {
    tick,
    turn: 0,
    width: W,
    height: H,
    terrain,
    coating: new Uint8Array(W * H),
    dirtyRects: dirty,
    entities,
    effectEvents: [],
    debris: {
      count: 0,
      x: new Int32Array(0),
      y: new Int32Array(0),
      vx: new Int32Array(0),
      material: new Uint8Array(0),
    },
    wind: 0,
    theme: 'theme.default',
  };
}

function meter(): ProcessMeter {
  const flags = new Uint8Array(256);
  flags[FIRE] = 4;
  flags[LAVA] = 2;
  const m = new ProcessMeter(W, H);
  m.setLooks(flags, [WATER, LAVA]);
  return m;
}

describe('process meter', () => {
  it('counts burning cells and molten cells open to the air', () => {
    const t = new Uint8Array(W * H);
    t.fill(1, 6 * W);
    t.fill(FIRE, 5 * W, 5 * W + 4);
    t.fill(LAVA, 5 * W + 8, 5 * W + 11);
    t[6 * W + 8] = LAVA; // buried under lava: not bubbling
    const c = meter().update(snap(0, t, []));
    expect(c.burning).toBe(4);
    expect(c.boiling).toBe(3);
    expect(c.flowing).toBe(0);
  });

  it('counts liquid that moves inside changed rects, and fades once it stops', () => {
    const m = meter();
    const t = new Uint8Array(W * H);
    t.fill(WATER, 2 * W, 2 * W + 6);
    m.update(snap(0, t, []));
    // the run of water falls one row
    t.fill(0, 2 * W, 2 * W + 6);
    t.fill(WATER, 3 * W, 3 * W + 6);
    const moving = m.update(snap(1, t, [{ x: 0, y: 2, w: 6, h: 2 }])).flowing;
    expect(moving).toBeGreaterThan(0);
    let c = moving;
    for (let i = 2; i < 60; i++) c = m.update(snap(i, t, [])).flowing;
    expect(c).toBe(0);
  });

  it('a new whole map is not a flood', () => {
    const m = meter();
    const t = new Uint8Array(W * H);
    m.update(snap(0, t, []));
    t.fill(WATER, 4 * W);
    expect(m.update(snap(1, t, [{ x: 0, y: 0, w: W, h: H }])).flowing).toBe(0);
  });

  it('hears gas clouds, fresh ones louder, and takes sim counts when larger', () => {
    const t = new Uint8Array(W * H);
    const gas = (age: number): EntityView => ({
      kind: 'zone',
      x: 8,
      y: 4,
      radius: 10,
      look: 'gas',
      turns: 3,
      age,
    });
    const fresh = meter().update(snap(0, t, [], [gas(0)])).gassing;
    const old = meter().update(snap(0, t, [], [gas(5000)])).gassing;
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
    const s = snap(0, t, []);
    s.processes = { quenching: 9, burning: 2 };
    const c = meter().update(s);
    expect(c.quenching).toBe(9);
    expect(c.burning).toBe(2);
  });
});
