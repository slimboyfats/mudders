import type { Input, RenderSnapshot } from '@mudders/shared';
import {
  DEAL_OUT,
  DEAL_SALE,
  STEP_PARTS,
  TICK_RATE,
  World,
  type ResolvedContent,
  type RoundResult,
  type WorldOptions,
} from '@mudders/sim';
import type { SnapshotStream } from '../render/types';
import { isNew } from '../changelog';
import { weaponPeak } from '../docs/data';

export const STEP_MS = 1000 / TICK_RATE;
/** Never simulate more than this many ticks per frame (tab switch, slow device): drop time instead. */
export const MAX_STEPS = 8;
/** What a frame may spend on the sim before it must draw (see `SimMatch.limitFrame`). */
export const SIM_BUDGET_MS = 10;

export interface HudTank {
  player: number;
  /** Team (milestone 7); the player number in a free-for-all. */
  team: number;
  alive: boolean;
  health: number;
  /** Full health for this tank type (health bars). */
  maxHealth: number;
  /** Shield points left (Bulwark, §3.2); 0 for most tanks. */
  shield: number;
  /** Cells left to drive this turn, out of `driveMax` (§3.2), and fuel left for the match. */
  driveLeft: number;
  driveMax: number;
  driving: number;
  fuel: number;
  angle: number;
  power: number;
  /** Own turns left frosted (Frost Bomb): shots fire at no more than CHILL_POWER. */
  chill: number;
  /** Own turns left glued (Glue Bomb): no driving. */
  glue: number;
  /** Own turns left jammed (Shield Breaker EMP): no driving, no gear. */
  jam: number;
  /** Own turns left stained (§4b): wet, oiled, muddy, burning (0 = not). */
  wet: number;
  oiled: number;
  muddy: number;
  burning: number;
  weapon: string;
  inventory: { id: string; name: string; count: number; category: string; isNew: boolean }[];
  /** Gear carried (§5.1), with whether switching it on now would do anything. */
  gear: HudGear[];
  /** Whether the held weapon takes weapon mods (§4.1). */
  modFits: boolean;
  /** AI personality name, or '' for a human. */
  bot: string;
  money: number;
  score: number;
  ready: boolean;
  /** Cash for destroying this tank while it carries the leader's bounty; 0 = no bounty. */
  bounty: number;
  /** Points match: times destroyed and brought back this round. */
  deaths: number;
  /** Points this round so far (damage, kills, self-damage, deaths), before the round's bonuses. */
  roundPoints: number;
}

/** One weapon in a points match's draft pool. */
export interface DraftSlot {
  slot: number;
  /** Player who took it, or -1 while it is free. */
  by: number;
  item: ShopItem;
}

/** The weapon draft of a points match, while it runs. */
export interface HudDraft {
  /** Player whose pick it is. */
  drafter: number;
  /** Picks each player makes; picks made so far, of `total`. */
  picks: number;
  pos: number;
  total: number;
  /** Who picks next, the current pick first. */
  next: number[];
  pool: DraftSlot[];
}

/** Kind of match, from the mode: classic, points (draft + respawn) or co-op waves. */
export type HudGame = 'classic' | 'points' | 'coop';

export interface HudGear {
  id: string;
  name: string;
  label: string;
  deploy: 'manual' | 'fall' | 'mod';
  count: number;
  useful: boolean;
  /** A weapon mod fitted for the next shot (§4.1). */
  fitted: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  pack: number;
  /** Gear (§5.1): fixed price, carry limit. */
  gear?: { max: number };
  /** Weapons: pack version it was added in, peak blast radius and tank damage (shop sorting). */
  since?: string;
  blast?: number;
  damage?: number;
  /** Added in the newest changelog wave: NEW badge. */
  isNew?: boolean;
  /** This shop's deal (shop deals rule): half price, or sold out. */
  deal?: 'sale' | 'out';
}

