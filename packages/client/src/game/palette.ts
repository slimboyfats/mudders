import type { ResolvedContent } from '@mudders/sim';
import { themeFrom, type PixelTheme } from '../render/pixel/theme';
import type { MaterialLook, RenderPalette, ShellLook, TankLook } from '../render/types';

/** Renderer palette from content: material colours (`meta.color`), material looks, themes, tanks. */
export function paletteFrom(content: ResolvedContent): RenderPalette {
  const materials = new Uint32Array(256);
  const looks: MaterialLook[] = [];
  const liquids: number[] = [];
  const hotLiquids: number[] = [];
  const heavyLiquids: number[] = [];
  for (const m of content.list('material')) {
    materials[m.cell] = parseHex(m.meta.color, 0xff00ff);
    // cold liquids splash; lava and burning liquids get their own fire looks instead
    if (m.settle === 'flow' && !m.look?.hot && !m.look?.flames) liquids.push(m.cell);
    // lava's surface glows and bubbles
    if (m.settle === 'flow' && m.look?.hot) hotLiquids.push(m.cell);
    // thick liquids that slide instead of flowing: tar, wet clay
    if (m.settle === 'slide' && !m.look?.hot && !m.look?.flames) heavyLiquids.push(m.cell);
    if (m.look) {
      looks.push({
        cell: m.cell,
        cycle: (m.look.cycle ?? []).map((c) => parseHex(c, 0xff00ff)),
        ticks: m.look.cycleTicks,
        hot: m.look.hot,
        topsoil: m.look.topsoil,
        flames: m.look.flames,
        char: m.look.char,
        glint: m.look.glint,
        ...(m.look.sway !== undefined ? { sway: m.look.sway } : {}),
        ...(m.look.limb ? { limb: true } : {}),
        ...(m.settle === 'gas' ? { cover: m.look.cover } : {}),
        ...(m.look.emit ? { emit: parseHex(m.look.emit, 0xffffff) } : {}),
      });
    } else if (m.settle === 'gas') {
      looks.push({ cell: m.cell, cycle: [], ticks: 1, hot: false, cover: 1 });
    }
  }
  const themes: Record<string, PixelTheme> = {};
  for (const t of content.list('theme')) themes[t.id] = themeFrom(t);
  const tanks: Record<string, TankLook> = {};
  for (const t of content.list('tank'))
    tanks[t.id] = { sprite: t.look.sprite, barrel: t.look.barrel };
  const shells: Record<string, ShellLook> = {};
  const colors = trailColors(content);
  for (const w of content.list('weapon')) {
    const look: ShellLook = w.look
      ? { shell: w.look.shell, trail: w.look.trail, size: w.look.size }
      : { shell: 'spark', trail: true };
    const c = colors.get(w.id);
    if (c !== undefined) look.trailColor = c;
    shells[w.id] = look;
  }
  return { materials, looks, themes, tanks, shells, liquids, hotLiquids, heavyLiquids };
}

/**
 * Shell trail colour per weapon type (`meta.category`), in hard saturated hues that read on both
 * day and night skies. Categories not listed (and weapons with none) keep the theme's trail colour.
 */
export const TRAIL_BY_CATEGORY: Readonly<Record<string, number>> = {
  explosive: 0xffb040,
  incendiary: 0xff5020,
  digger: 0xd09050,
  earthmover: 0xa87a44,
  roller: 0xc4ccd4,
  guided: 0x50f070,
  beam: 0x60e0ff,
  'terrain-dynamics': 0xa070ff,
  weird: 0xff50c0,
  mine: 0xe04060,
  support: 0x60f090,
};

/**
 * Trail colours by weapon id. Submunitions have no colour of their own: they take the colour of
 * the weapon that spawns them (MIRV warheads trail like the MIRV), following spawn and mine chains.
 */
export function trailColors(content: ResolvedContent): Map<string, number> {
  const out = new Map<string, number>();
  const weapons = content.list('weapon');
  for (const w of weapons) {
    const c = TRAIL_BY_CATEGORY[w.meta.category ?? ''];
    if (c !== undefined) out.set(w.id, c);
  }
  // a few passes reach chains like nuke → nuke-core; the first parent in pack order wins
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const w of weapons) {
      const c = out.get(w.id);
      if (c === undefined) continue;
      for (const imp of [...w.impact, ...w.pulse]) {
        const kids =
          'spawn' in imp
            ? typeof imp.spawn.weapon === 'string'
              ? [imp.spawn.weapon]
              : imp.spawn.weapon
            : 'mine' in imp
              ? [imp.mine.weapon]
              : [];
        for (const k of kids) {
          if (out.has(k)) continue;
          out.set(k, c);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Theme ids with display names, for the settings picker. */
export function themeChoices(content: ResolvedContent): { id: string; name: string }[] {
  return content.list('theme').map((t) => ({ id: t.id, name: t.meta.name }));
}

/** Parse "#rrggbb" to 0xRRGGBB, or return the fallback. */
export function parseHex(color: string | undefined, fallback: number): number {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return parseInt(color.slice(1), 16);
}
