/**
 * The land past the map edges (render-only, the sim never sees it). The battlefield is the map;
 * the view can still show what lies beyond it, so at the start of each round the renderer grows
 * the map into a bigger "apron" grid: the same ground carrying on to the left and right with its
 * own rolling skyline (lakes that touch an edge carry on too), and down below the bottom row.
 * Nothing in it is a reflection of the map. The terrain shader shades it like the map itself.
 *
 * Layout: an `width × height` grid with the map copied in at (`side`, 0); `side` columns on each
 * side and `below` rows under the map.
 */
export interface Apron {
  side: number;
  below: number;
  width: number;
  height: number;
  cells: Uint8Array;
}

/** Apron margins for a map: at least half the map each way, so a view centred on any edge at the
 * fit zoom never runs out of it (beyond, the shader folds back into the apron). Even, so the 2×2
 * art pixels line up with the map's. */
export function apronSize(w: number, h: number): { side: number; below: number } {
  const even = (n: number): number => Math.ceil(n / 2) * 2;
  return { side: even(Math.max(128, w * 0.6)), below: even(Math.max(96, h * 0.6)) };
}

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in -1..1, knots every `seg` cells. */
function vnoise(x: number, seg: number, seed: number): number {
  const i = Math.floor(x / seg);
  const t = x / seg - i;
  const s = t * t * (3 - 2 * t);
  const a = hash(i, seed) * 2 - 1;
  const b = hash(i + 1, seed) * 2 - 1;
  return a + (b - a) * s;
}

/**
 * Build the apron for `terrain` (`w × h`). `solidTop` marks materials a column's ground starts at
 * (topsoil: dirt, sand, snow...); `liquid` marks liquids. Both are 256-entry flag tables.
 */
export function buildApron(
  terrain: Uint8Array,
  w: number,
  h: number,
  solidTop: Uint8Array,
  liquid: Uint8Array,
  out?: Apron,
): Apron {
  const { side, below } = apronSize(w, h);
  const W = w + side * 2;
  const H = h + below;
  const cells = out && out.cells.length === W * H ? out.cells.fill(0) : new Uint8Array(W * H);
  for (let y = 0; y < h; y++) cells.set(terrain.subarray(y * w, y * w + w), y * W + side);

  // the ground of a map column: the first cell with a solid block under it, three columns wide
  // (toward the map's middle) and ten rows deep, so a tree crown or trunk doesn't count; failing
  // that, the first topsoil cell
  const solid = (x: number, y: number): boolean => {
    const m = terrain[y * w + x]!;
    return m !== 0 && liquid[m] === 0;
  };
  const surfaceOf = (x: number): number => {
    const inward = x < w / 2 ? 1 : -1;
    let top = -1;
    for (let y = 0; y < h; y++) {
      if (!solid(x, y)) continue;
      if (top < 0 && solidTop[terrain[y * w + x]!]) top = y;
      let ok = y + 10 <= h;
      for (let k = 0; ok && k < 10; k++) {
        for (let i = 0; i < 3; i++) {
          const xx = Math.max(0, Math.min(w - 1, x + inward * i));
          if (!solid(xx, y + k)) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return y;
    }
    return top < 0 ? h : top;
  };
  // the deepest solid material of a column (what the ground under the map is made of)
  const deepOf = (x: number, fallback: number): number => {
    for (let y = h - 1; y >= Math.max(0, h - 24); y--) {
      const m = terrain[y * w + x]!;
      if (m !== 0 && !liquid[m]) return m;
    }
    return fallback;
  };
  // the commonest solid material in the bottom rows: the fallback for open or flooded columns
  let common = 0;
  {
    const counts = new Uint32Array(256);
    for (let y = Math.max(0, h - 4); y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = terrain[y * w + x]!;
        if (m !== 0 && !liquid[m]) counts[m]!++;
      }
    }
    for (let m = 1; m < 256; m++) if (counts[m]! > counts[common]!) common = m;
  }

  // relief: how far the map's skyline swings, so the land beyond rolls about as much
  const surf = new Int32Array(w);
  let lo = h;
  let hi = 0;
  for (let x = 0; x < w; x++) {
    const s = surfaceOf(x);
    surf[x] = s;
    if (s < h) {
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  }
  const amp = Math.max(6, Math.min(h * 0.22, (hi - lo) * 0.5));

  for (const dir of [-1, 1] as const) {
    const ex = dir < 0 ? 0 : w - 1;
    const s0 = surf[ex]!;
    const seed = dir < 0 ? 11 : 23;
    // a lake or sea against this edge carries on out to its own shore
    let waterTop = -1;
    let water = 0;
    for (let y = 0; y < Math.min(h, s0); y++) {
      const m = terrain[y * w + ex]!;
      if (liquid[m]) {
        waterTop = y;
        water = m;
        break;
      }
    }
    // a column with no ground at all (open sky to the bottom, floating islands) carries on open
    if (s0 >= h) {
      for (let k = 1; k <= side; k++) {
        const ax = dir < 0 ? side - k : side + w - 1 + k;
        for (let y = h; y < H; y++) cells[y * W + ax] = 0;
      }
      continue;
    }
    for (let k = 1; k <= side; k++) {
      const ax = dir < 0 ? side - k : side + w - 1 + k;
      // skyline: starts level with the edge and rolls further from it, in two octaves; the
      // first few dozen columns ease in so there is no step at the edge
      const ease = Math.min(1, k / 48);
      const n = vnoise(k, 56, seed) * 0.75 + vnoise(k, 17, seed + 1) * 0.25;
      const n0 = vnoise(0, 56, seed) * 0.75 + vnoise(0, 17, seed + 1) * 0.25;
      let s = Math.round(s0 + (n - n0) * amp * ease);
      s = Math.max(Math.round(h * 0.08), Math.min(h - 8, s));
      // the ground's layers come from a map column some way in (wandering, never a mirror of
      // the edge), shifted to the new surface; caves and lakes in it fill with the layer above
      const src = Math.max(
        0,
        Math.min(
          w - 1,
          ex - dir * Math.floor((0.5 + 0.5 * vnoise(k, 31, seed + 2)) * Math.min(w - 1, 160)),
        ),
      );
      const ss = surf[src]! < h ? surf[src]! : s0;
      const deep = deepOf(src, common);
      let last = terrain[ss * w + src] ?? deep;
      if (last === 0 || liquid[last]) last = deep;
      for (let y = s; y < H; y++) {
        const sy = ss + (y - s);
        let m = sy < h ? terrain[sy * w + src]! : deep;
        if (m === 0 || liquid[m]) m = last;
        else last = m;
        cells[y * W + ax] = m;
      }
      if (waterTop >= 0) for (let y = waterTop; y < s; y++) cells[y * W + ax] = water;
    }
  }

  // under the map: each column carries on in its deepest material, its source wandering a few
  // columns side to side going down so neighbouring layers don't run as straight walls
  const bottom = new Uint8Array(w);
  for (let x = 0; x < w; x++) bottom[x] = deepOf(x, common);
  for (let y = h; y < H; y++) {
    const off = Math.round(vnoise(y, 23, 41) * 6);
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(w - 1, x + off));
      cells[y * W + side + x] = bottom[sx]!;
    }
  }
  return { side, below, width: W, height: H, cells };
}
