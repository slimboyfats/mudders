import {
  CONTENT_TYPE_FOLDERS,
  MANIFEST_BASE_KEYS,
  MANIFEST_SCHEMAS,
  MODE_CORE_KEYS,
  PackSchema,
  contentTypeOf,
  type ContentType,
  type ManifestByType,
  type PackManifest,
} from '@mudders/shared';
import { BehaviourRegistry, type AnyBehaviour, type BehaviourKind } from '../behaviours';
import { Hasher, canonicalJson } from '../hash';
import { KERNEL_VERSION } from '../version';

/**
 * Content resolution (§2c.4): raw manifests in, flat validated manifests out.
 *
 * 1. Collect manifests, check ids are unique, typed by prefix and live in the right folder.
 * 2. Migrate older `schemaVersion`s.
 * 3. Resolve `extends` (same type, shallow merge) and every `{ "use": id, …overrides }` object
 *    anywhere in a manifest (the referenced item's body, minus id/meta, shallow-merged with the
 *    overrides; the result keeps `ref: id`). Missing and cyclic references are errors.
 * 4. Validate against the type's Zod schema, then let each behaviour validate its parameters.
 * 5. Hash: canonical JSON of every resolved item + behaviour ids/versions + pack versions + kernel.
 *
 * The sim only ever sees the output. All errors are collected and thrown together.
 */

export interface RawManifest {
  /** Path, for error messages and folder checks, e.g. `core/weapons/missile/manifest.json`. */
  path: string;
  data: unknown;
}

export interface PackSource {
  pack: unknown;
  manifests: RawManifest[];
}

export interface ContentSource {
  packs: PackSource[];
  behaviours: AnyBehaviour[];
}

export type ResolvedItem = ManifestByType[ContentType];

export interface ResolvedContent {
  readonly hash: string;
  readonly packs: readonly PackManifest[];
  /** Sorted ids. */
  readonly ids: readonly string[];
  readonly behaviours: BehaviourRegistry;
  get<T extends ContentType>(type: T, id: string): ManifestByType[T];
  has(id: string): boolean;
  /** Items of a type, sorted by id. */
  list<T extends ContentType>(type: T): ManifestByType[T][];
  /** Raw (pre-resolution) manifest, for tooling. */
  raw(id: string): Record<string, unknown> | undefined;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`content failed to load:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ContentError';
  }
}

/** Upgraders from schemaVersion N to N+1, keyed by type then N. None yet. */
export const MANIFEST_MIGRATIONS: Partial<
  Record<ContentType, Record<number, (m: Record<string, unknown>) => Record<string, unknown>>>
> = {};

const BEHAVIOUR_TYPES: Partial<Record<ContentType, BehaviourKind>> = {
  gen: 'gen',
  flight: 'flight',
  terrainop: 'terrainop',
  mode: 'mode',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function migrate(type: ContentType, m: Record<string, unknown>): Record<string, unknown> {
  let out = m;
  const steps = MANIFEST_MIGRATIONS[type] ?? {};
  for (let v = typeof out.schemaVersion === 'number' ? out.schemaVersion : 1; steps[v]; v++) {
    out = steps[v]!(out);
  }
  return out;
}

function stripBase(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(m)) {
    if (!(MANIFEST_BASE_KEYS as readonly string[]).includes(k) && k !== 'extends') out[k] = m[k];
  }
  return out;
}

/** Parameters a behaviour validates: everything except base keys, `behaviour` and `ref`. */
export function behaviourParams(
  m: Record<string, unknown>,
  known: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stripBase(m))) {
    if (k !== 'behaviour' && k !== 'ref' && !known.includes(k)) out[k] = v;
  }
  return out;
}

export function resolveContent(source: ContentSource): ResolvedContent {
  const problems: string[] = [];
  const behaviours = new BehaviourRegistry();
  for (const b of source.behaviours) {
    try {
      behaviours.register(b);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }

  // 1. collect
  const packs: PackManifest[] = [];
  const raw: Record<string, Record<string, unknown>> = {};
  const rawPath: Record<string, string> = {};
  for (const ps of source.packs) {
    const pack = PackSchema.safeParse(ps.pack);
    if (!pack.success) {
      problems.push(`pack.json: ${pack.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    packs.push(pack.data);
    const seen: string[] = [];
    for (const { path, data } of ps.manifests) {
      if (!isPlainObject(data) || typeof data.id !== 'string') {
        problems.push(`${path}: manifest must be an object with a string "id"`);
        continue;
      }
      const id = data.id;
      const type = contentTypeOf(id);
      if (!type) {
        problems.push(`${path}: "${id}" has an unknown type prefix`);
        continue;
      }
      if (Object.hasOwn(raw, id)) {
        problems.push(`${path}: duplicate id "${id}" (also in ${rawPath[id]})`);
        continue;
      }
      const expected = `/${CONTENT_TYPE_FOLDERS[type]}/${id.slice(type.length + 1)}/manifest.json`;
      if (!path.endsWith(expected)) {
        problems.push(`${path}: "${id}" must live at <pack>${expected}`);
      }
      raw[id] = migrate(type, data);
      rawPath[id] = path;
      seen.push(id);
    }
    const listed = [...pack.data.items].sort();
    seen.sort();
    if (canonicalJson(listed) !== canonicalJson(seen)) {
      const missing = seen.filter((i) => !listed.includes(i));
      const extra = listed.filter((i) => !seen.includes(i));
      problems.push(
        `pack ${pack.data.name}: items[] out of date` +
          (missing.length ? `; not listed: ${missing.join(', ')}` : '') +
          (extra.length ? `; listed but missing: ${extra.join(', ')}` : ''),
      );
    }
  }

