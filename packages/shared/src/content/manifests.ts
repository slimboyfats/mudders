import { z } from 'zod';
import { DAMAGE_TYPES } from '../constants';

/**
 * Zod schemas for content manifests (§2c). These describe *resolved* manifests: the loader in
 * `@mudders/sim` first resolves every `extends` and `use` reference into a flat object and only
 * then validates it here. Raw manifests may therefore contain `extends` and `{ "use": … }`.
 *
 * Every schema carries `schemaVersion`; when a shape changes incompatibly, bump it and add a
 * migration in the loader (`MANIFEST_MIGRATIONS`) so older manifests keep loading.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

/** `type.name` or `type.name.variant`, lowercase kebab segments. */
export const ContentIdSchema = z
  .string()
  .regex(/^[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, 'ids look like "weapon.baby-missile"');

export const CONTENT_TYPES = [
  'material',
  'gen',
  'flight',
  'explosion',
  'terrainop',
  'weapon',
  'mode',
  'ai',
  'prop',
  'theme',
  'audio',
  'tank',
  'gear',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Folder under a pack that holds items of each type (`core/weapons/missile/manifest.json`). */
export const CONTENT_TYPE_FOLDERS: Readonly<Record<ContentType, string>> = {
  material: 'materials',
  gen: 'generators',
  flight: 'flights',
  explosion: 'explosions',
  terrainop: 'terrainops',
  weapon: 'weapons',
  mode: 'modes',
  ai: 'ai',
  prop: 'props',
  theme: 'themes',
  audio: 'audio',
  tank: 'tanks',
  gear: 'gear',
};

export function contentTypeOf(id: string): ContentType | undefined {
  const prefix = id.slice(0, id.indexOf('.'));
  return (CONTENT_TYPES as readonly string[]).includes(prefix)
    ? (prefix as ContentType)
    : undefined;
}

export const DamageTypeSchema = z.enum(DAMAGE_TYPES);

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const MetaSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  /** Pack version the item first appeared in, e.g. `core@0.1.0`. */
  since: z.string().regex(/^[a-z0-9-]+@\d+\.\d+\.\d+$/),
  deprecated: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** Debug/preview colour (`#rrggbb`). Themes own the real palette from milestone 2. */
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .optional(),
});

const base = {
  id: ContentIdSchema,
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  meta: MetaSchema,
};

/** Keys every top-level manifest has; stripped when an item is embedded via `use`. */
export const MANIFEST_BASE_KEYS = ['id', 'schemaVersion', 'meta'] as const;

/** Resolved embedded references keep `ref` (the id they came from) for traceability. */
const ref = (prefix: ContentType) =>
  ContentIdSchema.refine((id) => id.startsWith(`${prefix}.`), {
    message: `must reference a ${prefix}.* item`,
  }).optional();

/** `#rrggbb`, lowercase. */
export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, 'colours look like "#1a2b3c"');

// ── material ────────────────────────────────────────────────────────────────────────────────

/** A material id, or "air" for an empty cell. */
export const MaterialRefSchema = z.union([
  z.literal('air'),
  ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id or "air"'),
]);

export const SettleRuleSchema = z.enum(['static', 'fall', 'slide', 'flow']);
export type SettleRule = z.infer<typeof SettleRuleSchema>;

