import { useEffect, useMemo, useState } from 'react';
import { discoverContent } from '@mudders/content';
import { resolveContent, type ContentSource, type ResolvedContent } from '@mudders/sim';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { MatchView } from './MatchView';

/**
 * Dev content sandbox (§2c.5): pick any weapon, fire it at a test map, and tweak any manifest's
 * JSON live. Edits are re-resolved through the real loader (so `use`/`extends` and schema errors
 * show exactly as `content:validate` would) and survive a Vite reload via sessionStorage, which is
 * what makes editing a manifest file on disk feel like hot reload.
 */

const KEY = 'mudders.sandbox.v1';

interface Saved {
  weapon: string;
  edits: Record<string, string>;
  selected: string;
  wind: number;
  seed: number;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // ignore
  }
  return { weapon: 'weapon.missile', edits: {}, selected: '', wind: 0, seed: 7 };
}

function idOf(data: unknown): string {
  return typeof data === 'object' && data !== null && 'id' in data ? String(data.id) : '';
}

function patched(base: ContentSource, edits: Record<string, string>): ContentSource {
  return {
    behaviours: base.behaviours,
    packs: base.packs.map((p) => ({
      pack: p.pack,
      manifests: p.manifests.map((m) => {
        const e = edits[m.path];
        return e === undefined ? m : { path: m.path, data: JSON.parse(e) as unknown };
      }),
    })),
  };
}

export function Sandbox({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const base = useMemo(() => discoverContent(), []);
  const all = useMemo(
    () =>
      base.packs
        .flatMap((p) => p.manifests)
        .map((m) => ({ path: m.path, id: idOf(m.data), json: JSON.stringify(m.data, null, 2) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [base],
  );
  const [saved, setSaved] = useState<Saved>(load);
  const [generation, setGeneration] = useState(0);
  const selected =
    all.find((m) => m.path === saved.selected) ?? all.find((m) => m.id === saved.weapon);
  const [draft, setDraft] = useState(() =>
    selected ? (saved.edits[selected.path] ?? selected.json) : '',
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      // ignore
    }
  }, [saved]);

  const built = useMemo((): { content: ResolvedContent } | { error: string } => {
    try {
      return { content: resolveContent(patched(base, saved.edits)) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [base, saved.edits]);

  const weapons = 'content' in built ? built.content.list('weapon') : [];
  const match = useMemo(() => {
    if (!('content' in built)) return null;
    const content = built.content;
    const inventory: Record<string, number> = {};
    for (const w of content.list('weapon')) inventory[w.id] = -1;
    const m = new LocalMatch(content, {
      seed: saved.seed,
      mode: 'mode.classic',
      players: 2,
      map: { generator: 'gen.hills', width: 800, height: 400 },
      tankColumns: [120, 560],
      tankSetup: [{ inventory }, { health: 100 }],
      turnOrder: [0],
      wind: saved.wind,
    });
    const weapon = content.list('weapon').some((w) => w.id === saved.weapon)
      ? saved.weapon
      : (content.list('weapon')[0]?.id ?? '');
    m.input(0, { type: 'selectWeapon', weapon });
    m.input(0, { type: 'aim', angle: 50, power: 560 });
    return m;
    // generation forces a fresh map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, saved.seed, saved.wind, saved.weapon, generation]);

  const select = (path: string) => {
    const m = all.find((x) => x.path === path);
    setSaved((s) => ({ ...s, selected: path }));
    setDraft(m ? (saved.edits[path] ?? m.json) : '');
  };

  const [parseError, setParseError] = useState<string | null>(null);
  const apply = () => {
    if (!selected) return;
    try {
      JSON.parse(draft);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    setSaved((s) => ({ ...s, edits: { ...s.edits, [selected.path]: draft } }));
  };
  const revert = () => {
    if (!selected) return;
    setDraft(selected.json);
    setSaved((s) => ({
      ...s,
      edits: Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== selected.path)),
    }));
  };

  const panel = (
    <aside className="sandbox-panel">
      <h2>Sandbox</h2>
      <label>
        Weapon
        <select
          value={saved.weapon}
          onChange={(e) => {
            const id = e.target.value;
            setSaved((s) => ({ ...s, weapon: id }));
            const m = all.find((x) => x.id === id);
            if (m) select(m.path);
          }}
        >
          {weapons.map((w) => (
            <option key={w.id} value={w.id}>
              {w.meta.name} ({w.id})
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Wind
          <input
            type="number"
            step={0.002}
            value={saved.wind}
            onChange={(e) => setSaved((s) => ({ ...s, wind: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Map seed
          <input
            type="number"
            value={saved.seed}
            onChange={(e) => setSaved((s) => ({ ...s, seed: Number(e.target.value) >>> 0 }))}
          />
        </label>
        <button onClick={() => setGeneration((g) => g + 1)}>Reset map</button>
      </div>
      <label>
        Edit manifest
        <select value={selected?.path ?? ''} onChange={(e) => select(e.target.value)}>
          {all.map((m) => (
            <option key={m.path} value={m.path}>
              {saved.edits[m.path] !== undefined ? '● ' : ''}
              {m.id}
            </option>
          ))}
        </select>
      </label>
      <textarea
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Manifest JSON"
      />
      <div className="row">
        <button className="primary" onClick={apply}>
          Apply
        </button>
        <button onClick={revert}>Revert</button>
      </div>
      {parseError && <pre className="error">{parseError}</pre>}
      {'error' in built && <pre className="error">{built.error}</pre>}
      <p className="hint">
        Edits stay in this tab only; copy the JSON into the manifest file to keep them. Props and
        the prop painter arrive with the prop system in milestone 3.
      </p>
    </aside>
  );

  return match ? (
    <MatchView
      key={`${generation}-${saved.seed}-${saved.wind}-${JSON.stringify(saved.edits)}`}
      match={match}
      settings={settings}
      controls={(p) => p === 0}
      onExit={onExit}
      side={panel}
    />
  ) : (
    <div className="match">
      <div className="match-main">
        <div className="playfield" />
        {panel}
      </div>
    </div>
  );
}
