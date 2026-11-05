import type { ResolvedContent } from '@mudders/sim';
import type { RenderPalette } from '../render/types';

/** Renderer palette from material manifests (`meta.color`). */
export function paletteFrom(content: ResolvedContent): RenderPalette {
  const materials = new Uint32Array(256);
  for (const m of content.list('material')) materials[m.cell] = parseHex(m.meta.color, 0xff00ff);
  return { materials };
}

/** Parse "#rrggbb" to 0xRRGGBB, or return the fallback. */
export function parseHex(color: string | undefined, fallback: number): number {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return parseInt(color.slice(1), 16);
}
