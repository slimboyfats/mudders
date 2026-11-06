import {
  GEN_CORE_KEYS,
  MODE_CORE_KEYS,
  type DamageType,
  type EffectEvent,
  type EmbeddedExplosion,
  type EmbeddedTerrainOp,
  type EntityView,
  type Impact,
  type Input,
  type ModeManifest,
  type RenderSnapshot,
  type WallRule,
  DAMAGE_TYPES,
  TICK_RATE,
} from '@mudders/shared';
import {
  type AiApi,
  type AiBehaviour,
  type AiShopApi,
  type AiWeaponView,
  type ContactResult,
  type FlightBehaviour,
  type FlightHit,
  type FlightSignal,
  type ModeApi,
  type ModeBehaviour,
  type OpCall,
  type OpInstance,
  type Projectile,
  type ShotPrediction,
  type SimApi,
  type TankHandle,
  type TerrainOpBehaviour,
} from './behaviours';
import { behaviourParams, type ResolvedContent } from './content/resolve';
import { FP, cosDeci, isqrt, sinDeci, toFixed } from './fixed';
import { DebrisPool } from './debris';
import { Grid } from './grid';
import { Groups } from './groups';
import { Hasher } from './hash';
import { MaterialTable, damageTypeIndex } from './materials';
import { Prng } from './prng';
import { Scratch } from './scratch';
import { settleStep } from './settle';
import { reactStep, turnDecay } from './reactions';
import { SETTLE_FLOW } from './materials';

/** Tank footprint (§2a: ~16×10). x is the centre column, y the row the tank stands on. */
export const TANK_W = 16;
export const TANK_H = 10;
export const TANK_HALF = TANK_W / 2;
const BARREL = 8 * FP;
const MAX_TANK_FALL = 8;
/** Highest power (of 1000) a frosted tank can fire with. */
export const CHILL_POWER = 500;
/** Ticks a bot "thinks" before its shot (so humans can follow); it aims halfway through. */
export const BOT_THINK_TICKS = 50;
/** Longest flight the AI's predictor simulates. */
const PREDICT_TICKS = 900;

/** Match-rule overrides from the setup screen (§8); anything unset keeps the mode's value. */
export interface MatchRules {
  rounds?: number | undefined;
  turnTimer?: number | undefined;
  shopTimer?: number | undefined;
  suddenDeath?: boolean | undefined;
  windType?: 'none' | 'constant' | 'perTurn' | undefined;
  startingCash?: number | undefined;
  turnCap?: number | undefined;
}

export interface RoundResult {
  /** -1 = draw. In a team match: the winning team's best scorer this round. */
  winner: number;
  /** Winning team (-1 = draw). Without teams every player is their own team, so it equals `winner`. */
  winnerTeam: number;
  /** Points per player this round. */
  points: number[];
  /** Money earned per player (points + interest). */
  earned: number[];
}

export interface WorldOptions {
  seed: number;
  mode: string;
  players: number;
  map?:
    | { generator?: string | undefined; width?: number | undefined; height?: number | undefined }
    | undefined;
  /** Force tank columns instead of the generator's spawns. */
  tankColumns?: readonly number[] | undefined;
  /** Per-player overrides (scenarios, sandbox): starting health and inventory by weapon id. */
  tankSetup?:
    | readonly (
        | {
            health?: number | undefined;
            inventory?: Readonly<Record<string, number>> | undefined;
          }
        | undefined
      )[]
    | undefined;
  /** Force wind (cells/tick²) for the whole match. */
  wind?: number | undefined;
  /** Force the turn order (showcases, tests). The mode's order is still drawn, keeping the RNG in step. */
  turnOrder?: readonly number[] | undefined;
  rules?: MatchRules | undefined;
  /**
   * Team per player (milestone 7). Tanks on the same team don't end the round against each other,
   * share the round win, and hitting a teammate scores like self-damage. Unset = every player is
   * their own team (free-for-all), which gives exactly the old results.
   */
  teams?: readonly number[] | undefined;
  /** AI personality id per player (`ai.*`); null/undefined = human. */
  bots?: readonly (string | null | undefined)[] | undefined;
  /** Extra props at fixed centre columns (showcases), placed after the generator's. */
  props?: readonly { prop: string; x: number }[] | undefined;
}

/** `shop` sits between rounds; `over` is the end of the match. */
export type Phase = 'aim' | 'resolve' | 'shop' | 'over';

export interface Tank extends TankHandle {
  readonly player: number;
  /** Team id (milestone 7); the player number in a free-for-all. */
  readonly team: number;
  alive: boolean;
  x: number;
  y: number;
  health: number;
  angle: number;
  power: number;
  weapon: number;
  inventory: number[];
  falling: boolean;
  fallFrom: number;
  fallVel: number;
  /** Cells sunk into quicksand-like ground since the tank last fell or the round started. */
  sunk: number;
  /** Own turns left frosted (Frost Bomb): shots fire at no more than CHILL_POWER. */
  chill: number;
  lastHitBy: number;
  kills: number;
  damageDealt: number;
  selfDamage: number;
  /** Match totals; persist across rounds. */
  score: number;
  money: number;
  /** Index into the bot table, or -1 for a human. */
  bot: number;
  /** Bot-owned integers (bracketing state…), hashed. */
  aiMem: number[];
  /** Where this tank's last shell went off this round (-1 = none yet), and its aim. */
  lastShotX: number;
  lastShotY: number;
  lastShotAngle: number;
  lastShotPower: number;
  ready: boolean;
}

interface RtBot {
  b: AiBehaviour;
  params: unknown;
}

interface OpSite {
  b: TerrainOpBehaviour;
  params: unknown;
}

interface RtExplosion {
  radius: number;
  damage: number;
  damageType: DamageType;
  dt: number;
  linear: boolean;
  push: number;
  chill: number;
  op: number;
  effects: [string, Record<string, number>][];
}

interface RtSpawn {
  /** Weapon indexes (one, or a pool to pick from). */
  pool: number[];
  count: number;
  /** Fixed-point multipliers and velocities. */
  inherit: number;
  bounce: number;
  spread: number;
  jitter: number;
  up: number;
  stagger: number;
}

interface RtZoneSpec {
  radius: number;
  turns: number;
  damage: number;
  /** Fixed-point (FP = 1×). */
  amplify: number;
  op: number;
  damageType: DamageType;
  look: number;
}

type RtImpact =
  | { kind: 'explosion'; e: RtExplosion }
  | { kind: 'op'; op: number; radius: number; damageType: DamageType }
  | { kind: 'spawn'; s: RtSpawn }
  | { kind: 'zone'; z: RtZoneSpec };

/** A lingering zone on the map (§4a): plain integers, hashed. */
export interface Zone {
  x: number;
  y: number;
  radius: number;
  turns: number;
  damage: number;
  amplify: number;
  op: number;
  dt: number;
  look: number;
  owner: number;
}

/** Most zones alive at once; the oldest goes first. */
export const MAX_ZONES = 32;
/** Most shells in the air at once (cluster bombs); extra children are dropped. */
export const MAX_PROJECTILES = 64;
const ZONE_LOOKS = ['gas', 'acid', 'resonance'] as const;

interface RtWeapon {
  id: string;
  flight: FlightBehaviour;
  flightParams: unknown;
  maxTicks: number;
  onSolid: boolean;
  onTank: boolean;
  onWall: boolean;
  onApex: boolean;
  onTimer: number;
  impacts: RtImpact[];
  pulse: RtImpact[];
  price: number;
  pack: number;
  tier: number;
  expectedDamage: number;
  terrainValue: number;
}

interface PendingDeath {
  player: number;
  killer: number;
}
/**
 * The match state and tick loop (ARCHITECTURE §3.2). State advances only through `applyInput`
 * and `tick`; `hash()` covers everything that can influence future ticks.
 *
 * A World is a whole match (§3.1): `rounds` rounds, each on a freshly generated map, with the shop
 * phase between them. Money, score and inventory persist across rounds; health and position don't.
 */
