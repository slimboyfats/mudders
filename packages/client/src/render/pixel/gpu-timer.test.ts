import { describe, expect, it } from 'vitest';
import { GpuTimer } from './gpu-timer';

const TIME = 0x88bf;
const DISJOINT = 0x8fbb;
const AVAILABLE = 0x8867;
const RESULT = 0x8866;

/** A stand-in for the GL calls the timer makes: each query "costs" what `cost` says, in ms. */
function fakeGl(ext: boolean, cost: (n: number) => number) {
  let made = 0;
  let open: { id: number; ready: boolean } | null = null;
  const state = { disjoint: false, late: false, opened: 0, nested: false, deleted: 0 };
  const gl = {
    QUERY_RESULT_AVAILABLE: AVAILABLE,
    QUERY_RESULT: RESULT,
    getExtension: () => (ext ? { TIME_ELAPSED_EXT: TIME, GPU_DISJOINT_EXT: DISJOINT } : null),
    createQuery: () => ({ id: made++, ready: false }),
    deleteQuery: () => void state.deleted++,
    beginQuery: (_t: number, q: { id: number; ready: boolean }) => {
      if (open) state.nested = true;
      open = q;
      q.ready = false;
      state.opened++;
    },
    endQuery: () => {
      if (open) open.ready = true;
      open = null;
    },
    getParameter: () => state.disjoint,
    getQueryParameter: (q: { id: number; ready: boolean }, what: number) =>
      what === AVAILABLE ? q.ready && !state.late : cost(q.id) * 1e6,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, state };
}

describe('GpuTimer', () => {
  it('does nothing and reports nothing where the browser has no timer', () => {
    const { gl, state } = fakeGl(false, () => 1);
    const t = new GpuTimer(gl, 3);
    expect(t.available).toBe(false);
    expect(t.enable(true)).toBe(false);
    t.begin(0);
    t.frameEnd();
    expect(state.opened).toBe(0);
    expect(t.take()).toBeNull();
  });

  it('makes no queries until it is switched on', () => {
    const { gl, state } = fakeGl(true, () => 1);
    const t = new GpuTimer(gl, 3);
    t.begin(0);
    t.frameEnd();
    expect(state.opened).toBe(0);
    expect(t.take()).toBeNull();
  });

  it('sums each part and averages over the frames, one query at a time', () => {
    const { gl, state } = fakeGl(true, () => 2);
    const t = new GpuTimer(gl, 3);
    expect(t.enable(true)).toBe(true);
    for (let f = 0; f < 4; f++) {
      t.begin(0);
      t.begin(2);
      t.begin(0);
      t.frameEnd();
    }
    expect(state.nested).toBe(false);
    expect(t.take()).toEqual([4, 0, 2]);
    // taken: the next span starts empty
    t.frameEnd();
    expect(t.take()).toBeNull();
  });

  it('waits for late results and throws away interrupted ones', () => {
    const { gl, state } = fakeGl(true, () => 3);
    const t = new GpuTimer(gl, 2);
    t.enable(true);
    state.late = true;
    t.begin(1);
    t.frameEnd();
    expect(t.take()).toBeNull();
    state.late = false;
    t.frameEnd();
    expect(t.take()).toEqual([0, 3]);
    state.disjoint = true;
    t.begin(1);
    t.frameEnd();
    expect(t.take()).toBeNull();
  });

  it('gives up on queries that never answer', () => {
    const { gl, state } = fakeGl(true, () => 1);
    const t = new GpuTimer(gl, 1);
    t.enable(true);
    state.late = true;
    for (let f = 0; f < 200; f++) {
      t.begin(0);
      t.frameEnd();
    }
    t.dispose();
    expect(state.deleted).toBeLessThanOrEqual(66);
  });
});
