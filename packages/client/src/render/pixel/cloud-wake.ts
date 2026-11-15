import type { QuadBatch as Batch } from './batch';

/**
 * Clouds that answer back (renderer only). The painted cumulus lives in the scenery shader, so
 * {@link cloudAt} repeats its maths on the CPU for single points. A shell that flies through a
 * cloud punches a tunnel (sky-coloured cells along its path that the cloud slowly fills back in)
 * and throws puffs of cloud out either side of it and ahead; a blast close to a cloud blows a
 * ragged hole and flings puffs outward. Puffs are single opaque cells in the cloud's own tones
 * that brake in the air, drift on the wind and drop out cell by cell, so they read as pixels and
 * clear within a couple of seconds.
 */

/** What the scenery shader was last painted with (see `paintScenery`). */
export interface CloudSky {
  cover: number;
  /** Drift in cells (`u_cloud.y`). */
  drift: number;
  /** Boil phase in steps (`u_boil`). */
  boil: number;
  camX: number;
  mapW: number;
  mapH: number;
  horizon: number;
  /** Scenery offsets (`u_off`): apron side and rows above the map. */
  offX: number;
  offY: number;
  light: number;
  shadow: number;
  top: number;
  bottom: number;
}

function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h & 1023) / 1023;
}

function vnoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let fx = px - ix;
  let fy = py - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}

/** The shader's `cumulus`: true where a puff of this deck covers (px, py). */
function cumulus(
  px: number,
  py: number,
  slotW: number,
  baseY: number,
  size: number,
  seed: number,
  sky: CloudSky,
): boolean {
  const cover = sky.cover;
  const j0 = Math.floor(px / slotW);
  for (let s = -1; s <= 1; s++) {
    const j = j0 + s;
    if (hash(j, seed) > cover * 1.25) continue;
    const w = slotW * size * (0.55 + 0.6 * hash(j, seed + 1)) * (0.7 + 0.5 * cover);
    const cx = j * slotW + slotW * 0.5 + (hash(j, seed + 2) - 0.5) * slotW * 0.4;
    const by = Math.floor(baseY - hash(j, seed + 3) * baseY * 0.25);
    if (py > by) continue;
    for (let i = 0; i < 12; i++) {
      const top = i >= 7;
      let t = top ? ((i - 7) / 4) * 0.6 - 0.3 : i / 6 - 0.5;
      t += (hash(j + i + 1, seed + 6) - 0.5) * 0.08;
      const hr = hash(j + i + 1, seed + 4);
      let r = top
        ? w * (0.13 + 0.09 * hr) * (1 - Math.abs(t) * 1.2)
        : w * (0.11 + 0.07 * hr) * (1 - Math.abs(t) * 0.8);
      let lift = top ? w * (0.13 + 0.1 * hash(j + i + 1, seed + 7)) * (1 - Math.abs(t) * 2) : 0;
      const beat = sky.boil * (0.17 + 0.05 * hr) + i * 1.3 + seed;
      r *= 1 + 0.05 * Math.sin(beat);
      lift += w * 0.012 * Math.sin(beat * 0.7 + 1);
      const ccx = cx + t * w;
      const ccy = by - r * (0.45 + 0.35 * hash(j + i + 1, seed + 5)) - lift;
      const lx = (px - ccx) / r;
      const ly = (py - ccy) / r;
      const rim =
        1 + (vnoise(px / 6 + seed + sky.boil * 0.09, py / 6 + seed + sky.boil * 0.06) - 0.5) * 0.3;
      if (rim - Math.hypot(lx, ly) > 0) return true;
    }
  }
  return false;
}

/**
 * Which cloud deck covers map point (x, y) as painted on screen: 0 none, 1 the high deck,
 * 2 the low (farther) one. Points are taken on the scenery's 2×2-cell art pixels.
 */
