import { DAMAGE_TYPES, type DamageType, type MaterialManifest } from '@mudders/shared';

export const SETTLE_STATIC = 0;
export const SETTLE_FALL = 1;
export const SETTLE_SLIDE = 2;
export const SETTLE_FLOW = 3;
/** Gas: lives in the grid's gas layer, never in `material` (see `gas.ts`). */
export const SETTLE_GAS = 4;

export const NUM_DAMAGE_TYPES = DAMAGE_TYPES.length;
/** Strength is stored ×256 (256 = 1.0, dirt baseline). */
export const STRENGTH_ONE = 256;
/** Reaction rules per material (manifest limit). */
export const MAX_REACTIONS = 8;
/** "No change" in reaction/decay tables (0 is air, a real target). */
export const KEEP = 255;

/** `active` flags: what makes a cell need the per-tick reaction pass. */
export const ACT_DECAY = 1;
export const ACT_SPREAD = 2;
export const ACT_REACT = 4;
/** Bursts when it touches air (gas pockets): `reactStep` queues it for the world. */
export const ACT_BURST = 8;
/** cellState layout for `spread` materials: low 6 bits age, high 2 bits turns survived. */
export const AGE_MASK = 0x3f;

export function damageTypeIndex(t: DamageType): number {
  return DAMAGE_TYPES.indexOf(t);
}

/**
 * Flat lookup tables built from resolved material manifests, indexed by cell byte, so hot loops
 * never touch objects (§9). Coatings share the same id space and tables.
 */
export class MaterialTable {
  readonly settle = new Uint8Array(256);
  readonly density = new Uint8Array(256);
  /** Structural reach in cells (`span`); 255 = unlimited. */
  readonly span = new Uint8Array(256).fill(255);
  /** Cohesion ×256, in [-256, 256]. */
  readonly cohesion = new Int16Array(256);
  /** strength[cell * NUM_DAMAGE_TYPES + damageType], ×256. */
  readonly strength = new Uint16Array(256 * NUM_DAMAGE_TYPES).fill(STRENGTH_ONE);
  readonly isCoating = new Uint8Array(256);
  /** ACT_* bits. */
  readonly active = new Uint8Array(256);
  /**
   * Reaction rule for a pair at `cell * 256 + neighbour` (0 = none): an index into the `rule*`
   * arrays. Tags are expanded here at load, so the hot loop is one lookup per neighbour.
   */
  readonly pairRule = new Uint16Array(256 * 256);
  readonly ruleInto = new Uint8Array(256 * MAX_REACTIONS + 1).fill(KEEP);
  readonly ruleOther = new Uint8Array(256 * MAX_REACTIONS + 1).fill(KEEP);
  readonly ruleSpawn = new Uint8Array(256 * MAX_REACTIONS + 1).fill(KEEP);
  /** Chance per tick ×65536. */
  readonly ruleChance = new Uint32Array(256 * MAX_REACTIONS + 1);
  /** Gas cells: 1 rises, 255 (-1) sinks, 0 = not a gas. */
  readonly gasLift = new Int8Array(256);
  /** Gas vertical and sideways step chances per tick ×65536. */
  readonly gasRise = new Uint32Array(256);
  readonly gasDrift = new Uint32Array(256);
  readonly decayInto = new Uint8Array(256).fill(KEEP);
  readonly decayTicks = new Uint8Array(256);
  readonly decayTurns = new Uint8Array(256);
  readonly spread = new Uint8Array(256);
  readonly contactDamage = new Uint8Array(256);
  /** Ticks per sunk cell (0 = tanks do not sink) and the deepest a tank sinks. */
  readonly sinkTicks = new Uint8Array(256);
  readonly sinkDepth = new Uint8Array(256);
  /** Ticks per cell a tank slides on slick ground (0 = not slick). */
  readonly slickTicks = new Uint8Array(256);
  /** Sticky ground (tar): drive slowdown and allowance cost per cell (0 = not sticky). */
  readonly sticky = new Uint8Array(256);
  /** Compaction (§4b): cell a carve packs this material into (KEEP = none), ratio ×256, max depth. */
  readonly compactInto = new Uint8Array(256).fill(KEEP);
  readonly compactRatio = new Uint16Array(256);
  readonly compactDepth = new Uint8Array(256);
  /** Shattering (§4b crystal): shard cell (KEEP = none), share kept ×256, launch speed ×256. */
  readonly shatterInto = new Uint8Array(256).fill(KEEP);
  readonly shatterKeep = new Uint16Array(256);
  readonly shatterSpeed = new Uint16Array(256);
  /** Bursting (gas pockets): biggest pocket per burst, 0 = never bursts. */
  readonly burstMax = new Uint16Array(256);
  /** Weapon id whose impacts a burst runs, per cell ('' = none). */
  readonly burstWeapon: readonly string[];
  /** Crater rim (§4b): rim[cell * NUM_DAMAGE_TYPES + damageType]: into (KEEP = none), depth, chance ×256. */
  readonly rimInto = new Uint8Array(256 * NUM_DAMAGE_TYPES).fill(KEEP);
  readonly rimDepth = new Uint8Array(256 * NUM_DAMAGE_TYPES);
  readonly rimChance = new Uint16Array(256 * NUM_DAMAGE_TYPES);
  /** Deepest rim of any material, so a carve knows how far past its radius to look. */
  rimMaxDepth = 0;
  /**
   * Cell a blast lights this material into (KEEP = not blast-lit), whether any material is, and
   * per cell a bit mask of the damage types that light it.
   */
  readonly igniteInto = new Uint8Array(256).fill(KEEP);
  readonly igniteBy = new Uint8Array(256);
  anyIgnite = false;
  /** Chance ×65536 that a tick decay of this cell sets off its `detonate` explosion. */
  readonly detonateChance = new Uint32Array(256);
  /** id → cell byte. */
  private readonly cells: Readonly<Record<string, number>>;
  readonly ids: readonly string[];