export const MaterialSchema = z.strictObject({
  ...base,
  /** Byte stored in the grid for this material. 0 is air. Permanent, like the id. */
  cell: z.number().int().min(1).max(255),
  settle: SettleRuleSchema,
  /** Stacking order when flows meet; higher sinks. */
  density: z.number().int().min(0).max(255),
  /** Resistance per damage type: 1 = dirt, 0 = destroyed by any contact, >1 resists. */
  strength: z.partialRecord(DamageTypeSchema, z.number().min(0).max(64)),
  /** -1 loosens neighbours, 0 settles normally, >0 binds into blobs (§4b). */
  cohesion: z.number().min(-1).max(1),
  /** Coatings live in the secondary layer on top of a base material (§4b). */
  coating: z.boolean(),
  /**
   * Adjacency rules (§4b), checked on recently changed cells: when this cell touches `with`, with
   * probability `chance` per tick it becomes `into`, the neighbour becomes `other`, and/or `spawn`
   * is placed in an air cell next to it. For a coating, `into` replaces the coating. "air" clears.
   */
  reactions: z
    .array(
      z.strictObject({
        with: MaterialRefSchema,
        into: MaterialRefSchema.optional(),
        other: MaterialRefSchema.optional(),
        spawn: MaterialRefSchema.optional(),
        chance: z.number().min(0).max(1),
      }),
    )
    .max(4)
    .optional(),
  /** Timed conversion (§4b): after `ticks` ticks (busy, keeps the shot resolving) or `turns` turns. */
  decay: z
    .union([
      z.strictObject({ into: MaterialRefSchema, ticks: z.number().int().min(1).max(255) }),
      z.strictObject({ into: MaterialRefSchema, turns: z.number().int().min(1).max(3) }),
    ])
    .optional(),
  /** Flow materials: ticks a cell may keep spreading sideways after it last fell (≤ 63). */
  spread: z.number().int().min(1).max(63).optional(),
  /** Effect on tanks touching or buried in it (§4b), applied once at the end of each turn. */
  contact: z.strictObject({ damage: z.number().int().min(0).max(100) }).optional(),
  /** A tank resting on it sinks one cell every `ticks` ticks, up to `depth` cells (quicksand). */
  sink: z
    .strictObject({
      ticks: z.number().int().min(1).max(255),
      depth: z.number().int().min(1).max(8),
    })
    .optional(),
  /**
   * Slick ground (frost): a tank resting with at least half its treads on it slides one cell
   * every `ticks` ticks toward a side that drops away below it, until it reaches level ground.
   */
  slick: z.strictObject({ ticks: z.number().int().min(1).max(255) }).optional(),
  /**
   * Compaction (mud): when a crater is carved out of this material, the blast packs the cells
   * beneath each carved column instead of only blowing them away. Per column, `ratio` cells of
   * this material below the crater floor become `into` for every carved cell (at least one), so
   * the ground sinks in as a dent with a packed, tougher floor.
   */
  compact: z
    .strictObject({
      into: MaterialRefSchema,
      ratio: z.number().min(0.1).max(4),
      /** Thickest packed layer per column. */
      maxDepth: z.number().int().min(1).max(64),
    })
    .optional(),
  /**
   * Blast-lit (gunpowder): an explosion of one of the `by` damage types that reaches this cell,
   * without carving it away, turns it into `into` (a burning fuse). Reactions light it from fire
   * and lava as usual.
   */
  ignite: z
    .strictObject({
      into: MaterialRefSchema,
      by: z.array(DamageTypeSchema).min(1).default(['blast', 'heat', 'shock']),
    })
    .optional(),
  /**
   * Bursts (lit gunpowder): when a cell's tick `decay` runs out, with probability `chance` it
   * sets off `explosion` there, owned by the player whose turn it is. Its blast lights more
   * `ignite` cells, so a seam goes off in a chain.
   */
  detonate: z
    .strictObject({
      explosion: z.lazy(() => EmbeddedExplosionSchema),
      chance: z.number().min(0).max(1),
    })
    .optional(),
  /**
   * Renderer look (cosmetic, never read by the sim): `cycle` steps the cell through these colours
   * every `cycleTicks` ticks in hard bands (lava, water); `hot` makes the air above shimmer.
   */
  look: z
    .strictObject({
      cycle: z.array(HexColorSchema).min(2).max(8).optional(),
      cycleTicks: z.number().int().min(1).max(60).default(8),
      hot: z.boolean().default(false),
      /** Soil that grows the theme's grass on exposed tops (and tufts in the air above). */
      topsoil: z.boolean().default(false),
      /** Chars black and smoulders with embers after a blast, like topsoil, without the grass. */
      char: z.boolean().default(false),
      /** Licks pixel flames and black smoke up from exposed tops (napalm, burning oil). */
      flames: z.boolean().default(false),
      /** Crystalline: scattered cells glint white for a moment, in whole-cell steps (frost). */
      glint: z.boolean().default(false),
    })
    .optional(),
});
export type MaterialManifest = z.infer<typeof MaterialSchema>;

// ── behaviour-backed items (code + params) ──────────────────────────────────────────────────
// These are loose: the registered behaviour module validates its own parameters.

const behaviourBacked = { ...base, behaviour: ContentIdSchema };

/** Props a generator scatters after the terrain (§4c); counts are per 1000 map columns. */
export const GenPropSchema = z.strictObject({
  prop: ContentIdSchema.refine((id) => id.startsWith('prop.'), 'must be a prop.* id'),
  count: z.tuple([z.number().int().min(0).max(50), z.number().int().min(0).max(50)]),
  /** Place each after the first next to the previous one (a village street). */
  cluster: z.boolean().default(false),
});
export type GenProp = z.infer<typeof GenPropSchema>;

export const GeneratorSchema = z.looseObject({
  ...behaviourBacked,
  props: z.array(GenPropSchema).max(8).optional(),
});
/** Keys the kernel reads from a generator itself; the rest go to its behaviour. */
export const GEN_CORE_KEYS: readonly string[] = ['props'];
export const FlightSchema = z.looseObject({ ...behaviourBacked });
export const TerrainOpSchema = z.looseObject({ ...behaviourBacked });
export type GeneratorManifest = z.infer<typeof GeneratorSchema>;
export type FlightManifest = z.infer<typeof FlightSchema>;
export type TerrainOpManifest = z.infer<typeof TerrainOpSchema>;