export interface HudState {
  phase: 'aim' | 'resolve' | 'shop' | 'draft' | 'over';
  game: HudGame;
  /** Points match: the draft while it runs, else null. */
  draft: HudDraft | null;
  /** Co-op: waves held so far and the defending team, else null. */
  wave: { won: number; team: number } | null;
  activePlayer: number;
  /** Player steering the active tank: itself, or its Telepathy caster while mind-linked. */
  controller: number;
  turn: number;
  /** 1-based round being played (or just finished while shopping). */
  round: number;
  rounds: number;
  /** Whole seconds left on the turn or shop timer; -1 = no timer. */
  seconds: number;
  suddenDeath: boolean;
  /** Wind now (base + gust), in steps of `windMax`/40 so gusts don't re-render the HUD every tick. */
  wind: number;
  /** The turn's wind without the gust (what bots aim with). */
  windBase: number;
  windMax: number;
  /** Gusty wind: the wind keeps changing during the turn. */
  gusty: boolean;
  /** Weather label ("Rain", "Snow"), or '' in clear skies. */
  weather: string;
  /** This round's twist ('' for a normal round). */
  twist: string;
  /** Air temperature, whole °C. */
  temperature: number;
  /** Fuel Tank in the shop (§3.2): units per pack, price per pack, most a tank can hold. */
  fuel: { pack: number; price: number; max: number };
  tanks: HudTank[];
  /** Winner of the last finished round (-1 = draw), or of the match once it is over. */
  winner: number;
  /** Team play (milestone 7): show team letters and team winners. */
  teams: boolean;
  /** Winning team of the last round or the match (-1 = draw); equals `winner` in a free-for-all. */
  winnerTeam: number;
  results: RoundResult[];
  shop: ShopItem[];
  /**
   * Player who may press fire now to set off their shell in flight (Cloud Whale), or -1.
   */
  command: number;
  /** A supply crate someone just took (shown for a few seconds), or null. */
  pickup: { player: number; text: string; tick: number } | null;
  /** A map event the players should hear about (volcano rumbling, avalanche), or null. */
  alert: { text: string; tick: number } | null;
}

/** What the frame loop reads of a tank between snapshots. */
export interface TankView {
  readonly x: number;
  readonly y: number;
  /** Width in cells. */
  readonly w: number;
  readonly alive: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly team: number;
  /** Index of the bot playing this tank, or -1 for a human. */
  readonly bot: number;
}

/**
 * The little of a World the match view reads directly (everything else comes through snapshots
 * and the HUD state). A `World` fits it as it is; a match whose sim runs in the worker keeps a
 * copy that the worker refreshes after every message.
 */
export interface WorldView {
  readonly tick: number;
  readonly phase: HudState['phase'];
  readonly round: number;
  readonly turn: number;
  readonly activePlayer: number;
  readonly tanks: readonly TankView[];
  readonly grid: { readonly width: number; readonly height: number };
}

/** What the sim tells the performance recorder about the time since it was last asked. */
export interface SimPerf {
  projectiles: number;
  debris: number;
  /** Cells in the settle and reaction regions. */
  settle: number;
  react: number;
  /** The map, the weather and a twist, in words. */
  note: string;
  /** What the turn is waiting on ('' = nothing). */
  holding: string;
  /** Sim ms by part of the tick (`STEP_PARTS` order). */
  parts: number[];
  /** The longest tick, in ms and in words ('' = none timed). */
  worstMs: number;
  worstTick: string;
  /** Online: this side's standing with the other ('' = local). */
  net: string;
}

/**
 * A match as the UI sees it. `SimMatch` runs its World on this thread; `RemoteMatch`
 * (`sim-client.ts`) is the same match running in the sim worker.
 */