  // 3. resolve extends + use
  const resolved: Record<string, Record<string, unknown>> = {};
  const failed: Record<string, true> = {};
  const stack: string[] = [];

  const resolveUses = (value: unknown, owner: string): unknown => {
    if (Array.isArray(value)) return value.map((v) => resolveUses(v, owner));
    if (!isPlainObject(value)) return value;
    const out: Record<string, unknown> = {};
    if (typeof value.use === 'string') {
      const target = resolveItem(value.use, owner);
      if (!target) return value;
      Object.assign(out, stripBase(target), { ref: value.use });
      for (const k of Object.keys(value)) {
        if (k !== 'use') out[k] = resolveUses(value[k], owner);
      }
      return out;
    }
    for (const k of Object.keys(value)) out[k] = resolveUses(value[k], owner);
    return out;
  };

  const resolveItem = (id: string, from: string | null): Record<string, unknown> | undefined => {
    if (resolved[id]) return resolved[id];
    if (failed[id]) return undefined;
    const m = raw[id];
    if (!m) {
      problems.push(`${from ?? id}: references missing item "${id}"`);
      return undefined;
    }
    if (stack.includes(id)) {
      problems.push(`cyclic reference: ${[...stack.slice(stack.indexOf(id)), id].join(' → ')}`);
      failed[id] = true;
      return undefined;
    }
    stack.push(id);
    let merged: Record<string, unknown> = m;
    if (m.extends !== undefined) {
      const baseId = m.extends;
      if (typeof baseId !== 'string' || contentTypeOf(baseId) !== contentTypeOf(id)) {
        problems.push(`${id}: "extends" must name an item of the same type`);
      } else {
        const base = resolveItem(baseId, id);
        if (base) merged = { ...stripBase(base), ...m };
      }
      merged = { ...merged };
      delete merged.extends;
    }
    const out = resolveUses(merged, id) as Record<string, unknown>;
    stack.pop();
    if (failed[id]) return undefined;
    resolved[id] = out;
    return out;
  };

  const ids = Object.keys(raw).sort();
  for (const id of ids) resolveItem(id, null);

