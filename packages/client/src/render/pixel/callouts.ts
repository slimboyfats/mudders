import type { RenderSnapshot, TankView } from '@mudders/shared';
import type { QuadBatch } from './batch';

/**
 * Hit callouts: every change in a tank's health floats up over it as a pixel number ("-38" in
 * yellow, "+20" in green), and the shot's big moments get a word over the tank they happened to
 * (KILL, DOUBLE KILL, SNIPED, DIRECT HIT, CLOSE CALL, OWN GOAL). Read only from the snapshots the
 * renderer already gets, so it works the same in hot-seat, online and replays, and never touches
 * the sim. Drawn in map cells with a hard 1-cell outline, popping in white and blinking out in
 * steps, so it stays on the pixel grid.
 */

/** Hits on one tank this close together (ticks) add up into one number. */
export const MERGE_TICKS = 45;
/** A number's life after its last hit, and a callout's life. */
export const NUMBER_TICKS = 100;
export const CALLOUT_TICKS = 140;
/** Damage from one shot on one tank that counts as a direct hit. */
export const DIRECT_HIT = 40;
/** Health left (of 100) that makes surviving a hit a close call. */
export const CLOSE_CALL = 12;
/** Damage to the shooter's own tank in one shot that counts as an own goal. */
export const OWN_GOAL = 15;
/** Distance in cells between shooter and victim that turns a kill into a snipe. */
export const SNIPE_CELLS = 500;

export type CalloutKind =
  'close' | 'direct' | 'own' | 'kill' | 'snipe' | 'double' | 'triple' | 'multi';

const WORDS: Record<CalloutKind, string> = {
  close: 'CLOSE CALL',
  direct: 'DIRECT HIT',
  own: 'OWN GOAL',
  kill: 'KILL',
  snipe: 'SNIPED',
  double: 'DOUBLE KILL',
  triple: 'TRIPLE KILL',
  multi: 'MULTI KILL',
};

/** Higher wins when two callouts want the same tank. */
const RANK: Record<CalloutKind, number> = {
  close: 1,
  direct: 2,
  own: 2,
  kill: 3,
  snipe: 4,
  double: 5,
  triple: 6,
  multi: 7,
};

const COLOR: Record<CalloutKind, number> = {
  close: 0x7ad8ff,
  direct: 0xffe14a,
  own: 0xff9a3a,
  kill: 0xff4a3a,
  snipe: 0x9affb0,
  double: 0xff5ad0,
  triple: 0xff5ad0,
  multi: 0xff5ad0,
};

export const DAMAGE_RGB = 0xffd84a;
export const SELF_RGB = 0xff9a3a;
export const HEAL_RGB = 0x6ef06e;

export interface HitNumber {
  player: number;
  /** Summed change: negative = damage, positive = repair. */
  amount: number;
  /** Shown in orange: the shooter hurt itself. */
  self: boolean;
  /** First and last tick a hit added to it. */
  born: number;
  last: number;
  x: number;
  y: number;
}

export interface Callout {
  player: number;
  kind: CalloutKind;
  born: number;
  x: number;
  y: number;
}

/** Turns the snapshot stream into hit numbers and callouts. Pure logic, no GL. */
export class CalloutTracker {
  readonly numbers: HitNumber[] = [];
  readonly callouts: Callout[] = [];
  private prev = new Map<number, { health: number; alive: boolean }>();
  private round = -1;
  private lastTick = -1;
  /** Player who aimed last (the shot being resolved is theirs), or -1. */
  private shooter = -1;
  private shooterX = 0;
  private aiming = false;
  /** This shot: kills by the shooter, damage per tank, and which callouts already went up. */
  private kills = 0;
  private dealt = new Map<number, number>();
  private said = new Set<string>();

  reset(): void {
    this.numbers.length = 0;
    this.callouts.length = 0;
    this.prev.clear();
    this.shooter = -1;
    this.aiming = false;
    this.newShot();
  }

  private newShot(): void {
    this.kills = 0;
    this.dealt.clear();
    this.said.clear();
  }

