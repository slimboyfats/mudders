import { useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { activeSlots, saveSetup, type MatchSetup, type Slot } from '../game/setup';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { Rules } from './Rules';

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

      <Rules value={setup} onChange={(r) => update({ ...setup, ...r })} />

      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button className="primary" disabled={n < 2} onClick={onStart} data-testid="start">
          Start ({n} players)
        </button>
      </div>
    </main>
  );
}