  // 4. validate
  const items: Record<string, ResolvedItem> = {};
  for (const id of ids) {
    const r = resolved[id];
    if (!r) continue;
    const type = contentTypeOf(id)!;
    const parsed = MANIFEST_SCHEMAS[type].safeParse(r);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${id}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      continue;
    }
    items[id] = parsed.data as ResolvedItem;
  }

  // behaviour params, wherever a behaviour-backed object appears
  const checkBehaviour = (
    obj: unknown,
    where: string,
    kind: BehaviourKind,
    known: readonly string[] = [],
  ): void => {
    if (!isPlainObject(obj) || typeof obj.behaviour !== 'string') return;
    const b = behaviours.get(obj.behaviour);
    if (!b) {
      problems.push(`${where}: no behaviour registered for "${obj.behaviour}"`);
      return;
    }
    if (b.kind !== kind) {
      problems.push(`${where}: behaviour "${obj.behaviour}" is a ${b.kind}, expected ${kind}`);
      return;
    }
    const res = b.params.safeParse(behaviourParams(obj, known));
    if (!res.success) {
      for (const issue of res.error.issues) {
        problems.push(`${where}: ${issue.path.join('.') || '(params)'}: ${issue.message}`);
      }
    }
  };
  const checkExplosion = (e: unknown, where: string): void => {
    if (isPlainObject(e)) checkBehaviour(e.terrainOp, `${where}.terrainOp`, 'terrainop');
  };

  for (const id of ids) {
    const item = items[id];
    if (!item) continue;
    const type = contentTypeOf(id)!;
    const kind = BEHAVIOUR_TYPES[type];
    if (kind) checkBehaviour(item, id, kind, type === 'mode' ? MODE_CORE_KEYS : []);
    if (type === 'explosion') checkExplosion(item, id);
    if (type === 'weapon') {
      const w = item as ManifestByType['weapon'];
      checkBehaviour(w.flight, `${id}.flight`, 'flight');
      w.impact.forEach((imp, i) => {
        if ('explosion' in imp) checkExplosion(imp.explosion, `${id}.impact.${i}.explosion`);
        else checkBehaviour(imp.terrainOp, `${id}.impact.${i}.terrainOp`, 'terrainop');
      });
    }
    if (type === 'mode') {
      const m = item as ManifestByType['mode'];
      checkExplosion(m.deathExplosion, `${id}.deathExplosion`);
      if (contentTypeOf(m.map.generator) !== 'gen' || !items[m.map.generator]) {
        problems.push(`${id}: map.generator "${m.map.generator}" is not a loaded gen.* item`);
      }
      for (const l of m.loadout) {
        if (contentTypeOf(l.weapon) !== 'weapon' || !items[l.weapon]) {
          problems.push(`${id}: loadout weapon "${l.weapon}" is not a loaded weapon.* item`);
        }
      }
    }
    if (type === 'material') {
      const cell = (item as ManifestByType['material']).cell;
      for (const other of ids) {
        if (other >= id) break;
        const o = items[other];
        if (
          o &&
          contentTypeOf(other) === 'material' &&
          (o as ManifestByType['material']).cell === cell
        ) {
          problems.push(`${id}: cell ${cell} already used by ${other}`);
        }
      }
    }
  }

  if (problems.length) throw new ContentError(problems);

  // 5. hash
  const h = new Hasher().str(`kernel@${KERNEL_VERSION}`);
  for (const p of [...packs].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    h.str(`${p.name}@${p.version}`);
  }
  for (const id of ids) h.str(canonicalJson(items[id]));
  for (const b of behaviours.list()) h.str(`${b.id}#${b.version}`);
  const hash = h.hex();

  return {
    hash,
    packs,
    ids,
    behaviours,
    has: (id) => Object.hasOwn(items, id),
    get<T extends ContentType>(type: T, id: string): ManifestByType[T] {
      const item = Object.hasOwn(items, id) ? items[id] : undefined;
      if (!item || contentTypeOf(id) !== type) throw new Error(`no ${type} "${id}" loaded`);
      return item as ManifestByType[T];
    },
    list<T extends ContentType>(type: T): ManifestByType[T][] {
      return ids.filter((i) => contentTypeOf(i) === type).map((i) => items[i] as ManifestByType[T]);
    },
    raw: (id) => (Object.hasOwn(raw, id) ? raw[id] : undefined),
  };
}