  ingest(s: RenderSnapshot): void {
    const round = Math.floor(s.turn / 1000);
    if (s.tick < this.lastTick || round !== this.round) this.reset();
    this.round = round;
    this.lastTick = s.tick;

    let active: TankView | undefined;
    for (const e of s.entities) if (e.kind === 'tank' && e.active) active = e;
    if (active) {
      if (!this.aiming || active.player !== this.shooter) this.newShot();
      this.shooter = active.player;
      this.shooterX = active.x;
    }
    this.aiming = active !== undefined;
    // the shot is in the air or settling: what happens now is the shooter's doing
    const resolving = !this.aiming && this.shooter >= 0;

    for (const e of s.entities) {
      if (e.kind !== 'tank') continue;
      const was = this.prev.get(e.player);
      this.prev.set(e.player, { health: e.health, alive: e.alive });
      if (!was) continue;
      const d = Math.round(e.health) - Math.round(was.health);
      const self = resolving && e.player === this.shooter;
      if (d !== 0 && (was.alive || e.alive)) this.addNumber(e, d, self && d < 0, s.tick);
      if (!resolving) continue;
      if (d < 0) {
        const total = (this.dealt.get(e.player) ?? 0) - d;
        this.dealt.set(e.player, total);
        if (self) {
          if (total >= OWN_GOAL) this.say(e, 'own', s.tick);
        } else if (e.alive) {
          if (e.health <= (CLOSE_CALL * e.maxHealth) / 100) this.say(e, 'close', s.tick);
          else if (total >= DIRECT_HIT) this.say(e, 'direct', s.tick);
        }
      }
      if (was.alive && !e.alive) {
        if (self) {
          this.say(e, 'own', s.tick);
        } else {
          this.kills++;
          const far = Math.abs(e.x - this.shooterX) >= SNIPE_CELLS;
          const kind: CalloutKind =
            this.kills >= 4
              ? 'multi'
              : this.kills === 3
                ? 'triple'
                : this.kills === 2
                  ? 'double'
                  : far
                    ? 'snipe'
                    : 'kill';
          this.say(e, kind, s.tick);
        }
      }
    }

    // follow the tanks (a number rides a falling tank down), then drop what has faded
    for (const n of this.numbers) {
      const t = this.tankOf(s, n.player);
      if (t) {
        n.x = t.x;
        n.y = t.y;
      }
    }
    for (const c of this.callouts) {
      const t = this.tankOf(s, c.player);
      if (t) {
        c.x = t.x;
        c.y = t.y;
      }
    }
    prune(this.numbers, (n) => s.tick - n.last > NUMBER_TICKS);
    prune(this.callouts, (c) => s.tick - c.born > CALLOUT_TICKS);
  }

  private tankOf(s: RenderSnapshot, player: number): TankView | undefined {
    for (const e of s.entities) if (e.kind === 'tank' && e.player === player) return e;
    return undefined;
  }

  private addNumber(t: TankView, d: number, self: boolean, tick: number): void {
    for (const n of this.numbers) {
      // keep adding while the hits keep coming, and never mix damage with repairs
      if (n.player === t.player && tick - n.last <= MERGE_TICKS && n.amount < 0 === d < 0) {
        n.amount += d;
        n.last = tick;
        n.self = n.self || self;
        return;
      }
    }
    this.numbers.push({
      player: t.player,
      amount: d,
      self,
      born: tick,
      last: tick,
      x: t.x,
      y: t.y,
    });
  }

  /** Each kind goes up once per tank per shot; a bigger one replaces what the tank shows. */
  private say(t: TankView, kind: CalloutKind, tick: number): void {
    const key = `${t.player}:${kind}`;
    if (this.said.has(key)) return;
    this.said.add(key);
    for (let i = 0; i < this.callouts.length; i++) {
      const c = this.callouts[i]!;
      if (c.player !== t.player) continue;
      if (RANK[c.kind] > RANK[kind]) return;
      this.callouts.splice(i, 1);
      break;
    }
    this.callouts.push({ player: t.player, kind, born: tick, x: t.x, y: t.y });
  }
}

function prune<T>(list: T[], gone: (v: T) => boolean): void {
  let j = 0;
  for (const v of list) if (!gone(v)) list[j++] = v;
  list.length = j;
}

/** 3×5 glyphs (M, N, W are 5 wide), '#' = lit. */
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '##.', '#.#', '.#.'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['.#.', '#.#', '.#.', '#.#', '.#.'],
  '9': ['.#.', '#.#', '.##', '..#', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['..', '..', '..', '..', '..'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

/** Width of `text` in glyph pixels (one blank column between glyphs). */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.[0]?.length ?? 3) + 1;
  return Math.max(0, w - 1);
}

/**
 * Draws `text` centred on column `cx` with its bottom row at `bottom`, each glyph pixel `px` cells
 * square, over a 1-cell black outline.
 */