export interface GameMatch extends SnapshotStream {
  readonly content: ResolvedContent;
  readonly world: WorldView;
  /** False until the first map has arrived (a worker match builds its world off this thread). */
  readonly ready: boolean;
  /** Calls `fn` once the match is ready (at once when it already is); returns a way to cancel. */
  whenReady(fn: () => void): () => void;
  /** Frames that ran out of sim budget. */
  shed: number;
  input(player: number, input: Input): void;
  /** Advance by wall-clock `dtMs`; returns render time in ticks (tick + fraction). */
  advance(dtMs: number): number;
  limitFrame(ms: number): void;
  /** Time the sim by part of the tick (for the performance recorder), or stop. */
  timeParts(on: boolean): void;
  /** The recorder's figures since the last call. */
  takePerf(): SimPerf;
  net(): string;
  hud(): HudState;
  /** Sim ms spent so far, where the sim runs off this thread (so the frame loop can't time it). */
  simMs?(): number;
  /** The match is over for this page: free what it holds elsewhere. */
  dispose?(): void;
}

/**
 * Times the parts of a tick through the kernel's `World.probe` hook: ms per part, and the longest
 * tick with the part that took most of it.
 */
export class PartTimer {
  private ms = new Array<number>(STEP_PARTS.length).fill(0);
  private probeAt = 0;
  private tickAt = 0;
  private top = 0;
  private topMs = 0;
  private worstMs = 0;
  private worst = '';

  readonly probe = (part: number): void => {
    const n = performance.now();
    if (part < 0) {
      this.tickAt = n;
      this.topMs = -1;
    } else {
      const d = n - this.probeAt;
      this.ms[part] = (this.ms[part] ?? 0) + d;
      if (d > this.topMs) {
        this.topMs = d;
        this.top = part;
      }
      // the shop's only part, or the last one: the tick is over
      if ((part === 0 || part === STEP_PARTS.length - 1) && n - this.tickAt > this.worstMs) {
        this.worstMs = n - this.tickAt;
        this.worst = `${this.worstMs.toFixed(1)} ms of which ${STEP_PARTS[this.top] ?? ''} ${this.topMs.toFixed(1)}`;
      }
    }
    this.probeAt = n;
  };

  /** Figures since the last call. */
  take(): Pick<SimPerf, 'parts' | 'worstMs' | 'worstTick'> {
    const out = { parts: this.ms, worstMs: this.worstMs, worstTick: this.worst };
    this.ms = new Array<number>(STEP_PARTS.length).fill(0);
    this.worstMs = 0;
    this.worst = '';
    return out;
  }
}

/** The recorder's gauges, read off a World. */
export function worldPerf(
  w: World,
): Pick<SimPerf, 'projectiles' | 'debris' | 'settle' | 'react' | 'note' | 'holding'> {
  const g = w.grid;
  const twist = w.options.perRound?.[w.round % w.options.perRound.length]?.twist;
  return {
    projectiles: w.projectiles.length,
    debris: w.debris.count,
    settle: g.settling ? (g.settleMaxX - g.settleMinX + 1) * (g.settleMaxY + 1) : 0,
    react: g.reacting ? (g.reactMaxX - g.reactMinX + 1) * (g.reactMaxY - g.reactMinY + 1) : 0,
    note: [w.generator, w.weather?.id ?? 'clear', twist ?? ''].filter(Boolean).join(' '),
    holding: w.holding(),
  };
}

/** Ticks a pickup stays in the HUD. */
const PICKUP_TICKS = 180;

/**
 * A match the UI can show: owns a World (replaced wholesale when a network guest resyncs),
 * publishes one render snapshot per simulated tick and builds the HUD state. Subclasses decide how
 * inputs reach the sim and how wall-clock time turns into ticks: `LocalMatch` (hot-seat) here,
 * `HostMatch`/`GuestMatch` in `net/` (§6.3 lockstep).
 */
