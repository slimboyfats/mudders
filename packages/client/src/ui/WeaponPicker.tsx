import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { HudState } from '../game/match';
import { categoryColor as colorOf, categoryLabel as label } from './categories';

type Weapon = HudState['tanks'][number]['inventory'][number];

interface Props {
  inventory: Weapon[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}

const countText = (n: number) => (n < 0 ? '∞' : String(n));

/** Sideways drag on the button: px per weapon step. */
const CYCLE_PX = 44;
const SLOP_PX = 10;

/**
 * One weapon button instead of a strip. Tap it to open a grid of big tiles and tap one; or press
 * and slide up into the grid and let go on a weapon (one gesture); or slide sideways on the button
 * to flick through weapons in order.
 */
export function WeaponPicker({ inventory, selected, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
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
        setOpen(true);
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
    } else if (!g.moved) {
      setOpen(!g.wasOpen);
    }
    setMode(null);
    setHover(null);
  };

  const prev = inventory[index - 1];
  const next = inventory[index + 1];
  return (
    <div className={`weapon-picker${shown ? ' open' : ''}`}>
      {shown && mode !== 'pick' && (
        <div className="weapon-scrim" onPointerDown={() => setOpen(false)} aria-hidden="true" />
      )}
      {shown && (
        <div className="weapon-pop" role="listbox" aria-label="Weapons" data-testid="weapon-pop">
          <div className="weapon-pop-head">
            <span className="scrub-label">Weapons</span>
            <span className="weapon-pop-hint">
              {mode === 'pick' ? 'Let go on a weapon' : 'Tap to pick'}
            </span>
          </div>
          <div className="weapon-grid">
            {inventory.map((w) => (
              <button
                key={w.id}
                role="option"
                aria-selected={w.id === selected}
                data-weapon={w.id}
                className={`weapon-tile${w.id === selected ? ' selected' : ''}${hover === w.id ? ' hover' : ''}`}
                style={{ '--cat': colorOf(w.category) } as CSSProperties}
                onClick={() => {
                  onSelect(w.id);
                  setOpen(false);
                }}
              >
                <span className="wname">{w.name}</span>
                <span className="wmeta">
                  <span className="wcat">{label(w.category)}</span>
                  <span className="count">{countText(w.count)}</span>
                </span>
              </button>
            ))}
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
        aria-haspopup="listbox"
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
          if (e.detail === 0) setOpen(!open);
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