export class World implements SimApi {
  readonly groups: Groups;
  readonly grid: Grid;
  readonly mats: MaterialTable;
  readonly rng: Prng;
  readonly scratch: Scratch;
  readonly tanks: Tank[] = [];
  readonly weapons: RtWeapon[] = [];
  readonly mode: ModeManifest;
  readonly gravity: number;
  /** Effective match rules (mode values with setup-screen overrides applied). */
  readonly rounds: number;
  readonly turnCap: number;
  readonly turnTimerTicks: number;
  readonly shopTimerTicks: number;
  readonly windType: 'none' | 'constant' | 'perTurn';
  readonly suddenDeath: { fromTurn: number; damageScale: number; edgeCells: number } | null;

  tick = 0;
  phase: Phase = 'aim';
  wind = 0;
  /** Rounds finished so far (0 during the first round). */
  round = 0;
  /** Turns taken this round. */
  turn = 0;
  order: number[] = [];
  turnPos = 0;
  /** Ticks left to aim (turn timer) or to shop. 0 = no timer. */
  timer = 0;
  /** Bot think countdown while a bot is up. */
  botWait = 0;
  /** Columns lost to sudden death at each edge. */
  edge = 0;
  /** Shop price per weapon pack this round. */
  prices: number[] = [];
  /** Results of finished rounds. */
  readonly results: RoundResult[] = [];
  projectiles: Projectile[] = [];
  ops: OpInstance[] = [];
  zones: Zone[] = [];
  readonly debris = new DebrisPool();

  private readonly opSites: OpSite[] = [];
  private readonly bots: RtBot[] = [];
  private readonly botIds: string[] = [];
  private readonly modeB: ModeBehaviour;
  private readonly modeParams: unknown;
  private readonly maxSpeed: number;
  private readonly walls: WallRule;
  private readonly settleCap: number;
  private readonly deathExplosion: RtExplosion;
  private readonly windLocked: boolean;
  private readonly weaponIndex: Record<string, number> = {};
  private nextProjectileId = 1;
  private shooter = -1;
  private pendingInputs: { player: number; input: Input }[] = [];
  private contactDone = false;
  private pendingDeaths: PendingDeath[] = [];
  private effects: EffectEvent[] = [];
  private readonly modeApi: ModeApi;

  constructor(
    readonly content: ResolvedContent,
    readonly options: WorldOptions,
  ) {
    const mode = content.get('mode', options.mode);
    this.mode = mode;
    this.modeB = content.behaviours.getKind(mode.behaviour, 'mode');
    this.modeParams = this.modeB.params.parse(behaviourParams(mode, MODE_CORE_KEYS));
    this.rng = new Prng(options.seed);
    this.mats = new MaterialTable(content.list('material'));
    const width = options.map?.width ?? mode.map.width;
    const height = options.map?.height ?? mode.map.height;
    this.grid = new Grid(width, height);
    this.groups = new Groups(content.list('prop'), this.mats);
    this.scratch = new Scratch(this.grid.size);
    this.gravity = toFixed(mode.physics.gravity);
    this.maxSpeed = toFixed(mode.physics.maxSpeed);
    this.walls = mode.walls;
    this.settleCap = mode.settle.maxCellsPerTick;
    this.windLocked = options.wind !== undefined;
    if (options.wind !== undefined) this.wind = toFixed(options.wind);

    const rules = options.rules ?? {};
    this.rounds = Math.max(1, rules.rounds ?? mode.rounds);
    this.turnCap = Math.max(1, rules.turnCap ?? mode.turnCap);
    this.turnTimerTicks = Math.round((rules.turnTimer ?? mode.turnTimer) * TICK_RATE);
    this.shopTimerTicks = Math.max(1, Math.round((rules.shopTimer ?? mode.shopTimer) * TICK_RATE));
    this.windType = rules.windType ?? mode.wind.type;
    this.suddenDeath = rules.suddenDeath === false ? null : mode.suddenDeath;

    const weaponList = content.list('weapon');
    for (let i = 0; i < weaponList.length; i++) this.weaponIndex[weaponList[i]!.id] = i;
    for (const w of weaponList) {
      const flight = content.behaviours.getKind(w.flight.behaviour, 'flight');
      const flightParams = flight.params.parse(behaviourParams(w.flight));
      let onTimer = 0;
      const named: string[] = [];
      for (const t of w.triggers) {
        if (typeof t === 'string') named.push(t);
        else onTimer = t.onTimer;
      }
      this.weapons.push({
        id: w.id,
        flight,
        flightParams,
        maxTicks: flight.maxTicks(flightParams),
        onSolid: named.includes('onSolid'),
        onTank: named.includes('onTank'),
        onWall: named.includes('onWall'),
        onApex: named.includes('onApex'),
        onTimer,
        impacts: w.impact.map((imp) => this.bindImpact(imp, w.id)),
        pulse: w.pulse.map((imp) => this.bindImpact(imp, w.id)),
        price: w.shop.price,
        pack: w.shop.pack,
        tier: w.shop.tier,
        expectedDamage: w.ai.expectedDamage,
        terrainValue: w.ai.terrainValue,
      });
    }
    this.deathExplosion = this.bindExplosion(mode.deathExplosion);

    this.modeApi = {
      rng: this.rng,
      players: options.players,
      alive: (p) => this.tanks[p]?.alive ?? false,
      team: (p) => options.teams?.[p] ?? p,
      turn: () => this.turn,
      setWind: (w) => {
        if (!this.windLocked) this.wind = w;
      },
      windMax: toFixed(mode.wind.max),
      windType: this.windType,
    };

    this.createTanks();
    this.startRound();
  }

  // ── setup ───────────────────────────────────────────────────────────────────────────────

  private bindImpact(imp: Impact, weapon: string): RtImpact {
    if ('explosion' in imp) return { kind: 'explosion', e: this.bindExplosion(imp.explosion) };
    if ('spawn' in imp) {
      const sp = imp.spawn;
      const ids = typeof sp.weapon === 'string' ? [sp.weapon] : sp.weapon;
      const pool = ids.map((id) => {
        const i = this.weaponByIndex(id);
        if (i < 0) throw new Error(`${weapon}: spawn names unknown weapon ${id}`);
        return i;
      });
      return {
        kind: 'spawn',
        s: {
          pool,
          count: sp.count,
          inherit: toFixed(sp.inherit),
          bounce: toFixed(sp.bounce),
          spread: toFixed(sp.spread),
          jitter: toFixed(sp.jitter),
          up: toFixed(sp.up),
          stagger: toFixed(sp.stagger),
        },
      };
    }
    if ('zone' in imp) {
      const z = imp.zone;
      return {
        kind: 'zone',
        z: {
          radius: z.radius,
          turns: z.turns,
          damage: z.damage,
          amplify: toFixed(z.amplify),
          op: z.terrainOp ? this.bindOp(z.terrainOp) : -1,
          damageType: z.damageType,
          look: ZONE_LOOKS.indexOf(z.look),
        },
      };
    }
    return {
      kind: 'op',
      op: this.bindOp(imp.terrainOp),
      radius: imp.radius,
      damageType: imp.damageType,
    };
  }

  private bindOp(op: EmbeddedTerrainOp): number {
    const b = this.content.behaviours.getKind(op.behaviour, 'terrainop');
    this.opSites.push({ b, params: b.params.parse(behaviourParams(op)) });
    return this.opSites.length - 1;
  }

  private bindExplosion(e: EmbeddedExplosion): RtExplosion {
    const keys = Object.keys(e.effects).sort();
    return {
      radius: e.radius,
      damage: e.damage,
      damageType: e.damageType,
      dt: damageTypeIndex(e.damageType),
      linear: e.falloff === 'linear',
      push: e.push,
      chill: e.chill,
      op: e.terrainOp ? this.bindOp(e.terrainOp) : -1,
      effects: keys.map((k) => [k, { ...e.effects[k] }]),
    };
  }

  private bindBot(id: string): number {
    const item = this.content.get('ai', id);
    const b = this.content.behaviours.getKind(item.behaviour, 'ai');
    this.bots.push({ b, params: b.params.parse(behaviourParams(item)) });
    this.botIds.push(id);
    return this.bots.length - 1;
  }

  /** The `ai.*` id behind a tank's `bot` index, or '' for a human. */
  botId(index: number): string {
    return this.botIds[index] ?? '';
  }

