import type { Impact, MaterialManifest, PropManifest, WeaponManifest } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';

/**
 * Player docs (the /docs/ page): turns the resolved content packs into plain rows for the page.
 * Everything here reads the same manifests the game runs on, so the docs can't drift from it.
 */

export interface Stat {
  label: string;
  value: string;
}

/** One line of what a shot does, with the lines of any child shells nested under it. */
export interface EffectLine {
  text: string;
  /** Item the line points at (a child weapon, a mine's charge), for linking. */
  link?: string;
  children: EffectLine[];
}

export interface WeaponDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  since: string;
  price: number;
  pack: number;
  tier: number;
  flight: string;
  triggers: string[];
  effects: EffectLine[];
  pulse: EffectLine[];
  /** Largest blast radius and tank damage anywhere in the shot (children included). */
  peakRadius: number;
  peakDamage: number;
}

export interface MaterialDoc {
  id: string;
  name: string;
  description: string;
  since: string;
  color: string;
  cycle: string[];
  settle: string;
  /** Weight per cell (the stacking density). */
  density: number;
  /** Cells it can bridge or overhang under load; null = no limit. */
  span: number | null;
  cohesion: number;
  coating: boolean;
  strength: { type: string; value: number }[];
  traits: string[];
  /** Props built from it. */
  usedBy: string[];
}

export interface PropGroupDoc {
  name: string;
  materials: string[];
  glue: string;
  integrity: number | null;
  resistance: { type: string; value: number }[];
  breakInto: { from: string; into: string }[];
  supports: string[];
  notes: string[];
}

export interface PropDoc {
  id: string;
  name: string;
  description: string;
  since: string;
  width: number;
  height: number;
  cells: number;
  /** Shape rows as material colours ('' = empty), for the pixel picture. */
  pixels: string[][];
  materials: { role: string; material: string; cells: number }[];
  groups: PropGroupDoc[];
  placement: string[];
  maps: string[];
}

export interface TankDoc {
  id: string;
  name: string;
  description: string;
  since: string;
  sprite: string[];
  stats: Stat[];
}

export interface GearDoc {
  id: string;
  name: string;
  description: string;
  since: string;
  stats: Stat[];
}

export interface DocsData {
  version: string;
  weapons: WeaponDoc[];
  materials: MaterialDoc[];
  props: PropDoc[];
  tanks: TankDoc[];
  gear: GearDoc[];
  /** id → display name, for links between sections. */
  names: Record<string, string>;
}

export const DAMAGE_LABELS: Record<string, string> = {
  blast: 'Blast',
  kinetic: 'Kinetic',
  heat: 'Heat',
  cold: 'Cold',
  shock: 'Shock',
  dig: 'Dig',
  corrosive: 'Acid',
};

const SETTLE_LABELS: Record<string, string> = {
  static: 'Solid (stays put)',
  fall: 'Loose (falls)',
  slide: 'Thick (slides)',
  flow: 'Liquid (flows)',
};

const TRIGGER_LABELS: Record<string, string> = {
  onSolid: 'hits ground',
  onTank: 'hits a tank',
  onWall: 'hits a wall',
  onApex: 'top of its arc',
};

function nameOf(c: ResolvedContent, id: string): string {
  if (id === 'air') return 'air';
  const raw = c.raw(id);
  const meta = raw?.['meta'];
  if (meta && typeof meta === 'object' && 'name' in meta && typeof meta.name === 'string')
    return meta.name;
  return id;
}

function triggerLabel(t: WeaponManifest['triggers'][number]): string {
  if (typeof t === 'string') return TRIGGER_LABELS[t] ?? t;
  return `after ${(t.onTimer / 60).toFixed(1).replace(/\.0$/, '')} s`;
}

interface Peak {
  radius: number;
  damage: number;
}

