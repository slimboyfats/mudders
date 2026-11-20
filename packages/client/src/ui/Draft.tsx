import { useMemo, useState, type CSSProperties } from 'react';
import type { Input } from '@mudders/shared';
import type { DraftSlot, HudState, ShopItem } from '../game/match';
import { sfx } from '../audio/bridge';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { categoryColor, categoryLabel } from './categories';
import { Scoreboard } from './Shop';
import { WeaponPreview } from './WeaponPreview';

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const pcolor = (p: number) => css(PLAYER_COLORS[p % PLAYER_COLORS.length] ?? 0xffffff);

interface Props {
  hud: HudState;
  controls: (player: number) => boolean;
  send: (player: number, input: Input) => void;
}

/**
 * The weapon draft of a points match: one pool for everyone, shown as shop cards. Players take
 * turns (snake order) picking one weapon each; whoever is up taps Pick, everyone else watches the
 * pool fill with colours. ▶ plays the weapon's preview, as in the shop.
 */
export function Draft({ hud, controls, send }: Props) {
  const d = hud.draft;
  const [info, setInfo] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const items = useMemo(() => d?.pool.map((s) => s.item) ?? [], [d?.pool]);
  if (!d) return null;
  const up = d.drafter;
  const mine = up >= 0 && controls(up) && !hud.tanks[up]?.bot;
  const upName = hud.tanks[up]?.bot ? `P${up + 1} ${hud.tanks[up]?.bot}` : `P${up + 1}`;
  const low = mine && hud.seconds >= 0 && hud.seconds <= 5;
  const pick = (s: DraftSlot) => {
    sfx('audio.ui-buy');
    send(up, { type: 'pick', slot: s.slot });
  };
  const slotOf = (it: ShopItem) => d.pool.find((s) => s.item.id === it.id);
  const pickButton = (it: ShopItem) => {
    const s = slotOf(it);
    if (!s) return null;
    if (s.by >= 0) {
      return (
        <span
          className="taken"
          style={{ '--pc': pcolor(s.by) } as CSSProperties}
          aria-label={`Taken by player ${s.by + 1}`}
        >
          <span className="swatch" style={{ background: pcolor(s.by) }} />P{s.by + 1}
        </span>
      );
    }
    return (
      <button
        className="buy"
        disabled={!mine}
        onClick={() => pick(s)}
        aria-label={`Pick ${it.name}`}
        data-testid={`pick-${it.id}`}
      >
        <span>{mine ? 'Pick' : 'Free'}</span>
      </button>
    );
  };
  const picked = (player: number) => d.pool.filter((s) => s.by === player);
  return (
    <div className="shop draft" role="dialog" aria-label="Weapon draft" data-testid="draft">
      <header className="shop-head">
        <div className="shop-title">
          <span className="scrub-label">
            {hud.results.length === 0 ? 'Points match' : `Draft ${hud.round} of ${hud.rounds}`}
            {' · '}pick {Math.min(d.pos + 1, d.total)} of {d.total}
          </span>
          <h2 aria-live="polite">
            <span className="swatch" style={{ background: pcolor(up) }} />
            {mine ? `${upName}, your pick` : `${upName} is picking…`}
          </h2>
        </div>
        <div className="draft-next" aria-label="Who picks next">
          {d.next.slice(1, 7).map((p, i) => (
            <span
              key={i}
              className="swatch"
              style={{ background: pcolor(p) }}
              title={`P${p + 1}`}
            />
          ))}
        </div>
        {hud.seconds >= 0 && (
          <span
            className={`timer${low ? ' low' : ''}`}
            aria-label="Pick time left"
            data-testid="draft-timer"
          >
            {hud.seconds}s
          </span>
        )}
      </header>
      <div className="shop-main">
        <div className="draft-hands" aria-label="Picks so far">
          {hud.tanks.map((t) => (
            <div
              key={t.player}
              className="arsenal"
              style={{ '--pc': pcolor(t.player) } as CSSProperties}
            >
              <span className="scrub-label">
                <span className="swatch" style={{ background: pcolor(t.player) }} />P{t.player + 1}{' '}
                {picked(t.player).length}/{d.picks}
              </span>
              {picked(t.player).map((s) => (
                <span
                  key={s.slot}
                  className="arsenal-chip"
                  style={{ '--cat': categoryColor(s.item.category) } as CSSProperties}
                >
                  {s.item.name}
                </span>
              ))}
            </div>
          ))}
        </div>
        {hud.results.length > 0 && (
          <details className="shop-scores" open={hud.tanks.length <= 4}>
            <summary>Scores</summary>
            <Scoreboard hud={hud} final={false} />
          </details>
        )}
        <div className="cards">
          {d.pool.map((s) => {
            const it = s.item;
            return (
              <div
                key={s.slot}
                className={`card${s.by >= 0 ? ' sold-out taken-card' : ''}`}
                style={{ '--cat': categoryColor(it.category) } as CSSProperties}
              >
                <button
                  className="card-top"
                  onClick={() => setInfo(info === it.id ? null : it.id)}
                  aria-expanded={info === it.id}
                >
                  <b>{it.name}</b>
                </button>
                <p className={info === it.id ? 'full' : ''}>
                  <small className="cat">{categoryLabel(it.category)}</small>
                  {it.damage ? <small className="stat"> · {it.damage} dmg</small> : null}
                  {it.blast ? <small className="stat"> · blast {it.blast}</small> : null}{' '}
                  {it.description}
                </p>
                <div className="card-acts">
                  <button
                    className="peek"
                    onClick={() => setPeek(it.id)}
                    aria-label={`Watch ${it.name}`}
                    title="Watch it fired"
                    data-testid={`preview-${it.id}`}
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                  {pickButton(it)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="shop-foot">
        <span className="shop-foot-note">
          {mine
            ? 'Pick one weapon. You fire every weapon you pick, one shot each.'
            : 'Watch the pool: every weapon is taken once.'}{' '}
          Tap a name to read all about it, ▶ to watch it fired.
        </span>
      </div>
      {peek !== null && (
        <WeaponPreview
          items={items}
          index={Math.max(
            0,
            items.findIndex((it) => it.id === peek),
          )}
          onIndex={(i) => setPeek(items[i]?.id ?? null)}
          onClose={() => {
            const id = peek;
            setPeek(null);
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>(`[data-testid="preview-${id}"]`)?.focus(),
            );
          }}
          buy={pickButton}
        />
      )}
    </div>
  );
}
