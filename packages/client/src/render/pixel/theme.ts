/**
 * Pixel-renderer look per theme id (§2a). Themes become `theme.*` content items with palettes and
 * ambient effects in milestone 6; until then the renderer carries the default look and falls back
 * to it for unknown ids.
 */
export interface PixelTheme {
  skyTop: number;
  skyBottom: number;
  /** Outside the map. */
  letterbox: number;
  /** Rim light added to lit terrain edges. */
  light: number;
  /** Per-cell brightness grain, ±fraction. */
  grain: number;
  vignette: number;
  trail: number;
}

export const DEFAULT_THEME: PixelTheme = {
  skyTop: 0x0b1029,
  skyBottom: 0x5d3d63,
  letterbox: 0x07060a,
  light: 0x3a2c18,
  grain: 0.14,
  vignette: 0.28,
  trail: 0xffe2b8,
};

const THEMES: Record<string, PixelTheme> = {
  'theme.default': DEFAULT_THEME,
};

export function pixelTheme(id: string): PixelTheme {
  return Object.hasOwn(THEMES, id) ? THEMES[id]! : DEFAULT_THEME;
}

/** Okabe–Ito colour-blind-safe player colours (§8). */
export const PLAYER_COLORS = [
  0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7, 0xffffff,
] as const;

export function playerColor(p: number): number {
  return PLAYER_COLORS[p % PLAYER_COLORS.length]!;
}

/** Scale an 0xRRGGBB colour's brightness (k > 1 lightens, clamps at white). */
export function shade(rgb: number, k: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
}
