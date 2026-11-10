import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANGELOG, isNew } from '../changelog';
import { categoryColor, categoryLabel } from '../ui/categories';
import {
  DAMAGE_LABELS,
  type DocsData,
  type EffectLine,
  type MaterialDoc,
  type PropDoc,
  type TankDoc,
  type WeaponDoc,
} from './data';

const TABS = [
  { key: 'weapons', label: 'Weapons', prefix: 'weapon.' },
  { key: 'objects', label: 'Objects', prefix: 'prop.' },
  { key: 'materials', label: 'Materials', prefix: 'material.' },
  { key: 'tanks', label: 'Tanks', prefix: 'tank.' },
  { key: 'gear', label: 'Gear', prefix: 'gear.' },
  { key: 'new', label: "What's new", prefix: 'changelog.' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function tabFromHash(hash: string): Tab {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  for (const t of TABS) if (h === t.key || h.startsWith(t.prefix)) return t.key;
  return 'weapons';
}

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const matches = (q: string, ...fields: string[]): boolean =>
  q === '' || fields.some((f) => f.toLowerCase().includes(q));

export function Docs({ data }: { data: DocsData }) {
  const hash = useHash();
  const tab = tabFromHash(hash);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // jump to a linked item once its tab has rendered
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id.includes('.')) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }, [hash]);

  const counts: Record<Tab, number> = {
    weapons: data.weapons.length,
    objects: data.props.length,
    materials: data.materials.length,
    tanks: data.tanks.length,
    gear: data.gear.length,
    new: CHANGELOG.length,
  };

  return (
    <div className="docs">
      <header className="docs-head">
        <a className="docs-logo" href="../">
          MUDDERS
        </a>
        <span className="docs-sub">Field manual · {data.version}</span>
        <a className="docs-play" href="../">
          ▶ Play
        </a>
      </header>
      <nav className="docs-tabs">
        {TABS.map((t) => (
          <a key={t.key} href={`#${t.key}`} className={t.key === tab ? 'on' : ''}>
            {t.label} <span className="n">{counts[t.key]}</span>
          </a>
        ))}
      </nav>
      <input
        className="docs-search"
        type="search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search"
      />
      <main>
        {tab === 'weapons' && <Weapons data={data} q={q} />}
        {tab === 'objects' && <Objects data={data} q={q} />}
        {tab === 'materials' && <Materials data={data} q={q} />}
        {tab === 'tanks' && <Tanks tanks={data.tanks} q={q} />}
        {tab === 'gear' &&
          data.gear
            .filter((g) => matches(q, g.name, g.description))
            .map((g) => (
              <article key={g.id} id={g.id} className="card">
                <h2>{g.name}</h2>
                <p>{g.description}</p>
                <Stats stats={g.stats} />
                <Since s={g.since} />
              </article>
            ))}
        {tab === 'new' &&
          CHANGELOG.filter((e) => matches(q, e.title, ...e.items)).map((e) => (
            <article key={e.date} id={`changelog.${e.date}`} className="card">
              <h2>{e.title}</h2>
              <ul className="log">
                {e.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
              <p className="since">
                {e.date}
                {e.pack ? ` · ${e.pack}` : ''}
              </p>
            </article>
          ))}
      </main>
      <footer className="docs-foot">
        Generated from the game's own content files at build time, so every number here is the one
        the game uses.
      </footer>
    </div>
  );
}

function Since({ s }: { s: string }) {
  return <p className="since">since {s}</p>;
}