export abstract class SimMatch implements GameMatch {
  world: World;
  protected listeners: ((s: RenderSnapshot) => void)[] = [];
  private readonly names: Record<string, string> = {};
  private readonly categories: Record<string, string> = {};
  private readonly fresh: Record<string, boolean> = {};
  /** `ai.*` id → display name. */
  private readonly botNames: Record<string, string> = {};
  private readonly shopItems: (ShopItem & { index: number })[] = [];
  private readonly gearItems: ShopItem[] = [];
  private readonly gearLabels: Record<string, string> = {};

  constructor(
    readonly content: ResolvedContent,
    options: WorldOptions,
  ) {
    this.world = new World(content, options);
    for (const w of content.list('weapon')) {
      this.names[w.id] = w.meta.name;
      this.categories[w.id] = w.meta.category ?? '';
      this.fresh[w.id] = isNew(w.meta.since);
      if (w.shop.price > 0) {
        const peak = weaponPeak(content, w.id);
        this.shopItems.push({
          index: this.world.weaponByIndex(w.id),
          id: w.id,
          name: w.meta.name,
          description: w.meta.description,
          category: w.meta.category ?? '',
          price: w.shop.price,
          pack: w.shop.pack,
          since: w.meta.since,
          blast: peak.radius,
          damage: peak.damage,
          isNew: this.fresh[w.id] ?? false,
        });
      }
    }
    this.shopItems.sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
    for (const a of content.list('ai')) this.botNames[a.id] = a.meta.name;
    for (const g of content.list('gear')) {
      this.names[g.id] = g.meta.name;
      this.gearLabels[g.id] = g.label;
      this.gearItems.push({
        id: g.id,
        name: g.meta.name,
        description: g.meta.description,
        category:
          g.deploy === 'fall'
            ? 'gear · automatic'
            : g.deploy === 'mod'
              ? 'gear · weapon mod'
              : 'gear',
        price: g.shop.price,
        pack: g.shop.pack,
        gear: { max: g.shop.max },
      });
    }
    this.gearItems.sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
  }

  readonly ready = true;

  whenReady(fn: () => void): () => void {
    fn();
    return () => {};
  }

