import type { ResolvedContent } from '@mudders/sim';
import { themeFrom, type PixelTheme } from '../render/pixel/theme';
import type { MaterialLook, RenderPalette, ShellLook, TankLook } from '../render/types';

/** Renderer palette from content: material colours (`meta.color`), material looks, themes, tanks. */
export function paletteFrom(content: ResolvedContent): RenderPalette {
  const materials = new Uint32Array(256);
  const looks: MaterialLook[] = [];
  for (const m of content.list('material')) {
    materials[m.cell] = parseHex(m.meta.color, 0xff00ff);
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
      });
    }
  }
  const themes: Record<string, PixelTheme> = {};
  for (const t of content.list('theme')) themes[t.id] = themeFrom(t);
  const tanks: Record<string, TankLook> = {};
  for (const t of content.list('tank'))
    tanks[t.id] = { sprite: t.look.sprite, barrel: t.look.barrel };
  const shells: Record<string, ShellLook> = {};
  for (const w of content.list('weapon')) {
    if (w.look) shells[w.id] = { shell: w.look.shell, trail: w.look.trail, size: w.look.size };
  }
  return { materials, looks, themes, tanks, shells };
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
