import { useState, type CSSProperties } from 'react';
import type { Input } from '@mudders/shared';
import type { HudState, HudTank } from '../game/match';
import { teamName } from '../game/setup';
import { sfx } from '../audio/bridge';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { categoryColor, categoryGroup, categoryLabel } from './categories';

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const pcolor = (p: number) => css(PLAYER_COLORS[p % PLAYER_COLORS.length] ?? 0xffffff);
const money = (n: number) => `$${n.toLocaleString('en')}`;

interface ScoreProps {
  hud: HudState;
  final: boolean;
}

/** Round (or final) scoreboard: points this round, money earned, totals (§3.5). */
export function Scoreboard({ hud, final }: ScoreProps) {
  const last = hud.results[hud.results.length - 1];
  // team play: wins and the crown go to the whole team, and team-mates are listed together
  const won = (t: HudTank) => (hud.teams ? t.team === hud.winnerTeam : t.player === hud.winner);
  const wins = (t: HudTank) =>
    hud.results.filter((r) => (hud.teams ? r.winnerTeam === t.team : r.winner === t.player)).length;
  const teamScore = (team: number) =>
    hud.tanks.reduce((n, t) => n + (t.team === team ? t.score : 0), 0);
  const rows = [...hud.tanks].sort(
    (a, b) =>
      (hud.teams ? teamScore(b.team) - teamScore(a.team) || a.team - b.team : 0) ||
      b.score - a.score ||
      a.player - b.player,
  );
  return (
    <table className="scores">
      <thead>
        <tr>
          <th>Player</th>
          {!final && <th>Round</th>}
          {!final && <th>Earned</th>}
          <th>Wins</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.player} className={won(t) ? 'win' : ''}>
            <td>
              <span className="swatch" style={{ background: pcolor(t.player) }} />P{t.player + 1}
              {hud.teams && <small> Team {teamName(t.team)}</small>}
              {t.bot && <small> {t.bot}</small>}
              {won(t) && <span className="crown"> ★</span>}
            </td>
            {!final && <td>{last?.points[t.player] ?? 0}</td>}
            {!final && <td>+{money(last?.earned[t.player] ?? 0)}</td>}
            <td>{wins(t)}</td>
            <td>{t.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ShopProps {
  hud: HudState;
  controls: (player: number) => boolean;
  send: (player: number, input: Input) => void;
}

/**
 * The shop before round 1 and between rounds (§3.6, §8a). A sticky header with the timer, the
 * hot-seat player tabs and the cash; filter chips by kind; compact tiles with a big price button
 * (tap the tile name for the full description); a sticky Ready bar. AI players have already shopped.
 */
export function Shop({ hud, controls, send }: ShopProps) {
  const humans = hud.tanks.filter((t) => controls(t.player));
  const firstOpen = humans.find((t) => !t.ready) ?? humans[0];
  const [sel, setSel] = useState(firstOpen?.player ?? 0);
  const [filter, setFilter] = useState('all');
  const [info, setInfo] = useState<string | null>(null);
  const me = hud.tanks[sel] && controls(sel) ? hud.tanks[sel] : firstOpen;
  const last = hud.results[hud.results.length - 1];
  const opening = hud.results.length === 0;
  const owned = (id: string) =>
    me?.gear.find((g) => g.id === id)?.count ?? me?.inventory.find((i) => i.id === id)?.count ?? 0;
  const groups: string[] = ['all'];
  for (const it of hud.shop) {
    const g = categoryGroup(it.category);
    if (!groups.includes(g)) groups.push(g);
  }
  groups.push('driving');
  const shown = (category: string) => filter === 'all' || categoryGroup(category) === filter;
  const low = hud.seconds >= 0 && hud.seconds <= 5;

  return (
    <div className="shop" role="dialog" aria-label="Shop">
      <header className="shop-head">
        <div className="shop-title">
          <span className="scrub-label">
            {opening ? 'Before round 1' : `Round ${hud.round} of ${hud.rounds} over`}
          </span>
          <h2>
            {opening ? (
              <>Shop</>
            ) : hud.teams && last && last.winnerTeam >= 0 ? (
              <>Team {teamName(last.winnerTeam)} wins</>
            ) : last && last.winner >= 0 ? (
              <>
                <span className="swatch" style={{ background: pcolor(last.winner) }} />P
                {last.winner + 1} wins
              </>
            ) : (
              'Draw'
            )}
          </h2>
        </div>
        {me && humans.length > 1 && (
          <div className="tabs" role="tablist" aria-label="Who is shopping">
            {humans.map((t) => (
              <button
                key={t.player}
                role="tab"
                aria-selected={t.player === me.player}
                className={t.player === me.player ? 'on' : ''}
                style={{ '--pc': pcolor(t.player) } as CSSProperties}
                onClick={() => setSel(t.player)}
              >
                P{t.player + 1}
                {t.ready ? ' ✓' : ''}
              </button>
            ))}
          </div>
        )}
        {me && (
          <span className="cash" aria-label="Money">
            {money(me.money)}
          </span>
        )}
        <span
          className={`timer${low ? ' low' : ''}`}
          aria-label={opening ? 'Round 1 starts in' : 'Shop time left'}
          data-testid="shop-timer"
        >
          {hud.seconds >= 0 ? `${hud.seconds}s` : ''}
        </span>
      </header>
      {!opening && (
        <details className="shop-scores" open={hud.tanks.length <= 4}>
          <summary>Scores</summary>
          <Scoreboard hud={hud} final={false} />
        </details>
      )}
      {me && (
        <>
          <div className="shop-filters" role="tablist" aria-label="Filter">
            {groups.map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={filter === g}
                className={filter === g ? 'on' : ''}
                style={{ '--cat': g === 'all' ? 'var(--fg)' : categoryColor(g) } as CSSProperties}
                onClick={() => setFilter(g)}
              >
                {g === 'all' ? 'All' : categoryLabel(g)}
              </button>
            ))}
          </div>
          <div className="cards">
            {shown('driving') && (
              <div
                className="card fuel-card"
                style={{ '--cat': categoryColor('driving') } as CSSProperties}
              >
                <button
                  className="card-top"
                  onClick={() => setInfo(info === 'fuel' ? null : 'fuel')}
                >
                  <b>Fuel Tank</b>
                  <span className="own">
                    {me.fuel}/{hud.fuel.max}
                  </span>
                </button>
                <p className={info === 'fuel' ? 'full' : ''}>
                  Fuel for driving with ◀ ▶: one unit per cell. Driving doesn&apos;t use up your
                  turn, and what you don&apos;t burn carries over to the next round.
                </p>
                <button
                  className="buy"
                  disabled={me.ready || me.fuel >= hud.fuel.max || me.money < hud.fuel.price}
                  onClick={() => {
                    sfx('audio.ui-buy');
                    send(me.player, { type: 'buyFuel', packs: 1 });
                  }}
                  aria-label={`Buy ${hud.fuel.pack} fuel for ${hud.fuel.price}`}
                  data-testid="buy-fuel"
                >
                  <span>+{hud.fuel.pack}</span>
                  <span className="price">{money(hud.fuel.price)}</span>
                </button>
              </div>
            )}
            {hud.shop.map((it) => {
              if (!shown(it.category)) return null;
              const have = owned(it.id);
              const full = it.gear !== undefined && have >= it.gear.max;
              const can = !me.ready && have >= 0 && !full && me.money >= it.price;
              return (
                <div
                  key={it.id}
                  className={`card${it.gear ? ' gear-card' : ''}${have !== 0 ? ' owned' : ''}`}
                  style={{ '--cat': categoryColor(it.category) } as CSSProperties}
                >
                  <button
                    className="card-top"
                    onClick={() => setInfo(info === it.id ? null : it.id)}
                    aria-expanded={info === it.id}
                  >
                    <b>{it.name}</b>
                    <span className="own">
                      {have < 0 ? '∞' : it.gear ? `${have}/${it.gear.max}` : `×${have}`}
                    </span>
                  </button>
                  <p className={info === it.id ? 'full' : ''}>
                    <small className="cat">{categoryLabel(it.category)}</small> {it.description}
                  </p>
                  <button
                    className="buy"
                    disabled={!can}
                    onClick={() => {
                      sfx('audio.ui-buy');
                      send(me.player, { type: 'buy', item: it.id, packs: 1 });
                    }}
                    aria-label={`Buy ${it.pack} ${it.name} for ${it.price}`}
                  >
                    <span>{full ? 'Full' : `+${it.pack}`}</span>
                    <span className="price">{money(it.price)}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="shop-foot">
            <span className="shop-foot-note">
              {me.ready
                ? 'Waiting for the others…'
                : humans.length > 1
                  ? `P${me.player + 1} is shopping. Pass the device after Ready.`
                  : 'Buy what you need, then Ready.'}
            </span>
            <button
              className="primary ready"
              disabled={me.ready}
              onClick={() => {
                send(me.player, { type: 'ready' });
                const next = humans.find((t) => !t.ready && t.player !== me.player);
                if (next) setSel(next.player);
              }}
              data-testid="ready"
            >
              {me.ready ? 'Ready ✓' : `P${me.player + 1} ready ▶`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