  subscribe(fn: (s: RenderSnapshot) => void): () => void {
    this.listeners.push(fn);
    // a late subscriber gets a full-map snapshot so it can upload the whole terrain
    fn(this.fullSnapshot());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  protected fullSnapshot(): RenderSnapshot {
    const s = this.world.snapshot();
    const all = { x: 0, y: 0, w: s.width, h: s.height };
    return { ...s, dirtyRects: [all], gasRect: all };
  }

  /** Tell every subscriber about the current state (after a step, or a full map after a resync). */
  protected publish(full = false): void {
    const s = full ? this.fullSnapshot() : this.world.snapshot();
    for (const e of s.effectEvents) {
      const text =
        e.type === 'weatherFront'
          ? frontText(this.world.weather?.label)
          : alertText(e.type, e.params);
      if (text) this.alert = { text, tick: s.tick };
    }
    // a match that changes map or sky between rounds says where this round is played
    const w = this.world;
    const news = w.options.perRound !== undefined || w.arsenal.length > 0 || w.bountyPlayer >= 0;
    if (
      news &&
      w.phase !== 'shop' &&
      w.phase !== 'draft' &&
      w.phase !== 'over' &&
      w.round !== this.shown
    ) {
      this.shown = w.round;
      const free = w.arsenal.map((i) => this.names[w.weaponId(i)] ?? w.weaponId(i));
      this.alert = { text: roundLine(w, free), tick: s.tick };
    }
    for (const l of this.listeners) l(s);
  }

  private alert: { text: string; tick: number } | null = null;
  /** The round whose map the HUD last announced. */
  private shown = -1;

  /** The last supply crate taken, as the HUD words it, while it is fresh. */
  private pickupOf(w: World): HudState['pickup'] {
    const p = w.lastPickup;
    if (!p || w.tick - p.tick > PICKUP_TICKS) return null;
    let text: string;
    if (p.kind === 'weapon') {
      const id = w.weaponId(p.item);
      text = `${this.names[id] ?? id} ×${p.amount}`;
    } else if (p.kind === 'gear') {
      const id = w.gear[p.item]?.id ?? '';
      text = `${this.names[id] ?? id} ×${p.amount}`;
    } else if (p.kind === 'health') {
      text = p.amount > 0 ? `+${p.amount} health` : 'health (already full)';
    } else if (p.kind === 'fuel') {
      text = p.amount > 0 ? `+${p.amount} fuel` : 'fuel (tank full)';
    } else {
      text = `+$${p.amount.toLocaleString('en')}`;
    }
    return { player: p.player, text, tick: p.tick };
  }

  /** The draft as the HUD shows it: the pool in shop order, who took what, who picks next. */
  private draftOf(w: World): HudDraft {
    return {
      drafter: w.drafter,
      picks: w.draftPicks,
      pos: w.draftPos,
      total: w.draftOrder.length,
      next: w.draftOrder.slice(w.draftPos, w.draftPos + 8),
      pool: w.draftPool.map((wi, slot) => {
        const id = w.weaponId(wi);
        const known = this.shopItems.find((i) => i.index === wi);
        return {
          slot,
          by: w.draftBy[slot] ?? -1,
          item: known ?? {
            id,
            name: this.names[id] ?? id,
            description: '',
            category: this.categories[id] ?? '',
            price: 0,
            pack: 1,
          },
        };
      }),
    };
  }

  /** An input from this device for `player`. */
  abstract input(player: number, input: Input): void;

  /** Advance by wall-clock `dtMs`; returns render time in ticks (tick + fraction). */
  abstract advance(dtMs: number): number;

  /**
   * The longest one frame may spend simulating before it draws, in ms (Infinity = no limit, for
   * tests and headless runs). Past it a local match or host drops the ticks it still owes, so a
   * heavy moment plays a little slow at a steady frame rate instead of freezing while it catches up.
   */
  protected frameBudgetMs = Infinity;
  /** Frames that ran out of budget. */
  shed = 0;

  limitFrame(ms: number): void {
    this.frameBudgetMs = ms;
  }

  protected partProbe: ((part: number) => void) | null = null;
  private timer: PartTimer | null = null;

  /** Time the sim by part of the tick (the kernel's `World.probe`), or stop. */
  timeParts(on: boolean): void {
    if (on === (this.timer !== null)) return;
    this.timer = on ? new PartTimer() : null;
    this.partProbe = this.timer?.probe ?? null;
    this.world.probe = this.partProbe;
  }

  takePerf(): SimPerf {
    const t = this.timer?.take() ?? { parts: [], worstMs: 0, worstTick: '' };
    return { ...worldPerf(this.world), ...t, net: this.net() };
  }

  /** Online: this side's standing with the other, for the performance log ('' = local). */
  net(): string {
    return '';
  }

  hud(): HudState {
    const w = this.world;
    const last = w.results[w.results.length - 1];
    const wv = w.mode.waves;
    return {
      phase: w.phase,
      game: w.mode.draft ? 'points' : wv ? 'coop' : 'classic',
      draft: w.phase === 'draft' ? this.draftOf(w) : null,
      wave: wv ? { won: w.wavesWon, team: wv.team } : null,
      activePlayer: w.activePlayer,
      controller: w.controller,
      turn: w.turn,
      round: w.phase === 'shop' || w.phase === 'over' ? w.round : w.round + 1,
      rounds: w.rounds,
      seconds: w.timer > 0 ? Math.ceil(w.timer / TICK_RATE) : -1,
      suddenDeath: w.phase !== 'shop' && w.phase !== 'draft' && w.suddenDeathActive,
      wind: hudWind(w.wind, w.mode.wind.max),
      windBase: hudWind(w.windBase, w.mode.wind.max),
      windMax: w.mode.wind.max,
      gusty: w.windType === 'gusty',
      weather: w.weather?.label ?? '',
      twist:
        w.phase === 'shop' || w.phase === 'over'
          ? ''
          : (w.options.perRound?.[w.round % w.options.perRound.length]?.twist ?? ''),
      temperature: w.temperature,
      fuel: {
        pack: w.mode.drive.fuelPack,
        price: w.mode.drive.fuelPrice,
        max: w.mode.drive.fuelMax,
      },
      winner: w.phase === 'over' ? w.matchWinner : (last?.winner ?? -1),
      teams: w.options.teams !== undefined,
      winnerTeam: w.phase === 'over' ? w.matchWinnerTeam : (last?.winnerTeam ?? -1),
      results: w.results,
      pickup: this.pickupOf(w),
      alert: this.alert && w.tick - this.alert.tick <= PICKUP_TICKS ? this.alert : null,
      command: w.commandable(),
      shop: [
        ...this.gearItems,
        ...this.shopItems.map((i) => {
          const d = w.deals[i.index];
          return {
            ...i,
            price: w.prices[i.index] ?? i.price,
            ...(d === DEAL_SALE
              ? { deal: 'sale' as const }
              : d === DEAL_OUT
                ? { deal: 'out' as const }
                : {}),
          };
        }),
      ],
      tanks: w.tanks.map((t) => ({
        // follows the live tank, so an AI takeover (§6.1) shows in the HUD
        bot: t.bot >= 0 ? (this.botNames[w.botId(t.bot)] ?? '') : '',
        money: t.money,
        score: t.score,
        ready: t.ready,
        deaths: t.deaths,
        roundPoints:
          w.phase === 'aim' || w.phase === 'resolve'
            ? Math.trunc(t.damageDealt * w.mode.scoring.damage) +
              t.kills * w.mode.scoring.kill -
              Math.trunc(t.selfDamage * w.mode.scoring.selfDamage) -
              t.deaths * (w.mode.respawn?.penalty ?? 0)
            : 0,
        bounty:
          t.player === w.bountyPlayer && w.phase !== 'shop' && w.phase !== 'over'
            ? w.bountyValue()
            : 0,
        player: t.player,
        team: t.team,
        alive: t.alive,
        health: t.health,
        maxHealth: Math.max(1, t.maxHealth),
        shield: t.shield,
        driveLeft: t.driveLeft,
        driveMax: w.driveCells(t),
        driving: t.driving,
        fuel: t.fuel,
        angle: t.angle,
        power: t.power,
        chill: t.chill,
        glue: t.glue,
        jam: t.jam,
        wet: t.wet,
        oiled: t.oiled,
        muddy: t.muddy,
        burning: t.burning,
        weapon: w.weaponId(t.weapon),
        inventory: t.inventory
          .map((count, i) => ({
            id: w.weaponId(i),
            name: this.names[w.weaponId(i)] ?? '',
            count,
            category: this.categories[w.weaponId(i)] ?? '',
            isNew: this.fresh[w.weaponId(i)] ?? false,
          }))
          .filter((x) => x.count !== 0),
        gear: w.gear.map((g, i) => ({
          id: g.id,
          name: this.names[g.id] ?? '',
          label: this.gearLabels[g.id] ?? '',
          deploy: g.deploy,
          count: t.gear[i] ?? 0,
          useful: w.gearUseful(t, i),
          fitted: t.mod === i,
        })),
        modFits: w.weaponModable(w.weaponId(t.weapon)),
      })),
    };
  }
}

/**
 * A local match: steps the World at a fixed 60 Hz from a frame-time accumulator (so a 120 Hz
 * display never speeds the sim up, §8a). Inputs go straight into the sim.
 */
export class LocalMatch extends SimMatch {
  private acc = 0;

