import type { Input, RenderSnapshot } from '@mudders/shared';
import {
  TICK_RATE,
  World,
  type ResolvedContent,
  type RoundResult,
  type WorldOptions,
} from '@mudders/sim';
import type { SnapshotStream } from '../render/types';

const STEP_MS = 1000 / TICK_RATE;
/** Never simulate more than this many ticks per frame (tab switch, slow device): drop time instead. */
const MAX_STEPS = 8;

export interface HudTank {
  player: number;
  alive: boolean;
  health: number;
  angle: number;
  power: number;
  weapon: string;
  inventory: { id: string; name: string; count: number }[];
  /** AI personality name, or '' for a human. */
  bot: string;
  money: number;
  score: number;
  ready: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  pack: number;
}

export interface HudState {
  phase: 'aim' | 'resolve' | 'shop' | 'over';
  activePlayer: number;
  turn: number;
  /** 1-based round being played (or just finished while shopping). */
  round: number;
  rounds: number;
  /** Whole seconds left on the turn or shop timer; -1 = no timer. */
  seconds: number;
  suddenDeath: boolean;
  wind: number;
  windMax: number;
  tanks: HudTank[];
  /** Winner of the last finished round (-1 = draw), or of the match once it is over. */
  winner: number;
  results: RoundResult[];
  shop: ShopItem[];
}

/**
 * A local match: owns the World, steps it at a fixed 60 Hz from a frame-time accumulator (so a
 * 120 Hz display never speeds the sim up, §8a) and publishes one render snapshot per tick.
 * Inputs go through `input()`, exactly as they will over the network in milestone 4.
 */
export class LocalMatch implements SnapshotStream {
  readonly world: World;
  private listeners: ((s: RenderSnapshot) => void)[] = [];
  private acc = 0;
  private readonly names: Record<string, string> = {};
  private readonly botNames: string[];
  private readonly shopItems: (ShopItem & { index: number })[] = [];

  constructor(
    readonly content: ResolvedContent,
    options: WorldOptions,
  ) {
    this.world = new World(content, options);
    for (const w of content.list('weapon')) {
      this.names[w.id] = w.meta.name;
      if (w.shop.price > 0) {
        this.shopItems.push({
          index: this.world.weaponByIndex(w.id),
          id: w.id,
          name: w.meta.name,
          description: w.meta.description,
          category: w.meta.category ?? '',
          price: w.shop.price,
          pack: w.shop.pack,
        });
      }
    }
    this.shopItems.sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
    this.botNames = (options.bots ?? []).map((id) => (id ? content.get('ai', id).meta.name : ''));
  }

  subscribe(fn: (s: RenderSnapshot) => void): () => void {
    this.listeners.push(fn);
    // a late subscriber gets a full-map snapshot so it can upload the whole terrain
    const s = this.world.snapshot();
    fn({ ...s, dirtyRects: [{ x: 0, y: 0, w: s.width, h: s.height }] });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  input(player: number, input: Input): void {
    this.world.applyInput(player, input);
  }

  /** Advance by wall-clock `dtMs`; returns render time in ticks (tick + fraction). */
  advance(dtMs: number): number {
    this.acc += Math.min(dtMs, STEP_MS * MAX_STEPS);
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS) {
      this.stepOnce();
      this.acc -= STEP_MS;
      n++;
    }
    return this.world.tick + this.acc / STEP_MS;
  }

  stepOnce(): void {
    this.world.step();
    const s = this.world.snapshot();
    for (const l of this.listeners) l(s);
  }

  hud(): HudState {
    const w = this.world;
    const last = w.results[w.results.length - 1];
    return {
      phase: w.phase,
      activePlayer: w.activePlayer,
      turn: w.turn,
      round: w.phase === 'shop' || w.phase === 'over' ? w.round : w.round + 1,
      rounds: w.rounds,
      seconds: w.timer > 0 ? Math.ceil(w.timer / TICK_RATE) : -1,
      suddenDeath: w.phase !== 'shop' && w.suddenDeathActive,
      wind: w.wind / 65536,
      windMax: w.mode.wind.max,
      winner: w.phase === 'over' ? w.matchWinner : (last?.winner ?? -1),
      results: w.results,
      shop: this.shopItems.map((i) => ({ ...i, price: w.prices[i.index] ?? i.price })),
      tanks: w.tanks.map((t) => ({
        bot: this.botNames[t.player] ?? '',
        money: t.money,
        score: t.score,
        ready: t.ready,
        player: t.player,
        alive: t.alive,
        health: t.health,
        angle: t.angle,
        power: t.power,
        weapon: w.weaponId(t.weapon),
        inventory: t.inventory
          .map((count, i) => ({ id: w.weaponId(i), name: this.names[w.weaponId(i)] ?? '', count }))
          .filter((x) => x.count !== 0),
      })),
    };
  }
}

/** Cheap change key so the UI re-renders only when something it shows changed. */
export function hudKey(h: HudState): string {
  let k = `${h.phase}|${h.activePlayer}|${h.turn}|${h.round}|${h.seconds}|${h.suddenDeath ? 1 : 0}|${h.wind}|${h.winner}|${h.results.length}`;
  for (const i of h.shop) k += `,${i.price}`;
  for (const t of h.tanks) {
    k += `|${t.alive ? 1 : 0},${t.health},${t.angle},${t.power},${t.weapon},${t.money},${t.score},${t.ready ? 1 : 0}`;
    for (const i of t.inventory) k += `,${i.count}`;
  }
  return k;
}

/** External store for the HUD: the frame loop calls `refresh()`; React re-renders on change only. */
export class HudStore {
  state: HudState;
  private key: string;
  private readonly subs = new Set<() => void>();

  constructor(private readonly match: LocalMatch) {
    this.state = match.hud();
    this.key = hudKey(this.state);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };

  get = (): HudState => this.state;

  refresh = (): void => {
    const s = this.match.hud();
    const k = hudKey(s);
    if (k === this.key) return;
    this.state = s;
    this.key = k;
    for (const fn of this.subs) fn();
  };
}