  /**
   * AI takeover (§6.1): a bot plays for a disconnected human (`bot` set), or hands the tank back
   * (`bot` null). It arrives as an input, so every peer applies it on the same tick. If it is that
   * tank's turn, the turn restarts its clock for the new controller; in the shop a bot shops at once.
   */
  private takeover(t: Tank, bot: string | null): void {
    if (bot !== null && (!bot.startsWith('ai.') || !this.content.has(bot))) return;
    if (bot !== null && t.bot >= 0 && this.botIds[t.bot] === bot) return;
    if (bot === null && t.bot < 0) return;
    const next = bot === null ? -1 : this.bindBot(bot);
    t.bot = next;
    if (this.phase === 'aim' && t.player === this.activePlayer) {
      this.botWait = next >= 0 ? BOT_THINK_TICKS : 0;
      this.timer = next >= 0 ? 0 : this.turnTimerTicks;
    } else if (this.phase === 'shop' && next >= 0 && !t.ready) {
      this.botShop(t);
    }
  }

  /** Match start: one tank per player with the mode's loadout and starting cash (§3.6). */
  private createTanks(): void {
    const loadout = this.mode.loadout;
    const cash = this.options.rules?.startingCash ?? this.mode.economy.startingCash;
    for (let p = 0; p < this.options.players; p++) {
      const inventory = new Array<number>(this.weapons.length).fill(0);
      for (const l of loadout) inventory[this.weaponIndex[l.weapon]!] = l.count;
      const setup = this.options.tankSetup?.[p];
      if (setup?.inventory) {
        // order-independent: each key sets its own slot
        for (const id of Object.keys(setup.inventory)) {
          const w = Object.hasOwn(this.weaponIndex, id) ? this.weaponIndex[id] : undefined;
          if (w === undefined) throw new Error(`unknown weapon in tank setup: ${id}`);
          inventory[w] = setup.inventory[id]!;
        }
      }
      const botId = this.options.bots?.[p];
      this.tanks.push({
        player: p,
        team: this.options.teams?.[p] ?? p,
        alive: true,
        x: 0,
        y: 0,
        health: 0,
        angle: 90,
        power: 500,
        weapon: loadout[0] ? this.weaponIndex[loadout[0].weapon]! : 0,
        inventory,
        falling: false,
        fallFrom: 0,
        fallVel: 0,
        sunk: 0,
        chill: 0,
        lastHitBy: -1,
        kills: 0,
        damageDealt: 0,
        selfDamage: 0,
        score: 0,
        money: cash,
        bot: botId ? this.bindBot(botId) : -1,
        aiMem: [],
        lastShotX: -1,
        lastShotY: -1,
        lastShotAngle: 0,
        lastShotPower: 0,
        ready: false,
      });
    }
  }

  private startRound(): void {
    const g = this.grid;
    g.reset();
    this.debris.count = 0;
    this.projectiles = [];
    this.ops = [];
    this.zones = [];
    this.pendingDeaths = [];
    this.edge = 0;
    this.shooter = -1;

    const genId = this.options.map?.generator ?? this.mode.map.generator;
    const genItem = this.content.get('gen', genId);
    const gen = this.content.behaviours.getKind(genItem.behaviour, 'gen');
    const res = gen.generate(
      this,
      gen.params.parse(behaviourParams(genItem, GEN_CORE_KEYS)),
      this.options.players,
    );
    // Props (§4c) go on after the terrain and before the tanks, clear of every spawn.
    this.groups.reset();
    const spawns = Array.from(
      { length: this.options.players },
      (_, p) => this.options.tankColumns?.[p] ?? res.spawns[p] ?? 0,
    );
    if (genItem.props) this.groups.place(g, this.rng, genItem.props, spawns);
    for (const sp of this.options.props ?? []) this.groups.placeAt(g, sp.prop, sp.x, this.rng);
    // Pre-settle anything loose the generator left, so a round starts still.
    g.markDirty(0, 0, g.width - 1, g.height - 1);
    for (let i = 0; i < 2000 && g.settling; i++) settleStep(g, this.mats, i, g.size);
    g.clearSettle();
    g.takeRenderRects();
    g.addRenderRect(0, 0, g.width, g.height);
    g.clearReact();
    g.fallVel.fill(0);

    for (const tank of this.tanks) {
      const p = tank.player;
      const col = this.options.tankColumns?.[p] ?? res.spawns[p] ?? 0;
      tank.x = Math.max(TANK_HALF, Math.min(g.width - TANK_HALF - 1, col));
      tank.alive = true;
      tank.health = this.options.tankSetup?.[p]?.health ?? this.mode.startingHealth;
      tank.angle = tank.x < g.width / 2 ? 45 : 135;
      if (tank.inventory[tank.weapon] === 0) tank.weapon = this.firstWeapon(tank);
      tank.falling = false;
      tank.fallFrom = 0;
      tank.fallVel = 0;
      tank.sunk = 0;
      tank.chill = 0;
      tank.lastHitBy = -1;
      tank.kills = 0;
      tank.damageDealt = 0;
      tank.selfDamage = 0;
      tank.lastShotX = -1;
      tank.lastShotY = -1;
      tank.ready = false;
      tank.y = this.restingY(tank);
    }

    this.order = this.modeB.turnOrder(this.modeApi, this.modeParams);
    if (this.options.turnOrder) this.order = [...this.options.turnOrder];
    this.modeB.onRoundStart(this.modeApi, this.modeParams);
    this.turnPos = 0;
    this.turn = 0;
    this.beginTurn();
  }

  private firstWeapon(t: Tank): number {
    for (let i = 0; i < t.inventory.length; i++) if (t.inventory[i] !== 0) return i;
    return 0;
  }

  /**
   * Highest ground under the tank's footprint at round start. Intact prop cells don't count, so a
   * tank spawned under a rock arch stands on the ground beneath it, not on top.
   */
  private restingY(t: Tank): number {
    const g = this.grid;
    let y = g.height;
    for (let x = Math.max(0, t.x - TANK_HALF); x < Math.min(g.width, t.x + TANK_HALF); x++) {
      for (let r = 0, i = x; r < y; r++, i += g.width) {
        if (g.material[i] !== 0 && g.group[i] === 0) {
          y = r;
          break;
        }
      }
    }
    return y;
  }

  // ── public API ──────────────────────────────────────────────────────────────────────────

  get activePlayer(): number {
    return this.order[this.turnPos] ?? -1;
  }

  /** True when sudden death rules apply this turn (§3.1). */
  get suddenDeathActive(): boolean {
    const sd = this.suddenDeath;
    return sd !== null && Math.floor(this.turn / Math.max(1, this.tanks.length)) >= sd.fromTurn - 1;
  }

  /** Nothing moving: no projectiles, ops, settling, falling tanks or pending deaths. */
  get quiet(): boolean {
    return (
      this.projectiles.length === 0 &&
      this.ops.length === 0 &&
      this.debris.count === 0 &&
      !this.grid.settling &&
      !this.grid.reacting &&
      this.pendingDeaths.length === 0 &&
      !this.tanks.some((t) => t.falling || (t.alive && this.slipDir(t) !== 0))
    );
  }

  /** Queue an input; it is applied at the start of the next tick, in arrival order. */
  applyInput(player: number, input: Input): void {
    this.pendingInputs.push({ player, input });
  }

  launch(cellIndex: number, vx: number, vy: number): boolean {
    const g = this.grid;
    const m = g.material[cellIndex]!;
    if (m === 0) return false;
    const slot = g.group[cellIndex]!;
    // rock between the blast and this cell stops it
    if (this.groups.shields(g, cellIndex)) return false;
    if (slot !== 0) {
      if (!this.groups.isLocal(slot)) {
        // an intact prop group holds: the hit is charged to its integrity instead
        this.groups.refuse(slot);
        return false;
      }
      // locally glued rock: a blasted cell flies off like any other
      g.leaveGroup(cellIndex);
    }
    const x = cellIndex % g.width;
    const y = (cellIndex - x) / g.width;
    if (
      !this.debris.spawn(
        x * FP + FP / 2,
        y * FP + FP / 2,
        vx,
        vy,
        m,
        g.coating[cellIndex]!,
        g.cellState[cellIndex]!,
      )
    ) {
      return false;
    }
    g.material[cellIndex] = 0;
    g.coating[cellIndex] = 0;
    g.cellState[cellIndex] = 0;
    g.fallVel[cellIndex] = 0;
    return true;
  }

  emit(type: string, x: number, y: number, radius: number, params?: Record<string, number>): void {
    this.effects.push({ type, tick: this.tick, x, y, radius, params: params ?? {} });
  }

