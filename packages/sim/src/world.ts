import {
  AI_CORE_KEYS,
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
  AI_FUEL,
  type AiApi,
  type AiBehaviour,
  type AiGearView,
  type AiSpot,
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
import { FP, FP_SHIFT, cosDeci, isqrt, sinDeci, toFixed } from './fixed';
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

/**
 * Standard tank footprint (§2a: ~16×10): `tank.classic`, and every tank when no `tank.*` item is
 * loaded. x is the centre column, y the row the tank stands on. Tank types (`tank.*`) bring their own.
 */
export const TANK_W = 16;
export const TANK_H = 10;
export const TANK_HALF = TANK_W / 2;
const BARREL = 8 * FP;
const MAX_TANK_FALL = 8;
/** Highest power (of 1000) a frosted tank can fire with. */
export const CHILL_POWER = 500;
/**
 * Ticks a bot "thinks" before its shot (so humans can follow); it aims halfway through. A bot
 * that drives decides where to go a few ticks in, and the countdown waits while it drives.
 */
export const BOT_THINK_TICKS = 50;
const BOT_MOVE_TICK = BOT_THINK_TICKS - 8;
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
  /**
   * Tank type per player (`tank.*` id), `'random'` for one drawn from the seed (not the match
   * RNG), `'auto'` for the player's bot's favourite (`ai.*` `tank`), or null/undefined for the
   * mode's default tank.
   */
  tanks?: readonly (string | null | undefined)[] | undefined;
}

/** A tank type's numbers as the kernel uses them (§3.2). */
export interface TankType {
  /** `tank.*` id, or '' for the built-in standard tank. */
  readonly id: string;
  /** Percent of the mode's starting health. */
  readonly health: number;
  readonly shield: number;
  readonly width: number;
  readonly height: number;
  /** Percent damage dealt by its shells. */
  readonly damage: number;
  /** Percent muzzle speed. */
  readonly muzzle: number;
  /** Percent drive distance (driving lands later). */
  readonly drive: number;
}

/** The standard tank, used when a mode names no `tank` (or a match loads no tank types). */
export const STANDARD_TANK: TankType = {
  id: '',
  health: 100,
  shield: 0,
  width: TANK_W,
  height: TANK_H,
  damage: 100,
  muzzle: 100,
  drive: 100,
};

/** `shop` sits between rounds; `over` is the end of the match. */
export type Phase = 'aim' | 'resolve' | 'shop' | 'over';

export interface Tank extends TankHandle {
  readonly player: number;
  /** Team id (milestone 7); the player number in a free-for-all. */
  readonly team: number;
  /** Tank type (§3.2); fixed for the match. */
  readonly type: TankType;
  /** Hitbox width (even) and half-width, and height, in cells. */
  readonly w: number;
  readonly half: number;
  readonly h: number;
  alive: boolean;
  x: number;
  y: number;
  health: number;
  /** Health at round start (for health bars). */
  maxHealth: number;
  /** Shield points left this round; they soak damage before health. */
  shield: number;
  /** Most shield points this tank has held this round (for the shield bar). */
  shieldMax: number;
  /** Gear counts (`gear.*`, §5.1) by index into `World.gear`; a match total like weapons. */
  gear: number[];
  /** A parachute opened during the current fall: it drifts down and lands unhurt. */
  chute: boolean;
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
  /** Cells this tank may still drive this turn, and where it is driving now (-1, 0, 1). */
  driveLeft: number;
  driving: number;
  /** Drive fuel (one unit per cell); a match total, topped up in the shop. */
  fuel: number;
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
  /** Column a bot is driving to this turn (-1 = none). */
  botGoal: number;
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
  /** Gas cloud (null = fixed zone). Fixed-point speeds. */
  cloud: { puffs: number; puffRadius: number; billow: number; drift: number; sink: number } | null;
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
  /**
   * Gas cloud puffs, flattened x, y, vx, vy per puff in fixed-point cells (empty for a fixed
   * zone). `x`,`y` above follow the cloud's middle.
   */
  puffs: number[];
  puffRadius: number;
  /** Fixed-point: wind multiplier, and sink acceleration per tick. */
  drift: number;
  sink: number;
  /** Ticks since the zone was laid. */
  age: number;
}

/** Gas cloud puffs, fixed-point cells/tick per tick: apart, upward when on top, downhill. */
const PUFF_PUSH = FP >> 6;
const PUFF_LIFT = FP >> 6;
const PUFF_SLIDE = FP >> 6;

/** Most zones alive at once; the oldest goes first. */
export const MAX_ZONES = 32;
/** Most shells in the air at once (cluster bombs); extra children are dropped. */
export const MAX_PROJECTILES = 64;
const ZONE_LOOKS = ['gas', 'acid', 'resonance', 'toxic'] as const;

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

