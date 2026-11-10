import {
  AI_CORE_KEYS,
  GEN_CORE_KEYS,
  MODE_CORE_KEYS,
  WEATHER_CORE_KEYS,
  type DamageType,
  type EffectEvent,
  type EmbeddedExplosion,
  type EmbeddedTerrainOp,
  type EntityView,
  type Impact,
  type Input,
  type ModeManifest,
  type ProcessCounts,
  type Rect,
  type RenderSnapshot,
  type WallRule,
  type WeatherManifest,
  type WindType,
  DAMAGE_TYPES,
  TEMP_DRIFT,
  TEMP_MAX,
  TEMP_MILD,
  TEMP_MIN,
  TICK_RATE,
  tempChill,
  tempHeat,
} from '@mudders/shared';
import {
  AI_FUEL,
  type AiApi,
  type AiBehaviour,
  type AiGearView,
  type AiSpot,
  type AiShopApi,
  type AiWeaponView,
  type AiTankView,
  type Lure,
  type ContactResult,
  type FlightBehaviour,
  type FlightHit,
  type FlightSignal,
  type ModeApi,
  type ModeBehaviour,
  type WeatherBehaviour,
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
import { supportPass } from './support';
import { settleStep } from './settle';
import { reactStep, turnDecay } from './reactions';
import { gasStep } from './gas';
import { KEEP, SETTLE_FLOW } from './materials';

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
/** Shot power a tank starts every round with (0–1000). */
export const START_POWER = 500;
export const BOT_THINK_TICKS = 50;
const BOT_MOVE_TICK = BOT_THINK_TICKS - 8;
/** Longest flight the AI's predictor simulates. */
const PREDICT_TICKS = 900;

/** Match-rule overrides from the setup screen (§8); anything unset keeps the mode's value. */
export interface MatchRules {
  rounds?: number | undefined;
  turnTimer?: number | undefined;
  shopTimer?: number | undefined;
  /** Open the shop before round 1 too (same timer as between rounds), on round 1's map. */
  openingShop?: boolean | undefined;
  suddenDeath?: boolean | undefined;
  /** Each player's turn sudden death starts on, instead of the mode's `fromTurn`. */
  suddenDeathFrom?: number | undefined;
  windType?: WindType | undefined;
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
  /** Weather (`weather.*` id); unset = clear skies. */
  weather?: string | undefined;
  /** Force the air temperature (°C) for the whole match: no jitter, no drift. */
  temperature?: number | undefined;
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
  /**
   * Own turns left glued (Glue Bomb): the tank can't drive, and nothing shoves, slides or carries
   * it sideways (blasts, slick ground, terrain ops). It still falls if the ground goes.
   */
  glue: number;
  /**
   * Own turns left rusted (Thunderstorm): at the end of each own turn it loses `rustDamage`
   * health, it drives `rustDrive` thousandths of its cells, and shots wobble by ±`rustWobble`°.
   */
  rust: number;
  /**
   * Own turns left jammed (Shield Breaker EMP): its electrics are fried, so it can't drive or
   * switch on gear. Only hashed while > 0.
   */
  jam: number;
  /**
   * Marker's turns left marked (Spotter Flare): hits from the marker's team do `markBonus`
   * percent more damage. Counted down at the end of each turn of `markBy`. Hashed only while > 0.
   */
  mark: number;
  markBy: number;
  markBonus: number;
  /** Own turns left with a full-arc aim preview (Spotter Flare). Hashed only while > 0. */
  scope: number;
  rustDamage: number;
  rustDrive: number;
  rustWobble: number;
  /** Who rusted it (the storm's owner, credited for the rust damage), or -1. */
  rustBy: number;
  /**
   * Own turns left mind-controlled (Telepathy): on its turn the player `mindBy` steers it (aim,
   * weapon from its own inventory, drive, fire), and a bot caster turns it on its own side. The
   * link breaks if the caster dies.
   */
  mind: number;
  mindBy: number;
  /** Cells this tank may still drive this turn, and where it is driving now (-1, 0, 1). */
  driveLeft: number;
  driving: number;
  /** Drive fuel (one unit per cell); a match total, topped up in the shop. */
  fuel: number;
  /** Fuel owed in thousandths of a unit (hot or freezing air burns more than one per cell). */
  fuelBurn: number;
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
  glue: number;
  mind: number;
  jam: number;
  strip: boolean;
  drain: number;
  mark: number;
  markBonus: number;
  scope: number;
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

interface RtStrike {
  weapon: number;
  chance: number;
  spread: number;
  count: number;
  lead: number;
  stagger: number;
  fall: boolean;
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
  /** Cells above the ground for a sky zone (0 = on the ground). */
  sky: number;
  /** Rust: own turns, health per turn, drive thousandths, wobble degrees (null = none). */
  rust: { turns: number; damage: number; drive: number; wobble: number } | null;
  /** The sky zone spans the whole map. */
  wide: boolean;
  /** Strikes: weapon index, chance in thousandths, spread in cells (null = none). */
  strike: RtStrike | null;
  /** Sky zone wind drift (fixed-point multiplier; 0 = stays put). */
  drift: number;
  shieldDrain: number;
  /** Caltrops: health and extra allowance per cell driven inside (null = none). */
  spikes: { damage: number; drag: number } | null;
}

type RtImpact =
  | { kind: 'explosion'; e: RtExplosion }
  | { kind: 'op'; op: number; radius: number; damageType: DamageType }
  | { kind: 'spawn'; s: RtSpawn }
  | { kind: 'zone'; z: RtZoneSpec }
  | { kind: 'mine'; weapon: number; radius: number; look: number; span: number; height: number };

/** A mine on the map (§4a, Black Hole Mine): plain integers, hashed. */
export interface Mine {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Weapon whose impacts run where the mine trips. */
  weapon: number;
  look: number;
  owner: number;
  /** Armed once the turn it was laid in has ended. */
  armed: boolean;
  /**
   * Tripwire (`wireH` > 0): `x`,`y` is the first post's foot and `x2`,`y2` the second's (x2 > x);
   * the wire runs between the cells `wireH` above each.
   */
  x2: number;
  y2: number;
  wireH: number;
}

/** Most mines on the map at once; the oldest goes first. */
export const MAX_MINES = 16;
const MINE_LOOKS = ['black-hole', 'tripwire'] as const;

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
  /** Sky zone height (0 = none): `y` is the cloud level and the zone covers whole columns. */
  sky: number;
  /** Rust it leaves on tanks inside (`rustTurns` 0 = none); see Tank.rust. */
  rustTurns: number;
  rustDamage: number;
  rustDrive: number;
  rustWobble: number;
  /** Lightning strikes: weapon index (-1 = none), chance in thousandths, spread in cells. */
  strikeWeapon: number;
  strikeChance: number;
  strikeSpread: number;
  strikeCount: number;
  strikeLead: number;
  strikeStagger: number;
  /** Strikes fall from the cloud as real shells (rain). */
  strikeFall: boolean;
  /** Sky drift: fixed-point x (follows `x`), wind multiplier (0 = none). */
  fx: number;
  skyDrift: number;
  shieldDrain: number;
  spikeDamage: number;
  /** -1 = no spikes. */
  spikeDrag: number;
}

/** Gas cloud puffs, fixed-point cells/tick per tick: apart, upward when on top, downhill. */
const PUFF_PUSH = FP >> 6;
const PUFF_LIFT = FP >> 6;
const PUFF_SLIDE = FP >> 6;

/** Most zones alive at once; the oldest goes first. */
export const MAX_ZONES = 32;
/** Most shells in the air at once (cluster bombs); extra children are dropped. */
export const MAX_PROJECTILES = 64;
/** Most decoys (`Lure`) in one round. */
export const MAX_LURES = 8;
const ZONE_LOOKS = [
  'gas',
  'acid',
  'resonance',
  'toxic',
  'volcano',
  'storm',
  'caltrops',
  'acid-cloud',
] as const;

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
  /** Weather drag, fixed-point share of velocity per tick. */
  readonly drag: number;
  /** The match weather, or null for clear skies. */
  readonly weather: WeatherManifest | null;
  /** Effective match rules (mode values with setup-screen overrides applied). */
  readonly rounds: number;
  readonly turnCap: number;
  readonly turnTimerTicks: number;
  readonly shopTimerTicks: number;
  readonly windType: WindType;
  readonly suddenDeath: {
    fromTurn: number;
    damageScale: number;
    edgeCells: number;
    zoneDamage: number;
  } | null;

  tick = 0;
  phase: Phase = 'aim';
  /** Wind now: the turn's base plus the current gust (fixed-point cells/tick²). */
  wind = 0;
  /** The turn's wind without the gust; what bots aim with. */
  windBase = 0;
  /** Current gust on top of `windBase` (gusty wind only). */
  gust = 0;
  /** Air temperature now, whole °C (§3.4): the round's base plus a per-turn drift. */
  temperature = TEMP_MILD;
  /** This round's base temperature, which the drift is pulled back towards. */
  tempBase = TEMP_MILD;
  /** The mode's own numbers between ticks (`ModeApi.memory`). */
  readonly modeMem: number[] = [];
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
  /** Width in columns of the sudden-death zone at each map edge (terrain stays; tanks in it burn). */
  edge = 0;
  /** Shop price per weapon pack this round. */
  prices: number[] = [];
  /** Results of finished rounds. */
  readonly results: RoundResult[] = [];
  projectiles: Projectile[] = [];
  ops: OpInstance[] = [];
  /** Ops whose last step was `'idle'` (resident: they don't hold up the turn). */
  private idleOps = 0;
  zones: Zone[] = [];
  mines: Mine[] = [];
  /** Decoys this round (see `Lure`); dead ones stay so indexes hold for the round. */
  lures: Lure[] = [];
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
  /** Per material cell: the explosion its bursts set off (lit gunpowder), else null. */
  private readonly burstExplosion: (RtExplosion | null)[] = new Array<RtExplosion | null>(256).fill(
    null,
  );
  private readonly windLocked: boolean;
  private readonly weaponIndex: Record<string, number> = {};
  /** Weapon index a bursting material (gas pocket) sets off, per cell byte; -1 = none. */
  private readonly burstWeapon = new Int16Array(256).fill(-1);
  private readonly gearIndex: Record<string, number> = {};
  private nextProjectileId = 1;
  private nextMineId = 1;
  private shooter = -1;
  private pendingInputs: { player: number; input: Input }[] = [];
  private contactDone = false;
  private pendingDeaths: PendingDeath[] = [];
  private effects: EffectEvent[] = [];
  private readonly modeApi: ModeApi;
  private readonly weatherB: WeatherBehaviour | null;
  private readonly weatherParams: unknown;

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
    const weather = options.weather ? content.get('weather', options.weather) : null;
    this.weather = weather;
    this.drag = weather ? Math.trunc((weather.drag * FP) / 1000) : 0;
    this.weatherB = weather ? content.behaviours.getKind(weather.behaviour, 'weather') : null;
    this.weatherParams =
      weather && this.weatherB
        ? this.weatherB.params.parse(behaviourParams(weather, WEATHER_CORE_KEYS))
        : undefined;
    this.maxSpeed = toFixed(mode.physics.maxSpeed);
    this.walls = mode.walls;
    this.settleCap = mode.settle.maxCellsPerTick;
    this.windLocked = options.wind !== undefined;
    if (options.wind !== undefined) this.wind = this.windBase = toFixed(options.wind);

    const rules = options.rules ?? {};
    this.rounds = Math.max(1, rules.rounds ?? mode.rounds);
    this.turnCap = Math.max(1, rules.turnCap ?? mode.turnCap);
    this.turnTimerTicks = Math.round((rules.turnTimer ?? mode.turnTimer) * TICK_RATE);
    this.shopTimerTicks = Math.max(1, Math.round((rules.shopTimer ?? mode.shopTimer) * TICK_RATE));
    this.windType = rules.windType ?? mode.wind.type;
    const sd = rules.suddenDeath === false ? null : mode.suddenDeath;
    this.suddenDeath =
      sd && rules.suddenDeathFrom !== undefined
        ? { ...sd, fromTurn: Math.max(1, Math.trunc(rules.suddenDeathFrom)) }
        : sd;

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
    for (let c = 1; c < 256; c++) {
      const id = this.mats.burstWeapon[c]!;
      if (id === '') continue;
      if (!Object.hasOwn(this.weaponIndex, id)) {
        throw new Error(`${this.mats.ids[c]}: burst weapon ${id} is not loaded`);
      }
      this.burstWeapon[c] = this.weaponIndex[id]!;
    }
    for (const m of content.list('material')) {
      if (m.detonate) this.burstExplosion[m.cell] = this.bindExplosion(m.detonate.explosion);
    }

    this.modeApi = {
      rng: this.rng,
      now: () => this.tick,
      emit: (type, x, y, radius, params) => this.emit(type, x, y, radius, params),
      players: options.players,
      alive: (p) => this.tanks[p]?.alive ?? false,
      team: (p) => options.teams?.[p] ?? p,
      turn: () => this.turn,
      setWind: (w) => {
        if (!this.windLocked) this.windBase = w;
        this.wind = this.windBase + this.gust;
      },
      setGust: (g) => {
        this.gust = g;
        this.wind = this.windBase + g;
      },
      memory: this.modeMem,
      windMax: toFixed(mode.wind.max),
      windType: this.windType,
    };

    this.createTanks();
    if (rules.openingShop === true) {
      // the opening shop (§3.6): round 1's map is generated and shown behind the shop, and the
      // first turn begins when everyone is ready or the timer runs out
      this.startRound(false);
      this.openShop();
    } else {
      this.startRound();
    }
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
          sky: z.sky,
          wide: z.wide,
          rust: z.rust
            ? {
                turns: z.rust.turns,
                damage: z.rust.damage,
                drive: Math.round(z.rust.drive * 1000),
                wobble: z.rust.wobble,
              }
            : null,
          strike: z.strike ? this.bindStrike(weapon, z.strike) : null,
          drift: toFixed(z.drift),
          shieldDrain: z.shieldDrain,
          spikes: z.spikes ? { damage: z.spikes.damage, drag: z.spikes.drag } : null,
        },
      };
    }
    if ('mine' in imp) {
      const mw = this.weaponByIndex(imp.mine.weapon);
      if (mw < 0) throw new Error(`${weapon}: mine names unknown weapon ${imp.mine.weapon}`);
      return {
        kind: 'mine',
        weapon: mw,
        radius: imp.mine.radius,
        look: MINE_LOOKS.indexOf(imp.mine.look),
        span: imp.mine.wire ? imp.mine.wire.span : 0,
        height: imp.mine.wire ? imp.mine.wire.height : 0,
      };
    }
    return {
      kind: 'op',
      op: this.bindOp(imp.terrainOp),
      radius: imp.radius,
      damageType: imp.damageType,
    };
  }

  private bindStrike(
    weapon: string,
    st: {
      weapon: string;
      chance: number;
      spread: number;
      count: number;
      lead: number;
      stagger: number;
      fall: boolean;
    },
  ): RtStrike {
    const i = this.weaponByIndex(st.weapon);
    if (i < 0) throw new Error(`${weapon}: zone strike names unknown weapon ${st.weapon}`);
    return {
      weapon: i,
      chance: Math.round(st.chance * 1000),
      spread: st.spread,
      count: st.count,
      lead: st.lead,
      stagger: st.stagger,
      fall: st.fall,
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
      glue: e.glue,
      mind: e.mind,
      jam: e.jam,
      strip: e.strip,
      drain: e.drain,
      mark: e.mark,
      markBonus: e.markBonus,
      scope: e.scope,
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
    if (this.phase === 'aim' && t.player === this.controller) {
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
        power: START_POWER,
        weapon: loadout[0] ? this.weaponIndex[loadout[0].weapon]! : 0,
        inventory,
        falling: false,
        fallFrom: 0,
        fallVel: 0,
        sunk: 0,
        chill: 0,
        glue: 0,
        rust: 0,
        jam: 0,
        mark: 0,
        markBy: -1,
        markBonus: 0,
        scope: 0,
        rustDamage: 0,
        rustDrive: 1000,
        rustWobble: 0,
        rustBy: -1,
        mind: 0,
        mindBy: -1,
        driveLeft: 0,
        driving: 0,
        fuel: this.mode.drive.startFuel,
        fuelBurn: 0,
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

  private startRound(firstTurn = true): void {
    const g = this.grid;
    g.reset();
    this.debris.count = 0;
    this.projectiles = [];
    this.ops = [];
    this.idleOps = 0;
    this.zones = [];
    this.mines = [];
    this.lures = [];
    this.pendingDeaths = [];
    this.edge = 0;
    this.shooter = -1;

    const genId = this.options.map?.generator ?? this.mode.map.generator;
    const genItem = this.content.get('gen', genId);
    const gen = this.content.behaviours.getKind(genItem.behaviour, 'gen');
    this.startTemperature(genItem.temperature);
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
    for (const gl of res.glue ?? []) this.groups.glue(g, gl.prop, this.mats.cellOf(gl.material));
    if (genItem.props) this.groups.place(g, this.rng, genItem.props, spawns);
    for (const sp of this.options.props ?? []) this.groups.placeAt(g, sp.prop, sp.x, this.rng);
    // Pre-settle anything loose the generator left, so a round starts still.
    g.markDirty(0, 0, g.width - 1, g.height - 1);
    for (let i = 0; i < 2000 && g.settling; i++) settleStep(g, this.mats, i, g.size);
    // and anything the generator left hanging further than its material holds
    for (let pass = 0; pass < 8; pass++) {
      if (supportPass(g, this.mats, this.scratch, this.debris, this) === 0) break;
      for (let i = 0; i < 2000 && (this.debris.count > 0 || g.settling); i++) {
        this.debris.step(g, this.gravity, this.mats);
        settleStep(g, this.mats, i, g.size);
      }
    }
    g.clearStruct();
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
      // aim starts fresh every round (power too), like a new tank on a new map
      tank.angle = tank.x < g.width / 2 ? 45 : 135;
      tank.power = START_POWER;
      tank.driveLeft = 0;
      tank.driving = 0;
      tank.botGoal = -1;
      if (tank.inventory[tank.weapon] === 0) tank.weapon = this.firstWeapon(tank);
      tank.falling = false;
      tank.fallFrom = 0;
      tank.fallVel = 0;
      tank.sunk = 0;
      tank.chill = 0;
      tank.glue = 0;
      tank.mind = 0;
      tank.mindBy = -1;
      tank.rust = 0;
      tank.jam = 0;
      tank.mark = 0;
      tank.markBy = -1;
      tank.markBonus = 0;
      tank.scope = 0;
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
    if (firstTurn) this.beginTurn();
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

  /**
   * The player who steers the active tank this turn: its own player, or the caster of a mind link
   * (Telepathy) while the link holds (caster still alive). Inputs from this player move the active
   * tank, and the caster's bot plays it when the caster is a bot.
   */
  get controller(): number {
    const p = this.activePlayer;
    const t = this.tanks[p];
    if (!t || t.mind <= 0 || t.mindBy < 0 || t.mindBy === p) return p;
    return this.tanks[t.mindBy]?.alive ? t.mindBy : p;
  }

  /** Bot index that plays the active turn (the controller's bot), or -1 for a human. */
  private get driverBot(): number {
    return this.tanks[this.controller]?.bot ?? -1;
  }

  /** True when sudden death rules apply this turn (§3.1). */
  get suddenDeathActive(): boolean {
    const sd = this.suddenDeath;
    return sd !== null && Math.floor(this.turn / Math.max(1, this.tanks.length)) >= sd.fromTurn - 1;
  }

  /** What the gas layer adds to the renderer's process meter (fire crackle, gas hiss, sizzle). */
  private processCounts(): Partial<ProcessCounts> | undefined {
    const g = this.grid;
    const q = g.quenched;
    g.quenched = 0;
    if (g.gasCells === 0 && q === 0) return undefined;
    return { burning: g.gasHot, gassing: g.gasCells - g.gasHot, quenching: q };
  }

  /** Gas region at the last snapshot, so the renderer also clears where gas has left. */
  private lastGas: Rect | null = null;

  /** The rect of the gas layer a renderer must refresh: where gas is now plus where it was. */
  private gasRect(): Rect | null {
    const g = this.grid;
    const now: Rect | null = g.gassy
      ? { x: g.gasMinX, y: g.gasMinY, w: g.gasMaxX - g.gasMinX + 1, h: g.gasMaxY - g.gasMinY + 1 }
      : null;
    const was = this.lastGas;
    this.lastGas = now;
    if (!was) return now;
    if (!now) return was;
    const x = Math.min(was.x, now.x);
    const y = Math.min(was.y, now.y);
    return {
      x,
      y,
      w: Math.max(was.x + was.w, now.x + now.w) - x,
      h: Math.max(was.y + was.h, now.y + now.h) - y,
    };
  }

  /** Nothing moving: no projectiles, ops, settling, falling tanks or pending deaths. */
  get quiet(): boolean {
    return (
      this.projectiles.length === 0 &&
      this.ops.length === this.idleOps &&
      this.debris.count === 0 &&
      !this.grid.settling &&
      !this.grid.reacting &&
      this.pendingDeaths.length === 0 &&
      !this.tanks.some((t) => t.falling || (t.alive && t.glue === 0 && this.slipDir(t) !== 0))
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
        g.shadeOf(cellIndex),
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

  hold(player: number, x: number, y: number, fallFrom?: number): void {
    const t = this.tanks[player];
    // a glued tank can't be picked up (tornado, wave): it stays stuck to the ground
    if (!t || !t.alive || t.glue > 0) return;
    t.x = Math.max(t.half, Math.min(this.grid.width - 1 - t.half, x));
    t.y = Math.max(t.h, Math.min(this.grid.height - 1, y));
    if (!t.falling) {
      t.falling = true;
      t.fallFrom = t.y;
    } else if (t.y < t.fallFrom) {
      t.fallFrom = t.y;
    }
    if (fallFrom !== undefined) t.fallFrom = Math.min(t.y, fallFrom);
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
    this.modeB.onTick?.(this.modeApi, this.modeParams);
    this.weatherB?.onTick?.(this, this.weatherParams);

    this.stepProjectiles();
    this.stepOps();
    this.stepClouds();
    this.debris.step(this.grid, this.gravity, this.mats);
    const settling = this.grid.settling;
    settleStep(this.grid, this.mats, this.tick, this.settleCap);
    reactStep(this.grid, this.mats, this.tick);
    gasStep(this.grid, this.mats, this.tick, this.wind);
    if (this.grid.burstCount > 0) this.bursts();
    if (this.grid.pocketCount > 0) this.burstPockets();
    if (this.groups.any) {
      this.groups.absorbLosses(this.grid, this);
      if (settling) this.groups.checkBases(this.grid, this);
      else this.groups.settled();
    }
    // everything has come to rest after a change: what hangs too far for its material comes
    // down (§4b); never while an op is still shaping the ground (a growing ice wall)
    if (this.grid.structMaxX >= 0 && this.quiet) {
      supportPass(this.grid, this.mats, this.scratch, this.debris, this);
    }
    this.stepTanks();
    if (this.lures.length > 0) this.stepLures();
    if (this.mines.length > 0) this.stepMines();

    if (this.phase === 'resolve' && this.quiet) {
      // Contact damage (lava, napalm) once the shot has settled; deaths may need resolving first.
      if (!this.contactDone) {
        this.contactDone = true;
        this.applyContact();
        this.applyZones();
        this.applyRust();
        this.armMines();
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
    if (this.phase !== 'aim' || player !== this.controller || t.bot >= 0) return;
    // a mind-controlled tank takes its caster's inputs
    const c = player === this.activePlayer ? t : this.tanks[this.activePlayer];
    if (!c?.alive) return;
    this.steer(c, input);
  }

  private steer(t: Tank, input: Input): void {
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
        t.driving = t.driveLeft > 0 && t.fuel > 0 && t.glue === 0 && t.jam === 0 ? input.dir : 0;
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
    // a jammed tank's electrics are dead: no shield, no battery until it wears off
    if (!gear || gear.deploy !== 'manual' || !t.alive || t.jam > 0) return false;
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
    let cells = Math.trunc((this.mode.drive.cells * t.type.drive) / 100);
    // rusted tracks (Thunderstorm) grind along slower
    if (t.rust > 0) cells = Math.trunc((cells * t.rustDrive) / 1000);
    // cold engines (§3.4): up to 30% fewer cells a turn at the coldest
    return Math.trunc((cells * (1000 - Math.trunc((tempChill(this.temperature) * 3) / 10))) / 1000);
  }

  /**
   * Fuel one cell of driving burns, in thousandths (§3.4): 1000 in mild air, up to 1500 at the
   * hottest (it boils off) or coldest (stiff engines).
   */
  fuelPerCell(): number {
    const t = this.temperature;
    return 1000 + (tempHeat(t) >> 1) + (tempChill(t) >> 1);
  }

  /** Burn one cell's worth of fuel from `fuel`/`burn`; returns the new [fuel, burn]. */
  private burnFuel(fuel: number, burn: number): [number, number] {
    let b = burn + this.fuelPerCell();
    let f = fuel;
    while (b >= 1000 && f > 0) {
      f--;
      b -= 1000;
    }
    return [f, f > 0 ? b : 0];
  }

  /**
   * Sticky ground (tar) under a tank at column x, bottom row y: the material's `sticky.drive`
   * factor when at least half the treads rest on sticky cells, else 1.
   */
  stickyAt(x: number, y: number, half: number): number {
    const g = this.grid;
    if (y < 0 || y >= g.height) return 1;
    const st = this.mats.sticky;
    const row = y * g.width;
    let n = 0;
    let solid = 0;
    let f = 1;
    for (let c = Math.max(0, x - half); c < Math.min(g.width, x + half); c++) {
      const m = g.material[row + c]!;
      if (m === 0) continue;
      solid++;
      if (st[m] !== 0) {
        n++;
        if (st[m]! > f) f = st[m]!;
      }
    }
    return solid === 0 || n * 2 < solid ? 1 : f;
  }

  /** Ticks per driven cell for this tank where it stands (slower in tar). */
  private driveTicks(t: Tank): number {
    return this.mode.drive.ticksPerCell * this.stickyAt(t.x, t.y, t.half);
  }

  /**
   * One cell of driving (§3.2). The tank climbs a step of up to `drive.climb` cells, rolls down
   * one of the same, and stops at anything steeper (a wall, a prop, ground it is bogged in), at the
   * map edge or when its drive runs out (it may drive into the sudden-death zone). A real drop it
   * simply falls.
   */
  private driveStep(t: Tank): void {
    const g = this.grid;
    const dir = t.driving;
    const nx = t.x + dir;
    if (nx < t.half || nx >= g.width - t.half) {
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
    // bogged in tar: this cell costs several cells of the turn's allowance
    const cost = this.stickyAt(t.x, t.y, t.half);
    t.x = nx;
    t.y = top;
    for (let d = 0; d < climb && !this.supported(t); d++) t.y++;
    let drag = 0;
    if (this.zones.length > 0) {
      const zi = this.spikesAt(t.x, t.y, t.half);
      if (zi >= 0) {
        // caltrops: they bite the treads and puncture the tank, and every cell drags
        const z = this.zones[zi]!;
        drag = z.spikeDrag;
        this.emit('spiked', t.x, t.y, t.half, { damage: z.spikeDamage, player: t.player });
        this.damageTank(t, z.spikeDamage, z.owner);
        // bled out on the spikes: the turn is over
        if (!t.alive) this.interrupt(z.owner);
      }
    }
    t.driveLeft = Math.max(0, t.driveLeft - cost - drag);
    for (let i = 0; i <= drag; i++) [t.fuel, t.fuelBurn] = this.burnFuel(t.fuel, t.fuelBurn);
    if (t.driveLeft <= 0 || t.fuel <= 0 || !t.alive) t.driving = 0;
    this.emit('drive', t.x, t.y, t.half, { dir, left: t.driveLeft });
  }

  /**
   * Where driving in `dir` would take this tank this turn, cell by cell (the same rules as
   * `driveStep`), without moving it: up to its drive allowance and fuel, stopping at a wall, the
   * map edge, or before a drop it would take fall damage from. Spots inside the sudden-death zone
   * are left out. Read-only, so bots can plan with it.
   */
  reach(t: Tank, dir: -1 | 1): AiSpot[] {
    const g = this.grid;
    const climb = this.mode.drive.climb;
    const safe = this.mode.fallDamage.safeCells;
    const out: AiSpot[] = [];
    let left = t.driveLeft;
    let fuel = t.fuel;
    let burn = t.fuelBurn;
    let x = t.x;
    let y = t.y;
    while (left > 0 && fuel > 0) {
      left -= this.stickyAt(x, y, t.half);
      [fuel, burn] = this.burnFuel(fuel, burn);
      const nx = x + dir;
      if (nx < t.half || nx >= g.width - t.half) break;
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
      // never into an armed mine's reach
      if (this.mines.length > 0 && this.mineAt(nx, ny, t.half, t.h)) break;
      // never onto caltrops (driving off them is fine)
      if (
        this.zones.length > 0 &&
        this.spikesAt(nx, ny, t.half) >= 0 &&
        this.spikesAt(x, y, t.half) < 0
      ) {
        break;
      }
      x = nx;
      y = ny;
      // a spot in the sudden-death zone is no place to stop (driving through it is fine)
      if (nx - t.half < this.edge || nx + t.half > g.width - this.edge) continue;
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
    // the last one is gone: hold the next weapon the tank still has, so the HUD never shows a
    // weapon it can't fire (the shell below keeps the weapon it was fired with)
    const fired = t.weapon;
    if (t.inventory[fired] === 0) t.weapon = this.firstWeapon(t);
    t.driving = 0;
    let a = t.angle * 10;
    let power = t.chill > 0 ? Math.min(t.power, CHILL_POWER) : t.power;
    if (t.rust > 0 && t.rustWobble > 0) {
      // a rusted barrel shakes: the shot leaves a few degrees off, a little hot or weak
      const wob = t.rustWobble * 10;
      a += this.rng.range(-wob, wob);
      const pw = Math.trunc((power * t.rustWobble) / 90);
      power = Math.max(0, power + this.rng.range(-pw, pw));
      this.emit('rustWobble', t.x, t.y - t.h, t.half, { player: t.player });
    }
    const c = cosDeci(a);
    const s = sinDeci(a);
    const speed = this.muzzleSpeed(t, power);
    const x = t.x * FP + FP / 2 + Math.trunc((BARREL * c) / FP);
    const y = (t.y - t.h) * FP - Math.trunc((BARREL * s) / FP);
    this.projectiles.push({
      id: this.nextProjectileId++,
      weapon: fired,
      // a mind-controlled tank's shell is its caster's (kill credit, own-team rules)
      owner: this.controller === t.player ? t.player : this.controller,
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
      weapon: fired,
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
      // Died before shooting (burnt out in the sudden-death zone at the start of its turn): pass.
      this.phase = 'resolve';
      return;
    }
    const bot = this.driverBot;
    if (bot >= 0) {
      if (t.driving !== 0) {
        if (!t.falling && this.tick % this.driveTicks(t) === 0) {
          this.driveStep(t);
          if (t.x === t.botGoal) t.driving = 0;
        }
        return;
      }
      if (t.falling) return;
      this.botWait--;
      if (this.botWait === BOT_MOVE_TICK) this.botMove(t, bot);
      if (this.botWait === BOT_THINK_TICKS >> 1) this.botAim(t, bot);
      if (this.botWait <= 0) this.fire(t);
      return;
    }
    if (t.driving !== 0 && !t.falling && this.tick % this.driveTicks(t) === 0) {
      this.driveStep(t);
    }
    if (this.timer > 0 && --this.timer === 0) {
      // Out of time: fire with the current settings (§3.3).
      if (t.inventory[t.weapon] === 0) t.weapon = this.firstWeapon(t);
      this.fire(t);
    }
  }

  /** The bot's view of the match on its turn (§3.7). */
  /** The tanks a bot sees: the real ones, then every decoy dressed as a tank (see `Lure`). */
  private aiTanks(tanks: readonly AiTankView[]): readonly AiTankView[] {
    if (this.lures.length === 0) return tanks;
    const out: AiTankView[] = [...tanks];
    const n = this.tanks.length;
    for (let i = 0; i < this.lures.length; i++) {
      const l = this.lures[i]!;
      out.push({
        player: n + i,
        team: l.team,
        alive: l.alive,
        x: l.x,
        y: l.y,
        health: Math.max(0, l.hp),
        shield: 0,
        maxHealth: l.maxHp,
        half: l.half,
        h: l.h,
      });
    }
    return out;
  }

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
    // a mind-controlled tank plays for its caster: it counts itself on the caster's team (so the
    // caster's enemies are its targets, its own side included) and leaves its own memory alone
    const by =
      t.mind > 0 && t.mindBy >= 0 && t.mindBy !== t.player ? this.tanks[t.mindBy] : undefined;
    const charmed = by !== undefined && by.alive;
    const team = charmed ? by.team : t.team;
    return {
      rng: this.rng,
      me: t.player,
      tanks: this.aiTanks(
        charmed ? this.tanks.map((u) => (u === t ? { ...u, team } : u)) : this.tanks,
      ),
      weapons,
      gear: this.gearView(t),
      width: this.grid.width,
      height: this.grid.height,
      wind: this.windBase,
      gravity: this.gravity,
      maxSpeed: this.muzzleSpeed(t, 1000),
      surfaceY: (x) => this.grid.surfaceY(x),
      predict: (w, angle, power, from) => this.predict(t, w, angle, power, from),
      fuel: t.fuel,
      driveLeft: t.driveLeft,
      reach: (dir) => this.reach(t, dir),
      chill: t.chill,
      glue: t.glue,
      jam: t.jam,
      lastShot:
        t.lastShotX >= 0 && !charmed
          ? { x: t.lastShotX, y: t.lastShotY, angle: t.lastShotAngle, power: t.lastShotPower }
          : null,
      memory: charmed ? [] : t.aiMem,
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
  private botMove(t: Tank, b: number): void {
    const bot = this.bots[b]!;
    t.driving = 0;
    t.botGoal = -1;
    if (!bot.b.move || t.driveLeft <= 0 || t.fuel <= 0 || t.glue > 0 || t.jam > 0) return;
    const goal = bot.b.move(this.aiApi(t), bot.params);
    if (!Number.isInteger(goal) || goal === t.x) return;
    const dir = goal > t.x ? 1 : -1;
    if (!this.reach(t, dir).some((s) => s.x === goal)) return;
    t.botGoal = goal;
    t.driving = dir;
  }

  private botAim(t: Tank, b: number): void {
    const bot = this.bots[b]!;
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
  /** Where a shot would land in the turn's base wind (gusts are unforeseeable), touching nothing. */
  predict(t: Tank, weapon: number, angle: number, power: number, from?: AiSpot): ShotPrediction {
    const now = this.wind;
    this.wind = this.windBase;
    try {
      return this.predictNow(t, weapon, angle, power, from);
    } finally {
      this.wind = now;
    }
  }

  /**
   * The flight path of the active tank's shot as aimed now, in this exact wind (gust included),
   * as flat cell x, y pairs: the Spotter Flare's aim preview. Null unless a tank with `scope` is
   * aiming. Read-only: it changes nothing in the world.
   */
  previewPath(): number[] | null {
    const t = this.tanks[this.activePlayer];
    if (!t || !t.alive || t.scope <= 0 || this.phase !== 'aim') return null;
    const path: number[] = [];
    this.predictNow(t, t.weapon, t.angle, t.power, undefined, path);
    return path;
  }

  private predictNow(
    t: Tank,
    weapon: number,
    angle: number,
    power: number,
    from?: AiSpot,
    path?: number[],
  ): ShotPrediction {
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
      if (path) path.push(Math.floor(p.x / FP), Math.floor(p.y / FP));
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

  catchShell(id: number): boolean {
    const i = this.projectiles.findIndex((p) => p.id === id && p.alive);
    if (i < 0) return false;
    this.projectiles[i]!.alive = false;
    this.projectiles.splice(i, 1);
    return true;
  }

  hurt(player: number, amount: number, owner: number): void {
    const t = this.tanks[player];
    if (t) this.damageTank(t, Math.trunc(amount), owner);
  }

  heal(player: number, amount: number): number {
    const t = this.tanks[player];
    if (!t?.alive || amount <= 0) return 0;
    const healed = Math.min(Math.trunc(amount), t.maxHealth - t.health);
    if (healed <= 0) return 0;
    t.health += healed;
    return healed;
  }

  throwShell(weapon: number, owner: number, x: number, y: number, vx: number, vy: number): number {
    if (this.projectiles.length >= MAX_PROJECTILES || !this.weapons[weapon]) return -1;
    const id = this.nextProjectileId++;
    this.projectiles.push({ id, weapon, owner, x, y, vx, vy, age: 0, alive: true, data: [] });
    return id;
  }

  steerShell(id: number, vx: number, vy: number): boolean {
    for (const p of this.projectiles) {
      if (p.id !== id || !p.alive) continue;
      p.vx = vx;
      p.vy = vy;
      return true;
    }
    return false;
  }

  interrupt(owner: number): void {
    if (this.phase !== 'aim') return;
    const t = this.tanks[this.activePlayer];
    if (t) t.driving = 0;
    this.phase = 'resolve';
    this.timer = 0;
    this.shooter = owner;
  }

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

      // a shell flying through an armed tripwire sets it off and goes off with it
      if (this.wires > 0 && sig !== 'skip' && this.wireCatch(p, px, py)) continue;

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
      let tank = w.onTank ? this.tankAt(cx, cy, p) : -1;
      if (tank < 0 && w.onTank && this.lures.length > 0) {
        const l = this.lureAt(cx, cy);
        if (l >= 0) tank = this.tanks.length + l;
      }
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
      else if (imp.kind === 'mine') this.addMine(imp, x, y, p.owner);
      else this.addZone(imp.z, x, y, p.owner);
    }
  }

  /**
   * Uncovered gas pockets (§4b `burst`): each queued cell's whole 4-connected pocket of the same
   * material (up to the material's `max`) turns to air at once, and the material's burst weapon
   * goes off at the pocket's middle, credited to the shooter. Its blast may uncover the next
   * pocket, which `reactStep` finds on the next tick: pockets go off in a chain.
   */
  private burstPockets(): void {
    const g = this.grid;
    const W = g.width;
    const H = g.height;
    const mat = g.material;
    const q = this.scratch.queue;
    const mark = this.scratch.mark;
    const n = g.pocketCount;
    g.pocketCount = 0;
    for (let b = 0; b < n; b++) {
      const start = g.pockets[b]!;
      const m = mat[start]!;
      const wi = this.burstWeapon[m]!;
      if (wi < 0) continue; // already gone with an earlier pocket
      const max = this.mats.burstMax[m]!;
      const gen = this.scratch.nextMarkGen();
      let head = 0;
      let tail = 0;
      q[tail++] = start;
      mark[start] = gen;
      while (head < tail) {
        const i = q[head++]!;
        const x = i % W;
        const y = (i - x) / W;
        for (let k = 0; k < 4; k++) {
          const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
          const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mark[j] === gen || mat[j] !== m || tail >= max) continue;
          mark[j] = gen;
          q[tail++] = j;
        }
      }
      let sx = 0;
      let sy = 0;
      let x0 = W;
      let x1 = -1;
      let y0 = H;
      let y1 = -1;
      for (let k = 0; k < tail; k++) {
        const i = q[k]!;
        const x = i % W;
        const y = (i - x) / W;
        g.clearCell(i);
        sx += x;
        sy += y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      g.markDirty(x0, y0, x1, y1);
      const cx = Math.trunc(sx / tail);
      const cy = Math.trunc(sy / tail);
      this.emit('pocketBurst', cx, cy, Math.max(x1 - x0, y1 - y0) >> 1, { cells: tail });
      const p: Projectile = {
        id: 0,
        weapon: wi,
        owner: this.shooter,
        x: cx * FP + FP / 2,
        y: cy * FP + FP / 2,
        vx: 0,
        vy: 0,
        age: 0,
        alive: false,
        data: [],
      };
      this.runImpacts(this.weapons[wi]!.impacts, p, cx, cy);
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

  // ── mines ───────────────────────────────────────────────────────────────────────────────

  /** Plant a mine on the first air cell at or above the impact point (§4a). */
  private addMine(
    m: { weapon: number; radius: number; look: number; span: number; height: number },
    x: number,
    y: number,
    owner: number,
  ): void {
    const g = this.grid;
    let my = Math.min(y, g.height - 1);
    for (let k = 0; k < 32 && my > 0 && g.material[my * g.width + x] !== 0; k++) my--;
    if (this.mines.length >= MAX_MINES) this.mines.shift();
    const id = this.nextMineId++;
    let x1 = x;
    let y1 = my;
    let x2 = x;
    let y2 = my;
    if (m.span > 0) [x1, y1, x2, y2] = this.wireSpan(x, my, m.span >> 1, m.height);
    this.mines.push({
      id,
      x: x1,
      y: y1,
      radius: m.radius,
      weapon: m.weapon,
      look: m.look,
      owner,
      armed: false,
      x2,
      y2,
      wireH: m.span > 0 ? m.height : 0,
    });
    this.emit('mineLaid', x1, y1, m.radius, {
      look: m.look,
      id,
      ...(m.span > 0 ? { x2, y2 } : {}),
    });
  }

  /**
   * Posts for a tripwire centred on (x, y): up to `half` cells either side, each on the ground in
   * its column, pulled in two cells at a time while the ground between would cut the wire.
   */
  private wireSpan(
    x: number,
    y: number,
    half: number,
    h: number,
  ): [number, number, number, number] {
    const g = this.grid;
    const foot = (c: number): number => {
      // the first air cell above the ground in this column, searched from near the impact row
      let r = Math.max(0, Math.min(g.height - 1, y - 24));
      while (r < g.height - 1 && g.material[(r + 1) * g.width + c] === 0) r++;
      while (r > 0 && g.material[r * g.width + c] !== 0) r--;
      return r;
    };
    let a = half;
    let b = half;
    for (;;) {
      const x1 = Math.max(1, x - a);
      const x2 = Math.min(g.width - 2, x + b);
      const y1 = foot(x1);
      const y2 = foot(x2);
      if (x2 - x1 < 6) return [x1, y1, x2, y2];
      // a stake far above or below the impact (a cliff, a pillar) is no anchor
      let cut = Math.abs(y1 - y) > 12 ? -1 : Math.abs(y2 - y) > 12 ? 1 : 0;
      for (let c = x1 + 1; c < x2 && cut === 0; c++) {
        const wy = this.wireY(x1, y1 - h, x2, y2 - h, c);
        if (wy >= 0 && g.material[wy * g.width + c] !== 0) cut = c < x ? -1 : 1;
      }
      if (cut === 0) return [x1, y1, x2, y2];
      // the cut side is already as short as a stake gets: settle for this span (a cliff right
      // beside the impact used to spin here forever, freezing the game)
      if ((cut < 0 ? a : b) <= 3) return [x1, y1, x2, y2];
      if (cut < 0) a = Math.max(3, a - 2);
      else b = Math.max(3, b - 2);
    }
  }

  /** Row of a wire from (x1, y1) to (x2, y2) at column c (integer, rounded). */
  private wireY(x1: number, y1: number, x2: number, y2: number, c: number): number {
    const d = x2 - x1;
    if (d <= 0) return y1;
    return y1 + Math.trunc(((y2 - y1) * (c - x1) * 2 + d) / (2 * d));
  }

  /**
   * Whether a tank box (columns cx ± half, rows bottom − h … bottom) touches mine `m` once armed;
   * the touch point goes to `tripX`/`tripY`.
   */
  private mineHits(m: Mine, cx: number, bottom: number, half: number, h: number): boolean {
    if (m.wireH === 0) {
      const dx = cx - m.x;
      const dy = bottom - (h >> 1) - m.y;
      const r = m.radius + half;
      this.tripX = m.x;
      this.tripY = m.y;
      return dx * dx + dy * dy < r * r;
    }
    if (cx + half <= m.x || cx - half > m.x2) return false;
    const c = Math.max(m.x, Math.min(m.x2, cx));
    const wy = this.wireY(m.x, m.y - m.wireH, m.x2, m.y2 - m.wireH, c);
    this.tripX = c;
    this.tripY = wy;
    return wy >= bottom - h - 1 && wy <= bottom;
  }

  /** Armed tripwires on the map (skips the shell check when there are none). */
  private get wires(): number {
    let n = 0;
    for (const m of this.mines) if (m.armed && m.wireH > 0) n++;
    return n;
  }

  /** Where the last mine touch (or shell crossing) was found. */
  private tripX = 0;
  private tripY = 0;

  /** An armed mine would trip on a tank of this size standing at (cx, bottom). */
  private mineAt(cx: number, bottom: number, half: number, h: number): boolean {
    for (const m of this.mines) {
      if (m.armed && this.mineHits(m, cx, bottom, half, h)) return true;
    }
    return false;
  }

  /** A live tank touches the mine (within its reach, or against its wire). */
  private mineTouches(m: Mine, t: Tank): boolean {
    return this.mineHits(m, t.x, t.y, t.half, t.h);
  }

  /**
   * A shell that flew from (x0, y0) to its current spot (fixed-point) through an armed tripwire:
   * the wire trips where they cross and the shell goes off there. True if it did.
   */
  private wireCatch(p: Projectile, x0: number, y0: number): boolean {
    const ax = x0 >> FP_SHIFT;
    const ay = y0 >> FP_SHIFT;
    const bx = p.x >> FP_SHIFT;
    const by = p.y >> FP_SHIFT;
    for (let i = 0; i < this.mines.length; i++) {
      const m = this.mines[i]!;
      if (!m.armed || m.wireH === 0) continue;
      const lo = Math.min(ax, bx);
      const hi = Math.max(ax, bx);
      if (hi < m.x || lo > m.x2) continue;
      // which side of the wire each end is on, measured at its own column (clamped onto the wire)
      const ca = Math.max(m.x, Math.min(m.x2, ax));
      const cb = Math.max(m.x, Math.min(m.x2, bx));
      const sa = ay - this.wireY(m.x, m.y - m.wireH, m.x2, m.y2 - m.wireH, ca);
      const sb = by - this.wireY(m.x, m.y - m.wireH, m.x2, m.y2 - m.wireH, cb);
      const inA = ax >= m.x && ax <= m.x2;
      const inB = bx >= m.x && bx <= m.x2;
      if (!inA && !inB) continue;
      if (!(sa < 0 && sb >= 0) && !(sa > 0 && sb <= 0) && sb !== 0) continue;
      const c = inB ? cb : ca;
      const wy = this.wireY(m.x, m.y - m.wireH, m.x2, m.y2 - m.wireH, c);
      this.mines.splice(i, 1);
      this.tripX = c;
      this.tripY = wy;
      this.tripMine(m);
      this.impact(p, c, Math.max(0, Math.min(this.grid.height - 1, wy)));
      return true;
    }
    return false;
  }

  /**
   * Every tick: mines drop through air one cell a tick (lost off the bottom of the map), and an
   * armed mine with a tank in reach trips.
   */
  private stepMines(): void {
    const g = this.grid;
    let lost = false;
    for (const m of this.mines) {
      if (m.y + 1 >= g.height) {
        m.armed = false;
        m.weapon = -1;
        lost = true;
        continue;
      }
      if (g.material[(m.y + 1) * g.width + m.x] === 0) m.y++;
      if (m.wireH > 0) {
        if (m.y2 + 1 >= g.height) {
          m.armed = false;
          m.weapon = -1;
          lost = true;
          continue;
        }
        if (g.material[(m.y2 + 1) * g.width + m.x2] === 0) m.y2++;
      }
    }
    if (lost) this.mines = this.mines.filter((m) => m.weapon >= 0);
    this.tripMines(-1, -1, 0);
  }

  /** End of the turn a mine was laid in: it arms, and trips at once on a tank already in reach. */
  private armMines(): void {
    if (this.mines.length === 0) return;
    let armed = false;
    for (const m of this.mines) {
      if (m.armed) continue;
      m.armed = true;
      armed = true;
      this.emit('mineArmed', m.x, m.y, m.radius, { look: m.look, id: m.id });
    }
    if (armed) this.tripMines(-1, -1, 0);
  }

  /**
   * Trip every armed mine that a live tank is in reach of, or (radius > 0) that the blast at
   * (x, y) reaches. Each trips once, in list order; the mines it then sets off chain the same way.
   * A mine tripped while someone is aiming (they drove into it) ends that turn.
   */
  private tripMines(x: number, y: number, radius: number): void {
    for (let i = 0; i < this.mines.length;) {
      const m = this.mines[i]!;
      let hit = false;
      if (m.armed) {
        if (radius > 0) {
          const dx = m.x - x;
          const dy = m.y - y;
          hit = dx * dx + dy * dy < radius * radius;
          this.tripX = m.x;
          this.tripY = m.y;
          if (!hit && m.wireH > 0) {
            const ex = m.x2 - x;
            const ey = m.y2 - y;
            hit = ex * ex + ey * ey < radius * radius;
            this.tripX = m.x2;
            this.tripY = m.y2;
          }
        } else {
          for (const t of this.tanks) {
            if (t.alive && this.mineTouches(m, t)) {
              hit = true;
              break;
            }
          }
        }
      }
      if (!hit) {
        i++;
        continue;
      }
      this.mines.splice(i, 1);
      this.tripMine(m);
      // the list may have changed under us (chains): start over, the tripped mine is gone
      i = 0;
    }
  }

  /** Set off a mine at its trip point (`tripX`, `tripY`: the mine itself, or where the wire was hit). */
  private tripMine(m: Mine): void {
    const x = m.wireH > 0 ? this.tripX : m.x;
    const y = m.wireH > 0 ? Math.max(0, Math.min(this.grid.height - 1, this.tripY)) : m.y;
    this.interrupt(m.owner);
    if (m.wireH > 0) {
      this.emit('wireTrip', x, y, m.radius, {
        look: m.look,
        id: m.id,
        x1: m.x,
        y1: m.y - m.wireH,
        x2: m.x2,
        y2: m.y2 - m.wireH,
      });
    } else {
      this.emit('mineTrip', m.x, m.y, m.radius, { look: m.look, id: m.id });
    }
    const w = this.weapons[m.weapon]!;
    const p: Projectile = {
      id: 0,
      weapon: m.weapon,
      owner: m.owner,
      x: x * FP + FP / 2,
      y: y * FP + FP / 2,
      vx: 0,
      vy: 0,
      age: 0,
      alive: false,
      data: [],
    };
    this.runImpacts(w.impacts, p, x, y);
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
    let radius = c ? c.puffRadius : z.radius;
    if (z.sky > 0 && z.wide) {
      // a storm over the whole map: centred on the middle, reaching both edges
      x = this.grid.width >> 1;
      radius = (this.grid.width >> 1) + 1;
    }
    if (z.sky > 0) {
      // hang the zone over the highest ground under it (a storm cloud)
      const g = this.grid;
      let top = g.height;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(g.width - 1, x + radius);
      for (let cx = x0; cx <= x1; cx++) top = Math.min(top, g.surfaceY(cx));
      y = Math.max(4, top - z.sky);
    }
    const ru = z.rust;
    const st = z.strike;
    this.zones.push({
      x,
      y,
      radius,
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
      sky: z.sky,
      rustTurns: ru ? ru.turns : 0,
      rustDamage: ru ? ru.damage : 0,
      rustDrive: ru ? ru.drive : 1000,
      rustWobble: ru ? ru.wobble : 0,
      strikeWeapon: st ? st.weapon : -1,
      strikeChance: st ? st.chance : 0,
      strikeSpread: st ? (z.wide ? Math.max(st.spread, radius) : st.spread) : 0,
      strikeCount: st ? st.count : 0,
      strikeLead: st ? st.lead : 0,
      strikeStagger: st ? st.stagger : 0,
      strikeFall: st ? st.fall : false,
      fx: x * FP,
      skyDrift: z.sky > 0 ? z.drift : 0,
      shieldDrain: z.shieldDrain,
      spikeDamage: z.spikes ? z.spikes.damage : 0,
      spikeDrag: z.spikes ? z.spikes.drag : -1,
    });
    this.emit('zone', x, y, c ? c.puffRadius * 2 : radius, { look: z.look, turns: z.turns });
    // a cloud gathering in the sky rolls a long low rumble
    if (z.sky > 0) this.emit('thunder', x, y, z.wide ? 120 : 48, {});
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
      // a sky zone keeps time too (renderers gather its clouds by age)
      if (z.sky > 0) z.age++;
      if (z.skyDrift > 0) {
        // sailing with the wind, never past the map edges
        const W = this.grid.width;
        const lo = Math.min(W >> 1, z.radius) * FP;
        const hi = Math.max(W >> 1, W - z.radius) * FP;
        z.fx = Math.max(lo, Math.min(hi, z.fx + Math.trunc((this.wind * z.skyDrift) / FP)));
        z.x = z.fx >> FP_SHIFT;
      }
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
    if (emptied) this.zones = this.zones.filter((z) => z.turns > 0 || z.sky > 0);
  }

  /** True if a tank's centre is inside the zone (any puff, for a cloud). */
  private inZone(z: Zone, t: Tank): boolean {
    const x = t.x;
    const y = t.y - (t.h >> 1);
    const reach = z.radius + t.half;
    // a sky zone covers whole columns: anything under the cloud is in it
    if (z.sky > 0) return x - z.x < reach && z.x - x < reach;
    // a spiked strip of ground: a box as high as it is wide
    if (z.spikeDrag >= 0) return this.onSpikes(z, t.x, t.y, t.half);
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

  /** A tank standing at (x, bottom y) with this half width is on the zone's spikes. */
  private onSpikes(z: Zone, x: number, y: number, half: number): boolean {
    const r = z.radius + half;
    return x - z.x < r && z.x - x < r && y - z.y < z.radius && z.y - y < z.radius;
  }

  /** The spiked zone a tank at (x, y) stands in, or -1. */
  private spikesAt(x: number, y: number, half: number): number {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]!;
      if (z.spikeDrag >= 0 && this.onSpikes(z, x, y, half)) return i;
    }
    return -1;
  }

  /** End of a turn: zones hurt the tanks inside them and re-run their op, then age (§4a). */
  private applyZones(): void {
    if (this.zones.length === 0) return;
    for (const z of this.zones) {
      if (z.shieldDrain > 0) {
        for (const t of this.tanks) {
          if (!t.alive || t.shield <= 0 || !this.inZone(z, t)) continue;
          const eaten = Math.min(t.shield, z.shieldDrain);
          t.shield -= eaten;
          this.emit('shieldEaten', t.x, t.y - (t.h >> 1), t.half + 2, {
            eaten,
            left: t.shield,
            player: t.player,
            look: z.look,
          });
        }
      }
      if (z.damage > 0) {
        for (const t of this.tanks) {
          if (!t.alive) continue;
          if (!this.inZone(z, t)) continue;
          const dmg = this.ownerScaled(this.tempScaled(z.damage, z.dt), z.owner);
          this.emit('zoneHurt', t.x, t.y - (t.h >> 1), t.half, {
            damage: dmg,
            look: z.look,
          });
          this.damageTank(t, dmg, z.owner);
        }
      }
      if (z.rustTurns > 0) {
        for (const t of this.tanks) {
          if (!t.alive || !this.inZone(z, t)) continue;
          this.rustTank(t, z);
        }
      }
      if (z.op >= 0) {
        this.startOp(z.op, z.x, z.y, z.radius, DAMAGE_TYPES[z.dt]!, z.owner);
      }
      if (z.strikeWeapon >= 0) {
        for (let i = 0; i < z.strikeCount; i++) {
          if (this.rng.int(1000) < z.strikeChance) this.strike(z, i);
        }
      }
      z.turns--;
    }
    // a storm stays in the sky until its last timed bolts have landed: it goes when the turn ends
    this.zones = this.zones.filter((z) => z.turns > 0 || this.lingers(z));
  }

  /** A spent sky zone whose strikes hang as timed shells is kept until the next turn begins. */
  private lingers(z: Zone): boolean {
    return z.sky > 0 && z.strikeWeapon >= 0 && this.weapons[z.strikeWeapon]!.onTimer > 0;
  }

  /** Rust a tank under a rusting zone: refresh its turns (never stack) and take the zone's worst. */
  private rustTank(t: Tank, z: Zone): void {
    // the active tank's own turn is ending now, so it gets one more to keep the full count
    const turns =
      z.rustTurns + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
    const fresh = t.rust === 0;
    t.rustBy = z.owner;
    if (fresh) {
      t.rustDamage = z.rustDamage;
      t.rustDrive = z.rustDrive;
      t.rustWobble = z.rustWobble;
    } else {
      t.rustDamage = Math.max(t.rustDamage, z.rustDamage);
      t.rustDrive = Math.min(t.rustDrive, z.rustDrive);
      t.rustWobble = Math.max(t.rustWobble, z.rustWobble);
    }
    if (turns > t.rust) t.rust = turns;
    if (fresh) this.emit('rusted', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
  }

  /** End of a rusted tank's own turn: the rust eats a little more of it, then wears down a turn. */
  private applyRust(): void {
    const t = this.tanks[this.activePlayer];
    if (!t || t.rust <= 0) return;
    t.rust--;
    if (!t.alive) return;
    if (t.rustDamage > 0) {
      this.emit('rustHurt', t.x, t.y - (t.h >> 1), t.half, {
        damage: t.rustDamage,
        player: t.player,
      });
      // rust eats through shields like any corrosion
      this.damageTank(t, t.rustDamage, t.rustBy, true);
    }
    if (t.rust === 0) this.emit('unrusted', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
  }

  /**
   * A lightning strike out of a storm zone: a column within the zone's spread, down to the first
   * solid cell or tank top in it; the strike weapon's impacts go off there for the zone's owner.
   */
  private strike(z: Zone, n: number): void {
    const g = this.grid;
    const x = Math.max(
      0,
      Math.min(g.width - 1, z.x + this.rng.range(-z.strikeSpread, z.strikeSpread)),
    );
    const w0 = this.weapons[z.strikeWeapon]!;
    if (z.strikeFall) {
      // a drop let go just under the cloud; the higher ones land later
      if (this.projectiles.length >= MAX_PROJECTILES) return;
      const st = z.strikeStagger;
      const lift = st > 0 ? this.rng.int(st + 1) : 0;
      this.projectiles.push({
        id: this.nextProjectileId++,
        weapon: z.strikeWeapon,
        owner: z.owner,
        x: x * FP + FP / 2,
        y: (z.y + 4 - lift) * FP,
        vx: 0,
        vy: FP >> 2,
        age: 0,
        alive: true,
        data: [],
      });
      return;
    }
    let y = g.surfaceY(x);
    // tanks stand tallest: the bolt finds the highest one in the column
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (x < t.x - t.half || x >= t.x + t.half) continue;
      const top = t.y - t.h;
      if (top < y) y = Math.max(0, top);
    }
    y = Math.min(g.height - 1, y);
    const w = w0;
    if (w.onTimer > 0) {
      // a timed strike hangs where it will hit and goes off later: the barrage rolls
      if (this.projectiles.length >= MAX_PROJECTILES) return;
      const st = z.strikeStagger;
      const delay = z.strikeLead + n * st + (st > 0 ? this.rng.int(st + 1) : 0);
      this.projectiles.push({
        id: this.nextProjectileId++,
        weapon: z.strikeWeapon,
        owner: z.owner,
        x: x * FP + FP / 2,
        y: y * FP + FP / 2,
        vx: 0,
        vy: 0,
        age: Math.max(0, w.onTimer - 1 - delay),
        alive: true,
        data: [],
      });
      return;
    }
    this.emit('bolt', x, y, 0, { top: z.y, storm: 1 });
    this.emit('thunder', x, z.y, 24, {});
    const p: Projectile = {
      id: 0,
      weapon: z.strikeWeapon,
      owner: z.owner,
      x: x * FP + FP / 2,
      y: y * FP + FP / 2,
      vx: 0,
      vy: 0,
      age: 0,
      alive: false,
      data: [],
    };
    this.runImpacts(w.impacts, p, x, y);
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

  /**
   * Heat and cold damage by air temperature (§3.4): fire hits up to 50% harder at the hottest and
   * 30% softer at the coldest, frost the other way round. Exact (unchanged) in mild air.
   */
  private tempScaled(dmg: number, dt: number): number {
    const heat = tempHeat(this.temperature);
    const chill = tempChill(this.temperature);
    if (heat === 0 && chill === 0) return dmg;
    let k = 1000;
    if (dt === DT_HEAT) k += (heat >> 1) - Math.trunc((chill * 3) / 10);
    else if (dt === DT_COLD) k += (chill >> 1) - Math.trunc((heat * 3) / 10);
    return k === 1000 ? dmg : Math.trunc((dmg * k) / 1000);
  }

  /** `byWeapon` false for a tank's death blast, which the killer's tank type doesn't scale. */
  private explode(e0: RtExplosion, x: number, y: number, owner: number, byWeapon = true): void {
    const e = this.resonate(e0, x, y);
    if (e.op >= 0) this.startOp(e.op, x, y, e.radius, e.damageType, owner);
    if (this.mats.anyIgnite) this.ignite(x, y, e.radius, e.dt);
    const scale = this.suddenDeathActive ? this.suddenDeath!.damageScale : 1;
    const shooter = owner >= 0 ? this.tanks[owner] : undefined;
    const mine = shooter !== undefined && owner === this.activePlayer && this.phase === 'resolve';
    if (e.scope > 0 && shooter) {
      // the flare lights the field for the shooter's whole team: a full aim preview next turn
      for (const u of this.tanks) {
        if (!u.alive || u.team !== shooter.team) continue;
        const turns = e.scope + (u.player === owner && mine ? 1 : 0);
        if (turns > u.scope) u.scope = turns;
      }
      this.emit('scoped', x, y, e.radius, { player: owner });
    }
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
        const dmg = this.tempScaled(Math.trunc(base * scale), e.dt);
        this.damageTank(t, byWeapon ? this.ownerScaled(dmg, owner) : dmg, owner);
      }
      if (e.chill > 0) {
        // frosted for its next own turns; a tank that frosts itself keeps it past this turn too;
        // in hard frost (§3.4) it stays frosted a turn longer
        const turns =
          e.chill +
          (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0) +
          (tempChill(this.temperature) >= 500 ? 1 : 0);
        if (turns > t.chill) t.chill = turns;
        this.emit('frosted', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
      }
      if (e.glue > 0) {
        // glued for its next own turns; a tank that glues itself stays stuck past this turn too
        const turns = e.glue + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
        if (turns > t.glue) t.glue = turns;
        t.driving = 0;
        this.emit('glued', t.x, t.y, t.half, { player: t.player });
      }
      if (e.mind > 0 && owner >= 0 && owner !== t.player) {
        // a mind link (Telepathy): the caster steers this tank on its next own turns; never a
        // tank of the caster's own team
        const caster = this.tanks[owner];
        if (caster?.alive && caster.team !== t.team) {
          const turns =
            e.mind + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
          if (turns > t.mind || t.mindBy !== owner) t.mind = turns;
          t.mindBy = owner;
          this.emit('mindLink', t.x, t.y - (t.h >> 1), t.half, { player: t.player, by: owner });
        }
      }
      if (e.strip && t.shield > 0) {
        // the pulse collapses the shield outright, whatever is left of it
        this.emit('shieldStrip', t.x, t.y - (t.h >> 1), t.half + 2, {
          player: t.player,
          lost: t.shield,
        });
        t.shield = 0;
      }
      if (e.drain > 0) {
        // the pulse cooks spare batteries (gear that heals) in the hold, up to `drain` of them
        let left = e.drain;
        let lost = 0;
        for (let g = 0; g < this.gear.length && left > 0; g++) {
          if (this.gear[g]!.heal <= 0) continue;
          const n = Math.min(left, t.gear[g] ?? 0);
          if (n <= 0) continue;
          t.gear[g] = t.gear[g]! - n;
          left -= n;
          lost += n;
        }
        if (lost > 0)
          this.emit('drained', t.x, t.y - (t.h >> 1), t.half, { player: t.player, lost });
      }
      if (e.mark > 0 && shooter && t.team !== shooter.team) {
        // marked through the marker's next turns (a self-mark-turn counts one extra)
        t.mark = e.mark + (mine ? 1 : 0);
        t.markBy = owner;
        t.markBonus = e.markBonus;
        this.emit('marked', t.x, t.y - (t.h >> 1), t.half, { player: t.player, by: owner });
      }
      if (e.jam > 0) {
        // jammed for its next own turns; a tank that jams itself stays jammed past this turn too
        const turns = e.jam + (t.player === this.activePlayer && this.phase === 'resolve' ? 1 : 0);
        if (turns > t.jam) t.jam = turns;
        t.driving = 0;
        this.emit('jammed', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
      }
      // a glued tank holds fast: blasts don't shove it
      if (e.push > 0 && dx !== 0 && t.glue === 0) {
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
    if (e.damage > 0 && this.lures.length > 0) {
      for (let i = 0; i < this.lures.length; i++) {
        const l = this.lures[i]!;
        if (!l.alive) continue;
        const dx = l.x - x;
        const dy = l.y - (l.h >> 1) - y;
        const d = isqrt(dx * dx + dy * dy);
        const reach = e.radius + l.half;
        if (d >= reach) continue;
        const base = e.linear ? Math.trunc((e.damage * (reach - d)) / reach) : e.damage;
        this.hurtLure(i, Math.max(1, base), owner);
      }
    }
    if (e.damage > 0 && this.mines.length > 0) this.tripMines(x, y, e.radius);
  }

  /**
   * Lit gunpowder going off (§4b): explosions the reaction pass queued, in cell order, owned by
   * the player whose shot lit the seam. Their blasts light the cells around them in turn.
   */
  private bursts(): void {
    const g = this.grid;
    const n = g.burstCount;
    g.burstCount = 0;
    const owner = this.phase === 'resolve' ? this.activePlayer : -1;
    for (let k = 0; k < n; k += 2) {
      const i = g.bursts[k]!;
      const e = this.burstExplosion[g.bursts[k + 1]!];
      if (!e) continue;
      const x = i % g.width;
      this.explode(e, x, (i - x) / g.width, owner, false);
    }
  }

  /** A blast lights the `ignite` cells (gunpowder) it reached but didn't carve away. */
  private ignite(x: number, y: number, radius: number, dt: number): void {
    const g = this.grid;
    const W = g.width;
    const mat = g.material;
    const into = this.mats.igniteInto;
    const by = this.mats.igniteBy;
    const bit = 1 << dt;
    const keep = KEEP;
    const r = radius + 2;
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(W - 1, x + r);
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(g.height - 1, y + r);
    const rr = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      const dy = cy - y;
      for (let cx = x0, i = cy * W + x0; cx <= x1; cx++, i++) {
        const m = mat[i]!;
        const to = into[m]!;
        if (to === keep || (by[m]! & bit) === 0) continue;
        const dx = cx - x;
        if (dx * dx + dy * dy > rr) continue;
        g.leaveGroup(i);
        mat[i] = to;
        g.cellState[i] = 0;
        g.markDirty(cx, cy, cx, cy);
      }
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
    // terrain ops may shove tanks sideways (quakes, waves, pulls); glued tanks stay put
    if (this.glueX.length < this.tanks.length) this.glueX = new Int32Array(this.tanks.length);
    const pin = this.glueX;
    for (let i = 0; i < this.tanks.length; i++) pin[i] = this.tanks[i]!.x;
    const next: OpInstance[] = [];
    let idle = 0;
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
      if (more === 'idle') idle++;
    }
    this.ops = next;
    this.idleOps = idle;
    for (let i = 0; i < this.tanks.length; i++) {
      const t = this.tanks[i]!;
      if (t.glue > 0) t.x = pin[i]!;
    }
  }

  /** Tank columns before the ops step, so glued tanks can be put back (one slot per player). */
  private glueX = new Int32Array(8);

  /**
   * Hurt a tank. Its shield soaks the hit first (§3.2); `pierce` skips the shield (falling out of
   * the map is always fatal).
   */
  private damageTank(t: Tank, dmg0: number, by: number, pierce = false): void {
    if (dmg0 <= 0 || !t.alive) return;
    let dmg = dmg0;
    if (t.mark > 0 && by >= 0) {
      // a spotted tank: the marker's team hits it harder
      const src = this.tanks[by];
      const marker = this.tanks[t.markBy];
      if (src && marker && src.team === marker.team) {
        dmg = Math.trunc((dmg * (100 + t.markBonus)) / 100);
      }
    }
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
          const m = g.material[row + x]!;
          // gas only sits over air: a tank in a cloud of it is touching it
          const d = cd[m === 0 ? g.gas[row + x]! : m]!;
          if (d > worst) worst = d;
        }
      }
      // contact damage is burning (fire, napalm, lava), so the heat scales it too
      worst = this.tempScaled(worst, DT_HEAT);
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

  addLure(x: number, y: number, owner: number, hp: number): number {
    if (this.lures.length >= MAX_LURES) return -1;
    const o = this.tanks[owner];
    const g = this.grid;
    const half = TANK_W >> 1;
    const cx = Math.max(half, Math.min(g.width - half - 1, x | 0));
    this.lures.push({
      owner,
      team: o ? o.team : owner,
      x: cx,
      y: Math.max(TANK_H, Math.min(g.height, y | 0)),
      hp: Math.max(1, hp | 0),
      maxHp: Math.max(1, hp | 0),
      half,
      h: TANK_H,
      alive: true,
    });
    const i = this.lures.length - 1;
    const l = this.lures[i]!;
    this.emit('decoyUp', l.x, l.y, l.half, { index: i, owner });
    return i;
  }

  hurtLure(index: number, amount: number, owner: number): void {
    const l = this.lures[index];
    if (!l || !l.alive || amount <= 0) return;
    l.hp -= Math.trunc(amount);
    this.emit('decoyHit', l.x, l.y - (l.h >> 1), l.half, { index, owner });
    if (l.hp <= 0) this.popLure(index);
  }

  private popLure(index: number): void {
    const l = this.lures[index]!;
    l.alive = false;
    l.hp = 0;
    this.emit('decoyPop', l.x, l.y - (l.h >> 1), l.half + 4, { index, owner: l.owner });
  }

  /** Decoys drop a cell a tick onto whatever ground is left under them; off the map, they pop. */
  private stepLures(): void {
    const g = this.grid;
    for (let i = 0; i < this.lures.length; i++) {
      const l = this.lures[i]!;
      if (!l.alive) continue;
      let ground = l.y >= g.height;
      for (let x = l.x - l.half; x < l.x + l.half && !ground; x++) {
        if (x >= 0 && x < g.width && g.material[l.y * g.width + x] !== 0) ground = true;
      }
      if (ground) continue;
      l.y++;
      if (l.y >= g.height) this.popLure(i);
    }
  }

  /** Index of the live decoy covering cell (cx, cy), or -1. */
  private lureAt(cx: number, cy: number): number {
    for (let i = 0; i < this.lures.length; i++) {
      const l = this.lures[i]!;
      if (l.alive && cx >= l.x - l.half && cx < l.x + l.half && cy >= l.y - l.h && cy < l.y) {
        return i;
      }
    }
    return -1;
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
        if (t.glue === 0) {
          if (t.sunk === 0 && this.grid.settling) this.slide(t);
          if (!t.falling) this.slip(t);
        }
      } else {
        t.falling = false;
        const chute = t.chute;
        t.chute = false;
        const dist = t.y - t.fallFrom;
        const by = this.shooter >= 0 ? this.shooter : t.lastHitBy;
        if (t.y >= this.grid.height) {
          // Fell out of the map (dug to the bottom): lost.
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

  /**
   * The round's base temperature: the forced one, else the map's (or mild) plus the weather's shift
   * and a ±4 °C jitter. Drawn from its own seeded PRNG so the match RNG and every golden stay put.
   */
  private startTemperature(mapBase: number | undefined): void {
    const forced = this.options.temperature;
    if (forced !== undefined) {
      this.tempBase = this.temperature = clampTemp(Math.round(forced));
      return;
    }
    const r = new Prng((this.options.seed ^ Math.imul(this.round + 1, 0x6c8e9cf5)) >>> 0);
    const base = (mapBase ?? TEMP_MILD) + (this.weather?.temperature ?? 0) + r.range(-4, 4);
    this.tempBase = this.temperature = clampTemp(base);
  }

  /**
   * Each turn the air warms or cools by up to TEMP_DRIFT °C, leaning back towards the round's base
   * once it has wandered more than 10 °C away. Own seeded PRNG per turn, like `startTemperature`.
   */
  private driftTemperature(): void {
    if (this.options.temperature !== undefined) return;
    const k = Math.imul(this.round * 4096 + this.turn + 1, 0x2c1b3c6d);
    const r = new Prng((this.options.seed ^ k ^ 0x5bd1e995) >>> 0);
    let step = r.range(-TEMP_DRIFT, TEMP_DRIFT);
    const off = this.temperature - this.tempBase;
    if (off > 10) step = Math.min(step, 0) - 1;
    else if (off < -10) step = Math.max(step, 0) + 1;
    this.temperature = clampTemp(this.temperature + step);
  }

  private beginTurn(): void {
    this.contactDone = false;
    // spent storms that lingered for their last bolts are gone now
    if (this.zones.length > 0) this.zones = this.zones.filter((z) => z.turns > 0);
    if (this.turn > 0) this.driftTemperature();
    this.shooter = -1;
    this.phase = 'aim';
    this.modeB.onTurnStart(this.modeApi, this.modeParams);
    this.weatherB?.onTurnStart?.(this, this.weatherParams);
    if (this.suddenDeathActive) this.growZone();
    const t = this.tanks[this.activePlayer];
    if (t?.alive && this.suddenDeath && this.inDeathZone(t)) {
      // the wasteland eats at a tank that starts its turn inside it; no one gets the credit
      this.emit('zoneBurn', t.x, t.y - (t.h >> 1), t.half, { player: t.player });
      this.damageTank(t, this.suddenDeath.zoneDamage, -1, true);
    }
    const bot = t ? this.driverBot : -1;
    this.botWait = t && bot >= 0 ? BOT_THINK_TICKS : 0;
    this.timer = t && bot < 0 ? this.turnTimerTicks : 0;
    const by = this.controller;
    if (t?.alive && by !== t.player) {
      // its caster takes the controls for this turn
      const c = this.tanks[by]!;
      this.emit('mindTurn', t.x, t.y - (t.h >> 1), t.half, {
        player: t.player,
        by,
        cx: c.x,
        cy: c.y - (c.h >> 1),
      });
    }
    if (t) {
      // a glued tank can't drive this turn
      t.driveLeft = t.glue > 0 || t.jam > 0 ? 0 : this.driveCells(t);
      t.driving = 0;
    }
  }

  /**
   * Sudden death (§3.1): the death zone at each map edge grows by `edgeCells` columns. The terrain
   * stays; the zone is a no-go strip that burns any tank starting its turn inside it. A strip of
   * a couple of tank widths in the middle always stays clear.
   */
  private growZone(): void {
    const sd = this.suddenDeath!;
    const g = this.grid;
    const n = Math.min(sd.edgeCells, Math.max(0, (g.width >> 1) - TANK_W - this.edge));
    if (n <= 0) return;
    const from = this.edge;
    this.edge += n;
    this.emit('zoneGrow', from, g.height >> 1, n, { edge: this.edge });
  }

  /** True when any part of the tank's hull is inside the sudden-death zone. */
  inDeathZone(t: Tank): boolean {
    return t.x - t.half < this.edge || t.x + t.half > this.grid.width - this.edge;
  }

  private endTurn(): void {
    const active = this.tanks[this.activePlayer];
    if (active && active.chill > 0) active.chill--;
    if (active && active.mind > 0) {
      active.mind--;
      if (active.mind === 0) {
        if (active.alive) {
          this.emit('mindFree', active.x, active.y - (active.h >> 1), active.half, {
            player: active.player,
            by: active.mindBy,
          });
        }
        active.mindBy = -1;
      }
    }
    if (active && active.glue > 0) {
      active.glue--;
      // the glue gives: a little tear of goo as it lets go
      if (active.glue === 0 && active.alive) {
        this.emit('unglued', active.x, active.y, active.half, { player: active.player });
      }
    }
    this.turn++;
    turnDecay(this.grid, this.mats);
    if (active) {
      for (const u of this.tanks) {
        if (u.mark <= 0 || u.markBy !== active.player) continue;
        u.mark--;
        if (u.mark === 0) {
          u.markBy = -1;
          if (u.alive) this.emit('unmarked', u.x, u.y - (u.h >> 1), u.half, { player: u.player });
        }
      }
      if (active.scope > 0) active.scope--;
    }
    if (active && active.jam > 0) {
      active.jam--;
      if (active.jam === 0 && active.alive) {
        this.emit('unjammed', active.x, active.y - (active.h >> 1), active.half, {
          player: active.player,
        });
      }
    }
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
    if (this.timer > 0 && !this.tanks.every((t) => t.ready)) return;
    for (const t of this.tanks) t.ready = false;
    // the opening shop sits on round 1's map already; between rounds a new map is generated
    if (this.round === 0) this.beginTurn();
    else this.startRound();
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
        glue: t.glue,
        ...(t.rust > 0 ? { rust: t.rust } : {}),
        ...(t.mind > 0 ? { mind: t.mind, mindBy: t.mindBy } : {}),
        ...(t.jam > 0 ? { jam: t.jam } : {}),
        ...(t.mark > 0 ? { mark: t.mark, markBy: t.markBy } : {}),
        ...(t.scope > 0 ? { scope: t.scope } : {}),
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
        ...(z.sky > 0 ? { age: z.age } : {}),
        ...(z.puffs.length > 0
          ? {
              puffs: puffCells(z.puffs),
              puffRadius: z.puffRadius,
              age: z.age,
            }
          : {}),
      });
    }
    for (let i = 0; i < this.lures.length; i++) {
      const l = this.lures[i]!;
      if (!l.alive) continue;
      entities.push({
        kind: 'decoy',
        id: i,
        x: l.x,
        y: l.y,
        owner: l.owner,
        hp: l.hp,
        maxHp: l.maxHp,
      });
    }
    for (const m of this.mines) {
      entities.push({
        kind: 'mine',
        id: m.id,
        x: m.x,
        y: m.y,
        radius: m.radius,
        look: MINE_LOOKS[m.look] ?? 'black-hole',
        armed: m.armed,
        owner: m.owner,
        ...(m.wireH > 0 ? { wire: { x2: m.x2, y2: m.y2, height: m.wireH } } : {}),
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
      gas: this.grid.gas,
      gasRect: this.gasRect(),
      processes: this.processCounts(),
      shade: this.grid.shade,
      dirtyRects: this.grid.takeRenderRects(),
      entities,
      effectEvents,
      debris: {
        count: this.debris.count,
        x: this.debris.x,
        y: this.debris.y,
        vx: this.debris.vx,
        material: this.debris.mat,
        shade: this.debris.shade,
      },
      wind: this.wind / FP,
      temperature: this.temperature,
      deathZone: this.edge,
      preview: this.previewPath() ?? undefined,
      theme: 'theme.default',
      weather: this.weather
        ? {
            id: this.weather.id,
            kind: this.weather.ambient.kind,
            density: this.weather.ambient.density,
            color: this.weather.ambient.color,
            wet: this.weather.wet,
          }
        : undefined,
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
    h.bytes(g.material).bytes(g.coating).bytes(g.gas).bytes(g.cellState).bytes(g.fallVel);
    h.bytes(g.group).bytes(g.groupMat);
    this.groups.hash(h);
    h.num(g.settleMinX).num(g.settleMaxX).num(g.settleMaxY);
    h.num(g.structMinX).num(g.structMaxX).num(g.structMinY).num(g.structMaxY);
    h.num(g.reactMinX).num(g.reactMaxX).num(g.reactMinY).num(g.reactMaxY);
    h.num(g.turnMinX).num(g.turnMaxX).num(g.turnMinY).num(g.turnMaxY);
    h.num(this.contactDone ? 1 : 0);
    // temperature (kernel 0.18.0)
    h.num(this.temperature).num(this.tempBase);
    // gusty wind (kernel 0.9.0): only hashed when in use, so other matches keep their hashes
    if (this.gust !== 0 || this.modeMem.length > 0) {
      h.num(this.windBase).num(this.gust).num(this.modeMem.length);
      for (const v of this.modeMem) h.num(v);
    }
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
        .num(t.glue)
        .num(t.driveLeft)
        .num(t.driving)
        .num(t.fuel)
        .num(t.fuelBurn)
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
      // rust (Thunderstorm): only hashed while rusted, so other matches keep their hashes
      if (t.rust > 0)
        h.num(t.rust).num(t.rustDamage).num(t.rustDrive).num(t.rustWobble).num(t.rustBy);
      // mind link (Telepathy): likewise only while linked
      if (t.mind > 0) h.num(t.mind).num(t.mindBy);
      // jam (Shield Breaker EMP): likewise only while jammed
      if (t.jam > 0) h.num(t.jam);
      // mark and scope (Spotter Flare): likewise only while set
      if (t.mark > 0) h.num(t.mark).num(t.markBy).num(t.markBonus);
      if (t.scope > 0) h.num(t.scope);
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
      if (z.sky > 0 || z.rustTurns > 0 || z.strikeWeapon >= 0) {
        h.num(z.sky).num(z.rustTurns).num(z.rustDamage).num(z.rustDrive).num(z.rustWobble);
        h.num(z.strikeWeapon).num(z.strikeChance).num(z.strikeSpread);
        h.num(z.strikeCount).num(z.strikeLead).num(z.strikeStagger);
      }
      // newer zone kinds only: other matches keep their hashes
      if (z.skyDrift > 0 || z.shieldDrain > 0 || z.spikeDrag >= 0 || z.strikeFall) {
        h.num(z.strikeFall ? 1 : 0)
          .num(z.fx)
          .num(z.skyDrift)
          .num(z.shieldDrain)
          .num(z.spikeDamage)
          .num(z.spikeDrag);
      }
    }
    // decoys: only hashed once one has been put down, so other matches keep their hashes
    if (this.lures.length > 0) {
      h.num(this.lures.length);
      for (const l of this.lures) {
        h.num(l.owner)
          .num(l.team)
          .num(l.x)
          .num(l.y)
          .num(l.hp)
          .num(l.maxHp)
          .num(l.alive ? 1 : 0);
      }
    }
    // mines: only hashed once one has been laid, so other matches keep their hashes
    if (this.nextMineId > 1) {
      h.num(this.nextMineId).num(this.mines.length);
      for (const m of this.mines) {
        h.num(m.id).num(m.x).num(m.y).num(m.radius).num(m.weapon).num(m.look).num(m.owner);
        h.num(m.armed ? 1 : 0);
        if (m.wireH > 0) h.num(m.x2).num(m.y2).num(m.wireH);
      }
    }
    h.num(this.ops.length);
    // resident ops only: other matches keep their hashes
    if (this.idleOps > 0) h.num(this.idleOps);
    for (const o of this.ops) {
      h.num(o.op).num(o.t).num(o.call.x).num(o.call.y).num(o.call.radius).num(o.call.owner);
      for (const v of o.data) h.num(v);
    }
    return h.hex();
  }
}

/** Puff centres in cells, flattened x, y, from fixed-point x, y, vx, vy records. */
const DT_HEAT = damageTypeIndex('heat');
const DT_COLD = damageTypeIndex('cold');

function clampTemp(t: number): number {
  return Math.max(TEMP_MIN, Math.min(TEMP_MAX, t));
}

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
