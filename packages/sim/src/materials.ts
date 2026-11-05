import { DAMAGE_TYPES, type DamageType, type MaterialManifest } from '@mudders/shared';

export const SETTLE_STATIC = 0;
export const SETTLE_FALL = 1;
export const SETTLE_SLIDE = 2;
export const SETTLE_FLOW = 3;

export const NUM_DAMAGE_TYPES = DAMAGE_TYPES.length;
/** Strength is stored ×256 (256 = 1.0, dirt baseline). */
export const STRENGTH_ONE = 256;

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
