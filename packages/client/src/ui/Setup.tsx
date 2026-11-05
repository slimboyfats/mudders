import { useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import {
  PRESETS,
  activeSlots,
  saveSetup,
  type MapSize,
  type MatchSetup,
  type Preset,
  type Slot,
} from '../game/setup';
import { PLAYER_COLORS } from '../render/pixel/theme';

interface Props {
  setup: MatchSetup;
  setSetup: (s: MatchSetup) => void;
  onStart: () => void;
  onBack: () => void;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Local match setup (§8): player slots (human or AI), rounds, timers, map and rules. */
export function Setup({ setup, setSetup, onStart, onBack }: Props) {
  const bots = useMemo(
    () =>
      loadContent()
        .list('ai')
        .map((a) => ({ id: a.id, name: a.meta.name, desc: a.meta.description })),
    [],
  );
  const [open, setOpen] = useState<string | null>(null);
  const update = (s: MatchSetup) => {
    saveSetup(s);
    setSetup(s);
  };
  const setSlot = (i: number, v: Slot) => {
    const slots = [...setup.slots];
    slots[i] = v;
    update({ ...setup, slots });
  };
  const preset = (Object.keys(PRESETS) as Preset[]).find(
    (k) => PRESETS[k].rounds === setup.rounds && PRESETS[k].turnTimer === setup.turnTimer,
  );
  const n = activeSlots(setup).length;

  return (
    <main className="setup">
      <h2>Local game</h2>
      <section className="slots" aria-label="Players">
        {setup.slots.map((slot, i) => (
          <label key={i} className={`slot${slot === 'off' ? ' off' : ''}`}>
            <span className="swatch" style={{ background: css(PLAYER_COLORS[i] ?? 0xffffff) }} />
            <span className="slot-name">Player {i + 1}</span>
            <select
              value={slot}
              onChange={(e) => setSlot(i, e.target.value as Slot)}
              aria-label={`Player ${i + 1}`}
            >
              <option value="human">Human</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  AI: {b.name}
                </option>
              ))}
              {i >= 2 && <option value="off">—</option>}
            </select>
          </label>
        ))}
        <button className="link" onClick={() => setOpen(open === 'ai' ? null : 'ai')}>
          {open === 'ai' ? 'Hide' : 'About'} the AI players
        </button>
        {open === 'ai' && (
          <ul className="about">
            {bots.map((b) => (
              <li key={b.id}>
                <b>{b.name}</b>: {b.desc}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rules" aria-label="Rules">
        <div className="seg" role="radiogroup" aria-label="Match length">
          {(Object.keys(PRESETS) as Preset[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={preset === k}
              className={preset === k ? 'on' : ''}
              onClick={() => update({ ...setup, ...PRESETS[k] })}
            >
              {k === 'quick' ? 'Quick' : k === 'standard' ? 'Standard' : 'Long'}
              <small>
                {PRESETS[k].rounds} round{PRESETS[k].rounds > 1 ? 's' : ''}
              </small>
            </button>
          ))}
        </div>
        <label>
          Rounds
          <select
            value={setup.rounds}
            onChange={(e) => update({ ...setup, rounds: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5, 7, 10].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Turn timer
          <select
            value={setup.turnTimer}
            onChange={(e) => update({ ...setup, turnTimer: Number(e.target.value) })}
          >
            <option value={0}>Off</option>
            {[10, 15, 20, 30, 45].map((s) => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </label>
        <label>
          Map
          <select
            value={setup.size}
            onChange={(e) => update({ ...setup, size: e.target.value as MapSize })}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label>
          Scenery
          <select
            value={setup.scenery}
            onChange={(e) => update({ ...setup, scenery: e.target.value as MatchSetup['scenery'] })}
          >
            <option value="none">Bare hills</option>
            <option value="village">Village</option>
            <option value="badlands">Badlands</option>
          </select>
        </label>
        <label>
          Wind
          <select
            value={setup.wind}
            onChange={(e) => update({ ...setup, wind: e.target.value as MatchSetup['wind'] })}
          >
            <option value="none">None</option>
            <option value="constant">Per round</option>
            <option value="perTurn">Every turn</option>
          </select>
        </label>
        <label>
          Starting cash
          <select
            value={setup.startingCash}
            onChange={(e) => update({ ...setup, startingCash: Number(e.target.value) })}
          >
            {[0, 3000, 10000, 30000].map((c) => (
              <option key={c} value={c}>
                {c.toLocaleString('en')}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={setup.suddenDeath}
            onChange={(e) => update({ ...setup, suddenDeath: e.target.checked })}
          />
          Sudden death from turn 8
        </label>
      </section>

      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button className="primary" disabled={n < 2} onClick={onStart} data-testid="start">
          Start ({n} players)
        </button>
      </div>
    </main>
  );
}