  constructor(materials: readonly MaterialManifest[]) {
    const cells: Record<string, number> = {};
    const ids: string[] = new Array<string>(256).fill('');
    const burstWeapon: string[] = new Array<string>(256).fill('');
    ids[0] = 'air';
    this.strength.fill(0, 0, NUM_DAMAGE_TYPES); // air offers no resistance
    for (const m of materials) {
      const c = m.cell;
      if (ids[c]) throw new Error(`cell ${c} used by both ${ids[c]} and ${m.id}`);
      ids[c] = m.id;
      cells[m.id] = c;
      this.settle[c] =
        m.settle === 'static'
          ? SETTLE_STATIC
          : m.settle === 'fall'
            ? SETTLE_FALL
            : m.settle === 'slide'
              ? SETTLE_SLIDE
              : m.settle === 'flow'
                ? SETTLE_FLOW
                : SETTLE_GAS;
      if (m.settle === 'gas') {
        this.gasLift[c] = m.gas?.lift ?? 1;
        this.gasRise[c] = Math.round((m.gas?.rise ?? 1) * 65536);
        this.gasDrift[c] = Math.round((m.gas?.drift ?? 0.3) * 65536);
      }
      this.density[c] = m.density;
      if (m.span !== undefined) this.span[c] = m.span;
      this.cohesion[c] = Math.round(m.cohesion * 256);
      this.isCoating[c] = m.coating ? 1 : 0;
      for (let t = 0; t < NUM_DAMAGE_TYPES; t++) {
        const v = m.strength[DAMAGE_TYPES[t]!];
        this.strength[c * NUM_DAMAGE_TYPES + t] =
          v === undefined ? STRENGTH_ONE : Math.round(v * 256);
      }
    }
    this.cells = cells;
    this.ids = ids;
    const ref = (id: string) => (id === 'air' ? 0 : this.cellOf(id));
    // tag → cells carrying it, in manifest order (deterministic)
    const tagged: Record<string, number[]> = {};
    for (const m of materials) for (const t of m.tags ?? []) (tagged[t] ??= []).push(m.cell);
    // 1 = set by a tag rule, 2 = set by an id rule (an id rule beats any tag rule)
    const by = new Uint8Array(256 * 256);
    let rule = 0;
    for (const m of materials) {
      const c = m.cell;
      for (const r of m.reactions ?? []) {
        const k = ++rule;
        if (r.into) this.ruleInto[k] = ref(r.into);
        if (r.other) this.ruleOther[k] = ref(r.other);
        if (r.spawn) this.ruleSpawn[k] = ref(r.spawn);
        this.ruleChance[k] = Math.round(r.chance * 65536);
        this.active[c] = this.active[c]! | ACT_REACT;
        if (r.with.startsWith('#')) {
          for (const w of tagged[r.with.slice(1)] ?? []) {
            const p = c * 256 + w;
            // a tag never matches the material itself, and the first rule for a pair wins
            if (w === c || by[p] !== 0) continue;
            this.pairRule[p] = k;
            by[p] = 1;
          }
        } else {
          const p = c * 256 + ref(r.with);
          if (by[p] === 2) continue;
          this.pairRule[p] = k;
          by[p] = 2;
        }
      }
      if (m.decay) {
        this.decayInto[c] = ref(m.decay.into);
        if ('ticks' in m.decay) {
          this.decayTicks[c] = m.decay.ticks;
          this.active[c] = this.active[c]! | ACT_DECAY;
        } else this.decayTurns[c] = m.decay.turns;
      }
      if (m.spread && !(m.decay && 'ticks' in m.decay)) {
        this.spread[c] = m.spread;
        this.active[c] = this.active[c]! | ACT_SPREAD;
      }
      this.contactDamage[c] = m.contact?.damage ?? 0;
      this.sinkTicks[c] = m.sink?.ticks ?? 0;
      this.sinkDepth[c] = m.sink?.depth ?? 0;
      this.slickTicks[c] = m.slick?.ticks ?? 0;
      this.sticky[c] = m.sticky?.drive ?? 0;
      if (m.compact) {
        this.compactInto[c] = ref(m.compact.into);
        this.compactRatio[c] = Math.round(m.compact.ratio * 256);
        this.compactDepth[c] = m.compact.maxDepth;
      }
      if (m.shatter) {
        this.shatterInto[c] = ref(m.shatter.into);
        this.shatterKeep[c] = Math.round(m.shatter.keep * 256);
        this.shatterSpeed[c] = Math.round(m.shatter.speed * 256);
      }
      if (m.burst) {
        this.burstMax[c] = m.burst.max;
        burstWeapon[c] = m.burst.weapon;
        this.active[c] = this.active[c]! | ACT_BURST;
      }
      for (const r of m.rim ?? []) {
        for (const d of r.damage) {
          const i = c * NUM_DAMAGE_TYPES + DAMAGE_TYPES.indexOf(d);
          this.rimInto[i] = ref(r.into);
          this.rimDepth[i] = r.depth;
          this.rimChance[i] = Math.round(r.chance * 256);
        }
        if (r.depth > this.rimMaxDepth) this.rimMaxDepth = r.depth;
      }
      if (m.ignite) {
        this.igniteInto[c] = ref(m.ignite.into);
        for (const t of m.ignite.by)
          this.igniteBy[c] = this.igniteBy[c]! | (1 << damageTypeIndex(t));
        this.anyIgnite = true;
      }
      if (m.detonate) this.detonateChance[c] = Math.round(m.detonate.chance * 65536);
    }
    this.burstWeapon = burstWeapon;
  }

  /** Cell byte for a material id; throws on unknown ids (content is validated at load). */
  cellOf(id: string): number {
    const c = this.cells[id];
    if (c === undefined) throw new Error(`unknown material ${id}`);
    return c;
  }

  strengthOf(cell: number, damageType: number): number {
    return this.strength[cell * NUM_DAMAGE_TYPES + damageType]!;
  }
}