  step(): void {
    const inputs = this.pendingInputs;
    this.pendingInputs = [];
    for (const { player, input } of inputs) this.handleInput(player, input);

    if (this.phase === 'shop') {
      this.stepShop();
      this.tick++;
      return;
    }
    if (this.phase === 'aim') this.stepAim();

    this.stepProjectiles();
    this.stepOps();
    this.debris.step(this.grid, this.gravity, this.mats);
    const settling = this.grid.settling;
    settleStep(this.grid, this.mats, this.tick, this.settleCap);
    reactStep(this.grid, this.mats, this.tick);
    if (this.groups.any) {
      this.groups.absorbLosses(this.grid, this);
      if (settling) this.groups.checkBases(this.grid, this);
      else this.groups.settled();
    }
    this.stepTanks();

    if (this.phase === 'resolve' && this.quiet) {
      // Contact damage (lava, napalm) once the shot has settled; deaths may need resolving first.
      if (!this.contactDone) {
        this.contactDone = true;
        this.applyContact();
        this.applyZones();
      }
      if (this.quiet) this.endTurn();
    }
    this.tick++;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  // ── inputs ──────────────────────────────────────────────────────────────────────────────

  private handleInput(player: number, input: Input): void {
    const t = this.tanks[player];
    if (!t) return;
    if (input.type === 'takeover') return this.takeover(t, input.bot);
    if (input.type === 'buy' || input.type === 'ready') {
      if (this.phase !== 'shop' || t.ready) return;
      if (input.type === 'ready') t.ready = true;
      else this.buy(t, input.item, input.packs);
      return;
    }
    if (!t.alive || this.phase !== 'aim' || player !== this.activePlayer || t.bot >= 0) return;
    switch (input.type) {
      case 'aim':
        t.angle = Math.max(0, Math.min(180, input.angle | 0));
        t.power = Math.max(0, Math.min(1000, input.power | 0));
        break;
      case 'selectWeapon': {
        const w = Object.hasOwn(this.weaponIndex, input.weapon)
          ? this.weaponIndex[input.weapon]
          : undefined;
        if (w !== undefined && t.inventory[w] !== 0) t.weapon = w;
        break;
      }
      case 'fire':
        this.fire(t);
        break;
    }
  }

  /**
   * Buy `packs` packs of a weapon at this round's price (§3.6). Returns false (and changes nothing)
   * if it isn't shop time, the item isn't for sale, the player already has it unlimited, or can't
   * afford it.
   */
  buy(t: Tank, item: string, packs: number): boolean {
    const w = Object.hasOwn(this.weaponIndex, item) ? this.weaponIndex[item] : undefined;
    if (w === undefined || this.phase !== 'shop' || packs < 1) return false;
    const rw = this.weapons[w]!;
    const cost = (this.prices[w] ?? 0) * packs;
    if (rw.price <= 0 || t.inventory[w]! < 0 || cost > t.money) return false;
    t.money -= cost;
    t.inventory[w] = t.inventory[w]! + rw.pack * packs;
    return true;
  }

  private fire(t: Tank): void {
    const inv = t.inventory[t.weapon] ?? 0;
    if (inv === 0) return;
    if (inv > 0) t.inventory[t.weapon] = inv - 1;
    const a = t.angle * 10;
    const c = cosDeci(a);
    const s = sinDeci(a);
    const power = t.chill > 0 ? Math.min(t.power, CHILL_POWER) : t.power;
    const speed = Math.trunc((this.maxSpeed * power) / 1000);
    const x = t.x * FP + FP / 2 + Math.trunc((BARREL * c) / FP);
    const y = (t.y - TANK_H) * FP - Math.trunc((BARREL * s) / FP);
    this.projectiles.push({
      id: this.nextProjectileId++,
      weapon: t.weapon,
      owner: t.player,
      x,
      y,
      vx: Math.trunc((speed * c) / FP),
      vy: -Math.trunc((speed * s) / FP),
      age: 0,
      alive: true,
      data: [],
    });
    t.lastShotAngle = t.angle;
    t.lastShotPower = t.power;
    this.shooter = t.player;
    this.phase = 'resolve';
    this.timer = 0;
    this.emit('muzzle', Math.floor(x / FP), Math.floor(y / FP), 3, {
      angle: t.angle,
      weapon: t.weapon,
    });
  }

  // ── turn timer and bots ─────────────────────────────────────────────────────────────────

  private stepAim(): void {
    const t = this.tanks[this.activePlayer];
    if (!t?.alive) {
      // Died before shooting (fell into the sudden-death void at the start of its turn): pass.
      this.phase = 'resolve';
      return;
    }
    if (t.bot >= 0) {
      this.botWait--;
      if (this.botWait === BOT_THINK_TICKS >> 1) this.botAim(t);
      if (this.botWait <= 0) this.fire(t);
      return;
    }
    if (this.timer > 0 && --this.timer === 0) {
      // Out of time: fire with the current settings (§3.3).
      if (t.inventory[t.weapon] === 0) t.weapon = this.firstWeapon(t);
      this.fire(t);
    }
  }

  private botAim(t: Tank): void {
    const bot = this.bots[t.bot]!;
    const weapons: AiWeaponView[] = [];
    for (let i = 0; i < t.inventory.length; i++) {
      const count = t.inventory[i]!;
      if (count === 0) continue;
      const w = this.weapons[i]!;
      weapons.push({
        index: i,
        id: w.id,
        count,
        expectedDamage: w.expectedDamage,
        terrainValue: w.terrainValue,
      });
    }
    const api: AiApi = {
      rng: this.rng,
      me: t.player,
      tanks: this.tanks,
      weapons,
      width: this.grid.width,
      height: this.grid.height,
      wind: this.wind,
      gravity: this.gravity,
      maxSpeed: this.maxSpeed,
      surfaceY: (x) => this.grid.surfaceY(x),
      predict: (w, angle, power) => this.predict(t, w, angle, power),
      lastShot:
        t.lastShotX >= 0
          ? { x: t.lastShotX, y: t.lastShotY, angle: t.lastShotAngle, power: t.lastShotPower }
          : null,
      memory: t.aiMem,
      angle: t.angle,
      power: t.power,
    };
    const shot = bot.b.aim(api, bot.params);
    if (t.inventory[shot.weapon] !== undefined && t.inventory[shot.weapon] !== 0) {
      t.weapon = shot.weapon;
    } else if (t.inventory[t.weapon] === 0) t.weapon = this.firstWeapon(t);
    t.angle = Math.max(0, Math.min(180, Math.round(shot.angle)));
    t.power = Math.max(0, Math.min(1000, Math.round(shot.power)));
  }

  /**
   * Where a shell would land with this aim through the current terrain, ignoring everything the
   * shot itself would change. Uses the weapon's own flight behaviour and the same tracer as real
   * shells, so it is exact for the first impact.
   */
  predict(t: Tank, weapon: number, angle: number, power: number): ShotPrediction {
    const w = this.weapons[weapon] ?? this.weapons[0]!;
    const a = Math.max(0, Math.min(180, Math.round(angle))) * 10;
    const c = cosDeci(a);
    const s = sinDeci(a);
    const speed = Math.trunc((this.maxSpeed * Math.max(0, Math.min(1000, power))) / 1000);
    const p: Projectile = {
      id: 0,
      weapon,
      owner: t.player,
      x: t.x * FP + FP / 2 + Math.trunc((BARREL * c) / FP),
      y: (t.y - TANK_H) * FP - Math.trunc((BARREL * s) / FP),
      vx: Math.trunc((speed * c) / FP),
      vy: -Math.trunc((speed * s) / FP),
      age: 0,
      alive: true,
      data: [],
    };
    const W = this.grid.width * FP;
    const max = Math.min(PREDICT_TICKS, w.maxTicks);
    const hit = this.hit;
    for (let i = 0; i < max; i++) {
      let px = p.x;
      const py = p.y;
      const sig = w.flight.step(this, p, w.flightParams);
      p.age++;
      if (sig === 'die') break;
      if (sig === 'impact') {
        const x = Math.max(0, Math.min(this.grid.width - 1, Math.floor(p.x / FP)));
        const y = Math.max(0, Math.min(this.grid.height - 1, Math.floor(p.y / FP)));
        return { x, y, tank: this.tankAt(x, y, p), ticks: i, landed: true };
      }
      if (p.x < 0 || p.x >= W) {
        if (this.walls === 'wrap') {
          p.x = ((p.x % W) + W) % W;
          px = p.x;
        } else if (this.walls === 'bounce') {
          p.x = p.x < 0 ? -p.x : 2 * W - p.x - 1;
          p.vx = -p.vx;
        } else {
          const y = Math.floor(p.y / FP);
          return { x: p.x < 0 ? 0 : this.grid.width - 1, y, tank: -1, ticks: i, landed: false };
        }
      }
      if (sig !== 'skip' && this.trace(px, py, p, w)) {
        // Contact handlers only move the shell (no rng, no world changes), so they are safe here.
        const res = w.flight.contact?.(this, p, w.flightParams, hit) ?? 'impact';
        if (res === 'die') break;
        if (res !== 'continue') {
          return { x: hit.x, y: hit.y, tank: hit.tank, ticks: i, landed: true };
        }
      }
      if (p.y < -4 * this.grid.height * FP || p.y >= (this.grid.height + 8) * FP) break;
    }
    return {
      x: Math.floor(p.x / FP),
      y: Math.floor(p.y / FP),
      tank: -1,
      ticks: max,
      landed: false,
    };
  }

  private tankAt(cx: number, cy: number, p: Projectile): number {
    for (const t of this.tanks) {
      if (!t.alive || (t.player === p.owner && p.age < 4)) continue;
      if (cx >= t.x - TANK_HALF && cx < t.x + TANK_HALF && cy >= t.y - TANK_H && cy < t.y) {
        return t.player;
      }
    }
    return -1;
  }

  // ── projectiles ─────────────────────────────────────────────────────────────────────────

  private stepProjectiles(): void {
    const W = this.grid.width * FP;
    const H = this.grid.height;
    const hit = this.hit;
    // Children spawned this tick (cluster bombs) are appended and start moving next tick.
    const n = this.projectiles.length;
    for (let k = 0; k < n; k++) {
      const p = this.projectiles[k]!;
      if (!p.alive) continue;
      const w = this.weapons[p.weapon]!;
      let px = p.x;
      const py = p.y;
      const pvy = p.vy;
      const sig: FlightSignal = w.flight.step(this, p, w.flightParams);
      p.age++;
      if (sig === 'die') {
        p.alive = false;
        continue;
      }
      if (sig === 'impact') {
        this.impactHere(p);
        continue;
      }

      if (p.x < 0 || p.x >= W) {
        const wx = p.x < 0 ? 0 : this.grid.width - 1;
        const wy = Math.floor(p.y / FP);
        if (this.walls === 'concrete' || w.onWall) {
          this.impact(p, wx, Math.max(0, Math.min(H - 1, wy)));
          continue;
        }
        if (this.walls === 'absorb') {
          p.alive = false;
          continue;
        }
        if (this.walls === 'bounce') {
          p.x = p.x < 0 ? -p.x : 2 * W - p.x - 1;
          p.vx = -p.vx;
        } else {
          p.x = ((p.x % W) + W) % W;
          px = p.x;
        }
      }

      if (sig === 'pulse') {
        const cx = Math.max(0, Math.min(this.grid.width - 1, Math.floor(p.x / FP)));
        const cy = Math.max(0, Math.min(H - 1, Math.floor(p.y / FP)));
        this.runImpacts(w.pulse, p, cx, cy);
      }

      if (sig !== 'skip' && this.trace(px, py, p, w)) {
        const res: ContactResult = w.flight.contact?.(this, p, w.flightParams, hit) ?? 'impact';
        if (res === 'impact') {
          this.impact(p, hit.x, hit.y);
          continue;
        }
        if (res === 'die') {
          p.alive = false;
          continue;
        }
        if (res === 'pulse') this.runImpacts(w.pulse, p, hit.x, hit.y);
      }
      if (w.onApex && pvy < 0 && p.vy >= 0) {
        this.impactHere(p);
      } else if (w.onTimer > 0 && p.age >= w.onTimer) {
        this.impactHere(p);
      } else if (p.age >= w.maxTicks || p.y < -4 * H * FP || p.y >= (H + 8) * FP) {
        p.alive = false;
      }
    }
    if (this.projectiles.some((p) => !p.alive)) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
  }

  /** Scratch hit record filled by `trace`. */
  private readonly hit: FlightHit = { x: 0, y: 0, freeX: 0, freeY: 0, tank: -1 };

  /**
   * Walk the segment cell by cell; on the first hit fill `this.hit` (hit cell, last free cell
   * before it, tank hit) and return true.
   */
  private trace(x0: number, y0: number, p: Projectile, w: RtWeapon): boolean {
    const g = this.grid;
    const hit = this.hit;
    const dx = p.x - x0;
    const dy = p.y - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / FP));
    let fx = Math.max(0, Math.min(g.width - 1, Math.floor(x0 / FP)));
    let fy = Math.max(0, Math.min(g.height - 1, Math.floor(y0 / FP)));
    for (let i = 1; i <= n; i++) {
      const cx = Math.floor((x0 + Math.trunc((dx * i) / n)) / FP);
      const cy = Math.floor((y0 + Math.trunc((dy * i) / n)) / FP);
      if (cx < 0 || cx >= g.width) continue;
      if (cy >= g.height) {
        hit.x = cx;
        hit.y = g.height - 1;
        hit.freeX = fx;
        hit.freeY = fy;
        hit.tank = -1;
        return true;
      }
      if (cy < 0) continue;
      const solid = w.onSolid && g.material[cy * g.width + cx] !== 0;
      const tank = w.onTank ? this.tankAt(cx, cy, p) : -1;
      if (solid || tank >= 0) {
        hit.x = cx;
        hit.y = cy;
        hit.freeX = fx;
        hit.freeY = fy;
        hit.tank = tank;
        return true;
      }
      fx = cx;
      fy = cy;
    }
    return false;
  }

  private impactHere(p: Projectile): void {
    const x = Math.max(0, Math.min(this.grid.width - 1, Math.floor(p.x / FP)));
    const y = Math.max(0, Math.min(this.grid.height - 1, Math.floor(p.y / FP)));
    this.impact(p, x, y);
  }

  private impact(p: Projectile, x: number, y: number): void {
    p.alive = false;
    const owner = this.tanks[p.owner];
    if (owner) {
      owner.lastShotX = x;
      owner.lastShotY = y;
    }
    this.runImpacts(this.weapons[p.weapon]!.impacts, p, x, y);
  }

  private runImpacts(impacts: readonly RtImpact[], p: Projectile, x: number, y: number): void {
    for (const imp of impacts) {
      if (imp.kind === 'explosion') this.explode(imp.e, x, y, p.owner);
      else if (imp.kind === 'op') this.startOp(imp.op, x, y, imp.radius, imp.damageType, p.owner);
      else if (imp.kind === 'spawn') this.spawn(imp.s, p, x, y);
      else this.addZone(imp.z, x, y, p.owner);
    }
  }

  /** Child shells from the impact point, lifted out of the ground (§5.1 cluster weapons). */
  private spawn(s: RtSpawn, p: Projectile, x: number, y: number): void {
    const g = this.grid;
    let sy = Math.min(y, g.height - 1);
    for (let k = 0; k < 32 && sy > 0 && g.material[sy * g.width + x] !== 0; k++) sy--;
    const j = s.jitter >> 8;
    for (let i = 0; i < s.count; i++) {
      if (this.projectiles.length >= MAX_PROJECTILES) break;
      const weapon = s.pool.length === 1 ? s.pool[0]! : s.pool[this.rng.int(s.pool.length)]!;
      let vx = Math.trunc((p.vx * s.inherit) / FP);
      let vy =
        s.bounce > 0
          ? -Math.trunc((Math.abs(p.vy) * s.bounce) / FP)
          : Math.trunc((p.vy * s.inherit) / FP);
      if (s.count > 1) vx += Math.trunc((s.spread * (2 * i - (s.count - 1))) / (s.count - 1));
      if (j > 0) {
        vx += this.rng.range(-j, j) << 8;
        vy += this.rng.range(-j, j) << 8;
      }
      vy -= s.up;
      if (s.stagger > 0) vy -= s.stagger * (p.vx >= 0 ? i : s.count - 1 - i);
      this.projectiles.push({
        id: this.nextProjectileId++,
        weapon,
        owner: p.owner,
        x: x * FP + FP / 2,
        y: sy * FP + FP / 2,
        vx,
        vy,
        age: 0,
        alive: true,
        data: [],
      });
    }
  }

  private addZone(z: RtZoneSpec, x: number, y: number, owner: number): void {
    if (this.zones.length >= MAX_ZONES) this.zones.shift();
    this.zones.push({
      x,
      y,
      radius: z.radius,
      turns: z.turns,
      damage: z.damage,
      amplify: z.amplify,
      op: z.op,
      dt: damageTypeIndex(z.damageType),
      look: z.look,
      owner,
    });
    this.emit('zone', x, y, z.radius, { look: z.look, turns: z.turns });
  }

  /** End of a turn: zones hurt the tanks inside them and re-run their op, then age (§4a). */
  private applyZones(): void {
    if (this.zones.length === 0) return;
    for (const z of this.zones) {
      if (z.damage > 0) {
        for (const t of this.tanks) {
          if (!t.alive) continue;
          const dx = t.x - z.x;
          const dy = t.y - TANK_H / 2 - z.y;
          const reach = z.radius + TANK_HALF;
          if (dx * dx + dy * dy >= reach * reach) continue;
          this.emit('zoneHurt', t.x, t.y - TANK_H / 2, TANK_HALF, {
            damage: z.damage,
            look: z.look,
          });
          this.damageTank(t, z.damage, z.owner);
        }
      }
      if (z.op >= 0) {
        this.startOp(z.op, z.x, z.y, z.radius, DAMAGE_TYPES[z.dt]!, z.owner);
      }
      z.turns--;
    }
    this.zones = this.zones.filter((z) => z.turns > 0);
  }

  // ── explosions, ops, damage ─────────────────────────────────────────────────────────────

  private explode(e0: RtExplosion, x: number, y: number, owner: number): void {
    const e = this.resonate(e0, x, y);
    if (e.op >= 0) this.startOp(e.op, x, y, e.radius, e.damageType, owner);
    const scale = this.suddenDeathActive ? this.suddenDeath!.damageScale : 1;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const dy = t.y - TANK_H / 2 - y;
      const d = isqrt(dx * dx + dy * dy);
      const reach = e.radius + TANK_HALF;
      if (d >= reach) continue;
      // sheltered behind (or under) thick rock: the blast doesn't reach it
      if (this.groups.any && this.groups.shelters(this.grid, x, y, t.x, t.y - TANK_H / 2)) continue;
      if (e.damage > 0) {
        const base = e.linear ? Math.trunc((e.damage * (reach - d)) / reach) : e.damage;
        this.damageTank(t, Math.trunc(base * scale), owner);
      }
      if (e.chill > 0) {
        // frosted for its next own turns; a tank that frosts itself keeps it past this turn too
        const turns =
          e.chill + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
        if (turns > t.chill) t.chill = turns;
        this.emit('frosted', t.x, t.y - TANK_H / 2, TANK_HALF, { player: t.player });
      }
      if (e.push > 0 && dx !== 0) {
        const shove = Math.trunc((e.push * (reach - d)) / reach);
        t.x = Math.max(
          TANK_HALF,
          Math.min(this.grid.width - TANK_HALF - 1, t.x + (dx > 0 ? shove : -shove)),
        );
        t.lastHitBy = owner;
      }
    }
    // renderers tint the flash and sky by damage type (cosmetic)
    for (const [type, params] of e.effects) {
      this.emit(type, x, y, e.radius, { ...params, dt: e.dt });
    }
  }

  /** A resonance zone under the blast scales it once and is used up (Resonator). */
  private resonate(e: RtExplosion, x: number, y: number): RtExplosion {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]!;
      if (z.amplify <= FP) continue;
      const dx = x - z.x;
      const dy = y - z.y;
      if (dx * dx + dy * dy > z.radius * z.radius) continue;
      this.zones.splice(i, 1);
      this.emit('resonate', x, y, e.radius, { factor: z.amplify / FP });
      const k = z.amplify;
      return {
        ...e,
        radius: Math.min(400, Math.trunc((e.radius * k) / FP)),
        damage: Math.trunc((e.damage * k) / FP),
        push: Math.trunc((e.push * k) / FP),
      };
    }
    return e;
  }

  private startOp(
    op: number,
    x: number,
    y: number,
    radius: number,
    damageType: DamageType,
    owner: number,
  ): void {
    const site = this.opSites[op]!;
    const call: OpCall = {
      x,
      y,
      radius,
      damageType,
      damageTypeIndex: damageTypeIndex(damageType),
      owner,
    };
    this.grid.clearWatch();
    const shielded = this.groups.any && this.groups.shieldBegin(this.grid, x, y, radius);
    const data = site.b.start(this, site.params, call);
    if (shielded) this.groups.shieldEnd(this.grid);
    if (this.groups.any) this.groups.guard(this.grid, call.damageTypeIndex, this);
    if (data) this.ops.push({ op, call, t: 0, data });
  }

  private stepOps(): void {
    if (this.ops.length === 0) return;
    const next: OpInstance[] = [];
    for (const inst of this.ops) {
      inst.t++;
      const site = this.opSites[inst.op]!;
      this.grid.clearWatch();
      const c = inst.call;
      const shielded = this.groups.any && this.groups.shieldBegin(this.grid, c.x, c.y, c.radius);
      const more = site.b.step?.(this, site.params, inst) ?? false;
      if (shielded) this.groups.shieldEnd(this.grid);
      if (this.groups.any) this.groups.guard(this.grid, c.damageTypeIndex, this);
      if (more) next.push(inst);
    }
    this.ops = next;
  }

  private damageTank(t: Tank, dmg: number, by: number): void {
    if (dmg <= 0 || !t.alive) return;
    const applied = Math.min(dmg, t.health);
    t.health -= applied;
    const src = by >= 0 ? this.tanks[by] : undefined;
    // hitting a teammate scores like hitting yourself (free-for-all: only yourself)
    const friendly = src !== undefined && src.team === t.team;
    if (src) {
      if (friendly) src.selfDamage += applied;
      else src.damageDealt += applied;
    }
    if (by >= 0) t.lastHitBy = by;
    if (t.health <= 0) {
      t.alive = false;
      t.falling = false;
      if (src && !friendly) src.kills++;
      this.pendingDeaths.push({ player: t.player, killer: by });
    }
  }

  // ── tanks ───────────────────────────────────────────────────────────────────────────────

  /** Worst contact damage of any cell in or directly under each tank's footprint (§4b). */
  private applyContact(): void {
    const g = this.grid;
    const cd = this.mats.contactDamage;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      let worst = 0;
      for (let y = Math.max(0, t.y - TANK_H); y <= Math.min(g.height - 1, t.y); y++) {
        const row = y * g.width;
        for (let x = Math.max(0, t.x - TANK_HALF); x < Math.min(g.width, t.x + TANK_HALF); x++) {
          const d = cd[g.material[row + x]!]!;
          if (d > worst) worst = d;
        }
      }
      if (worst > 0) {
        this.emit('burn', t.x, t.y - TANK_H / 2, TANK_HALF, { damage: worst });
        this.damageTank(t, worst, t.lastHitBy);
      }
    }
  }

  /** On a flowing slope (quicksand) the tank slides one cell toward the lower side. */
  private slide(t: Tank): void {
    const g = this.grid;
    if (t.y >= g.height || (this.tick & 3) !== 0) return;
    const row = t.y * g.width;
    let flow = 0;
    let solid = 0;
    for (let x = Math.max(0, t.x - TANK_HALF); x < Math.min(g.width, t.x + TANK_HALF); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (this.mats.settle[m] === SETTLE_FLOW) flow++;
    }
    if (flow * 2 < solid || solid === 0) return;
    const l = g.surfaceY(t.x - TANK_HALF - 1);
    const r = g.surfaceY(t.x + TANK_HALF);
    if (l === r) return;
    const nx = t.x + (l > r ? -1 : 1);
    if (nx < TANK_HALF || nx >= g.width - TANK_HALF) return;
    t.x = nx;
  }

  /**
   * Which way a tank on slick ground (frost) slides: toward a side whose surface drops below the
   * row it stands on, lower side first; 0 when it is not mostly on slick cells or the ground is
   * level. Also returns the slick material's ticks per cell through `slipTicks`.
   */
  private slipDir(t: Tank): number {
    const g = this.grid;
    if (t.y >= g.height || t.sunk !== 0) return 0;
    const st = this.mats.slickTicks;
    const row = t.y * g.width;
    let n = 0;
    let solid = 0;
    let ticks = 0;
    for (let x = Math.max(0, t.x - TANK_HALF); x < Math.min(g.width, t.x + TANK_HALF); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (st[m] !== 0) {
        n++;
        ticks = st[m]!;
      }
    }
    if (solid === 0 || n * 2 < solid) return 0;
    const l = t.x - TANK_HALF - 1 >= 0 ? g.surfaceY(t.x - TANK_HALF - 1) : -1;
    const r = t.x + TANK_HALF < g.width ? g.surfaceY(t.x + TANK_HALF) : -1;
    if (l <= t.y && r <= t.y) return 0;
    const dir = l > r ? -1 : 1;
    const nx = t.x + dir;
    if (nx < TANK_HALF || nx >= g.width - TANK_HALF) return 0;
    this.slipTicks = ticks;
    return dir;
  }

  private slipTicks = 1;

  /** On slick ground (frost) the tank slides downhill one cell every few ticks. */
  private slip(t: Tank): void {
    const dir = this.slipDir(t);
    if (dir === 0 || this.tick % this.slipTicks !== 0) return;
    t.x += dir;
  }

  /**
   * On `sink` ground (quicksand) the tank settles into it: one cell every `sink.ticks` ticks, up to
   * `sink.depth` cells. Its lower body then sits inside the terrain, which the renderer draws over
   * it. It needs sink material under at least half the treads.
   */
  private sink(t: Tank): void {
    const g = this.grid;
    if (t.y >= g.height - 1) return;
    const row = t.y * g.width;
    const st = this.mats.sinkTicks;
    let n = 0;
    let solid = 0;
    let best = 0;
    for (let x = Math.max(0, t.x - TANK_HALF); x < Math.min(g.width, t.x + TANK_HALF); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (st[m] !== 0) {
        n++;
        best = m;
      }
    }
    if (n * 2 < solid || n * 2 < TANK_W) return;
    if (t.sunk >= this.mats.sinkDepth[best]! || this.tick % st[best]! !== 0) return;
    t.y++;
    t.sunk++;
  }

  private supported(t: Tank): boolean {
    if (t.y >= this.grid.height) return true;
    const m = this.grid.material;
    const row = t.y * this.grid.width;
    for (
      let x = Math.max(0, t.x - TANK_HALF);
      x < Math.min(this.grid.width, t.x + TANK_HALF);
      x++
    ) {
      if (m[row + x] !== 0) return true;
    }
    return false;
  }

  private stepTanks(): void {
    const fd = this.mode.fallDamage;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (!this.supported(t)) {
        if (!t.falling) {
          t.falling = true;
          t.fallFrom = t.y;
          t.fallVel = 0;
          t.sunk = 0;
        }
        t.fallVel = Math.min(t.fallVel + 1, MAX_TANK_FALL);
        for (let i = 0; i < t.fallVel && !this.supported(t); i++) t.y++;
      } else if (!t.falling) {
        // once it has started to sink the tank is bogged down and no longer slides
        this.sink(t);
        if (t.sunk === 0 && this.grid.settling) this.slide(t);
        if (!t.falling) this.slip(t);
      } else {
        t.falling = false;
        const dist = t.y - t.fallFrom;
        const by = this.shooter >= 0 ? this.shooter : t.lastHitBy;
        if (t.y >= this.grid.height) {
          // Fell out of the map (sudden-death void, or dug to the bottom): lost.
          this.emit('land', t.x, this.grid.height - 1, TANK_HALF, { distance: dist });
          this.damageTank(t, t.health, by);
          continue;
        }
        const dmg = Math.trunc(Math.max(0, dist - fd.safeCells) * fd.perCell);
        this.emit('land', t.x, t.y, TANK_HALF, { distance: dist });
        this.damageTank(t, dmg, by);
      }
    }
    // Death explosions; they may chain. Attribution follows the original killer (§3.5).
    for (let i = 0; i < this.pendingDeaths.length; i++) {
      const d = this.pendingDeaths[i]!;
      const t = this.tanks[d.player]!;
      this.emit('tankDeath', t.x, t.y - TANK_H / 2, TANK_W, { player: d.player });
      this.explode(this.deathExplosion, t.x, t.y - TANK_H / 2, d.killer);
    }
    this.pendingDeaths = [];
  }

  // ── turns and rounds ────────────────────────────────────────────────────────────────────

  private beginTurn(): void {
    this.contactDone = false;
    this.shooter = -1;
    this.phase = 'aim';
    this.modeB.onTurnStart(this.modeApi, this.modeParams);
    if (this.suddenDeathActive) this.collapseEdges();
    const t = this.tanks[this.activePlayer];
    this.botWait = t && t.bot >= 0 ? BOT_THINK_TICKS : 0;
    this.timer = t && t.bot < 0 ? this.turnTimerTicks : 0;
  }

  /** Sudden death: the outermost columns crumble into the void (§3.1). */
  private collapseEdges(): void {
    const sd = this.suddenDeath!;
    const g = this.grid;
    const n = Math.min(sd.edgeCells, Math.max(0, (g.width >> 1) - TANK_W - this.edge));
    if (n <= 0) return;
    const from = this.edge;
    this.edge += n;
    for (let y = 0; y < g.height; y++) {
      const row = y * g.width;
      for (let x = from; x < this.edge; x++) {
        g.clearCell(row + x);
        g.clearCell(row + g.width - 1 - x);
      }
    }
    // Whole columns go, so nothing above them can fall: only the renderer needs to know.
    g.addRenderRect(from, 0, n, g.height);
    g.addRenderRect(g.width - this.edge, 0, n, g.height);
    this.emit('collapse', from, g.height >> 1, n, { side: -1 });
    this.emit('collapse', g.width - 1 - from, g.height >> 1, n, { side: 1 });
  }

  private endTurn(): void {
    const active = this.tanks[this.activePlayer];
    if (active && active.chill > 0) active.chill--;
    this.turn++;
    turnDecay(this.grid, this.mats);
    if (this.teamsAlive() <= 1 || this.turn >= this.turnCap * this.tanks.length) {
      this.endRound();
      return;
    }
    for (let i = 0; i < this.order.length; i++) {
      this.turnPos = (this.turnPos + 1) % this.order.length;
      if (this.tanks[this.order[this.turnPos]!]?.alive) break;
    }
    this.beginTurn();
  }

  /** Distinct teams with a living tank. */
  private teamsAlive(): number {
    let n = 0;
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i]!;
      if (!t.alive) continue;
      let first = true;
      for (let j = 0; j < i; j++) {
        const u = this.tanks[j]!;
        if (u.alive && u.team === t.team) first = false;
      }
      if (first) n++;
    }
    return n;
  }

  /**
   * Teams in a stable order with their totals. In a free-for-all each player is a team of one, so
   * these are the player's own numbers.
   */
  private teamTotals(): {
    team: number;
    first: number;
    alive: boolean;
    health: number;
    damage: number;
    score: number;
  }[] {
    const out: ReturnType<World['teamTotals']> = [];
    for (const t of this.tanks) {
      let e = out.find((x) => x.team === t.team);
      if (!e) {
        e = { team: t.team, first: t.player, alive: false, health: 0, damage: 0, score: 0 };
        out.push(e);
      }
      if (t.alive) {
        e.alive = true;
        e.health += t.health;
      }
      e.damage += t.damageDealt;
      e.score += t.score;
    }
    return out;
  }

  /** Points, money and the round winner (§3.5, §3.6); then the shop or the end of the match. */
  private endRound(): void {
    const sc = this.mode.scoring;
    const eco = this.mode.economy;
    const standing = this.teamTotals().filter((e) => e.alive);
    let winnerTeam = -1;
    if (standing.length === 1) winnerTeam = standing[0]!.team;
    else if (standing.length > 1) {
      // turn cap: rank surviving teams by health, then damage dealt, then lowest player number
      winnerTeam = standing.sort(
        (a, b) => b.health - a.health || b.damage - a.damage || a.first - b.first,
      )[0]!.team;
    }
    const points: number[] = [];
    const earned: number[] = [];
    for (const t of this.tanks) {
      let pts =
        Math.trunc(t.damageDealt * sc.damage) +
        t.kills * sc.kill -
        Math.trunc(t.selfDamage * sc.selfDamage);
      if (t.alive) pts += sc.survival;
      if (t.team === winnerTeam) pts += sc.roundWin;
      points.push(pts);
      t.score += pts;
      const money = Math.trunc(t.money * eco.interest) + Math.max(0, pts) * eco.moneyPerPoint;
      earned.push(money);
      t.money += money;
    }
    // the round's named winner: the winning team's best scorer (ties: lower player number)
    let winner = -1;
    for (const t of this.tanks) {
      if (t.team !== winnerTeam) continue;
      if (winner < 0 || points[t.player]! > points[winner]!) winner = t.player;
    }
    this.results.push({ winner, winnerTeam, points, earned });
    this.round++;
    this.projectiles = [];
    this.timer = 0;
    if (this.round >= this.rounds) {
      this.phase = 'over';
      return;
    }
    this.openShop();
  }

  private openShop(): void {
    this.phase = 'shop';
    this.timer = this.shopTimerTicks;
    const j = Math.round(this.mode.economy.priceJitter * 1000);
    this.prices = this.weapons.map((w) =>
      w.price <= 0
        ? 0
        : Math.max(1, Math.round((w.price * (1000 + (j > 0 ? this.rng.range(-j, j) : 0))) / 1000)),
    );
    for (const t of this.tanks) {
      t.ready = false;
      if (t.bot >= 0) this.botShop(t);
    }
  }

  private botShop(t: Tank): void {
    const bot = this.bots[t.bot]!;
    const api: AiShopApi = {
      rng: this.rng,
      me: t.player,
      money: t.money,
      round: this.round,
      items: this.weapons.map((w, i) => ({
        index: i,
        id: w.id,
        price: this.prices[i] ?? 0,
        pack: w.pack,
        tier: w.tier,
        count: t.inventory[i] ?? 0,
        expectedDamage: w.expectedDamage,
        terrainValue: w.terrainValue,
      })),
    };
    for (const b of bot.b.shop(api, bot.params)) {
      const w = this.weapons[b.item];
      if (w) this.buy(t, w.id, b.packs);
    }
    t.ready = true;
  }

  private stepShop(): void {
    if (this.timer > 0) this.timer--;
    if (this.timer === 0 || this.tanks.every((t) => t.ready)) this.startRound();
  }

  /**
   * Match-winning team by total score (ties: more round wins, then lower player number). In a
   * free-for-all that is the winning player.
   */
  get matchWinnerTeam(): number {
    if (this.phase !== 'over') return -1;
    const wins = (team: number) => this.results.filter((r) => r.winnerTeam === team).length;
    return this.teamTotals().sort(
      (a, b) => b.score - a.score || wins(b.team) - wins(a.team) || a.first - b.first,
    )[0]!.team;
  }

  /** Match winner: the best scorer of the winning team (the winning player in a free-for-all). */
  get matchWinner(): number {
    const team = this.matchWinnerTeam;
    if (team < 0) return -1;
    let best = -1;
    for (const t of this.tanks) {
      if (t.team === team && (best < 0 || t.score > this.tanks[best]!.score)) best = t.player;
    }
    return best;
  }

  // ── observation ─────────────────────────────────────────────────────────────────────────

  weaponId(index: number): string {
    return this.weapons[index]?.id ?? '';
  }

  weaponByIndex(id: string): number {
    return Object.hasOwn(this.weaponIndex, id) ? this.weaponIndex[id]! : -1;
  }

  /** Read-only render snapshot (§2b). Dirty rects and effect events since the previous call. */
  snapshot(): RenderSnapshot {
    const entities: EntityView[] = [];
    for (const t of this.tanks) {
      entities.push({
        kind: 'tank',
        player: t.player,
        x: t.x,
        y: t.y,
        angle: t.angle,
        health: t.health,
        alive: t.alive,
        power: t.power,
        chill: t.chill,
        active: this.phase === 'aim' && t.player === this.activePlayer,
      });
    }
    for (const p of this.projectiles) {
      entities.push({
        kind: 'projectile',
        id: p.id,
        weapon: this.weaponId(p.weapon),
        x: p.x / FP,
        y: p.y / FP,
      });
    }
    for (const z of this.zones) {
      entities.push({
        kind: 'zone',
        x: z.x,
        y: z.y,
        radius: z.radius,
        look: ZONE_LOOKS[z.look] ?? 'gas',
        turns: z.turns,
      });
    }
    const effectEvents = this.effects;
    this.effects = [];
    return {
      tick: this.tick,
      turn: this.turn + this.round * 1000,
      width: this.grid.width,
      height: this.grid.height,
      terrain: this.grid.material,
      coating: this.grid.coating,
      dirtyRects: this.grid.takeRenderRects(),
      entities,
      effectEvents,
      debris: {
        count: this.debris.count,
        x: this.debris.x,
        y: this.debris.y,
        material: this.debris.mat,
      },
      wind: this.wind / FP,
      theme: 'theme.default',
    };
  }

  /** Hash of everything that can influence future ticks (desync detection, golden tests). */
  hash(): string {
    const h = new Hasher();
    const g = this.grid;
    h.num(this.tick).str(this.phase).num(this.wind).num(this.turn).num(this.turnPos);
    h.num(this.round).num(this.timer).num(this.botWait).num(this.edge);
    h.num(this.shooter).num(this.nextProjectileId);
    for (const o of this.order) h.num(o);
    for (const p of this.prices) h.num(p);
    for (let i = 0; i < 4; i++) h.u32(this.rng.state[i]!);
    h.bytes(g.material).bytes(g.coating).bytes(g.cellState).bytes(g.fallVel);
    h.bytes(g.group).bytes(g.groupMat);
    this.groups.hash(h);
    h.num(g.settleMinX).num(g.settleMaxX).num(g.settleMaxY);
    h.num(g.reactMinX).num(g.reactMaxX).num(g.reactMinY).num(g.reactMaxY);
    h.num(g.turnMinX).num(g.turnMaxX).num(g.turnMinY).num(g.turnMaxY);
    h.num(this.contactDone ? 1 : 0);
    for (const t of this.tanks) {
      h.num(t.player)
        .num(t.alive ? 1 : 0)
        .num(t.x)
        .num(t.y)
        .num(t.health)
        .num(t.angle)
        .num(t.power);
      h.num(t.weapon)
        .num(t.falling ? 1 : 0)
        .num(t.fallFrom)
        .num(t.fallVel)
        .num(t.sunk)
        .num(t.chill)
        .num(t.lastHitBy);
      h.num(t.kills).num(t.damageDealt).num(t.selfDamage);
      h.num(t.score)
        .num(t.money)
        .num(t.bot)
        .num(t.ready ? 1 : 0);
      h.num(t.lastShotX).num(t.lastShotY).num(t.lastShotAngle).num(t.lastShotPower);
      for (const v of t.inventory) h.num(v);
      h.num(t.aiMem.length);
      for (const v of t.aiMem) h.num(v);
    }
    h.num(this.projectiles.length);
    for (const p of this.projectiles) {
      h.num(p.id).num(p.weapon).num(p.owner).num(p.x).num(p.y).num(p.vx).num(p.vy).num(p.age);
      for (const v of p.data) h.num(v);
    }
    const d = this.debris;
    h.num(d.count);
    for (let i = 0; i < d.count; i++) {
      h.num(d.x[i]!)
        .num(d.y[i]!)
        .num(d.vx[i]!)
        .num(d.vy[i]!)
        .u32(d.mat[i]!)
        .u32(d.coat[i]!)
        .u32(d.state[i]!);
    }
    h.num(this.zones.length);
    for (const z of this.zones) {
      h.num(z.x).num(z.y).num(z.radius).num(z.turns).num(z.damage).num(z.amplify);
      h.num(z.op).num(z.dt).num(z.look).num(z.owner);
    }
    h.num(this.ops.length);
    for (const o of this.ops) {
      h.num(o.op).num(o.t).num(o.call.x).num(o.call.y).num(o.call.radius).num(o.call.owner);
      for (const v of o.data) h.num(v);
    }
    return h.hex();
  }
}