export const EmbeddedFlightSchema = z.looseObject({
  ref: ref('flight'),
  behaviour: ContentIdSchema,
});
export const EmbeddedTerrainOpSchema = z.looseObject({
  ref: ref('terrainop'),
  behaviour: ContentIdSchema,
});
export type EmbeddedFlight = z.infer<typeof EmbeddedFlightSchema>;
export type EmbeddedTerrainOp = z.infer<typeof EmbeddedTerrainOpSchema>;

// ── explosion ───────────────────────────────────────────────────────────────────────────────

/** Effect profile: event type → numeric parameters, e.g. `{ "burst": { "count": 40 } }`. */
export const EffectProfileSchema = z.record(z.string(), z.record(z.string(), z.number()));

const explosionBody = {
  /** Blast radius in cells (before material strength scaling). */
  radius: z.number().int().min(1).max(400),
  /** Damage to a tank at the centre; falls off with distance. */
  damage: z.number().int().min(0).max(1000),
  damageType: DamageTypeSchema,
  falloff: z.enum(['linear', 'flat']),
  /** Horizontal shove applied to tanks in range at the centre, in cells. */
  push: z.number().int().min(0).max(200),
  /**
   * Frosts tanks in range for this many of their own turns: a frosted tank fires at no more than
   * half power. 0 = none.
   */
  chill: z.number().int().min(0).max(3).default(0),
  terrainOp: EmbeddedTerrainOpSchema.nullable(),
  effects: EffectProfileSchema,
};

export const ExplosionSchema = z.strictObject({ ...base, ...explosionBody });
export const EmbeddedExplosionSchema = z.strictObject({ ref: ref('explosion'), ...explosionBody });
export type ExplosionManifest = z.infer<typeof ExplosionSchema>;
export type EmbeddedExplosion = z.infer<typeof EmbeddedExplosionSchema>;

// ── weapon ──────────────────────────────────────────────────────────────────────────────────