  input(player: number, input: Input): void {
    this.world.applyInput(player, input);
  }

  advance(dtMs: number): number {
    this.acc += Math.min(dtMs, STEP_MS * MAX_STEPS);
    const t0 = this.frameBudgetMs < Infinity ? performance.now() : 0;
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS) {
      this.stepOnce();
      this.acc -= STEP_MS;
      n++;
      if (this.acc >= STEP_MS && performance.now() - t0 > this.frameBudgetMs) {
        this.acc %= STEP_MS; // out of time: the game runs a little slow instead of the picture freezing
        this.shed++;
        break;
      }
    }
    return this.world.tick + this.acc / STEP_MS;
  }

  stepOnce(): void {
    this.world.step();
    this.publish();
  }
}

/** "Round 2: Glacier, snow": where a round of a shuffled match is played. */
export function roundLine(w: World, free: readonly string[] = []): string {
  const map = w.content.get('gen', w.generator).meta.name;
  const sky = w.weather?.label;
  const twist = w.options.perRound?.[w.round % w.options.perRound.length]?.twist;
  return `Round ${w.round + 1}: ${map}${sky ? `, ${sky.toLowerCase()}` : ''}${
    twist ? ` · ${twist.toUpperCase()}!` : ''
  }${free.length > 0 ? `\nFree: ${free.join(', ')}` : ''}${
    w.bountyPlayer >= 0
      ? `\nBounty on P${w.bountyPlayer + 1}: $${w.bountyValue().toLocaleString('en')} for the kill`
      : ''
  }`;
}

