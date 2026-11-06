import { useState } from 'react';
import type { Input } from '@mudders/shared';
import type { HudState, HudTank } from '../game/match';
import { teamName } from '../game/setup';
import { sfx } from '../audio/bridge';
import { PLAYER_COLORS } from '../render/pixel/theme';

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
 * Between-round shop (§3.6, §8a): card grid with large buy buttons and the timer. Hot-seat players
 * take turns on one device via the player tabs; AI players have already shopped.
 */
export function Shop({ hud, controls, send }: ShopProps) {
  const humans = hud.tanks.filter((t) => controls(t.player));
  const firstOpen = humans.find((t) => !t.ready) ?? humans[0];
  const [sel, setSel] = useState(firstOpen?.player ?? 0);
  const me = hud.tanks[sel] && controls(sel) ? hud.tanks[sel] : firstOpen;
  const last = hud.results[hud.results.length - 1];
  const owned = (id: string) =>
    me?.gear.find((g) => g.id === id)?.count ?? me?.inventory.find((i) => i.id === id)?.count ?? 0;

  return (
    <div className="shop" role="dialog" aria-label="Shop">
      <header>
        <h2>
          Round {hud.round} of {hud.rounds}:{' '}
          {hud.teams && last && last.winnerTeam >= 0 ? (
            <>Team {teamName(last.winnerTeam)} wins</>
          ) : last && last.winner >= 0 ? (
            <>
              <span className="swatch" style={{ background: pcolor(last.winner) }} />P
              {last.winner + 1} wins
            </>
          ) : (
            'draw'
          )}
        </h2>
        <span className="timer" aria-label="Shop time left">
          {hud.seconds >= 0 ? `${hud.seconds}s` : ''}
        </span>
      </header>
      <Scoreboard hud={hud} final={false} />
      {me && (
        <>
          <div className="tabs" role="tablist">
            {humans.map((t) => (
              <button
                key={t.player}
                role="tab"
                aria-selected={t.player === me.player}
                className={t.player === me.player ? 'on' : ''}
                onClick={() => setSel(t.player)}
              >
                <span className="swatch" style={{ background: pcolor(t.player) }} />P{t.player + 1}{' '}
                {t.ready ? '✓' : ''}
              </button>
            ))}
            <span className="cash">{money(me.money)}</span>
          </div>
          <div className="cards">
            <div className="card fuel-card">
              <div className="card-top">
                <b>Fuel Tank</b>
                <small>driving</small>
              </div>
              <p>
                Fuel for driving with ◀ ▶: one unit per cell. Driving doesn't use up your turn, and
                what you don't burn carries over to the next round.
              </p>
              <div className="card-bottom">
                <span className="own">
                  {me.fuel}/{hud.fuel.max}
                </span>
                <button
                  disabled={me.ready || me.fuel >= hud.fuel.max || me.money < hud.fuel.price}
                  onClick={() => {
                    sfx('audio.ui-buy');
                    send(me.player, { type: 'buyFuel', packs: 1 });
                  }}
                  aria-label={`Buy ${hud.fuel.pack} fuel for ${hud.fuel.price}`}
                  data-testid="buy-fuel"
                >
                  +{hud.fuel.pack} · {money(hud.fuel.price)}
                </button>
              </div>
            </div>
            {hud.shop.map((it) => {
              const have = owned(it.id);
              const full = it.gear !== undefined && have >= it.gear.max;
              const can = !me.ready && have >= 0 && !full && me.money >= it.price;
              return (
                <div key={it.id} className={`card${it.gear ? ' gear-card' : ''}`}>
                  <div className="card-top">
                    <b>{it.name}</b>
                    <small>{it.category}</small>
                  </div>
                  <p>{it.description}</p>
                  <div className="card-bottom">
                    <span className="own">
                      {have < 0 ? '∞' : it.gear ? `${have}/${it.gear.max}` : `×${have}`}
                    </span>
                    <button
                      disabled={!can}
                      onClick={() => {
                        sfx('audio.ui-buy');
                        send(me.player, { type: 'buy', item: it.id, packs: 1 });
                      }}
                      aria-label={`Buy ${it.pack} ${it.name} for ${it.price}`}
                    >
                      +{it.pack} · {money(it.price)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
            {me.ready ? 'Waiting for others…' : `P${me.player + 1} ready`}
          </button>
        </>
      )}
    </div>
  );
}