export function cloudAt(x: number, y: number, sky: CloudSky): number {
  if (sky.cover <= 0) return 0;
  const px = Math.floor((x + sky.offX) / 2) * 2 - sky.offX;
  const py = Math.floor((y + sky.offY) / 2) * 2 - sky.offY;
  const hz = Math.min(sky.horizon, sky.mapH * 0.85);
  const drift = Math.floor(sky.drift / 2) * 2;
  const dx = sky.camX - sky.mapW * 0.5;
  const qx = px - Math.floor((dx * 0.85) / 2) * 2 + drift;
  if (cumulus(qx, py, 190, hz * 0.44, 1, 21, sky)) return 1;
  const qx2 = px - Math.floor((dx * 0.9) / 2) * 2 + Math.floor((drift * 0.5) / 2) * 2;
  if (cumulus(qx2, py, 110, hz * 0.7, 0.8, 37, sky)) return 2;
  return 0;
}

/** The sky's own colour at map row y (the shader's banded gradient, without the dither seam). */
export function skyAt(y: number, sky: CloudSky): number {
  const k = Math.min(1, Math.max(0, y / sky.mapH));
  const q = Math.floor(k * k * (3 - 2 * k) * 24 + 0.5) / 24;
  const c = mixRgb(sky.top, sky.bottom, q);
  // the pale haze over the horizon, in its three steps
  const hz = Math.min(sky.horizon, sky.mapH * 0.85);
  const hk = Math.min(1, Math.max(0, (y - hz * 0.5) / (hz * 0.5)));
  return mixRgb(c, mixRgb(sky.bottom, 0xffffff, 0.3), (Math.floor(hk * 3 + 0.5) / 3) * 0.55);
}

