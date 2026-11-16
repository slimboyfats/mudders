import type { RenderSnapshot, TankView } from '@mudders/shared';

/**
 * End-of-match awards ("Best shot", "Most dirt moved", ...), counted from the snapshot stream the
 * renderer already gets, so hot-seat, online and replays agree and the sim never knows. Like the
 * hit callouts, everything that happens after a tank fires and before the next tank aims is
 * credited to that shooter.
 */

export interface PlayerStats {
  /** Damage dealt to other tanks over the match. */
  damage: number;
  /** Most damage to other tanks from one shot. */
  bestShot: number;
  kills: number;
  /** Longest distance in cells between shooter and a tank it killed. */
  longestKill: number;
  /** Earth cells blasted away or piled up during own shots. */
  dirt: number;
  /** Shots fired, and shots that hurt another tank. */
  shots: number;
  hits: number;
  /** Damage taken from anyone. */
  taken: number;
  /** Damage to itself. */
  self: number;
  /** Times it was left on 15 health or less by a shot and lived. */
  closeCalls: number;
}

export interface Award {
  id: string;
  title: string;
  player: number;
  /** What it was for: "62 damage in one shot". */
  detail: string;
}

/** Health left (of 100) after a shot that counts as a close call. */
export const CLOSE_CALL = 15;
/** Fewest shots before Sharp eye (hit rate, at least half the shots) counts. */
export const MIN_SHOTS = 3;

function empty(): PlayerStats {
  return {
    damage: 0,
    bestShot: 0,
    kills: 0,
    longestKill: 0,
    dirt: 0,
    shots: 0,
    hits: 0,
    taken: 0,
    self: 0,
    closeCalls: 0,
  };
}

export class MatchStats {
  readonly players = new Map<number, PlayerStats>();
  /** 1 per material cell that counts as earth (dirt, sand, rock, snow...), 0 for air, liquids, fire. */
  private readonly earth: Uint8Array;
  private copy = new Uint8Array(0);
  private width = 0;
  private prev = new Map<number, { health: number; alive: boolean }>();
  private lastTick = -1;
  private shooter = -1;
  private shooterX = 0;
  private aiming = false;
  /** This shot: damage to others, and per tank damage taken. */
  private shot = 0;
  private hurt = new Map<number, number>();

  /** `earth[cell] = 1` for every material cell that counts as dirt moved. */
  constructor(earth: Uint8Array) {
    this.earth = earth;
  }

  stats(player: number): PlayerStats {
    let p = this.players.get(player);
    if (!p) {
      p = empty();
      this.players.set(player, p);
    }
    return p;
  }

  ingest(s: RenderSnapshot): void {
    // rewound (replay, resync): what was counted no longer happened in this stream
    if (s.tick < this.lastTick) this.prev.clear();
    this.lastTick = s.tick;
    this.last = s;
    this.dirt(s);

    let active: TankView | undefined;
    for (const e of s.entities) if (e.kind === 'tank' && e.active) active = e;
    if (active && (!this.aiming || active.player !== this.shooter)) {
      this.endShot(s);
      this.shooter = active.player;
      this.shooterX = active.x;
    }
    if (active) this.shooterX = active.x;
    // a new aim after a shot went out: count it when the aim ends
    if (this.aiming && !active && this.shooter >= 0) this.stats(this.shooter).shots++;
    this.aiming = active !== undefined;
    const resolving = !this.aiming && this.shooter >= 0;

    for (const e of s.entities) {
      if (e.kind !== 'tank') continue;
      const was = this.prev.get(e.player);
      this.prev.set(e.player, { health: e.health, alive: e.alive });
      if (!was) continue;
      // a new round refills health: nothing to credit
      if (!was.alive && e.alive) continue;
      const d = Math.round(was.health) - Math.round(e.health);
      if (d > 0) {
        this.stats(e.player).taken += d;
        if (resolving) {
          this.hurt.set(e.player, (this.hurt.get(e.player) ?? 0) + d);
          if (e.player === this.shooter) this.stats(e.player).self += d;
          else {
            this.shot += d;
            this.stats(this.shooter).damage += d;
          }
        }
      }
      if (resolving && was.alive && !e.alive && e.player !== this.shooter) {
        const st = this.stats(this.shooter);
        st.kills++;
        st.longestKill = Math.max(st.longestKill, Math.round(Math.abs(e.x - this.shooterX)));
      }
    }
  }

