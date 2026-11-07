import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import {
  activeSlots,
  activeTeams,
  canStart,
  defaultTeams,
  saveSetup,
  type MatchSetup,
  type Slot,
} from '../game/setup';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { Rules } from './Rules';
import { TankAbout, TankPick, useFavourites, useTanks } from './Tanks';
import { TeamPick, TeamsToggle } from './Teams';

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
  const tanks = useTanks();
  const favourites = useFavourites();
  const [open, setOpen] = useState<string | null>(null);
  const setTank = (i: number, t: string) => {
    const next = [...setup.tanks];
    next[i] = t;
    update({ ...setup, tanks: next });
  };
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
  const teams = setup.teams;
  const oneTeam = teams !== null && n >= 2 && !canStart(setup);
  const setTeam = (i: number, t: number) => {
    const next = [...(teams ?? defaultTeams(setup.slots.length))];
    next[i] = t;
    update({ ...setup, teams: next });
  };
  // Up to 8 players (milestone 7): show the seats in use plus one free one, at least four.
  let last = -1;
  setup.slots.forEach((x, i) => {
    if (x !== 'off') last = i;
  });
  const shown = Math.min(setup.slots.length, Math.max(4, last + 2));

  return (
    <main className="setup local">
      <h2>Local game</h2>
      <section className="slots" aria-label="Players">
        <TeamsToggle
          on={teams !== null}
          onChange={(on) =>
            update({ ...setup, teams: on ? defaultTeams(setup.slots.length) : null })
          }
        />
        {setup.slots.slice(0, shown).map((slot, i) => (
          <label
            key={i}
            className={`slot${slot === 'off' ? ' off' : ''}`}
            style={{ '--pc': css(PLAYER_COLORS[i] ?? 0xffffff) } as CSSProperties}
          >
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
            {slot !== 'off' && (
              <TankPick
                value={setup.tanks[i] ?? 'auto'}
                seat={i}
                bot={slot.startsWith('ai.') ? slot : undefined}
                tanks={tanks}
                favourites={favourites}
                onChange={(t) => setTank(i, t)}
              />
            )}
            {teams && slot !== 'off' && (
              <TeamPick team={teams[i] ?? i % 2} seat={i} onChange={(t) => setTeam(i, t)} />
            )}
          </label>
        ))}
        {oneTeam && (
          <p className="hint" data-testid="one-team">
            Everyone is on one team: put someone on another team to start.
          </p>
        )}
        {n > 4 && setup.size === 'small' && (
          <p className="hint" data-testid="crowded">
            {n} players is a crowd on a small map: try Medium or Large.
          </p>
        )}
        <button className="link" onClick={() => setOpen(open === 'ai' ? null : 'ai')}>
          {open === 'ai' ? 'Hide' : 'About'} the AI players
        </button>
        <button className="link" onClick={() => setOpen(open === 'tanks' ? null : 'tanks')}>
          {open === 'tanks' ? 'Hide' : 'About'} the tanks
        </button>
        {open === 'tanks' && <TankAbout tanks={tanks} />}
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

      <Rules value={setup} players={n} onChange={(r) => update({ ...setup, ...r })} />

      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button
          className="primary"
          disabled={!canStart(setup)}
          onClick={onStart}
          data-testid="start"
        >
          Start ({n} players{teamsLabel(activeTeams(setup))})
        </button>
      </div>
    </main>
  );
}

/** ", 2 teams" when teams are on. */
function teamsLabel(t: number[] | null): string {
  return t ? `, ${new Set(t).size} teams` : '';
}
