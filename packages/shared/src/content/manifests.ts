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
});
export type MaterialManifest = z.infer<typeof MaterialSchema>;

// ── behaviour-backed items (code + params) ──────────────────────────────────────────────────
// These are loose: the registered behaviour module validates its own parameters.

const behaviourBacked = { ...base, behaviour: ContentIdSchema };

export const GeneratorSchema = z.looseObject({ ...behaviourBacked });
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

export const ImpactSchema = z.union([
  z.strictObject({ explosion: EmbeddedExplosionSchema }),
  z.strictObject({
    terrainOp: EmbeddedTerrainOpSchema,
    radius: z.number().int().min(1).max(400),
    damageType: DamageTypeSchema,
  }),
]);
export type Impact = z.infer<typeof ImpactSchema>;

export const WeaponSchema = z.strictObject({
  ...base,
  flight: EmbeddedFlightSchema,
  triggers: z.array(TriggerSchema).min(1),
  impact: z.array(ImpactSchema).min(1),
  shop: z.strictObject({
    price: z.number().int().min(0),
    pack: z.number().int().min(1),
    tier: z.number().int().min(0),
  }),
  ai: z.strictObject({
    expectedDamage: z.number().min(0),
    terrainValue: z.number().min(0).max(1),
  }),
});
export type WeaponManifest = z.infer<typeof WeaponSchema>;

// ── mode ────────────────────────────────────────────────────────────────────────────────────

export const WallRuleSchema = z.enum(['absorb', 'bounce', 'wrap', 'concrete']);
export type WallRule = z.infer<typeof WallRuleSchema>;

export const ModeSchema = z.looseObject({
  ...behaviourBacked,
  rounds: z.number().int().min(1).max(20),
  /** Turns per player before the round ends on points (§3.1). */
  turnCap: z.number().int().min(1),
  startingHealth: z.number().int().min(1).max(1000),
  physics: z.strictObject({
    /** Gravity in cells/tick². */
    gravity: z.number().positive(),
    /** Muzzle speed at power 1000, in cells/tick. */
    maxSpeed: z.number().positive(),
  }),
  wind: z.strictObject({
    type: z.enum(['none', 'constant', 'perTurn']),
    /** Maximum wind acceleration, cells/tick². */
    max: z.number().min(0),
  }),
  walls: WallRuleSchema,
  fallDamage: z.strictObject({
    safeCells: z.number().int().min(0),
    perCell: z.number().min(0),
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

/** AI personality (§3.7): a behaviour module plus its tuning; runs inside the sim. */
export const AiSchema = z.looseObject({ ...behaviourBacked });
export type AiManifest = z.infer<typeof AiSchema>;

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
}

/** Keys the mode schema defines itself; everything else on a mode goes to its behaviour. */
export const MODE_CORE_KEYS: readonly string[] = Object.keys(ModeSchema.shape);