  /** The shot is over (the next tank aims): settle its best-shot, hit and close-call counts. */
  private endShot(s: RenderSnapshot): void {
    if (this.shooter >= 0) {
      const st = this.stats(this.shooter);
      if (this.shot > 0) st.hits++;
      st.bestShot = Math.max(st.bestShot, this.shot);
      for (const e of s.entities) {
        if (e.kind !== 'tank' || !e.alive || !this.hurt.has(e.player)) continue;
        if (e.health <= (CLOSE_CALL * e.maxHealth) / 100) this.stats(e.player).closeCalls++;
      }
    }
    this.shot = 0;
    this.hurt.clear();
  }

  /** The latest snapshot, to close the last shot when the match ends (no one aims again). */
  private last: RenderSnapshot | null = null;

  /** Earth cells that changed inside the dirty rects, credited to the shooter while resolving. */
  private dirt(s: RenderSnapshot): void {
    const n = s.width * s.height;
    if (this.copy.length !== n || this.width !== s.width) {
      this.copy = new Uint8Array(s.terrain);
      this.width = s.width;
      return;
    }
    const credit = !this.aiming && this.shooter >= 0;
    const earth = this.earth;
    const copy = this.copy;
    const t = s.terrain;
    let moved = 0;
    for (const r of s.dirtyRects) {
      // a full-map refresh (late subscriber, resync) is a reload, not a blast
      const whole = r.w >= s.width && r.h >= s.height;
      for (let y = r.y; y < r.y + r.h; y++) {
        const row = y * s.width;
        for (let i = row + r.x, end = row + r.x + r.w; i < end; i++) {
          const now = t[i] ?? 0;
          const was = copy[i] ?? 0;
          if (now === was) continue;
          if (!whole && earth[now] !== earth[was]) moved++;
          copy[i] = now;
        }
      }
    }
    if (credit && moved > 0) this.stats(this.shooter).dirt += moved;
  }

  /** The awards for this match: one per kind that someone earned, in a fixed order. */
  awards(): Award[] {
    if (this.last && this.shooter >= 0) {
      this.endShot(this.last);
      this.shooter = -1;
    }
    const out: Award[] = [];
    const ids = [...this.players.keys()].sort((a, b) => a - b);
    const best = (
      id: string,
      title: string,
      value: (p: PlayerStats) => number,
      detail: (v: number, p: PlayerStats) => string,
      min = 1,
      ok: (p: PlayerStats) => boolean = () => true,
    ) => {
      let who = -1;
      let top = 0;
      for (const pl of ids) {
        const p = this.stats(pl);
        if (!ok(p)) continue;
        const v = value(p);
        if (v >= min && v > top) {
          top = v;
          who = pl;
        }
      }
      if (who >= 0) out.push({ id, title, player: who, detail: detail(top, this.stats(who)) });
    };
    best(
      'best-shot',
      'Best shot',
      (p) => p.bestShot,
      (v) => `${v} damage in one shot`,
    );
    best(
      'dirt',
      'Most dirt moved',
      (p) => p.dirt,
      (v) => `${v.toLocaleString('en')} cells of earth`,
      50,
    );
    best(
      'kills',
      'Most kills',
      (p) => p.kills,
      (v) => (v === 1 ? '1 tank wrecked' : `${v} tanks wrecked`),
    );
    best(
      'sniper',
      'Longest kill',
      (p) => p.longestKill,
      (v) => `from ${v} cells away`,
      1,
    );
    best(
      'aim',
      'Sharp eye',
      (p) => (p.hits * 1000) / p.shots,
      (_v, p) => `${p.hits} of ${p.shots} shots hit`,
      500,
      (p) => p.shots >= MIN_SHOTS,
    );
    best(
      'close',
      'Nine lives',
      (p) => p.closeCalls,
      (v) => (v === 1 ? 'lived through 1 close call' : `lived through ${v} close calls`),
    );
    best(
      'taken',
      'Punching bag',
      (p) => p.taken,
      (v) => `took ${v} damage`,
      20,
    );
    best(
      'self',
      'Own worst enemy',
      (p) => p.self,
      (v) => `${v} damage to itself`,
      10,
    );
    return out;
  }
}

/** The earth lookup for `MatchStats` from material manifests: solid ground that isn't burning. */
export function earthCells(
  materials: readonly { id: string; cell: number; settle?: string | undefined }[],
): Uint8Array {
  const earth = new Uint8Array(256);
  for (const m of materials) {
    const solid = m.settle === 'fall' || m.settle === 'slide' || m.settle === 'static';
    if (solid && !/fire|flame|burning|lit|magma|reactor/.test(m.id)) earth[m.cell & 255] = 1;
  }
  return earth;
}