function describeImpact(
  c: ResolvedContent,
  i: Impact,
  depth: number,
  peak: Peak,
  seen: readonly string[],
): EffectLine {
  if ('explosion' in i) {
    const e = i.explosion;
    peak.radius = Math.max(peak.radius, e.radius);
    peak.damage = Math.max(peak.damage, e.damage);
    const extra = [
      e.push > 0 ? `push ${e.push}` : '',
      e.chill > 0 ? `chills ${e.chill} turn${e.chill > 1 ? 's' : ''}` : '',
      e.glue > 0 ? `glues ${e.glue} turn${e.glue > 1 ? 's' : ''}` : '',
      e.falloff === 'flat' ? 'no falloff' : '',
    ].filter(Boolean);
    const op = e.terrainOp?.ref ? ` · ${nameOf(c, e.terrainOp.ref)}` : '';
    const dmg =
      e.damage > 0
        ? `${e.damage} ${DAMAGE_LABELS[e.damageType] ?? e.damageType} damage`
        : 'no damage';
    return {
      text: `${nameOf(c, e.ref ?? 'explosion')}: radius ${e.radius}, ${dmg}${op}${extra.length ? ` (${extra.join(', ')})` : ''}`,
      children: [],
    };
  }
  if ('terrainOp' in i) {
    peak.radius = Math.max(peak.radius, i.radius);
    const name = i.terrainOp.ref ? nameOf(c, i.terrainOp.ref) : i.terrainOp.behaviour;
    // resident ops (a summoned monster): how long they stay and what they reach for
    const op: Record<string, unknown> = i.terrainOp;
    const num = (k: string): number | undefined => (typeof op[k] === 'number' ? op[k] : undefined);
    const extra: string[] = [];
    const rounds = num('rounds');
    if (rounds !== undefined) extra.push(`stays ${rounds} full rounds of turns`);
    const grab = num('grabReach');
    if (grab !== undefined) extra.push(`grabs tanks within ${grab} cells`);
    const katch = num('catchReach');
    if (katch !== undefined) extra.push(`catches shells within ${katch} cells`);
    const topple = num('toppleDrop');
    if (topple !== undefined) extra.push(`topples and bursts if dug out ${topple} cells`);
    const more = extra.length ? ` (${extra.join(', ')})` : '';
    return { text: `${name}: radius ${i.radius}${more}`, children: [] };
  }
  if ('zone' in i) {
    const z = i.zone;
    if (z.amplify > 1)
      return {
        text: `Resonance field, radius ${z.radius}: the next blast inside it is ×${z.amplify} bigger`,
        children: [],
      };
    const where = z.cloud
      ? `drifting cloud of ${z.cloud.puffs} puffs`
      : z.spikes
        ? `spiked ground ${z.radius * 2} cells wide`
        : `${z.look} zone, radius ${z.radius}`;
    const parts = [`${z.turns} turn${z.turns > 1 ? 's' : ''}`];
    if (z.damage > 0) parts.unshift(`${z.damage} damage per turn`);
    if (z.shieldDrain > 0) parts.unshift(`eats ${z.shieldDrain} shield per turn`);
    if (z.spikes) {
      parts.push(
        `${z.spikes.damage} damage per cell driven on it, each cell costs ${z.spikes.drag + 1}× drive and fuel`,
      );
    }
    if (z.drift > 0) parts.push('drifts with the wind');
    if (z.rust) parts.push(`rusts tanks for ${z.rust.turns} turns`);
    const children: EffectLine[] = [];
    if (z.strike && depth < 3 && !seen.includes(z.strike.weapon)) {
      const s = z.strike;
      children.push({
        text: `${Math.round(s.chance * 100)}% chance per turn: ${s.count} × ${nameOf(c, s.weapon)}`,
        link: s.weapon,
        children: weaponLines(c, s.weapon, depth + 1, peak, seen),
      });
    }
    return { text: `${cap(where)}: ${parts.join(', ')}`, children };
  }
  if ('mine' in i) {
    const m = i.mine;
    const how = m.wire
      ? `Strings a tripwire up to ${m.wire.span} cells long, ${m.wire.height} cells up, that tanks and shells set off`
      : `Lays a mine that trips within ${m.radius} cells`;
    return {
      text: `${how}: ${nameOf(c, m.weapon)}`,
      link: m.weapon,
      children: depth < 3 ? weaponLines(c, m.weapon, depth + 1, peak, seen) : [],
    };
  }
  const s = i.spawn;
  if (typeof s.weapon !== 'string') {
    const pool = [...new Set(s.weapon)];
    return {
      text: `${s.count} × random pick of ${pool.length}: ${pool.map((w) => nameOf(c, w)).join(', ')}`,
      children: [],
    };
  }
  const child = s.weapon;
  return {
    text: `${s.count} × ${nameOf(c, child)}`,
    link: child,
    children:
      depth < 3 && !seen.includes(child) ? weaponLines(c, child, depth + 1, peak, seen) : [],
  };
}

