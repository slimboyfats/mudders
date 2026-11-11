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
    const shade = Buffer.alloc(r.w * r.h);
    let shaded = false;
    for (let row = 0; row < r.h; row++) {
      const start = (r.y + row) * s.width + r.x;
      buf.set(s.terrain.subarray(start, start + r.w), row * r.w);
      const c = s.coating.subarray(start, start + r.w);
      coat.set(c, row * r.w);
      if (!coated && c.some((v) => v !== 0)) coated = true;
      if (s.shade) {
        const g = s.shade.subarray(start, start + r.w);
        shade.set(g, row * r.w);
        if (!shaded && g.some((v) => v !== 0)) shaded = true;
      }
    }
    // the coating layer rides along only when the patch has any (most frames have none)
    patches.push([
      r.x,
      r.y,
      r.w,
      r.h,
      buf.toString('base64'),
      coated ? coat.toString('base64') : '',
      // and the grain shade of moved cells, when any moved
      shaded ? shade.toString('base64') : '',
    ]);
  }
  let gas: WireSnapshot['gas'];
  const g = s.gasRect;
  if (g && g.w > 0 && g.h > 0) {
    const buf = Buffer.alloc(g.w * g.h);
    for (let row = 0; row < g.h; row++) {
      const start = (g.y + row) * s.width + g.x;
      buf.set(s.gas.subarray(start, start + g.w), row * g.w);
    }
    gas = [g.x, g.y, g.w, g.h, buf.toString('base64')];
  }
  const n = s.debris.count;
  return {
    tick: s.tick,
    turn: s.turn,
    patches,
    ...(gas ? { gas } : {}),
    ...(s.processes ? { processes: s.processes } : {}),
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
    ...(s.weather ? { weather: s.weather } : {}),
    ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
    ...(s.deathZone ? { deathZone: s.deathZone } : {}),
    ...(s.preview ? { preview: s.preview } : {}),
    ...(s.birds ? { birds: [...s.birds] } : {}),
  };
}