export const TriggerSchema = z.union([
  z.enum(['onSolid', 'onTank', 'onWall', 'onApex']),
  z.strictObject({ onTimer: z.number().int().min(1) }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

const WeaponIdSchema = ContentIdSchema.refine(
  (id) => id.startsWith('weapon.'),
  'must be a weapon.* id',
);

/**
 * Child shells (MIRV warheads, cluster bomblets, Leapfrog hops). Each child flies as its own
 * weapon from the impact point (lifted to the nearest air cell), owned by the same shooter.
 * Velocities are in cells/tick: `inherit` × the parent's velocity, children fanned evenly across
 * ±`spread` horizontally, ±`jitter` at random (match PRNG) on both axes, and `up` added upward.
 * `bounce` > 0 replaces the vertical part with a rebound: −|parent vy| × `bounce`.
 * `stagger` lifts each child a little more than the last, counted in the parent's direction of
 * travel, so the far children fly higher and land one after another (MIRV's rolling carpet).
 */
export const SpawnSchema = z.strictObject({
  /** One weapon, or a pool picked from at random per child (Mystery). */
  weapon: z.union([WeaponIdSchema, z.array(WeaponIdSchema).min(1).max(64)]),
  count: z.number().int().min(1).max(16).default(1),
  inherit: z.number().min(-2).max(2).default(1),
  bounce: z.number().min(0).max(2).default(0),
  spread: z.number().min(0).max(20).default(0),
  jitter: z.number().min(0).max(20).default(0),
  up: z.number().min(-20).max(20).default(0),
  stagger: z.number().min(0).max(4).default(0),
});
export type Spawn = z.infer<typeof SpawnSchema>;

/**
 * Zone (§4a): a lingering region left by a shot. At the end of every turn it hurts tanks inside
 * it (`damage`) and re-runs `terrainOp` over itself, for `turns` turns. `amplify` > 1 makes it a
 * resonance field instead: the next explosion centred inside it is scaled by that factor (radius,
 * damage and push) and the zone is used up. `look` tells renderers how to draw it.
 *
 * `cloud` makes it a moving gas cloud instead of a fixed circle: `puffs` puffs of `puffRadius`
 * burst out from the impact at `billow` cells/tick, then drift with the wind (`drift` × wind),
 * sink at up to `sink` cells/tick, slide downhill and pool in low ground. A tank inside any puff
 * takes the zone's damage at the end of each turn; `radius` is unused for clouds.
 */
export const ZoneCloudSchema = z.strictObject({
  puffs: z.number().int().min(1).max(32),
  puffRadius: z.number().int().min(2).max(60),
  billow: z.number().min(0).max(4).default(1),
  drift: z.number().min(0).max(40).default(8),
  sink: z.number().min(0).max(2).default(0.3),
});
export type ZoneCloud = z.infer<typeof ZoneCloudSchema>;

export const ZoneSchema = z.strictObject({
  radius: z.number().int().min(1).max(400),
  turns: z.number().int().min(1).max(10),
  damage: z.number().int().min(0).max(100).default(0),
  amplify: z.number().min(1).max(4).default(1),
  terrainOp: EmbeddedTerrainOpSchema.nullable().default(null),
  damageType: DamageTypeSchema.default('blast'),
  look: z.enum(['gas', 'acid', 'resonance', 'toxic']).default('gas'),
  cloud: ZoneCloudSchema.nullable().default(null),
});
export type ZoneSpec = z.infer<typeof ZoneSchema>;

export const ImpactSchema = z.union([
  z.strictObject({ explosion: EmbeddedExplosionSchema }),
  z.strictObject({
    terrainOp: EmbeddedTerrainOpSchema,
    radius: z.number().int().min(1).max(400),
    damageType: DamageTypeSchema,
  }),
  z.strictObject({ spawn: SpawnSchema }),
  z.strictObject({ zone: ZoneSchema }),
]);
export type Impact = z.infer<typeof ImpactSchema>;

export const WeaponSchema = z.strictObject({
  ...base,
  flight: EmbeddedFlightSchema,
  triggers: z.array(TriggerSchema).min(1),
  impact: z.array(ImpactSchema).min(1),
  /**
   * Run where the shell is, without stopping it, whenever its flight asks (a digger's tunnel, a
   * laser's cut, a water cannon's stream). Most weapons have none.
   */
  pulse: z.array(ImpactSchema).default([]),
  shop: z.strictObject({
    price: z.number().int().min(0),
    pack: z.number().int().min(1),
    tier: z.number().int().min(0),
  }),
  ai: z.strictObject({
    expectedDamage: z.number().min(0),
    terrainValue: z.number().min(0).max(1),
  }),
  /** Sounds (cosmetic, client only): `fire` replaces the default shot sound. */
  audio: z.strictObject({ fire: ref('audio') }).optional(),
  /**
   * Renderer look of the shell in flight (cosmetic, never read by the sim): `fire` draws a burning
   * gob shedding flames instead of the default spark, `ricochet` a crackling energy ball that runs
   * hotter after every bounce, `meteor` a glowing rock head trailing a long streak of fire and
   * smoke, `mud` a dripping glob of wet mud; `trail: false` leaves no trail line.
   */
  look: z
    .strictObject({
      shell: z.enum(['spark', 'fire', 'ricochet', 'meteor', 'mud']).default('spark'),
      trail: z.boolean().default(true),
      /** Scale of a `meteor` head and its streak. */
      size: z.number().min(0.5).max(3).default(1),
    })
    .optional(),
});
export type WeaponManifest = z.infer<typeof WeaponSchema>;

// ── mode ────────────────────────────────────────────────────────────────────────────────────

export const WallRuleSchema = z.enum(['absorb', 'bounce', 'wrap', 'concrete']);

/**
 * How wind changes (§3.4): never, once per round, every turn, or every turn plus gusts that keep
 * shifting it while you aim and while the shell is in the air.
 */
export const WindTypeSchema = z.enum(['none', 'constant', 'perTurn', 'gusty']);
export type WindType = z.infer<typeof WindTypeSchema>;
export type WallRule = z.infer<typeof WallRuleSchema>;

export const ModeSchema = z.looseObject({
  ...behaviourBacked,
  rounds: z.number().int().min(1).max(20),
  /** Turns per player before the round ends on points (§3.1). */
  turnCap: z.number().int().min(1),
  startingHealth: z.number().int().min(1).max(1000),
  /** Default tank type (`tank.*`) for players the setup doesn't give one; unset = standard tank. */
  tank: ContentIdSchema.optional(),
  physics: z.strictObject({
    /** Gravity in cells/tick². */
    gravity: z.number().positive(),
    /** Muzzle speed at power 1000, in cells/tick. */
    maxSpeed: z.number().positive(),
  }),
  wind: z.strictObject({
    type: WindTypeSchema,
    /** Maximum wind acceleration, cells/tick². */
    max: z.number().min(0),
  }),
  walls: WallRuleSchema,
  fallDamage: z.strictObject({
    safeCells: z.number().int().min(0),
    perCell: z.number().min(0),
  }),
  /**
   * Driving (§3.2): cells a standard tank may drive per turn (scaled by its type's `drive`
   * percent), the steepest step it can climb and ticks per cell. Every cell burns one unit of
   * fuel: tanks start the match with `startFuel`, keep what's left between rounds, and buy
   * `fuelPack` units for `fuelPrice` in the shop, up to `fuelMax`.
   */
  drive: z
    .strictObject({
      cells: z.number().int().min(0).max(1000),
      climb: z.number().int().min(0).max(20),
      ticksPerCell: z.number().int().min(1).max(60),
      startFuel: z.number().int().min(0).max(10000),
      fuelPack: z.number().int().min(1).max(10000),
      fuelPrice: z.number().int().min(0).max(1_000_000),
      fuelMax: z.number().int().min(1).max(10000),
    })
    .default({
      cells: 40,
      climb: 3,
      ticksPerCell: 3,
      startFuel: 80,
      fuelPack: 40,
      fuelPrice: 500,
      fuelMax: 400,
    }),
  map: z.strictObject({
    generator: ContentIdSchema,
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(2048),
  }),
  settle: z.strictObject({ maxCellsPerTick: z.number().int().min(100) }),
  /** count -1 = unlimited. */
  loadout: z.array(z.strictObject({ weapon: ContentIdSchema, count: z.number().int().min(-1) })),
  deathExplosion: EmbeddedExplosionSchema,
  /** Seconds to aim before the shot fires itself with the current settings (§3.3). 0 = off. */
  turnTimer: z.number().min(0).max(600).default(0),
  /** Seconds in the between-round shop before everyone is auto-ready (§3.6). */
  shopTimer: z.number().min(1).max(600).default(30),
  /**
   * Sudden death (§3.1): from the player's `fromTurn`-th turn, weapon damage × `damageScale` and
   * `edgeCells` columns at each map edge collapse into the void at the start of every turn.
   */
  suddenDeath: z
    .strictObject({
      fromTurn: z.number().int().min(1),
      damageScale: z.number().min(1).max(10),
      edgeCells: z.number().int().min(0).max(512),
    })
    .nullable()
    .default(null),
  /** Points per round (§3.5): per hp dealt, per kill, per hp of self-damage (subtracted), bonuses. */
  scoring: z
    .strictObject({
      damage: z.number().min(0),
      kill: z.number().int().min(0),
      selfDamage: z.number().min(0),
      survival: z.number().int().min(0),
      roundWin: z.number().int().min(0),
    })
    .default({ damage: 1, kill: 50, selfDamage: 1, survival: 25, roundWin: 100 }),
  /** Money (§3.6): earned from points, interest on unspent cash, per-round price jitter. */
  economy: z
    .strictObject({
      startingCash: z.number().int().min(0),
      moneyPerPoint: z.number().int().min(0),
      interest: z.number().min(0).max(1),
      priceJitter: z.number().min(0).max(0.9),
    })
    .default({ startingCash: 0, moneyPerPoint: 10, interest: 0, priceJitter: 0 }),
});
export type ModeManifest = z.infer<typeof ModeSchema>;

// ── ai ──────────────────────────────────────────────────────────────────────────────────────

/**
 * AI personality (§3.7): a behaviour module plus its tuning; runs inside the sim. `tank` is the
 * tank type the setup screen gives the bot by default (a `tank.*` id, or "random").
 */
export const AiSchema = z.looseObject({
  ...behaviourBacked,
  tank: z.union([z.literal('random'), ContentIdSchema]).optional(),
});
export type AiManifest = z.infer<typeof AiSchema>;

/** Keys the ai schema defines itself; everything else on an ai item goes to its behaviour. */
export const AI_CORE_KEYS: readonly string[] = ['tank'];

// ── tank ────────────────────────────────────────────────────────────────────────────────────

/** Sprite cell codes for a tank look (renderer-only). */
export const TANK_SPRITE_CODES = '.hHdtwmsg';

/**
 * Tank type (§3.2): plain stats the kernel reads, plus a pixel look only the renderer reads. Every
 * strength should cost something. Stats are relative to `tank.classic`, which matches the
 * pre-0.13 tank exactly.
 */
export const TankSchema = z.strictObject({
  ...base,
  /** Starting health as a percentage of the mode's `startingHealth`. */
  health: z.number().int().min(10).max(400),
  /** Shield points: soak damage before health, refilled at every round start. */
  shield: z.number().int().min(0).max(200).default(0),
  /** Hitbox in cells (`width` even, so the tank stays centred on its column). */
  body: z.strictObject({
    width: z
      .number()
      .int()
      .min(6)
      .max(32)
      .refine((n) => n % 2 === 0, 'width must be even'),
    height: z.number().int().min(4).max(20),
  }),
  /** Damage this tank's shells deal, in percent (explosions and lingering zones it owns). */
  damage: z.number().int().min(25).max(300).default(100),
  /** Muzzle speed in percent: how fast (and so how far) its shells fly at a given power. */
  muzzle: z.number().int().min(50).max(200).default(100),
  /** How far it can drive per turn, in percent of the standard (driving lands in a later PR). */
  drive: z.number().int().min(0).max(400).default(100),
  /**
   * Pixel look (renderer-only). `sprite` rows are drawn bottom-aligned and centred on the tank's
   * column; codes: `.` empty, `h` hull (player colour), `H` hull highlight, `d` hull shade,
   * `t` tread, `w` wheel, `m` metal, `s` shield emitter (glints while the shield holds), `g` glass.
   * The barrel pivots at `barrel.x/y` (cells from the bottom-centre, y up).
   */
  look: z.strictObject({
    sprite: z
      .array(z.string().regex(/^[.hHdtwmsg]+$/, `sprite rows use only "${'.hHdtwmsg'}"`))
      .min(1)
      .max(20),
    barrel: z.strictObject({
      x: z.number().int().min(-16).max(16),
      y: z.number().int().min(0).max(20),
      length: z.number().int().min(2).max(20),
      width: z.number().int().min(1).max(3),
    }),
  }),
});
export type TankManifest = z.infer<typeof TankSchema>;

// ── gear ────────────────────────────────────────────────────────────────────────────────────

/**
 * Defensive gear (§5.1): bought in the shop like weapons, kept in a separate inventory, and used
 * without spending the turn. The kernel reads only these numbers:
 * - `deploy: "manual"`: the owner switches it on while aiming. `shield` raises the tank's shield to
 *   that many points (never lowers it); `heal` restores that much health, up to the round-start
 *   health. It can't be used when it would change nothing.
 * - `deploy: "fall"`: opens by itself when a fall would hurt; the tank drifts down at `fallSpeed`
 *   cells per tick and lands unhurt (falling out of the map is still fatal).
 */
export const GearSchema = z.strictObject({
  ...base,
  deploy: z.enum(['manual', 'fall']),
  shield: z.number().int().min(0).max(400).default(0),
  heal: z.number().int().min(0).max(400).default(0),
  fallSpeed: z.number().int().min(1).max(8).default(1),
  shop: z.strictObject({
    price: z.number().int().min(1),
    pack: z.number().int().min(1).max(20),
    /** Most a tank may carry. */
    max: z.number().int().min(1).max(99).default(9),
  }),
  /** Short label for the in-match button (renderer/UI only). */
  label: z.string().min(1).max(12),
});
export type GearManifest = z.infer<typeof GearSchema>;

// ── prop ────────────────────────────────────────────────────────────────────────────────────

const MaterialIdSchema = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

/**
 * Prop (§4c): a multi-material stamp written into the grid at round start, after which it is
 * ordinary terrain, except that cells in a `group` hold together: damage to them drains the
 * group's integrity instead of removing cells, and at 0 the whole group converts (`breakInto`)
 * and pours down under normal settle rules.
 */
export const PropSchema = z.strictObject({
  ...base,
  /** Rows top to bottom; each character is a `legend` key, space = leave the cell as it is. */
  shape: z.array(z.string().min(1)).min(1).max(96),
  /** Shape character → role name. */
  legend: z.record(z.string().length(1), z.string().min(1)),
  /** Role → material, so a variant re-skins a prop by swapping materials. */
  materials: z.record(z.string().min(1), MaterialIdSchema),
  groups: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        roles: z.array(z.string().min(1)).min(1),
        /**
         * How the group holds together. `whole`: hits drain `integrity` and are undone until it
         * runs out, then the whole group breaks at once. `local`: glued only until hit; a hit
         * frees the cells it touched plus `loosen` cells around them (as `breakInto`), and any
         * piece no longer joined to the ground comes loose and falls.
         */
        glue: z.enum(['whole', 'local']).default('whole'),
        /** `local` glue: how far around a hit the glue gives way, in cells. */
        loosen: z.number().int().min(0).max(8).default(2),
        /**
         * `local` glue: the group shields what is behind it. A blast's reach stops once its line
         * from the blast centre has crossed this many of the group's cells, so ground and tanks
         * behind or under thick rock are untouched (the rock itself still chips where hit).
         * 0 = no shield.
         */
        shield: z.number().int().min(0).max(64).default(0),
        /** Damage pool (`whole` glue): one cell an op tries to remove costs 1, scaled by `resistance`. */
        integrity: z.number().int().min(1).max(100_000).default(100),
        /** Per damage type, on top of the materials' own strength; 2 = takes half damage. */
        resistance: z.partialRecord(DamageTypeSchema, z.number().min(0.05).max(64)).default({}),
        /** Material → what it turns into when the group breaks; unlisted cells just come loose. */
        breakInto: z.record(MaterialIdSchema, MaterialRefSchema).default({}),
        /** Material → its cracked look, applied to a growing share of cells as integrity drops. */
        crack: z.record(MaterialIdSchema, MaterialIdSchema).default({}),
        /** Groups this one rests on: when one breaks, this one breaks too. */
        supports: z.array(z.string().min(1)).default([]),
      }),
    )
    .max(16)
    .default([]),
  placement: z
    .strictObject({
      /** Largest height difference across the footprint the prop accepts, in cells. */
      maxSlope: z.number().int().min(0).max(64).default(6),
      /** Free columns kept between the prop and a tank spawn. */
      clearance: z.number().int().min(0).max(400).default(24),
      /**
       * Passes of random edge wear (cells chipped off the outline, bumps added on top), so every
       * copy on a map looks a little different. 0 stamps the shape exactly.
       */
      roughen: z.number().int().min(0).max(6).default(0),
      /** Placed facing either way, at random. */
      mirror: z.boolean().default(false),
      /**
       * A tank may stand under it: generator placement may put it over a spawn (the tank in an
       * opening at least 16 rows tall), and tanks start on the ground beneath it, not on top.
       */
      shelter: z.boolean().default(false),
      /**
       * Rows the prop's root (its left end, or right when mirrored) is sunk into a hillside that
       * falls away under the rest, so it juts out of the slope half buried. 0 = it stands level on
       * the ground. `maxSlope` is then ignored.
       */
      embed: z.number().int().min(0).max(48).default(0),
    })
    .default({ maxSlope: 6, clearance: 24, roughen: 0, mirror: false, shelter: false, embed: 0 }),
});
export type PropManifest = z.infer<typeof PropSchema>;