/** How the HUD words a weather front, from the sky it brings. */
export function frontText(label: string | undefined): string {
  return label ? `${label} moving in…` : 'The skies are clearing';
}

/** How the HUD words a map event, or '' for effects that aren't news. */
export function alertText(type: string, params: Readonly<Record<string, number>>): string {
  if (type === 'rumble') return params.turns === 1 ? 'The volcano is rumbling…' : 'Eruption!';
  if (type === 'avalanche') return 'Avalanche!';
  if (type === 'tide')
    return params.rising === 1
      ? 'The tide is coming in'
      : params.rising === 0
        ? 'The tide is going out'
        : '';
  return '';
}

/** Fixed-point wind in HUD units, rounded to 1/40 of the maximum. */
function hudWind(fixed: number, max: number): number {
  const v = fixed / 65536;
  return max > 0 ? (Math.round((v / max) * 40) / 40) * max : v;
}

/** Cheap change key so the UI re-renders only when something it shows changed. */
export function hudKey(h: HudState): string {
  let k = `${h.pickup ? `${h.pickup.tick}:${h.pickup.player}` : ''}|${h.alert?.tick ?? ''}|${h.phase}|${h.command}|${h.activePlayer}|${h.controller}|${h.turn}|${h.round}|${h.seconds}|${h.suddenDeath ? 1 : 0}|${h.wind}|${h.windBase}|${h.temperature}|${h.weather}|${h.winner}|${h.results.length}|${h.draft ? `${h.draft.pos}:${h.draft.drafter}` : ''}`;
  for (const i of h.shop) k += `,${i.price}`;
  for (const t of h.tanks) {
    k += `|${t.bot}|${t.alive ? 1 : 0},${t.health},${t.shield},${t.driveLeft},${t.driving},${t.fuel},${t.angle},${t.power},${t.weapon},${t.money},${t.score},${t.ready ? 1 : 0},${t.deaths},${t.roundPoints}`;
    for (const i of t.inventory) k += `,${i.count}`;
    for (const g of t.gear) k += `;${g.count}${g.useful ? 'u' : ''}`;
  }
  return k;
}

/** External store for the HUD: the frame loop calls `refresh()`; React re-renders on change only. */
export class HudStore {
  state: HudState;
  private key: string;
  private readonly subs = new Set<() => void>();

  constructor(private readonly match: GameMatch) {
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
    // a worker match hands out the same state until the worker sends a new one
    if (s === this.state) return;
    const k = hudKey(s);
    if (k === this.key) return;
    this.state = s;
    this.key = k;
    for (const fn of this.subs) fn();
  };
}