function Stats({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <dl className="stats">
      {stats.map((s) => (
        <div key={s.label}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A stepped pixel bar: `value` of `max`, in 12 hard blocks. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const n = max > 0 ? Math.min(12, Math.ceil((value / max) * 12)) : 0;
  return (
    <span className="bar" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={i < n ? { background: color } : undefined} />
      ))}
    </span>
  );
}

function Link({ id, data }: { id: string; data: DocsData }) {
  return <a href={`#${id}`}>{data.names[id] ?? id}</a>;
}

// ── weapons ─────────────────────────────────────────────────────────────────────────────────

function Effects({ lines }: { lines: EffectLine[] }) {
  return (
    <ul className="effects">
      {lines.map((l, i) => (
        <li key={i}>
          {l.text}
          {l.children.length > 0 && <Effects lines={l.children} />}
        </li>
      ))}
    </ul>
  );
}

function Weapons({ data, q }: { data: DocsData; q: string }) {
  const [cat, setCat] = useState('all');
  const cats = useMemo(() => [...new Set(data.weapons.map((w) => w.category))].sort(), [data]);
  const maxR = Math.max(...data.weapons.map((w) => w.peakRadius));
  const maxD = Math.max(...data.weapons.map((w) => w.peakDamage));
  const list = data.weapons.filter(
    (w) => (cat === 'all' || w.category === cat) && matches(q, w.name, w.description, w.category),
  );
  return (
    <>
      <div className="chips">
        {['all', ...cats].map((c) => (
          <button
            key={c}
            className={c === cat ? 'on' : ''}
            style={c === 'all' ? undefined : { borderColor: categoryColor(c) }}
            onClick={() => setCat(c)}
          >
            {c === 'all' ? 'All' : categoryLabel(c)}
          </button>
        ))}
      </div>
      <div className="grid">
        {list.map((w) => (
          <WeaponCard key={w.id} w={w} maxR={maxR} maxD={maxD} />
        ))}
      </div>
    </>
  );
}

function WeaponCard({ w, maxR, maxD }: { w: WeaponDoc; maxR: number; maxD: number }) {
  const color = categoryColor(w.category);
  return (
    <article id={w.id} className="card" style={{ borderTopColor: color }}>
      <h2>
        {w.name}
        {isNew(w.since) && <span className="new-badge">New</span>}
        <span className="tag" style={{ color }}>
          {categoryLabel(w.category)}
        </span>
      </h2>
      <p>{w.description}</p>
      <div className="meters">
        <span>Radius</span>
        <Bar value={w.peakRadius} max={maxR} color={color} />
        <b>{w.peakRadius}</b>
        <span>Damage</span>
        <Bar value={w.peakDamage} max={maxD} color={color} />
        <b>{w.peakDamage}</b>
      </div>
      <Stats
        stats={[
          { label: 'Price', value: `$${w.price.toLocaleString('en')} for ${w.pack}` },
          { label: 'Flight', value: w.flight },
          { label: 'Goes off', value: w.triggers.join(', ') },
        ]}
      />
      <h3>On impact</h3>
      <Effects lines={w.effects} />
      {w.pulse.length > 0 && (
        <>
          <h3>Along the way</h3>
          <Effects lines={w.pulse} />
        </>
      )}
      <Since s={w.since} />
    </article>
  );
}

// ── objects ─────────────────────────────────────────────────────────────────────────────────

/** Pixel picture: one canvas pixel per map cell, scaled up with hard edges. */
function Pixels({ rows, scale }: { rows: string[][]; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    rows.forEach((row, y) =>
      row.forEach((c, x) => {
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
  }, [rows, w, h]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className="pixels"
      style={{ width: w * scale, height: h * scale }}
    />
  );
}

function Objects({ data, q }: { data: DocsData; q: string }) {
  return (
    <div className="grid wide">
      {data.props
        .filter((p) => matches(q, p.name, p.description))
        .map((p) => (
          <PropCard key={p.id} p={p} data={data} />
        ))}
    </div>
  );
}

function PropCard({ p, data }: { p: PropDoc; data: DocsData }) {
  const scale = Math.max(2, Math.min(5, Math.floor(160 / Math.max(p.width, p.height))));
  return (
    <article id={p.id} className="card">
      <h2>{p.name}</h2>
      <div className="stage">
        <Pixels rows={p.pixels} scale={scale} />
      </div>
      <p>{p.description}</p>
      <Stats
        stats={[
          { label: 'Size', value: `${p.width}×${p.height} cells` },
          { label: 'Cells', value: String(p.cells) },
          { label: 'Maps', value: p.maps.length ? p.maps.join(', ') : 'sandbox only' },
        ]}
      />
      <h3>Built from</h3>
      <ul className="mats">
        {p.materials.map((m) => (
          <li key={m.role}>
            <Swatch color={data.materials.find((x) => x.id === m.material)?.color ?? '#f0f'} />
            {m.role}: <Link id={m.material} data={data} />{' '}
            <span className="dim">({m.cells} cells)</span>
          </li>
        ))}
      </ul>
      {p.groups.map((g) => (
        <div key={g.name} className="group">
          <h3>
            {g.name}
            {g.integrity !== null && <span className="tag">integrity {g.integrity}</span>}
          </h3>
          <p className="dim">{g.glue}</p>
          {g.resistance.length > 0 && (
            <p>
              Resists:{' '}
              {g.resistance.map((r) => `${DAMAGE_LABELS[r.type] ?? r.type} ×${r.value}`).join(', ')}
            </p>
          )}
          {g.breakInto.length > 0 && (
            <p>
              Breaks into:{' '}
              {g.breakInto.map((b, i) => (
                <span key={b.from}>
                  {i > 0 && ', '}
                  <Link id={b.from} data={data} /> →{' '}
                  {b.into === 'air' ? 'nothing' : <Link id={b.into} data={data} />}
                </span>
              ))}
            </p>
          )}
          {g.supports.length > 0 && <p>Rests on: {g.supports.join(', ')}</p>}
          {g.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ))}
      <h3>Placement</h3>
      <ul className="plain">
        {p.placement.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <Since s={p.since} />
    </article>
  );
}

// ── materials ───────────────────────────────────────────────────────────────────────────────

function Swatch({ color, cycle = [] }: { color: string; cycle?: string[] }) {
  const cols = cycle.length ? cycle : [color];
  return (
    <span className="swatch" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <i key={i} style={{ background: cols[i % cols.length] }} />
      ))}
    </span>
  );
}

function Materials({ data, q }: { data: DocsData; q: string }) {
  const maxD = Math.max(...data.materials.map((m) => m.density));
  return (
    <div className="grid">
      {data.materials
        .filter((m) => matches(q, m.name, m.description, m.settle))
        .map((m) => (
          <MaterialCard key={m.id} m={m} data={data} maxD={maxD} />
        ))}
    </div>
  );
}

const strengthLabel = (v: number): string =>
  v === 0 ? 'none' : v >= 64 ? 'immune' : `×${Number(v.toFixed(2))}`;

function MaterialCard({ m, data, maxD }: { m: MaterialDoc; data: DocsData; maxD: number }) {
  return (
    <article id={m.id} className="card" style={{ borderTopColor: m.color }}>
      <h2>
        <Swatch color={m.color} cycle={m.cycle} />
        {m.name}
      </h2>
      <p>{m.description}</p>
      <Stats
        stats={[
          { label: 'Behaves', value: m.settle },
          { label: 'Weight', value: String(m.density) },
          { label: 'Span', value: m.span === null ? 'no limit' : `${m.span} cells` },
          {
            label: 'Cohesion',
            value: m.cohesion > 0 ? 'clumps' : m.cohesion < 0 ? 'loosens' : 'normal',
          },
          ...(m.coating ? [{ label: 'Layer', value: 'coats the surface' }] : []),
        ]}
      />
      <div className="meters">
        <span>Weight</span>
        <Bar value={m.density} max={maxD} color={m.color} />
        <b>{m.density}</b>
      </div>
      <h3>Toughness (dirt = ×1)</h3>
      <div className="meters">
        {m.strength.map((s) => (
          <StrengthRow key={s.type} type={s.type} value={s.value} color={m.color} />
        ))}
      </div>
      {m.traits.length > 0 && (
        <>
          <h3>Special</h3>
          <ul className="plain">
            {m.traits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {m.usedBy.length > 0 && (
        <p>
          In:{' '}
          {m.usedBy.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link id={id} data={data} />
            </span>
          ))}
        </p>
      )}
      <Since s={m.since} />
    </article>
  );
}

function StrengthRow({ type, value, color }: { type: string; value: number; color: string }) {
  // log-ish scale so ×0.5 … ×8 all read: 1 block per doubling around dirt
  const blocks = value <= 0 ? 0 : Math.max(1, Math.min(12, Math.round(4 + Math.log2(value) * 2)));
  return (
    <>
      <span>{DAMAGE_LABELS[type] ?? type}</span>
      <Bar value={blocks} max={12} color={color} />
      <b>{strengthLabel(value)}</b>
    </>
  );
}

// ── tanks ───────────────────────────────────────────────────────────────────────────────────

const TANK_COLORS: Record<string, string> = {
  h: '#d9873a',
  H: '#f2b366',
  d: '#8a4f22',
  t: '#3a322c',
  w: '#6b625a',
  m: '#9a9a9a',
  s: '#7fd8ff',
  g: '#bfe6ff',
};

function Tanks({ tanks, q }: { tanks: TankDoc[]; q: string }) {
  return (
    <div className="grid">
      {tanks
        .filter((t) => matches(q, t.name, t.description))
        .map((t) => {
          const width = Math.max(...t.sprite.map((r) => r.length));
          const rows = t.sprite.map((r) =>
            Array.from({ length: width }, (_, x) => TANK_COLORS[r[x] ?? '.'] ?? ''),
          );
          return (
            <article key={t.id} id={t.id} className="card">
              <h2>{t.name}</h2>
              <div className="stage small">
                <Pixels rows={rows} scale={6} />
              </div>
              <p>{t.description}</p>
              <Stats stats={t.stats} />
              <Since s={t.since} />
            </article>
          );
        })}
    </div>
  );
}