// ── theme ───────────────────────────────────────────────────────────────────────────────────

/** Ambient weather a theme draws over the map (cosmetic, per client, scaled by quality). */
export const AmbientKinds = ['none', 'rain', 'snow', 'embers', 'stars', 'dust'] as const;

/**
 * Theme (§2a, §2c): the map's look. Purely cosmetic: the sim never reads it, so every player may
 * pick their own. Sky gradient, rim light, grain, ambient weather and surface treatment (rain
 * darkens and wets exposed ground, snow settles on it), optional scanlines.
 */
export const ThemeSchema = z.strictObject({
  ...base,
  sky: z.strictObject({ top: HexColorSchema, bottom: HexColorSchema }),
  /** Outside the map. */
  letterbox: HexColorSchema,
  /** Rim light added to lit terrain edges. */
  light: HexColorSchema,
  /** Shot trails. */
  trail: HexColorSchema,
  /** Per-cell brightness grain, ±fraction. */
  grain: z.number().min(0).max(0.5),
  vignette: z.number().min(0).max(1),
  ambient: z
    .strictObject({
      kind: z.enum(AmbientKinds),
      /** Particles per 1000 map cells of width at high quality. */
      density: z.number().min(0).max(400),
      color: HexColorSchema,
    })
    .default({ kind: 'none', density: 0, color: '#ffffff' }),
  /** Exposed ground darkened and glinting (rain), 0–1. */
  wet: z.number().min(0).max(1).default(0),
  /** Snow settled on exposed ground, 0–1. */
  snow: z.number().min(0).max(1).default(0),
  /** Arcade scanlines, 0–1 darkening of every other device row. */
  scanlines: z.number().min(0).max(1).default(0),
  /** Lightning flicker in the sky every N ticks on average (storms); 0 = never. */
  flicker: z.number().int().min(0).max(3600).default(0),
  /**
   * Painted scenery behind the battlefield (cosmetic): shaded pixel clouds, up to three parallax
   * ranges (far to near, hazing into the sky's bottom colour) and the grass on topsoil materials.
   */
  scenery: z
    .strictObject({
      clouds: z
        .strictObject({
          /** 0 = clear sky, 1 = overcast. */
          cover: z.number().min(0).max(1),
          light: HexColorSchema,
          shadow: HexColorSchema,
        })
        .optional(),
      /** Silhouette colours, far to near: mountains, hills, treeline. */
      ranges: z.array(HexColorSchema).max(3).default([]),
      /** Grass on `topsoil` materials; without it they keep their own colour. */
      grass: HexColorSchema.optional(),
      /** Tint multiplied into the ground's colours (night themes dim and cool it). */
      ground: HexColorSchema.optional(),
      /** Flower specks in the grass, 0–1. */
      flowers: z.number().min(0).max(1).optional(),
    })
    .default({ ranges: [] }),
});
export type ThemeManifest = z.infer<typeof ThemeSchema>;