export function drawText(
  b: QuadBatch,
  text: string,
  cx: number,
  bottom: number,
  px: number,
  rgb: number,
  alpha = 1,
): void {
  const x0 = Math.round(cx - (textWidth(text) * px) / 2);
  const y0 = Math.round(bottom - 5 * px);
  for (let pass = 0; pass < 2; pass++) {
    let x = x0;
    for (const ch of text) {
      const rows = GLYPHS[ch];
      if (!rows) {
        x += 4 * px;
        continue;
      }
      for (let r = 0; r < 5; r++) {
        const row = rows[r]!;
        for (let c = 0; c < row.length; c++) {
          if (row.charCodeAt(c) !== 35) continue; // '#'
          const gx = x + c * px;
          const gy = y0 + r * px;
          if (pass === 0) b.rect(gx - 1, gy - 1, px + 2, px + 2, 0x000000, 0.85 * alpha);
          else b.rect(gx, gy, px, px, rgb, alpha);
        }
      }
      x += (rows[0]!.length + 1) * px;
    }
  }
}

/** Glyph pixel size in map cells for a camera scale (device px per cell): readable when zoomed out. */
export function glyphCells(scale: number): number {
  return Math.max(1, Math.min(4, Math.round(5 / Math.max(0.25, scale))));
}

/** Stepped fade: full, then three hard steps down over the last `steps × 6` ticks. */
function fade(age: number, life: number): number {
  const left = life - age;
  if (left > 18) return 1;
  if (left <= 0) return 0;
  return Math.ceil(left / 6) / 4;
}

/** Above the health bar: tank row minus body, bar and the player-number plate. */
const LIFT = 16;

/** Labels already placed this frame (x0, y0, x1, y1 per label), so neighbours stack, never overlap. */
const placed: number[] = [];

/**
 * The bottom row for a `w`×`h` label centred on `cx` that wants to sit at `bottom`: moved up
 * above any label it would overlap, then recorded.
 */
function place(cx: number, bottom: number, w: number, h: number): number {
  const x0 = cx - w / 2 - 1;
  const x1 = cx + w / 2 + 1;
  let y = bottom;
  for (let moved = true, guard = 0; moved && guard < 16; guard++) {
    moved = false;
    for (let i = 0; i < placed.length; i += 4) {
      if (x1 <= placed[i]! || x0 >= placed[i + 2]!) continue;
      if (y <= placed[i + 1]! || y - h - 1 >= placed[i + 3]!) continue;
      y = placed[i + 1]! - 1;
      moved = true;
    }
  }
  placed.push(x0, y - h - 1, x1, y + 1);
  return y;
}

export function drawCallouts(
  b: QuadBatch,
  tracker: CalloutTracker,
  t: number,
  scale: number,
): void {
  const px = glyphCells(scale);
  placed.length = 0;
  for (const n of tracker.numbers) {
    const age = t - n.born;
    if (age < 0) continue;
    // rises a cell every 3 ticks for the first half second, then hangs
    const rise = Math.min(10, Math.floor(age / 3)) * Math.max(1, px >> 1);
    const a = fade(t - n.last, NUMBER_TICKS);
    if (a <= 0) continue;
    const text = n.amount < 0 ? `-${-n.amount}` : `+${n.amount}`;
    const rgb = n.amount > 0 ? HEAL_RGB : n.self ? SELF_RGB : DAMAGE_RGB;
    // a fresh hit pops white for a few ticks
    const pop = t - n.last < 4;
    const y = place(n.x, n.y - LIFT - rise, textWidth(text) * px, 5 * px);
    drawText(b, text, n.x, y, px, pop ? 0xffffff : rgb, a);
  }
  for (const c of tracker.callouts) {
    const age = t - c.born;
    if (age < 0) continue;
    const a = fade(age, CALLOUT_TICKS);
    if (a <= 0) continue;
    // pops in one size bigger and white, then settles; blinks with white for the first half second
    const big = age < 8 ? px + 1 : px;
    const blink = age < 30 && Math.floor(age / 5) % 2 === 0;
    const word = WORDS[c.kind];
    const lift = LIFT + 12 * px + 6 + Math.min(6, Math.floor(age / 4)) * Math.max(1, px >> 1);
    // lay out at the settled size so the stack doesn't jump when the pop ends
    const y = place(c.x, c.y - lift, textWidth(word) * px, 5 * px);
    drawText(b, word, c.x, y, big, blink ? 0xffffff : COLOR[c.kind], a);
  }
}