/** A `gear.*` item as the kernel uses it (§5.1). */
export interface RtGear {
  readonly id: string;
  readonly deploy: 'manual' | 'fall';
  readonly shield: number;
  readonly heal: number;
  readonly fallSpeed: number;
  readonly price: number;
  readonly pack: number;
  readonly max: number;
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
  /** Defensive gear (§5.1), in id order; sold at fixed prices (no jitter, so no RNG draws). */
  readonly gear: RtGear[] = [];
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
  private readonly gearIndex: Record<string, number> = {};
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
    for (const g of content.list('gear')) {
      this.gearIndex[g.id] = this.gear.length;
      this.gear.push({
        id: g.id,
        deploy: g.deploy,
        shield: g.shield,
        heal: g.heal,
        fallSpeed: g.fallSpeed,
        price: g.shop.price,
        pack: g.shop.pack,
        max: g.shop.max,
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
          cloud: z.cloud
            ? {
                puffs: z.cloud.puffs,
                puffRadius: z.cloud.puffRadius,
                billow: toFixed(z.cloud.billow),
                drift: toFixed(z.cloud.drift),
                sink: toFixed(z.cloud.sink),
              }
            : null,
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
    this.bots.push({ b, params: b.params.parse(behaviourParams(item, AI_CORE_KEYS)) });
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
    t.driving = 0;
    t.botGoal = -1;
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
      const gear = new Array<number>(this.gear.length).fill(0);
      for (const l of loadout) inventory[this.weaponIndex[l.weapon]!] = l.count;
      const setup = this.options.tankSetup?.[p];
      if (setup?.inventory) {
        // order-independent: each key sets its own slot (weapons and gear alike)
        for (const id of Object.keys(setup.inventory)) {
          const gi = Object.hasOwn(this.gearIndex, id) ? this.gearIndex[id] : undefined;
          if (gi !== undefined) {
            gear[gi] = Math.max(0, setup.inventory[id]!);
            continue;
          }
          const w = Object.hasOwn(this.weaponIndex, id) ? this.weaponIndex[id] : undefined;
          if (w === undefined) throw new Error(`unknown weapon in tank setup: ${id}`);
          inventory[w] = setup.inventory[id]!;
        }
      }
      const botId = this.options.bots?.[p];
      const type = this.tankType(p);
      this.tanks.push({
        player: p,
        team: this.options.teams?.[p] ?? p,
        type,
        w: type.width,
        half: type.width >> 1,
        h: type.height,
        alive: true,
        x: 0,
        y: 0,
        health: 0,
        maxHealth: 0,
        shield: 0,
        shieldMax: 0,
        gear,
        chute: false,
        angle: 90,
        power: 500,
        weapon: loadout[0] ? this.weaponIndex[loadout[0].weapon]! : 0,
        inventory,
        falling: false,
        fallFrom: 0,
        fallVel: 0,
        sunk: 0,
        chill: 0,
        driveLeft: 0,
        driving: 0,
        fuel: this.mode.drive.startFuel,
        lastHitBy: -1,
        kills: 0,
        damageDealt: 0,
        selfDamage: 0,
        score: 0,
        money: cash,
        bot: botId ? this.bindBot(botId) : -1,
        aiMem: [],
        botGoal: -1,
        lastShotX: -1,
        lastShotY: -1,
        lastShotAngle: 0,
        lastShotPower: 0,
        ready: false,
      });
    }
  }

  /**
   * Player `p`'s tank type: the setup's pick, one drawn from the seed for `'random'` (a separate
   * PRNG, so the match RNG and every golden stay put), else the mode's default tank.
   */
  private tankType(p: number): TankType {
    const all = this.content.list('tank');
    let id = this.options.tanks?.[p] ?? this.mode.tank;
    if (id === 'auto') {
      const bot = this.options.bots?.[p];
      id = (bot ? this.content.get('ai', bot).tank : undefined) ?? this.mode.tank;
    }
    if (id === 'random' && all.length > 0) {
      const r = new Prng((this.options.seed ^ Math.imul(p + 1, 0x9e3779b1)) >>> 0);
      id = all[r.range(0, all.length - 1)]!.id;
    }
    if (!id || !id.startsWith('tank.') || !this.content.has(id)) return STANDARD_TANK;
    const m = this.content.get('tank', id);
    return {
      id: m.id,
      health: m.health,
      shield: m.shield,
      width: m.body.width,
      height: m.body.height,
      damage: m.damage,
      muzzle: m.muzzle,
      drive: m.drive,
    };
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
      tank.x = Math.max(tank.half, Math.min(g.width - tank.half - 1, col));
      tank.alive = true;
      const full = Math.trunc((this.mode.startingHealth * tank.type.health) / 100);
      tank.health = this.options.tankSetup?.[p]?.health ?? full;
      tank.maxHealth = Math.max(full, tank.health);
      tank.shield = tank.type.shield;
      tank.shieldMax = tank.type.shield;
      tank.chute = false;
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
      tank.y = this.restingY(tank, res.spawnFrom);
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
   * tank spawned under a rock arch stands on the ground beneath it, not on top. Rows above the
   * generator's `spawnFrom` (a cave roof) don't count either.
   */
  private restingY(t: Tank, from?: Int32Array): number {
    const g = this.grid;
    let y = g.height;
    for (let x = Math.max(0, t.x - t.half); x < Math.min(g.width, t.x + t.half); x++) {
      const r0 = Math.max(0, Math.min(g.height, from?.[x] ?? 0));
      for (let r = r0, i = r0 * g.width + x; r < y; r++, i += g.width) {
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

  hold(player: number, x: number, y: number): void {
    const t = this.tanks[player];
    if (!t || !t.alive) return;
    t.x = Math.max(t.half, Math.min(this.grid.width - 1 - t.half, x));
    t.y = Math.max(t.h, Math.min(this.grid.height - 1, y));
    if (!t.falling) {
      t.falling = true;
      t.fallFrom = t.y;
    } else if (t.y < t.fallFrom) {
      t.fallFrom = t.y;
    }
    // stepTanks adds 1 before moving it, so a held tank stays put this tick
    t.fallVel = -1;
    t.sunk = 0;
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
    this.stepClouds();
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
    if (input.type === 'buy' || input.type === 'buyFuel' || input.type === 'ready') {
      if (this.phase !== 'shop' || t.ready) return;
      if (input.type === 'ready') t.ready = true;
      else if (input.type === 'buyFuel') this.buyFuel(t, input.packs);
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
      case 'drive':
        t.driving = t.driveLeft > 0 && t.fuel > 0 ? input.dir : 0;
        break;
      case 'useGear': {
        const g = Object.hasOwn(this.gearIndex, input.gear)
          ? this.gearIndex[input.gear]
          : undefined;
        if (g !== undefined) this.useGear(t, g);
        break;
      }
    }
  }

  /** Whether switching on gear `g` now would change anything for this tank. */
  gearUseful(t: Tank, g: number): boolean {
    const gear = this.gear[g];
    if (!gear || gear.deploy !== 'manual' || !t.alive) return false;
    return (gear.shield > 0 && t.shield < gear.shield) || (gear.heal > 0 && t.health < t.maxHealth);
  }

  /**
   * Switch on a piece of gear while aiming (§5.1); it doesn't use up the turn. A shield raises the
   * tank's shield to the gear's points, a battery restores health up to the round-start health.
   * Returns false (changing nothing) when the tank has none or it would do nothing.
   */
  useGear(t: Tank, g: number): boolean {
    if (this.phase !== 'aim' || t.player !== this.activePlayer) return false;
    if ((t.gear[g] ?? 0) <= 0 || !this.gearUseful(t, g)) return false;
    const gear = this.gear[g]!;
    t.gear[g]!--;
    const cy = t.y - (t.h >> 1);
    if (gear.shield > t.shield) {
      t.shield = gear.shield;
      t.shieldMax = Math.max(t.shieldMax, t.shield);
      this.emit('shieldUp', t.x, cy, t.half + 2, { player: t.player, shield: t.shield });
    }
    if (gear.heal > 0 && t.health < t.maxHealth) {
      const healed = Math.min(gear.heal, t.maxHealth - t.health);
      t.health += healed;
      this.emit('battery', t.x, cy, t.half + 2, { player: t.player, healed });
    }
    return true;
  }

  /**
   * Buy `packs` packs of gear at its fixed price, never past its carry limit. Returns false
   * (changing nothing) when it isn't shop time, the tank is full or can't afford it.
   */
  buyGear(t: Tank, g: number, packs: number): boolean {
    const gear = this.gear[g];
    if (!gear || this.phase !== 'shop' || packs < 1) return false;
    const have = t.gear[g] ?? 0;
    const cost = gear.price * packs;
    if (have >= gear.max || cost > t.money) return false;
    t.money -= cost;
    t.gear[g] = Math.min(gear.max, have + gear.pack * packs);
    return true;
  }

  /**
   * Buy drive fuel in the shop (§3.2): `packs` × `fuelPack` units at `fuelPrice` each pack, never
   * past `fuelMax`. Returns false (changing nothing) when it isn't shop time, the tank is full or
   * can't afford it.
   */
  buyFuel(t: Tank, packs: number): boolean {
    const d = this.mode.drive;
    const cost = d.fuelPrice * packs;
    if (this.phase !== 'shop' || packs < 1 || t.fuel >= d.fuelMax || cost > t.money) return false;
    t.money -= cost;
    t.fuel = Math.min(d.fuelMax, t.fuel + d.fuelPack * packs);
    return true;
  }

  /** Per-turn drive allowance for a tank: the mode's cells scaled by its type's `drive` percent. */
  driveCells(t: Tank): number {
    return Math.trunc((this.mode.drive.cells * t.type.drive) / 100);
  }

  /**
   * One cell of driving (§3.2). The tank climbs a step of up to `drive.climb` cells, rolls down
   * one of the same, and stops at anything steeper (a wall, a prop, ground it is bogged in), at the
   * map edge (or the sudden-death void) or when its drive runs out. A real drop it simply falls.
   */
  private driveStep(t: Tank): void {
    const g = this.grid;
    const dir = t.driving;
    const nx = t.x + dir;
    if (nx < t.half + this.edge || nx >= g.width - t.half - this.edge) {
      t.driving = 0;
      return;
    }
    const climb = this.mode.drive.climb;
    const col = dir > 0 ? nx + t.half - 1 : nx - t.half;
    let top = t.y;
    for (let r = Math.max(0, t.y - t.h); r < Math.min(g.height, t.y); r++) {
      if (g.material[r * g.width + col] !== 0) {
        top = r;
        break;
      }
    }
    if (t.y - top > climb) {
      t.driving = 0;
      this.emit('driveBlocked', t.x, t.y, t.half, { dir });
      return;
    }
    t.x = nx;
    t.y = top;
    for (let d = 0; d < climb && !this.supported(t); d++) t.y++;
    t.driveLeft--;
    t.fuel--;
    if (t.driveLeft <= 0 || t.fuel <= 0) t.driving = 0;
    this.emit('drive', t.x, t.y, t.half, { dir, left: t.driveLeft });
  }

  /**
   * Where driving in `dir` would take this tank this turn, cell by cell (the same rules as
   * `driveStep`), without moving it: up to its drive allowance and fuel, stopping at a wall, the
   * map edge, or before a drop it would take fall damage from. Read-only, so bots can plan with it.
   */
  reach(t: Tank, dir: -1 | 1): AiSpot[] {
    const g = this.grid;
    const climb = this.mode.drive.climb;
    const safe = this.mode.fallDamage.safeCells;
    const out: AiSpot[] = [];
    const n = Math.min(t.driveLeft, t.fuel);
    let x = t.x;
    let y = t.y;
    for (let i = 0; i < n; i++) {
      const nx = x + dir;
      if (nx < t.half + this.edge || nx >= g.width - t.half - this.edge) break;
      const col = dir > 0 ? nx + t.half - 1 : nx - t.half;
      let top = y;
      for (let r = Math.max(0, y - t.h); r < Math.min(g.height, y); r++) {
        if (g.material[r * g.width + col] !== 0) {
          top = r;
          break;
        }
      }
      if (y - top > climb) break;
      let ny = top;
      for (let d = 0; d < climb && !this.supportedAt(nx, ny, t.half); d++) ny++;
      // past the climb it falls; a drop it lands from unhurt is fine, a deeper one is not
      for (let d = 0; d < safe && !this.supportedAt(nx, ny, t.half); d++) ny++;
      if (!this.supportedAt(nx, ny, t.half)) break;
      x = nx;
      y = ny;
      out.push({ x, y });
    }
    return out;
  }

  /**
   * Buy `packs` packs of a weapon at this round's price (§3.6). Returns false (and changes nothing)
   * if it isn't shop time, the item isn't for sale, the player already has it unlimited, or can't
   * afford it.
   */
  buy(t: Tank, item: string, packs: number): boolean {
    if (Object.hasOwn(this.gearIndex, item)) return this.buyGear(t, this.gearIndex[item]!, packs);
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
    t.driving = 0;
    const a = t.angle * 10;
    const c = cosDeci(a);
    const s = sinDeci(a);
    const power = t.chill > 0 ? Math.min(t.power, CHILL_POWER) : t.power;
    const speed = this.muzzleSpeed(t, power);
    const x = t.x * FP + FP / 2 + Math.trunc((BARREL * c) / FP);
    const y = (t.y - t.h) * FP - Math.trunc((BARREL * s) / FP);
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

  /** Launch speed (fixed-point) for `power` 0–1000 from this tank's muzzle. */
  private muzzleSpeed(t: Tank, power: number): number {
    const v = Math.trunc((this.maxSpeed * Math.max(0, Math.min(1000, power))) / 1000);
    return t.type.muzzle === 100 ? v : Math.trunc((v * t.type.muzzle) / 100);
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
      if (t.driving !== 0) {
        if (!t.falling && this.tick % this.mode.drive.ticksPerCell === 0) {
          this.driveStep(t);
          if (t.x === t.botGoal) t.driving = 0;
        }
        return;
      }
      if (t.falling) return;
      this.botWait--;
      if (this.botWait === BOT_MOVE_TICK) this.botMove(t);
      if (this.botWait === BOT_THINK_TICKS >> 1) this.botAim(t);
      if (this.botWait <= 0) this.fire(t);
      return;
    }
    if (t.driving !== 0 && !t.falling && this.tick % this.mode.drive.ticksPerCell === 0) {
      this.driveStep(t);
    }
    if (this.timer > 0 && --this.timer === 0) {
      // Out of time: fire with the current settings (§3.3).
      if (t.inventory[t.weapon] === 0) t.weapon = this.firstWeapon(t);
      this.fire(t);
    }
  }

  /** The bot's view of the match on its turn (§3.7). */
  private aiApi(t: Tank): AiApi {
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
    return {
      rng: this.rng,
      me: t.player,
      tanks: this.tanks,
      weapons,
      gear: this.gearView(t),
      width: this.grid.width,
      height: this.grid.height,
      wind: this.wind,
      gravity: this.gravity,
      maxSpeed: this.muzzleSpeed(t, 1000),
      surfaceY: (x) => this.grid.surfaceY(x),
      predict: (w, angle, power, from) => this.predict(t, w, angle, power, from),
      fuel: t.fuel,
      driveLeft: t.driveLeft,
      reach: (dir) => this.reach(t, dir),
      chill: t.chill,
      lastShot:
        t.lastShotX >= 0
          ? { x: t.lastShotX, y: t.lastShotY, angle: t.lastShotAngle, power: t.lastShotPower }
          : null,
      memory: t.aiMem,
      angle: t.angle,
      power: t.power,
    };
  }

  /** What gear a tank carries, for its bot (§5.1). */
  private gearView(t: Tank): AiGearView[] {
    return this.gear.map((g, i) => ({
      index: i,
      id: g.id,
      deploy: g.deploy,
      shield: g.shield,
      heal: g.heal,
      count: t.gear[i] ?? 0,
      useful: this.gearUseful(t, i),
    }));
  }

  /** A bot that drives picks a reachable column and starts rolling there. */
  private botMove(t: Tank): void {
    const bot = this.bots[t.bot]!;
    t.driving = 0;
    t.botGoal = -1;
    if (!bot.b.move || t.driveLeft <= 0 || t.fuel <= 0) return;
    const goal = bot.b.move(this.aiApi(t), bot.params);
    if (!Number.isInteger(goal) || goal === t.x) return;
    const dir = goal > t.x ? 1 : -1;
    if (!this.reach(t, dir).some((s) => s.x === goal)) return;
    t.botGoal = goal;
    t.driving = dir;
  }

  private botAim(t: Tank): void {
    const bot = this.bots[t.bot]!;
    if (bot.b.gear) {
      // gear first (a shield up before the shot), each use validated like a human's
      for (const g of bot.b.gear(this.aiApi(t), bot.params)) {
        if (Number.isInteger(g)) this.useGear(t, g);
      }
    }
    const shot = bot.b.aim(this.aiApi(t), bot.params);
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
  predict(t: Tank, weapon: number, angle: number, power: number, from?: AiSpot): ShotPrediction {
    const w = this.weapons[weapon] ?? this.weapons[0]!;
    const a = Math.max(0, Math.min(180, Math.round(angle))) * 10;
    const c = cosDeci(a);
    const s = sinDeci(a);
    const speed = this.muzzleSpeed(t, t.chill > 0 ? Math.min(power, CHILL_POWER) : power);
    const ox = from ? from.x | 0 : t.x;
    const oy = from ? from.y | 0 : t.y;
    const p: Projectile = {
      id: 0,
      weapon,
      owner: t.player,
      x: ox * FP + FP / 2 + Math.trunc((BARREL * c) / FP),
      y: (oy - t.h) * FP - Math.trunc((BARREL * s) / FP),
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
      if (cx >= t.x - t.half && cx < t.x + t.half && cy >= t.y - t.h && cy < t.y) {
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
    const c = z.cloud;
    const puffs: number[] = [];
    if (c) {
      // lift the burst point out of the ground, then fling the puffs out in a ring
      const g = this.grid;
      let sy = Math.min(y, g.height - 1);
      for (let k = 0; k < 32 && sy > 0 && g.material[sy * g.width + x] !== 0; k++) sy--;
      y = sy;
      for (let i = 0; i < c.puffs; i++) {
        const a = Math.trunc((i * 3600) / c.puffs) + this.rng.range(-150, 150);
        const sp = c.billow - this.rng.int((c.billow >> 1) + 1);
        // flattened: more sideways than up, as heavy gas spills out rather than rising
        puffs.push(
          x * FP + FP / 2,
          y * FP + FP / 2,
          Math.trunc((cosDeci(a) * sp) / FP),
          Math.trunc((sinDeci(a) * sp) / FP / 2),
        );
      }
    }
    this.zones.push({
      x,
      y,
      radius: c ? c.puffRadius : z.radius,
      turns: z.turns,
      damage: z.damage,
      amplify: z.amplify,
      op: z.op,
      dt: damageTypeIndex(z.damageType),
      look: z.look,
      owner,
      puffs,
      puffRadius: c ? c.puffRadius : 0,
      drift: c ? c.drift : 0,
      sink: c ? c.sink : 0,
      age: 0,
    });
    this.emit('zone', x, y, c ? c.puffRadius * 2 : z.radius, { look: z.look, turns: z.turns });
  }

  /**
   * Gas clouds move every tick (aim and resolve alike): each puff eases toward the wind's drift,
   * sinks, keeps clear of the other puffs, slides down slopes and climbs only gentle ones. A puff
   * blown off the map or buried under new ground is gone; a cloud with no puffs left is gone.
   */
  private stepClouds(): void {
    if (this.zones.length === 0) return;
    const g = this.grid;
    const W = g.width;
    const H = g.height;
    const mat = g.material;
    let emptied = false;
    for (const z of this.zones) {
      const pf = z.puffs;
      if (pf.length === 0) continue;
      z.age++;
      // puffs settle about half a radius apart: a thick blanket, not a row of balls
      const r = Math.max(2, z.puffRadius >> 1);
      const tvx = Math.trunc((this.wind * z.drift) / FP);
      let n = pf.length >> 2;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i++) {
        const o = i << 2;
        let x = pf[o]!;
        let y = pf[o + 1]!;
        let vx = pf[o + 2]!;
        let vy = pf[o + 3]!;
        // wind and weight
        vx += (tvx - vx) >> 5;
        vy += z.sink >> 4;
        vy -= vy >> 4;
        // keep apart: puffs closer than a radius push each other away (spreads the cloud out)
        const cx0 = x >> FP_SHIFT;
        const cy0 = y >> FP_SHIFT;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = cx0 - (pf[j << 2]! >> FP_SHIFT);
          const dy = cy0 - (pf[(j << 2) + 1]! >> FP_SHIFT);
          if (dx >= r || dx <= -r || dy >= r || dy <= -r) continue;
          vx += dx > 0 ? PUFF_PUSH : dx < 0 ? -PUFF_PUSH : i < j ? -PUFF_PUSH : PUFF_PUSH;
          if (dy < 0 || (dy === 0 && i < j)) vy -= PUFF_LIFT;
        }
        // across: climb at most two cells, else stall
        let nx = x + vx;
        let cx = nx >> FP_SHIFT;
        if (cx < 0 || cx >= W) {
          pf[o] = -1;
          continue;
        }
        let cy = y >> FP_SHIFT;
        if (cy >= 0 && mat[cy * W + cx] !== 0) {
          let up = 1;
          while (up <= 2 && cy - up >= 0 && mat[(cy - up) * W + cx] !== 0) up++;
          if (up <= 2) {
            y -= up * FP;
            cy -= up;
          } else {
            nx = x;
            cx = x >> FP_SHIFT;
            vx = -(vx >> 1);
          }
        }
        x = nx;
        // down (or up): rest on the ground, then slide toward the lower side
        const ny = y + vy;
        const ncy = ny >> FP_SHIFT;
        if (ncy >= H || (ncy >= 0 && mat[ncy * W + cx] !== 0)) {
          vy = 0;
          // which way is down: the deeper drop three cells to either side
          const dl = cx >= 3 ? dropBelow(mat, W, H, cx - 3, cy) : 0;
          const dr = cx + 3 < W ? dropBelow(mat, W, H, cx + 3, cy) : 0;
          if (dl > dr) vx -= PUFF_SLIDE;
          else if (dr > dl) vx += PUFF_SLIDE;
        } else {
          y = ny < 0 ? 0 : ny;
          if (ny < 0) vy = 0;
        }
        // buried by new ground: rise out, or be smothered
        cy = y >> FP_SHIFT;
        if (cy < H && mat[cy * W + cx] !== 0) {
          let up = 1;
          while (up <= 12 && cy - up >= 0 && mat[(cy - up) * W + cx] !== 0) up++;
          if (up > 12 || cy - up < 0) {
            pf[o] = -1;
            continue;
          }
          y -= up * FP;
          vy = 0;
        }
        pf[o] = x;
        pf[o + 1] = y;
        pf[o + 2] = vx;
        pf[o + 3] = vy;
      }
      // drop dead puffs (in order), re-centre the zone on the rest
      let k = 0;
      for (let i = 0; i < n; i++) {
        const o = i << 2;
        if (pf[o]! < 0) continue;
        if (k !== i) {
          const q = k << 2;
          pf[q] = pf[o]!;
          pf[q + 1] = pf[o + 1]!;
          pf[q + 2] = pf[o + 2]!;
          pf[q + 3] = pf[o + 3]!;
        }
        sx += pf[k << 2]! >> FP_SHIFT;
        sy += pf[(k << 2) + 1]! >> FP_SHIFT;
        k++;
      }
      if (k < n) pf.length = k << 2;
      n = k;
      if (n === 0) {
        emptied = true;
        z.turns = 0;
        continue;
      }
      z.x = Math.trunc(sx / n);
      z.y = Math.trunc(sy / n);
    }
    if (emptied) this.zones = this.zones.filter((z) => z.turns > 0);
  }

  /** True if a tank's centre is inside the zone (any puff, for a cloud). */
  private inZone(z: Zone, t: Tank): boolean {
    const x = t.x;
    const y = t.y - (t.h >> 1);
    const reach = z.radius + t.half;
    const pf = z.puffs;
    if (pf.length === 0) {
      const dx = x - z.x;
      const dy = y - z.y;
      return dx * dx + dy * dy < reach * reach;
    }
    for (let o = 0; o < pf.length; o += 4) {
      const dx = x - (pf[o]! >> FP_SHIFT);
      const dy = y - (pf[o + 1]! >> FP_SHIFT);
      if (dx * dx + dy * dy < reach * reach) return true;
    }
    return false;
  }

  /** End of a turn: zones hurt the tanks inside them and re-run their op, then age (§4a). */
  private applyZones(): void {
    if (this.zones.length === 0) return;
    for (const z of this.zones) {
      if (z.damage > 0) {
        for (const t of this.tanks) {
          if (!t.alive) continue;
          if (!this.inZone(z, t)) continue;
          const dmg = this.ownerScaled(z.damage, z.owner);
          this.emit('zoneHurt', t.x, t.y - (t.h >> 1), t.half, {
            damage: dmg,
            look: z.look,
          });
          this.damageTank(t, dmg, z.owner);
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

  /**
   * Damage from a shell `owner` fired, scaled by the owner's tank type (Howitzer hits harder).
   * Integer percent, and exact for the standard 100%.
   */
  private ownerScaled(dmg: number, owner: number): number {
    const k = owner >= 0 ? (this.tanks[owner]?.type.damage ?? 100) : 100;
    return k === 100 ? dmg : Math.trunc((dmg * k) / 100);
  }

  /** `byWeapon` false for a tank's death blast, which the killer's tank type doesn't scale. */
  private explode(e0: RtExplosion, x: number, y: number, owner: number, byWeapon = true): void {
    const e = this.resonate(e0, x, y);
    if (e.op >= 0) this.startOp(e.op, x, y, e.radius, e.damageType, owner);
    const scale = this.suddenDeathActive ? this.suddenDeath!.damageScale : 1;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const cy = t.y - (t.h >> 1);
      const dy = cy - y;
      const d = isqrt(dx * dx + dy * dy);
      const reach = e.radius + t.half;
      if (d >= reach) continue;
      // sheltered behind (or under) thick rock: the blast doesn't reach it
      if (this.groups.any && this.groups.shelters(this.grid, x, y, t.x, cy)) continue;
      if (e.damage > 0) {
        const base = e.linear ? Math.trunc((e.damage * (reach - d)) / reach) : e.damage;
        const dmg = Math.trunc(base * scale);
        this.damageTank(t, byWeapon ? this.ownerScaled(dmg, owner) : dmg, owner);
      }
      if (e.chill > 0) {
        // frosted for its next own turns; a tank that frosts itself keeps it past this turn too
        const turns =
          e.chill + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
        if (turns > t.chill) t.chill = turns;
        this.emit('frosted', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
      }
      if (e.push > 0 && dx !== 0) {
        const shove = Math.trunc((e.push * (reach - d)) / reach);
        t.x = Math.max(
          t.half,
          Math.min(this.grid.width - t.half - 1, t.x + (dx > 0 ? shove : -shove)),
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

  /**
   * Hurt a tank. Its shield soaks the hit first (§3.2); `pierce` skips the shield (falling out of
   * the map is always fatal).
   */
  private damageTank(t: Tank, dmg0: number, by: number, pierce = false): void {
    if (dmg0 <= 0 || !t.alive) return;
    let dmg = dmg0;
    if (t.shield > 0 && !pierce) {
      const soak = Math.min(dmg, t.shield);
      t.shield -= soak;
      dmg -= soak;
      this.emit('shieldHit', t.x, t.y - (t.h >> 1), t.half + 2, {
        soaked: soak,
        left: t.shield,
        player: t.player,
      });
      if (dmg <= 0) {
        if (by >= 0) t.lastHitBy = by;
        return;
      }
    }
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
      for (let y = Math.max(0, t.y - t.h); y <= Math.min(g.height - 1, t.y); y++) {
        const row = y * g.width;
        for (let x = Math.max(0, t.x - t.half); x < Math.min(g.width, t.x + t.half); x++) {
          const d = cd[g.material[row + x]!]!;
          if (d > worst) worst = d;
        }
      }
      if (worst > 0) {
        this.emit('burn', t.x, t.y - (t.h >> 1), t.half, { damage: worst });
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
    for (let x = Math.max(0, t.x - t.half); x < Math.min(g.width, t.x + t.half); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (this.mats.settle[m] === SETTLE_FLOW) flow++;
    }
    if (flow * 2 < solid || solid === 0) return;
    const l = g.surfaceY(t.x - t.half - 1);
    const r = g.surfaceY(t.x + t.half);
    if (l === r) return;
    const nx = t.x + (l > r ? -1 : 1);
    if (nx < t.half || nx >= g.width - t.half) return;
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
    for (let x = Math.max(0, t.x - t.half); x < Math.min(g.width, t.x + t.half); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (st[m] !== 0) {
        n++;
        ticks = st[m]!;
      }
    }
    if (solid === 0 || n * 2 < solid) return 0;
    const l = t.x - t.half - 1 >= 0 ? g.surfaceY(t.x - t.half - 1) : -1;
    const r = t.x + t.half < g.width ? g.surfaceY(t.x + t.half) : -1;
    if (l <= t.y && r <= t.y) return 0;
    const dir = l > r ? -1 : 1;
    const nx = t.x + dir;
    if (nx < t.half || nx >= g.width - t.half) return 0;
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
    for (let x = Math.max(0, t.x - t.half); x < Math.min(g.width, t.x + t.half); x++) {
      const m = g.material[row + x]!;
      if (m === 0) continue;
      solid++;
      if (st[m] !== 0) {
        n++;
        best = m;
      }
    }
    if (n * 2 < solid || n * 2 < t.w) return;
    if (t.sunk >= this.mats.sinkDepth[best]! || this.tick % st[best]! !== 0) return;
    t.y++;
    t.sunk++;
  }

  private supported(t: Tank): boolean {
    return this.supportedAt(t.x, t.y, t.half);
  }

  private supportedAt(cx: number, cy: number, half: number): boolean {
    if (cy >= this.grid.height) return true;
    const m = this.grid.material;
    const row = cy * this.grid.width;
    for (let x = Math.max(0, cx - half); x < Math.min(this.grid.width, cx + half); x++) {
      if (m[row + x] !== 0) return true;
    }
    return false;
  }

  /**
   * A falling tank that is about to take fall damage opens a parachute if it carries one (the
   * first `deploy: "fall"` gear in id order), using it up.
   */
  private openChute(t: Tank): void {
    for (let g = 0; g < this.gear.length; g++) {
      if (this.gear[g]!.deploy !== 'fall' || (t.gear[g] ?? 0) <= 0) continue;
      t.gear[g]!--;
      t.chute = true;
      t.fallVel = Math.min(t.fallVel, this.gear[g]!.fallSpeed);
      this.emit('chute', t.x, t.y - t.h, t.half + 2, { player: t.player });
      return;
    }
  }

  /** Fall speed under an open parachute: the slowest `fall` gear's speed. */
  private chuteSpeed(): number {
    let v = MAX_TANK_FALL;
    for (const g of this.gear) if (g.deploy === 'fall') v = Math.min(v, g.fallSpeed);
    return v;
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
        if (!t.chute && t.y - t.fallFrom >= fd.safeCells && fd.perCell > 0) this.openChute(t);
        t.fallVel = Math.min(t.fallVel + 1, t.chute ? this.chuteSpeed() : MAX_TANK_FALL);
        for (let i = 0; i < t.fallVel && !this.supported(t); i++) t.y++;
      } else if (!t.falling) {
        // once it has started to sink the tank is bogged down and no longer slides
        this.sink(t);
        if (t.sunk === 0 && this.grid.settling) this.slide(t);
        if (!t.falling) this.slip(t);
      } else {
        t.falling = false;
        const chute = t.chute;
        t.chute = false;
        const dist = t.y - t.fallFrom;
        const by = this.shooter >= 0 ? this.shooter : t.lastHitBy;
        if (t.y >= this.grid.height) {
          // Fell out of the map (sudden-death void, or dug to the bottom): lost.
          this.emit('land', t.x, this.grid.height - 1, t.half, { distance: dist });
          this.damageTank(t, t.health, by, true);
          continue;
        }
        const dmg = chute ? 0 : Math.trunc(Math.max(0, dist - fd.safeCells) * fd.perCell);
        this.emit('land', t.x, t.y, t.half, { distance: chute ? 0 : dist });
        this.damageTank(t, dmg, by);
      }
    }
    // Death explosions; they may chain. Attribution follows the original killer (§3.5).
    for (let i = 0; i < this.pendingDeaths.length; i++) {
      const d = this.pendingDeaths[i]!;
      const t = this.tanks[d.player]!;
      this.emit('tankDeath', t.x, t.y - (t.h >> 1), t.w, { player: d.player });
      this.explode(this.deathExplosion, t.x, t.y - (t.h >> 1), d.killer, false);
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
    if (t) {
      t.driveLeft = this.driveCells(t);
      t.driving = 0;
    }
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
      fuel: t.fuel,
      fuelMax: this.mode.drive.fuelMax,
      fuelPack: this.mode.drive.fuelPack,
      fuelPrice: this.mode.drive.fuelPrice,
      driveCells: this.driveCells(t),
      health: t.maxHealth,
      gear: this.gear.map((g, i) => ({
        index: i,
        id: g.id,
        deploy: g.deploy,
        shield: g.shield,
        heal: g.heal,
        price: g.price,
        pack: g.pack,
        max: g.max,
        count: t.gear[i] ?? 0,
      })),
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
      if (b.item === AI_FUEL) {
        this.buyFuel(t, b.packs);
        continue;
      }
      if (b.gear === true) {
        this.buyGear(t, b.item, b.packs);
        continue;
      }
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
        maxHealth: t.maxHealth,
        shield: t.shield,
        maxShield: t.shieldMax,
        chute: t.chute,
        tank: t.type.id,
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
        ...(z.puffs.length > 0
          ? {
              puffs: puffCells(z.puffs),
              puffRadius: z.puffRadius,
              age: z.age,
            }
          : {}),
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
        vx: this.debris.vx,
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
      h.str(t.type.id).num(t.w).num(t.h).num(t.maxHealth).num(t.shield);
      // gear (kernel 0.8.0)
      h.num(t.shieldMax)
        .num(t.chute ? 1 : 0)
        .num(t.gear.length);
      for (const v of t.gear) h.num(v);
      h.num(t.weapon)
        .num(t.falling ? 1 : 0)
        .num(t.fallFrom)
        .num(t.fallVel)
        .num(t.sunk)
        .num(t.chill)
        .num(t.driveLeft)
        .num(t.driving)
        .num(t.fuel)
        .num(t.lastHitBy);
      h.num(t.kills).num(t.damageDealt).num(t.selfDamage);
      h.num(t.score)
        .num(t.money)
        .num(t.bot)
        .num(t.ready ? 1 : 0);
      h.num(t.lastShotX).num(t.lastShotY).num(t.lastShotAngle).num(t.lastShotPower);
      for (const v of t.inventory) h.num(v);
      h.num(t.botGoal).num(t.aiMem.length);
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
      h.num(z.puffRadius).num(z.drift).num(z.sink).num(z.age).num(z.puffs.length);
      for (const v of z.puffs) h.num(v);
    }
    h.num(this.ops.length);
    for (const o of this.ops) {
      h.num(o.op).num(o.t).num(o.call.x).num(o.call.y).num(o.call.radius).num(o.call.owner);
      for (const v of o.data) h.num(v);
    }
    return h.hex();
  }
}

/** Puff centres in cells, flattened x, y, from fixed-point x, y, vx, vy records. */
function puffCells(pf: readonly number[]): number[] {
  const out: number[] = [];
  for (let o = 0; o < pf.length; o += 4) out.push(pf[o]! >> FP_SHIFT, pf[o + 1]! >> FP_SHIFT);
  return out;
}

/** Air cells straight down from (x, y), at most 8 (how far the ground falls away there). */
function dropBelow(mat: Uint8Array, W: number, H: number, x: number, y: number): number {
  let d = 0;
  for (let r = y; d < 8 && r < H && r >= 0 && mat[r * W + x] === 0; r++) d++;
  return d;
}
