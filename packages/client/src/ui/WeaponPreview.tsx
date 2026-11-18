import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { loadContent } from '@mudders/content';
import type { ResolvedContent } from '@mudders/sim';
import { renderDpr } from '../game/auto-quality';
import { STEP_MS, type ShopItem } from '../game/match';
import { paletteFrom } from '../game/palette';
import { loadSettings } from '../game/settings';
import { WeaponDemo } from '../game/weapon-demo';
import { loadRenderer, type Renderer, type RenderPalette } from '../render';
import { categoryColor, categoryLabel } from './categories';

/**
 * While a preview is open the match behind the shop is not drawn (the shop covers it anyway):
 * the phone's GPU then only works on the small preview. The sim behind it keeps running, so an
 * online shop never falls behind.
 */
export const previewing = { open: false };

/** Most sim ticks one frame catches up (a slow frame plays the preview a little slow). */
const MAX_STEPS = 3;

let palette: { content: ResolvedContent; palette: RenderPalette } | null = null;
function paletteOf(content: ResolvedContent): RenderPalette {
  if (palette?.content !== content) palette = { content, palette: paletteFrom(content) };
  return palette.palette;
}

interface Props {
  /** The weapons the shop shows right now (filter and search applied), in its order. */
  items: readonly ShopItem[];
  /** Index into `items` of the weapon on show. */
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** The shop's own Buy button for an item, so buying here works exactly like on its card. */
  buy: (item: ShopItem) => ReactNode;
}

/**
 * The shop's weapon preview (Joel: "can we get some previews of the weapons somehow"): a small
 * window that plays one real shot of the weapon on a loop, at a tank across a little valley,
 * with the weapon's text, stats and Buy button beside it. ◀ ▶ step through the shop's list.
 */
export function WeaponPreview({ items, index, onIndex, onClose, buy }: Props) {
  const item = items[index];
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const [error, setError] = useState<string | null>(null);
  const weapon = item?.id ?? '';
  // the weapon the window opened on: the renderer is mounted once, for it
  const [first] = useState(weapon);
  const label = `${item?.name ?? ''} fired at a tank, on a loop`;
  const demoRef = useRef<WeaponDemo | null>(null);

  useEffect(() => {
    previewing.open = true;
    closeRef.current?.focus();
    return () => {
      previewing.open = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  // the renderer, mounted once on the preview canvas, and the frame loop
  useEffect(() => {
    const box = boxRef.current;
    const content = loadContent();
    if (!box || !content.has(first)) return;
    // a canvas of its own per mount, so its GL context can be let go of on the way out
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    box.prepend(canvas);
    const settings = loadSettings();
    const quality = settings.quality;
    const demo = new WeaponDemo(content, first);
    demoRef.current = demo;
    let r: Renderer | null = null;
    let disposed = false;
    let raf = 0;
    let last = -1;
    let acc = 0;
    let ro: ResizeObserver | undefined;
    const frame = (now: number) => {
      if (!r) return;
      raf = requestAnimationFrame(frame);
      // never sooner than 10 ms after the last frame (even pacing on 120 Hz screens)
      if (last >= 0 && now - last < 10) return;
      const wall = last < 0 ? 0 : now - last;
      last = now;
      if (!pausedRef.current) {
        acc += Math.min(wall, STEP_MS * MAX_STEPS);
        let n = 0;
        while (acc >= STEP_MS && n < MAX_STEPS) {
          demo.step();
          acc -= STEP_MS;
          n++;
        }
        if (n === MAX_STEPS) acc = 0;
      }
      r.camera.update(Math.min(wall, 100));
      r.render(demo.tick + acc / STEP_MS);
    };
    setError(null);
    void loadRenderer('pixel', demo.world.grid.width, demo.world.grid.height)
      .then((renderer) => {
        if (disposed) return;
        renderer.mount(canvas, demo, {
          quality,
          theme: settings.theme,
          palette: paletteOf(content),
          shake: settings.shake,
          dayNight: false,
          chatter: false,
          catchUp: 2,
        });
        r = renderer;
        const size = () => {
          const rect = box.getBoundingClientRect();
          renderer.resize(rect.width, rect.height, renderDpr(quality, window.devicePixelRatio));
        };
        size();
        ro = new ResizeObserver(size);
        ro.observe(box);
        raf = requestAnimationFrame(frame);
      })
      .catch((e: unknown) => setError((e as Error).message));
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && r) {
        last = -1;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      ro?.disconnect();
      r?.unmount();
      r = null;
      demoRef.current = null;
      // browsers keep only a few GL contexts: let this one go with the window
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [first]);

  // stepping to another weapon: the same renderer plays it as the next "round"
  useEffect(() => {
    if (weapon) demoRef.current?.setWeapon(weapon);
    boxRef.current?.querySelector('canvas')?.setAttribute('aria-label', label);
  }, [weapon, label]);

  if (!item) return null;
  const color = categoryColor(item.category);
  return (
    <div
      className="preview-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-name"
        style={{ '--cat': color } as CSSProperties}
        data-testid="weapon-preview"
      >
        <div className="preview-view" ref={boxRef}>
          {error && <p className="preview-error">Preview not available: {error}</p>}
          <button
            className="preview-pause"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? 'Play preview' : 'Pause preview'}
            data-testid="preview-pause"
          >
            {paused ? '▶' : '❚❚'}
          </button>
        </div>
        <div className="preview-info">
          <header className="preview-head">
            <h2 id="preview-name">
              {item.name}
              {item.isNew && <span className="new-badge">New</span>}
            </h2>
            <button
              ref={closeRef}
              className="preview-close"
              onClick={onClose}
              aria-label="Close preview"
              data-testid="preview-close"
            >
              ✕
            </button>
          </header>
          <p className="preview-stats">
            <span className="cat">{categoryLabel(item.category)}</span>
            {item.damage ? <span className="stat"> · {item.damage} dmg</span> : null}
            {item.blast ? <span className="stat"> · blast {item.blast}</span> : null}
          </p>
          <p className="preview-text">{item.description}</p>
          <div className="preview-foot">
            <button
              className="preview-step"
              onClick={() => onIndex(index - 1)}
              disabled={index <= 0}
              aria-label="Previous weapon"
              data-testid="preview-prev"
            >
              ◀
            </button>
            {buy(item)}
            <button
              className="preview-step"
              onClick={() => onIndex(index + 1)}
              disabled={index >= items.length - 1}
              aria-label="Next weapon"
              data-testid="preview-next"
            >
              ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
