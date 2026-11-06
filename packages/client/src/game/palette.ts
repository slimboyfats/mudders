import type { ResolvedContent } from '@mudders/sim';
import { themeFrom, type PixelTheme } from '../render/pixel/theme';
import type { MaterialLook, RenderPalette } from '../render/types';

/** Renderer palette from content: material colours (`meta.color`), material looks and themes. */
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
      });
    }
  }
  const themes: Record<string, PixelTheme> = {};
  for (const t of content.list('theme')) themes[t.id] = themeFrom(t);
  return { materials, looks, themes };
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