// ── audio ───────────────────────────────────────────────────────────────────────────────────

/** Chip waveforms (§8b): pulse widths 50/25/12.5 %, triangle, saw, LFSR noise (long and short). */
export const SYNTH_WAVES = [
  'square',
  'pulse25',
  'pulse12',
  'triangle',
  'saw',
  'noise',
  'metal',
] as const;

/** One voice of a synth patch: a waveform with a stepped pitch sweep and an envelope. */
export const SynthVoiceSchema = z.strictObject({
  wave: z.enum(SYNTH_WAVES),
  /** Start pitch in Hz (for noise: the LFSR clock divided by 64). */
  freq: z.number().min(10).max(12_000),
  /** End pitch in Hz, swept exponentially in 60 Hz steps like a chip; defaults to `freq`. */
  to: z.number().min(10).max(12_000).optional(),
  /** Seconds before the voice starts. */
  delay: z.number().min(0).max(4).default(0),
  attack: z.number().min(0).max(2).default(0.002),
  /** Seconds at full volume after the attack. */
  hold: z.number().min(0).max(8).default(0),
  /** Seconds to fade to silence. */
  release: z.number().min(0.005).max(8),
  volume: z.number().min(0).max(1),
  /** Arpeggio: semitone offsets cycled every `arpRate` seconds. */
  arp: z.array(z.number().int().min(-24).max(24)).max(8).optional(),
  arpRate: z
    .number()
    .min(0.01)
    .max(1)
    .default(1 / 30),
  /** Vibrato: rate in Hz and depth in semitones. */
  vibrato: z
    .strictObject({ rate: z.number().min(0.1).max(30), depth: z.number().min(0).max(12) })
    .optional(),
});