function weaponLines(
  c: ResolvedContent,
  id: string,
  depth: number,
  peak: Peak,
  seen: readonly string[],
): EffectLine[] {
  if (!c.has(id)) return [];
  const w = c.get('weapon', id);
  const next = [...seen, id];
  return w.impact.map((i) => describeImpact(c, i, depth, peak, next));
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function weaponDoc(c: ResolvedContent, w: WeaponManifest): WeaponDoc {
  const peak: Peak = { radius: 0, damage: 0 };
  const effects = weaponLines(c, w.id, 0, peak, []);
  const pulse = w.pulse.map((i) => describeImpact(c, i, 0, { radius: 0, damage: 0 }, [w.id]));
  return {
    id: w.id,
    name: w.meta.name,
    description: w.meta.description,
    category: w.meta.category ?? 'other',
    since: w.meta.since,
    price: w.shop.price,
    pack: w.shop.pack,
    tier: w.shop.tier,
    flight: w.flight.ref ? nameOf(c, w.flight.ref) : w.flight.behaviour,
    triggers: w.triggers.map(triggerLabel),
    effects,
    pulse,
    peakRadius: peak.radius,
    peakDamage: peak.damage,
  };
}

function materialTraits(c: ResolvedContent, m: MaterialManifest): string[] {
  const t: string[] = [];
  if (m.contact) t.push(`Hurts tanks touching it: ${m.contact.damage} per turn`);
  if (m.sink) t.push(`Tanks sink into it, up to ${m.sink.depth} cells`);
  if (m.slick) t.push('Slippery: tanks slide downhill on it');
  if (m.sticky) t.push(`Sticky: driving on it is ${m.sticky.drive}× slower`);
  if (m.compact) t.push(`Packs down into ${nameOf(c, m.compact.into)} under blasts`);
  if (m.shatter)
    t.push(
      `Shatters: about ${Math.round(m.shatter.keep * 100)}% flies out as ${nameOf(c, m.shatter.into)}`,
    );
  if (m.burst) t.push(`Bursts when opened to the air: ${nameOf(c, m.burst.weapon)}`);
  for (const r of m.rim ?? [])
    t.push(
      `${r.damage.map((d) => DAMAGE_LABELS[d] ?? d).join('/')} craters turn the rim into ${nameOf(c, r.into)}`,
    );
  if (m.ignite) t.push(`Lit by explosions: becomes ${nameOf(c, m.ignite.into)}`);
  if (m.detonate)
    t.push(
      `Can explode: radius ${m.detonate.explosion.radius}, ${m.detonate.explosion.damage} damage`,
    );
  if (m.decay) {
    const when =
      'ticks' in m.decay
        ? 'after a moment'
        : `after ${m.decay.turns} turn${m.decay.turns > 1 ? 's' : ''}`;
    t.push(`Turns into ${nameOf(c, m.decay.into)} ${when}`);
  }
  for (const r of m.reactions ?? []) {
    const parts = [
      r.into ? `becomes ${nameOf(c, r.into)}` : '',
      r.other ? `turns it into ${nameOf(c, r.other)}` : '',
      r.spawn ? `gives off ${nameOf(c, r.spawn)}` : '',
    ].filter(Boolean);
    if (parts.length) t.push(`Touching ${nameOf(c, r.with)}: ${parts.join(', ')}`);
  }
  if (m.look?.topsoil) t.push('Grows grass on top');
  if (m.look?.flames) t.push('Burns with open flames');
  if (m.look?.hot) t.push('Glows hot');
  return t;
}

function materialDoc(c: ResolvedContent, m: MaterialManifest, usedBy: string[]): MaterialDoc {
  return {
    id: m.id,
    name: m.meta.name,
    description: m.meta.description,
    since: m.meta.since,
    color: m.meta.color ?? '#ff00ff',
    cycle: m.look?.cycle ?? [],
    settle: SETTLE_LABELS[m.settle] ?? m.settle,
    density: m.density,
    span: m.span ?? null,
    cohesion: m.cohesion,
    coating: m.coating,
    strength: Object.keys(DAMAGE_LABELS).map((type) => ({
      type,
      value: (m.strength as Record<string, number | undefined>)[type] ?? 1,
    })),
    traits: materialTraits(c, m),
    usedBy,
  };
}

function propDoc(c: ResolvedContent, p: PropManifest, maps: string[]): PropDoc {
  const width = Math.max(...p.shape.map((r) => r.length));
  const colorOf = (role: string | undefined): string => {
    const mat = role ? p.materials[role] : undefined;
    if (!mat || !c.has(mat)) return '';
    return c.get('material', mat).meta.color ?? '';
  };
  const counts = new Map<string, number>();
  const pixels = p.shape.map((row) =>
    Array.from({ length: width }, (_, x) => {
      const ch = row[x] ?? ' ';
      if (ch === ' ') return '';
      const role = p.legend[ch];
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
      return colorOf(role);
    }),
  );
  const roles = Object.keys(p.materials).sort();
  const groups: PropGroupDoc[] = p.groups.map((g) => {
    const notes: string[] = [];
    if (g.glue === 'local') {
      notes.push(`Chips where hit; loosens ${g.loosen} cells around each hit`);
      if (g.shield > 0) notes.push(`Shields what's behind it (${g.shield} cells deep)`);
    }
    if (Object.keys(g.crack).length) notes.push('Cracks as it takes damage');
    return {
      name: g.name,
      materials: [...new Set(g.roles.map((r) => p.materials[r]).filter((m) => m !== undefined))],
      glue: g.glue === 'whole' ? 'Holds together, then breaks all at once' : 'Breaks up bit by bit',
      integrity: g.glue === 'whole' ? g.integrity : null,
      resistance: Object.entries(g.resistance)
        .filter((e): e is [string, number] => e[1] !== undefined)
        .map(([type, value]) => ({ type, value })),
      breakInto: Object.entries(g.breakInto).map(([from, into]) => ({ from, into })),
      supports: g.supports,
      notes,
    };
  });
  const pl = p.placement;
  const placement = [
    pl.shelter ? 'Tanks can shelter underneath' : '',
    pl.mirror ? 'Placed facing either way' : '',
    pl.roughen > 0 ? 'Every copy is a little different' : '',
    pl.embed > 0 ? 'Juts out of hillsides' : `Needs ground flat to within ${pl.maxSlope} cells`,
    `Keeps ${pl.clearance} cells from tank spawns`,
  ].filter(Boolean);
  return {
    id: p.id,
    name: p.meta.name,
    description: p.meta.description,
    since: p.meta.since,
    width,
    height: p.shape.length,
    cells: [...counts.values()].reduce((a, b) => a + b, 0),
    pixels,
    materials: roles.map((role) => ({
      role,
      material: p.materials[role] ?? '',
      cells: counts.get(role) ?? 0,
    })),
    groups,
    placement,
    maps,
  };
}

const pct = (n: number): string => `${n}%`;

/** Every section of the docs, from the resolved content. */
export function docsData(c: ResolvedContent): DocsData {
  const names: Record<string, string> = {};
  for (const id of c.ids) names[id] = nameOf(c, id);

  const weapons = c
    .list('weapon')
    .filter((w) => w.shop.price > 0)
    .map((w) => weaponDoc(c, w))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  const props = c.list('prop');
  const gens = c.list('gen');
  const mapsFor = (id: string): string[] =>
    gens.filter((g) => g.props?.some((p) => p.prop === id)).map((g) => g.meta.name);

  const usedBy = (mat: string): string[] =>
    props.filter((p) => Object.values(p.materials).includes(mat)).map((p) => p.id);

  const materials = c
    .list('material')
    .map((m) => materialDoc(c, m, usedBy(m.id)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tanks: TankDoc[] = c.list('tank').map((t) => ({
    id: t.id,
    name: t.meta.name,
    description: t.meta.description,
    since: t.meta.since,
    sprite: t.look.sprite,
    stats: [
      { label: 'Health', value: pct(t.health) },
      { label: 'Shield', value: String(t.shield) },
      { label: 'Body', value: `${t.body.width}×${t.body.height}` },
      { label: 'Damage', value: pct(t.damage) },
      { label: 'Shell speed', value: pct(t.muzzle) },
      { label: 'Drive', value: pct(t.drive) },
    ],
  }));

  const gear: GearDoc[] = c.list('gear').map((g) => ({
    id: g.id,
    name: g.meta.name,
    description: g.meta.description,
    since: g.meta.since,
    stats: [
      { label: 'Price', value: `${g.shop.price} for ${g.shop.pack}` },
      { label: 'Carry', value: `up to ${g.shop.max}` },
      {
        label: 'Use',
        value: g.deploy === 'manual' ? 'switch on while aiming' : 'opens when falling',
      },
      ...(g.shield > 0 ? [{ label: 'Shield', value: String(g.shield) }] : []),
      ...(g.heal > 0 ? [{ label: 'Heal', value: `+${g.heal}` }] : []),
    ],
  }));

  return {
    version: c.packs.map((p) => `${p.name}@${p.version}`).join(', '),
    weapons,
    materials,
    props: props
      .map((p) => propDoc(c, p, mapsFor(p.id)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tanks,
    gear,
    names,
  };
}