function mixRgb(a: number, b: number, t: number): number {
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

const PUFFS = 1536;
const HOLES = 768;
/** Ticks a tunnel cell stays open before the cloud has filled it back in. */
const HOLE_LIFE = 70;

export class CloudWake {
  // puffs: position, velocity, birth tick, life, tone (0 light .. 3 shadow)
  private readonly px = new Float32Array(PUFFS);
  private readonly py = new Float32Array(PUFFS);
  private readonly vx = new Float32Array(PUFFS);
  private readonly vy = new Float32Array(PUFFS);
  private readonly pb = new Int32Array(PUFFS);
  private readonly pl = new Uint8Array(PUFFS);
  private readonly pt = new Uint8Array(PUFFS);
  private pn = 0;
  // tunnel and blast holes: centre, birth tick, radius
  private readonly hx = new Float32Array(HOLES);
  private readonly hy = new Float32Array(HOLES);
  private readonly hb = new Int32Array(HOLES);
  private readonly hr = new Uint8Array(HOLES);
  /** Which cells of the hole's diamond lay over painted cloud when it opened (bit per cell). */
  private readonly hm = new Uint32Array(HOLES);
  private hn = 0;
  private readonly last = new Map<number, { x: number; y: number; seen: number; deck: number }>();
  private live = 0;
  private tones = [0xffffff, 0xe0e0e0, 0xc0c0c0, 0x808080];

  /** Set the four puff tones from the theme's cloud light and shadow. */
  setTones(light: number, shadow: number): void {
    this.tones = [
      light,
      mixRgb(light, shadow, 0.22),
      mixRgb(light, shadow, 0.5),
      mixRgb(light, shadow, 0.8),
    ];
  }

  clear(): void {
    this.pn = 0;
    this.hn = 0;
    this.live = 0;
    this.last.clear();
  }

  private puff(
    x: number,
    y: number,
    vx: number,
    vy: number,
    tick: number,
    life: number,
    tone: number,
  ): void {
    const i = this.pn % PUFFS;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.pb[i] = tick;
    this.pl[i] = life;
    this.pt[i] = tone;
    this.pn++;
  }

  private hole(x: number, y: number, r: number, tick: number, sky: CloudSky): void {
    const i = this.hn % HOLES;
    const cx = Math.floor(x) + 0.5;
    const cy = Math.floor(y) + 0.5;
    // a tunnel never cuts into open sky: remember which of its cells lie over the cloud
    let mask = 0;
    let bit = 0;
    for (let oy = -r; oy <= r; oy++) {
      const w = r - Math.abs(oy);
      for (let ox = -w; ox <= w; ox++, bit++) {
        if (cloudAt(cx + ox, cy + oy, sky) !== 0) mask |= 1 << bit;
      }
    }
    this.hx[i] = cx;
    this.hy[i] = cy;
    this.hr[i] = r;
    this.hb[i] = tick;
    this.hm[i] = mask;
    this.hn++;
  }

  /**
   * One tick of shell `id` at (x, y): where its move this tick crossed a cloud, punch the
   * tunnel and throw puffs. `solid` says whether a map cell is ground (clouds behind it don't
   * show, so they don't answer either).
   */
  shell(
    id: number,
    x: number,
    y: number,
    tick: number,
    sky: CloudSky,
    solid: (x: number, y: number) => boolean,
  ): void {
    const was = this.last.get(id);
    const prevDeck = was?.deck ?? 0;
    const now = { x, y, seen: tick, deck: 0 };
    this.last.set(id, now);
    if (sky.cover <= 0 || !was) return;
    const dx = x - was.x;
    const dy = y - was.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01 || len > 40) return;
    const ux = dx / len;
    const uy = dy / len;
    const steps = Math.min(12, Math.ceil(len / 1.5));
    let r = (Math.imul(tick + 1, 2654435761) ^ Math.imul(id + 1, 40503)) >>> 0;
    const next = (): number => {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return r;
    };
    // a fast shell tears harder
    const force = Math.min(1.6, 0.4 + len * 0.15);
    let inside = prevDeck;
    for (let k = 1; k <= steps; k++) {
      const sx = was.x + (dx * k) / steps;
      const sy = was.y + (dy * k) / steps;
      const deck = solid(Math.floor(sx), Math.floor(sy)) ? 0 : cloudAt(sx, sy, sky);
      if (deck !== inside) {
        // punching in or out through the cloud's skin: a burst of puffs, mostly forward
        this.live = tick;
        const d = deck || inside;
        for (let i = 0; i < 12; i++) {
          const s = next();
          const spread = (((s & 15) - 7.5) / 7.5) * 0.9;
          const sp = (0.35 + ((s >>> 4) & 7) * 0.07) * force * (deck === 0 ? 1 : 0.6);
          const dir = deck === 0 ? 1 : -0.4;
          this.puff(
            sx,
            sy,
            (ux * dir - uy * spread) * sp,
            (uy * dir + ux * spread) * sp,
            tick,
            50 + ((s >>> 7) & 31),
            d === 2 ? 1 + ((s >>> 12) & 1) : (s >>> 12) & 1,
          );
        }
        inside = deck;
      }
      if (deck === 0) continue;
      this.live = tick;
      this.hole(sx, sy, deck === 1 ? 3 : 2, tick, sky);
      // puffs: torn off either side of the path and dragged along behind the shell
      const n = deck === 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const s = next();
        const side = (s & 1) === 0 ? 1 : -1;
        const out = (0.3 + ((s >>> 1) & 7) * 0.06) * force;
        const along = (0.1 + ((s >>> 4) & 7) * 0.06) * force;
        this.puff(
          sx - uy * side * 1.5,
          sy + ux * side * 1.5,
          -uy * side * out + ux * along,
          ux * side * out + uy * along,
          tick,
          45 + ((s >>> 7) & 31),
          deck === 2 ? 1 + ((s >>> 12) & 1) : (s >>> 12) & 1,
        );
      }
    }
    now.deck = inside;
  }

  /** A blast at (x, y) with radius `radius`: blow a hole in any cloud it reaches, fling puffs out. */
  blast(x: number, y: number, radius: number, tick: number, sky: CloudSky): void {
    if (sky.cover <= 0) return;
    const reach = radius * 2.2 + 6;
    let r = (Math.imul(tick + 5, 2654435761) ^ Math.imul(Math.floor(x) + 3, 40503)) >>> 0;
    const next = (): number => {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return r;
    };
    // sample rings round the blast; every cloud point the push reaches answers
    for (let ring = 1; ring <= 4; ring++) {
      const d = (reach * ring) / 4;
      const n = 8 + ring * 6;
      for (let i = 0; i < n; i++) {
        const a = ((i + (ring & 1) * 0.5) / n) * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const sx = x + cx * d;
        const sy = y + cy * d;
        const deck = cloudAt(sx, sy, sky);
        if (deck === 0) continue;
        this.live = tick;
        const push = (1.2 - ring * 0.22) * Math.min(1.5, 0.5 + radius / 25);
        if (ring <= 3) this.hole(sx, sy, deck === 1 ? 3 : 2, tick, sky);
        for (let k = 0; k < 2; k++) {
          const s = next();
          const sp = push * (0.5 + ((s & 7) / 7) * 0.6);
          this.puff(
            sx + (((s >>> 3) & 3) - 1.5),
            sy + (((s >>> 5) & 3) - 1.5),
            cx * sp,
            cy * sp - 0.05,
            tick,
            50 + ((s >>> 7) & 31),
            deck === 2 ? 2 + ((s >>> 12) & 1) : (s >>> 12) % 3,
          );
        }
      }
    }
  }

  /** Move the puffs one tick: they brake hard in the air and drift downwind. */
  step(tick: number, wind: number): void {
    for (const [id, l] of this.last) if (l.seen < tick - 2) this.last.delete(id);
    if (tick - this.live > 120) return;
    const n = Math.min(this.pn, PUFFS);
    for (let i = 0; i < n; i++) {
      if (tick - this.pb[i]! > this.pl[i]!) continue;
      this.vx[i] = this.vx[i]! * 0.9 + wind * 0.6;
      this.vy[i] = this.vy[i]! * 0.9 - 0.002;
      this.px[i] = this.px[i]! + this.vx[i]!;
      this.py[i] = this.py[i]! + this.vy[i]!;
    }
  }

  /**
   * Draw the tunnels (sky-coloured cells the cloud fills back in from the rim, cell by cell) and
   * the puffs (opaque cloud-tone cells that drop out as they age).
   */
  draw(tick: number, sky: CloudSky, b: Batch): void {
    // tunnels and puffs are drawn in map cells over the painted sky
    if (tick - this.live > 120) return;
    const nh = Math.min(this.hn, HOLES);
    for (let i = 0; i < nh; i++) {
      const age = tick - this.hb[i]!;
      if (age < 0 || age > HOLE_LIFE) continue;
      const f = age / HOLE_LIFE;
      const rad = this.hr[i]!;
      const x = this.hx[i]!;
      const y = this.hy[i]!;
      const mask = this.hm[i]!;
      let bit = 0;
      for (let oy = -rad; oy <= rad; oy++) {
        const w = rad - Math.abs(oy);
        for (let ox = -w; ox <= w; ox++, bit++) {
          if ((mask & (1 << bit)) === 0) continue;
          // rim cells fill in first, the middle last
          const edge = (Math.abs(ox) + Math.abs(oy)) / (rad + 1);
          const h = (Math.imul(i * 97 + ox * 31 + oy * 17 + 5, 2654435761) >>> 0) & 1023;
          if (f > (1 - edge * 0.6) * (0.6 + (h / 1023) * 0.4)) continue;
          b.push(x + ox, y + oy, 1, 1, skyAt(y + oy, sky), 1);
        }
      }
    }
    const np = Math.min(this.pn, PUFFS);
    for (let i = 0; i < np; i++) {
      const age = tick - this.pb[i]!;
      const life = this.pl[i]!;
      if (age < 0 || age > life) continue;
      const f = age / life;
      const h = (Math.imul(i + 13, 2654435761) >>> 0) & 1023;
      if (f > 0.3 && (h / 1023) * 0.7 + 0.3 < f) continue;
      const tone = Math.min(3, this.pt[i]! + (f > 0.6 ? 1 : 0));
      const x = Math.floor(this.px[i]!) + 0.5;
      const y = Math.floor(this.py[i]!) + 0.5;
      b.push(x, y, 1, 1, this.tones[tone]!, 1);
      // young puffs are 2×2 lumps, so the first burst reads as cloud, not dust
      if (f < 0.55 && (h & 1) === 0) b.push(x + 1, y, 1, 1, this.tones[tone]!, 1);
      if (f < 0.45 && (h & 6) !== 0) b.push(x, y + 1, 1, 1, this.tones[Math.min(3, tone + 1)]!, 1);
      if (f < 0.3 && (h & 8) === 0)
        b.push(x + 1, y + 1, 1, 1, this.tones[Math.min(3, tone + 1)]!, 1);
    }
  }
}
