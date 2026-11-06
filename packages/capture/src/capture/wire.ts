import type { RenderSnapshot } from '@mudders/shared';
import type { WireSnapshot } from '@mudders/client/capture-wire';

/** Turn a sim snapshot into the compact message the capture page understands. */
export function toWire(s: RenderSnapshot): WireSnapshot {
  const patches: WireSnapshot['patches'] = [];
  for (const r of s.dirtyRects) {
    if (r.w <= 0 || r.h <= 0) continue;
    const buf = Buffer.alloc(r.w * r.h);
    const coat = Buffer.alloc(r.w * r.h);
    let coated = false;
    for (let row = 0; row < r.h; row++) {
      const start = (r.y + row) * s.width + r.x;
      buf.set(s.terrain.subarray(start, start + r.w), row * r.w);
      const c = s.coating.subarray(start, start + r.w);
      coat.set(c, row * r.w);
      if (!coated && c.some((v) => v !== 0)) coated = true;
    }
    // the coating layer rides along only when the patch has any (most frames have none)
    patches.push([
      r.x,
      r.y,
      r.w,
      r.h,
      buf.toString('base64'),
      coated ? coat.toString('base64') : '',
    ]);
  }
  const n = s.debris.count;
  return {
    tick: s.tick,
    turn: s.turn,
    patches,
    entities: s.entities,
    effectEvents: s.effectEvents,
    debris: {
      x: Array.from(s.debris.x.subarray(0, n)),
      y: Array.from(s.debris.y.subarray(0, n)),
      vx: Array.from(s.debris.vx.subarray(0, n)),
      m: Array.from(s.debris.material.subarray(0, n)),
    },
    wind: s.wind,
    theme: s.theme,
  };
}
