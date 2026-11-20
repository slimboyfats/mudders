import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import type { HudState } from '../game/match';
import {
  favourites,
  favouritesFirst,
  subscribeFavourites,
  toggleFavourite,
} from '../game/weapon-prefs';
import { categoryColor as colorOf, categoryLabel as label } from './categories';

type Weapon = HudState['tanks'][number]['inventory'][number];

interface Props {
  inventory: Weapon[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  /** Player the list is for: the previous weapon is kept per player (hot-seat). */
  owner?: number;
  /** A weapon's description, for the info card a long press opens. */
  describe?: ((id: string) => string) | undefined;
}

const countText = (n: number) => (n < 0 ? '∞' : String(n));

/** Sideways drag on the button: px per weapon step. */
const CYCLE_PX = 44;
const SLOP_PX = 10;
/** Hold a tile this long for its info card. */
const HOLD_MS = 450;

/**
 * One weapon button instead of a strip. Tap it to open a grid of big tiles and tap one; or press
 * and slide up into the grid and let go on a weapon (one gesture); or slide sideways on the button
 * to flick through weapons in order.
 */
export function WeaponPicker({
  inventory,
  selected,
  disabled,
  onSelect,
  owner = 0,
  describe,
}: Props) {
  const [open, setOpen] = useState(false);
  const fav = useSyncExternalStore(subscribeFavourites, favourites);
  // the weapon each player had before the current one (swap back in one tap)
  const [held, setHeld] = useState<Record<number, { cur: string; prev: string }>>({});
  const was = held[owner];
  if (selected && was?.cur !== selected)
    setHeld({ ...held, [owner]: { cur: selected, prev: was?.cur ?? '' } });
  // long press on a tile: its info card
  const [info, setInfo] = useState<string | null>(null);
  const hold = useRef({ timer: 0, fired: false });
  const startHold = (id: string) => {
    window.clearTimeout(hold.current.timer);
    hold.current.fired = false;
    hold.current.timer = window.setTimeout(() => {
      hold.current.fired = true;
      setInfo(id);
    }, HOLD_MS);
  };
  const endHold = () => window.clearTimeout(hold.current.timer);
  const [mode, setMode] = useState<'cycle' | 'pick' | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const gesture = useRef({ id: -1, x: 0, y: 0, index: 0, step: 0, moved: false, wasOpen: false });
  const shown = open && !disabled;
  const current = inventory.find((w) => w.id === selected) ?? inventory[0];
  const index = Math.max(
    0,
    inventory.findIndex((w) => w.id === selected),
  );

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown]);

  const tileAt = (x: number, y: number): string | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-weapon]')?.dataset.weapon ?? null;

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic event without a live pointer
    }
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      index,
      step: 0,
      moved: false,
      wasOpen: open,
    };
    setMode(null);
    // open on touch-down, not on release: the grid answers at once, and a slide up still picks
    if (!open) {
      setOpen(true);
      setInfo(null);
    }
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (e.pointerId !== g.id || disabled) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    let m = mode;
    if (m === null) {
      if (dy < -SLOP_PX * 2 && -dy > Math.abs(dx)) {
        m = 'pick';
      } else if (Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
        m = 'cycle';
        setOpen(false);
      } else return;
      g.moved = true;
      setMode(m);
    }
    if (m === 'cycle') {
      const step = Math.round(dx / CYCLE_PX);
      if (step !== g.step) {
        g.step = step;
        const next = inventory[Math.max(0, Math.min(inventory.length - 1, g.index + step))];
        if (next && next.id !== selected) onSelect(next.id);
      }
    } else {
      setHover(tileAt(e.clientX, e.clientY));
    }
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (e.pointerId !== g.id) return;
    g.id = -1;
    if (mode === 'pick') {
      const id = tileAt(e.clientX, e.clientY);
      if (id) {
        onSelect(id);
        setOpen(false);
      }
    } else if (!g.moved && g.wasOpen) {
      setOpen(false);
    }
    setMode(null);
    setHover(null);
  };

  const prev = inventory[index - 1];
  const next = inventory[index + 1];
  const ordered = favouritesFirst(inventory, fav);
  const prevId = held[owner]?.prev ?? '';
  const prevWeapon =
    prevId && prevId !== selected ? inventory.find((w) => w.id === prevId) : undefined;
  const infoWeapon = shown && info ? inventory.find((w) => w.id === info) : undefined;
  return (
    <div className={`weapon-picker${shown ? ' open' : ''}`}>
      {shown && mode !== 'pick' && (
        <div className="weapon-scrim" onPointerDown={() => setOpen(false)} aria-hidden="true" />
      )}
      {shown && (
        <div className="weapon-pop" data-testid="weapon-pop">
          <div className="weapon-pop-head">
            <span className="scrub-label" id="weapon-pop-label">
              Weapons
            </span>
            {prevWeapon && mode !== 'pick' && (
              <button
                className="weapon-swap"
                onClick={() => {
                  onSelect(prevWeapon.id);
                  setOpen(false);
                }}
                data-testid="weapon-swap"
              >
                ⇄ Back to {prevWeapon.name}
              </button>
            )}
            <span className="weapon-pop-hint">
              {mode === 'pick' ? 'Let go on a weapon' : 'Tap to pick, hold for info'}
            </span>
          </div>
          {infoWeapon && (
            <div className="weapon-info" role="group" aria-label={`${infoWeapon.name} info`}>
              <div className="weapon-info-head">
                <span className="wname">{infoWeapon.name}</span>
                <span className="wcat">{label(infoWeapon.category)}</span>
              </div>
              <p>{describe?.(infoWeapon.id) || 'No description.'}</p>
              <div className="row">
                <button
                  className="primary"
                  onClick={() => {
                    onSelect(infoWeapon.id);
                    setOpen(false);
                  }}
                >
                  Pick
                </button>
                <button
                  aria-pressed={fav.includes(infoWeapon.id)}
                  onClick={() => toggleFavourite(infoWeapon.id)}
                >
                  {fav.includes(infoWeapon.id) ? '★ Favourite' : '☆ Add to favourites'}
                </button>
                <button onClick={() => setInfo(null)}>Close</button>
              </div>
            </div>
          )}
          <div className="weapon-grid" role="group" aria-labelledby="weapon-pop-label">
            {ordered.map((w, i) => {
              const starred = fav.includes(w.id);
              const split = i > 0 && !starred && fav.includes(ordered[i - 1]?.id ?? '');
              return (
                <div
                  key={w.id}
                  className={`weapon-cell${starred ? ' fav' : ''}${split ? ' split' : ''}`}
                >
                  <button
                    aria-pressed={w.id === selected}
                    data-weapon={w.id}
                    className={`weapon-tile${w.id === selected ? ' selected' : ''}${hover === w.id ? ' hover' : ''}`}
                    style={{ '--cat': colorOf(w.category) } as CSSProperties}
                    onPointerDown={(e) => {
                      if (e.pointerType !== 'mouse' || e.button === 0) startHold(w.id);
                    }}
                    onPointerUp={endHold}
                    onPointerLeave={endHold}
                    onPointerCancel={endHold}
                    onContextMenu={(e) => {
                      // a long press on Android, a right click on desktop: the info card
                      e.preventDefault();
                      endHold();
                      setInfo(w.id);
                    }}
                    onClick={() => {
                      if (hold.current.fired) {
                        hold.current.fired = false;
                        return;
                      }
                      onSelect(w.id);
                      setOpen(false);
                    }}
                  >
                    <span className="wname">{w.name}</span>
                    <span className="wmeta">
                      <span className="wcat">
                        {w.isNew && <span className="new-badge">New</span>}
                        {label(w.category)}
                      </span>
                      <span className="count">{countText(w.count)}</span>
                    </span>
                  </button>
                  <button
                    className="weapon-star"
                    aria-pressed={starred}
                    aria-label={`Favourite: ${w.name}`}
                    data-testid={`star-${w.id}`}
                    onClick={() => toggleFavourite(w.id)}
                  >
                    {starred ? '★' : '☆'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {mode === 'cycle' && (
        <div className="weapon-cycle" aria-hidden="true">
          <span className="side">{prev ? `‹ ${prev.name}` : ''}</span>
          <span className="side right">{next ? `${next.name} ›` : ''}</span>
        </div>
      )}
      <button
        className={`weapon-btn${mode ? ' active' : ''}`}
        disabled={disabled || !current}
        aria-haspopup="true"
        aria-expanded={shown}
        aria-label={
          current ? `Weapon: ${current.name}, ${countText(current.count)} left` : 'Weapon'
        }
        data-testid="weapon-button"
        style={{ '--cat': colorOf(current?.category ?? '') } as CSSProperties}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          // keyboard (Enter / Space) has no pointer events: toggle the grid here
          if (e.detail === 0) {
            setOpen(!open);
            setInfo(null);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="scrub-label">Weapon</span>
        <span className="wname">{current?.name ?? '—'}</span>
        <span className="count">{current ? countText(current.count) : ''}</span>
        <span className="chev" aria-hidden="true">
          ▴
        </span>
      </button>
    </div>
  );
}