/** What makes a sound play: an effect event type, optionally only for one damage type. */
export const AudioTriggerSchema = z.strictObject({
  event: z.string().min(1),
  damageType: DamageTypeSchema.optional(),
});

/**
 * Audio item (§8b): a synth patch (SFX) or a tracker module (music), with its licence. Client only:
 * the sim never reads audio, so a muted or audio-less peer stays deterministic.
 */
export const AudioSchema = z.strictObject({
  ...base,
  bus: z.enum(['sfx', 'music', 'ui']),
  licence: z.strictObject({
    /** SPDX id, e.g. `CC0-1.0`. */
    spdx: z.string().min(1),
    author: z.string().min(1),
    /** How it was made (tool, generator script, …). */
    source: z.string().min(1),
  }),
  synth: z
    .strictObject({
      voices: z.array(SynthVoiceSchema).min(1).max(8),
      /**
       * Scale by the event's radius against `ref` cells: bigger is lower and longer. 0 = fixed.
       */
      radiusRef: z.number().min(0).max(400).default(0),
    })
    .optional(),
  module: z
    .strictObject({
      /** Tracker module next to the manifest (`.mod`, `.xm`, `.s3m`, `.it`). */
      file: z.string().regex(/^[a-z0-9-]+\.(mod|xm|s3m|it)$/),
      /** Loop forever (music) or play once (jingles). */
      loop: z.boolean().default(true),
    })
    .optional(),
  /** Effect events that play this sound (SFX). */
  on: z.array(AudioTriggerSchema).default([]),
  /** Minimum seconds between two starts of this sound, so bursts don't stack into noise. */
  gap: z.number().min(0).max(5).default(0.04),
});
export type AudioManifest = z.infer<typeof AudioSchema>;
export type SynthVoice = z.infer<typeof SynthVoiceSchema>;

