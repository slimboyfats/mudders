import { FP, type World } from '@mudders/sim';

/** One player's last shot: the aim it left with and the path of its first shell. */
export interface GhostShot {
  angle: number;
  power: number;
  weapon: string;
  /** Flat map-cell x, y pairs, oldest first. Empty until the shell is seen. */
  path: number[];
}

/** Longest path kept, in points (a shell that circles for a minute stops being recorded). */
const MAX_POINTS = 2400;

/**
 * Last-shot ghost (matches): remembers, for every player, the aim of their previous shot and the
 * path its first shell flew, so the next turn can be judged against it. Fed the world after
 * every tick; reads only, never touches the sim. Training has its own three-path version.
 */
export class ShotGhost {
  readonly shots: (GhostShot | null)[] = [];
  /** Bumped whenever a path or an aim changes (the overlay redraws on it). */
  version = 0;
  /** Called once per shot as it leaves the barrel. */
  onShot: ((player: number, shot: GhostShot) => void) | null = null;
  private countedTurn = -1;
  private countedRound = -1;
  /** Per player: id of the shell whose path is being recorded, or -1. */
  private tracing: number[] = [];
  /** Players who fired this turn: the active one, or everyone who fired in a volley. */
  private shooters: number[] = [];
  private mapRound = -1;

  observe(w: World): void {
    if (w.round !== this.mapRound) {
      if (this.mapRound >= 0) this.clearPaths();
      this.mapRound = w.round;
    }
    if (w.phase !== 'resolve') {
      this.tracing.length = 0;
      return;
    }
    if (w.turn !== this.countedTurn || w.round !== this.countedRound) {
      const shooters: number[] = [];
      if (w.volley) {
        for (const t of w.tanks) {
          if (w.projectiles.some((q) => q.owner === t.player)) shooters.push(t.player);
        }
      } else if (w.tanks[w.activePlayer]) shooters.push(w.activePlayer);
      if (shooters.length === 0) return;
      this.countedTurn = w.turn;
      this.countedRound = w.round;
      this.shooters = shooters;
      for (const p of shooters) {
        const tank = w.tanks[p];
        if (!tank) continue;
        const shot: GhostShot = {
          angle: tank.angle,
          power: tank.power,
          weapon: w.weaponId(tank.weapon),
          path: [],
        };
        this.shots[p] = shot;
        this.tracing[p] = -1;
        this.onShot?.(p, shot);
      }
      this.version++;
    }
    for (const p of this.shooters) this.trace(w, p);
  }

  /** Follow player `p`'s first shell of the turn one more tick. */
  private trace(w: World, p: number): void {
    const shot = this.shots[p];
    if (!shot) return;
    if ((this.tracing[p] ?? -1) < 0) {
      if (shot.path.length > 0) return;
      const q = w.projectiles.find((x) => x.alive && x.owner === p);
      if (!q) return;
      this.tracing[p] = q.id;
    }
    const q = w.projectiles.find((x) => x.id === this.tracing[p]);
    if (!q || !q.alive || shot.path.length >= MAX_POINTS) {
      this.tracing[p] = -1;
      return;
    }
    shot.path.push(Math.floor(q.x / FP), Math.floor(q.y / FP));
    this.version++;
  }

  /** A new round is a new map: old paths no longer mean anything, the aims still do. */
  clearPaths(): void {
    for (const s of this.shots) if (s) s.path = [];
    this.version++;
  }
}
