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
  private tracing = -1;
  private shooter = -1;
  private mapRound = -1;

  observe(w: World): void {
    if (w.round !== this.mapRound) {
      if (this.mapRound >= 0) this.clearPaths();
      this.mapRound = w.round;
    }
    if (w.phase !== 'resolve') {
      this.tracing = -1;
      return;
    }
    const p = w.activePlayer;
    const tank = w.tanks[p];
    if (!tank) return;
    if (w.turn !== this.countedTurn || w.round !== this.countedRound) {
      this.countedTurn = w.turn;
      this.countedRound = w.round;
      const shot: GhostShot = {
        angle: tank.angle,
        power: tank.power,
        weapon: w.weaponId(tank.weapon),
        path: [],
      };
      this.shots[p] = shot;
      this.shooter = p;
      this.tracing = -1;
      this.version++;
      this.onShot?.(p, shot);
    }
    const shot = this.shots[this.shooter];
    if (!shot) return;
    if (this.tracing < 0) {
      if (shot.path.length > 0) return;
      const q = w.projectiles.find((x) => x.alive && x.owner === this.shooter);
      if (!q) return;
      this.tracing = q.id;
    }
    const q = w.projectiles.find((x) => x.id === this.tracing);
    if (!q || !q.alive || shot.path.length >= MAX_POINTS) {
      this.tracing = -1;
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
