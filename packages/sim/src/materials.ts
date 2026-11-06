import { DAMAGE_TYPES, type DamageType, type MaterialManifest } from '@mudders/shared';

export const SETTLE_STATIC = 0;
export const SETTLE_FALL = 1;
export const SETTLE_SLIDE = 2;
export const SETTLE_FLOW = 3;

export const NUM_DAMAGE_TYPES = DAMAGE_TYPES.length;
/** Strength is stored ×256 (256 = 1.0, dirt baseline). */
export const STRENGTH_ONE = 256;
/** Reaction slots per material. */
export const MAX_REACTIONS = 4;
/** "No change" in reaction/decay tables (0 is air, a real target). */
export const KEEP = 255;

/** `active` flags: what makes a cell need the per-tick reaction pass. */
export const ACT_DECAY = 1;
export const ACT_SPREAD = 2;
export const ACT_REACT = 4;
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
  /** Cohesion ×256, in [-256, 256]. */
  readonly cohesion = new Int16Array(256);
  /** strength[cell * NUM_DAMAGE_TYPES + damageType], ×256. */
  readonly strength = new Uint16Array(256 * NUM_DAMAGE_TYPES).fill(STRENGTH_ONE);
  readonly isCoating = new Uint8Array(256);
  /** ACT_* bits. */
  readonly active = new Uint8Array(256);
  /** reaction k of cell c at c * MAX_REACTIONS + k; `reactWith` 0 = unused slot. */
  readonly reactWith = new Uint8Array(256 * MAX_REACTIONS);
  readonly reactInto = new Uint8Array(256 * MAX_REACTIONS).fill(KEEP);
  readonly reactOther = new Uint8Array(256 * MAX_REACTIONS).fill(KEEP);
  readonly reactSpawn = new Uint8Array(256 * MAX_REACTIONS).fill(KEEP);
  /** Chance per tick ×65536. */
  readonly reactChance = new Uint32Array(256 * MAX_REACTIONS);
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
  /** Compaction (§4b): cell a carve packs this material into (KEEP = none), ratio ×256, max depth. */
  readonly compactInto = new Uint8Array(256).fill(KEEP);
  readonly compactRatio = new Uint16Array(256);
  readonly compactDepth = new Uint8Array(256);
  /** id → cell byte. */
  private readonly cells: Readonly<Record<string, number>>;
  readonly ids: readonly string[];

  constructor(materials: readonly MaterialManifest[]) {
    const cells: Record<string, number> = {};
    const ids: string[] = new Array<string>(256).fill('');
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
              : SETTLE_FLOW;
      this.density[c] = m.density;
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
    for (const m of materials) {
      const c = m.cell;
      (m.reactions ?? []).forEach((r, k) => {
        const i = c * MAX_REACTIONS + k;
        this.reactWith[i] = ref(r.with);
        if (r.into) this.reactInto[i] = ref(r.into);
        if (r.other) this.reactOther[i] = ref(r.other);
        if (r.spawn) this.reactSpawn[i] = ref(r.spawn);
        this.reactChance[i] = Math.round(r.chance * 65536);
        this.active[c] = this.active[c]! | ACT_REACT;
      });
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
      if (m.compact) {
        this.compactInto[c] = ref(m.compact.into);
        this.compactRatio[c] = Math.round(m.compact.ratio * 256);
        this.compactDepth[c] = m.compact.maxDepth;
      }
    }
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