// ── packs ───────────────────────────────────────────────────────────────────────────────────

export const PackSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]+$/),
  version: SemverSchema,
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  description: z.string().optional(),
  /** Every item id in the pack, sorted. `content:validate` checks it matches the folders. */
  items: z.array(ContentIdSchema),
});
export type PackManifest = z.infer<typeof PackSchema>;

export const MANIFEST_SCHEMAS = {
  material: MaterialSchema,
  gen: GeneratorSchema,
  flight: FlightSchema,
  explosion: ExplosionSchema,
  terrainop: TerrainOpSchema,
  weapon: WeaponSchema,
  mode: ModeSchema,
  ai: AiSchema,
  prop: PropSchema,
  theme: ThemeSchema,
  audio: AudioSchema,
  tank: TankSchema,
  gear: GearSchema,
} as const satisfies Record<ContentType, z.ZodType>;

export interface ManifestByType {
  material: MaterialManifest;
  gen: GeneratorManifest;
  flight: FlightManifest;
  explosion: ExplosionManifest;
  terrainop: TerrainOpManifest;
  weapon: WeaponManifest;
  mode: ModeManifest;
  ai: AiManifest;
  prop: PropManifest;
  theme: ThemeManifest;
  audio: AudioManifest;
  tank: TankManifest;
  gear: GearManifest;
}

/** Keys the mode schema defines itself; everything else on a mode goes to its behaviour. */
export const MODE_CORE_KEYS: readonly string[] = Object.keys(ModeSchema.shape);
