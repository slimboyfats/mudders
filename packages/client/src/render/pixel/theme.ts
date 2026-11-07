/**
 * Pixel-renderer look per theme id (§2a). Themes are `theme.*` content items (sky, light, ambient
 * weather, wet/snow surface, scanlines); the client converts them to this shape and hands them to
 * the renderer with the palette. Unknown ids fall back to the default dusk look.
 */
export type AmbientKind = 'none' | 'rain' | 'snow' | 'embers' | 'stars' | 'dust';

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
  ambient: { kind: AmbientKind; density: number; color: number };
  /** Exposed ground darkened and glinting, 0–1. */
  wet: number;
  /** Snow settled on exposed ground, 0–1. */
  snow: number;
  /** Scanline darkening, 0–1. */
  scanlines: number;
  /** Sky lightning every N ticks on average; 0 = never. */
  flicker: number;
  /** Shaded pixel clouds; cover 0 = none. */
  clouds: { cover: number; light: number; shadow: number };
  /** Parallax silhouettes, far to near (0–3). */
  ranges: number[];
  /** Grass colour on topsoil materials; -1 = none. */
  grass: number;
  /** Tint multiplied into still ground (0xffffff = none). */
  ground: number;
  /** Flower specks in the grass, 0–1. */
  flowers: number;
}

export const DEFAULT_THEME: PixelTheme = {
  skyTop: 0x0b1029,
  skyBottom: 0x5d3d63,
  letterbox: 0x07060a,
  light: 0x3a2c18,
  grain: 0.14,
  vignette: 0.28,
  trail: 0xffe2b8,
  ambient: { kind: 'stars', density: 60, color: 0xe8e0ff },
  wet: 0,
  snow: 0,
  scanlines: 0,
  flicker: 0,
  clouds: { cover: 0, light: 0xffffff, shadow: 0x808080 },
  ranges: [],
  grass: -1,
  ground: 0xffffff,
  flowers: 0,
};

/** The subset of a `theme.*` manifest the renderer reads. */
export interface ThemeData {
  sky: { top: string; bottom: string };
  letterbox: string;
  light: string;
  trail: string;
  grain: number;
  vignette: number;
  ambient: { kind: AmbientKind; density: number; color: string };
  wet: number;
  snow: number;
  scanlines: number;
  flicker: number;
  scenery: {
    clouds?: { cover: number; light: string; shadow: string } | undefined;
    ranges: string[];
    grass?: string | undefined;
    ground?: string | undefined;
    flowers?: number | undefined;
  };
}

const hex = (s: string): number => parseInt(s.slice(1), 16);

export function themeFrom(m: ThemeData): PixelTheme {
  return {
    skyTop: hex(m.sky.top),
    skyBottom: hex(m.sky.bottom),
    letterbox: hex(m.letterbox),
    light: hex(m.light),
    grain: m.grain,
    vignette: m.vignette,
    trail: hex(m.trail),
    ambient: { kind: m.ambient.kind, density: m.ambient.density, color: hex(m.ambient.color) },
    wet: m.wet,
    snow: m.snow,
    scanlines: m.scanlines,
    flicker: m.flicker,
    clouds: m.scenery.clouds
      ? {
          cover: m.scenery.clouds.cover,
          light: hex(m.scenery.clouds.light),
          shadow: hex(m.scenery.clouds.shadow),
        }
      : DEFAULT_THEME.clouds,
    ranges: m.scenery.ranges.slice(0, 3).map(hex),
    grass: m.scenery.grass ? hex(m.scenery.grass) : -1,
    ground: m.scenery.ground ? hex(m.scenery.ground) : 0xffffff,
    flowers: m.scenery.flowers ?? 0,
  };
}

export function pixelTheme(
  id: string,
  themes: Readonly<Record<string, PixelTheme>> | undefined,
): PixelTheme {
  return themes && Object.hasOwn(themes, id) ? themes[id]! : DEFAULT_THEME;
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

/** Blend two 0xRRGGBB colours: `k` = 0 gives `a`, 1 gives `b`. */
export function mix(a: number, b: number, k: number): number {
  const ch = (s: number): number =>
    Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const AMBIENT_KINDS: readonly AmbientKind[] = ['none', 'rain', 'snow', 'embers', 'stars', 'dust'];

/**
 * The theme as the match weather shows it: the weather's precipitation replaces the theme's own
 * ambient particles, and rain wets the ground at least as much as the weather says. Clear = as is.
 */
export function withWeather(
  th: PixelTheme,
  w: { kind: string; density: number; color: string; wet: number } | undefined,
): PixelTheme {
  if (!w) return th;
  const kind = AMBIENT_KINDS.find((k) => k === w.kind) ?? 'none';
  return {
    ...th,
    ambient: { kind, density: w.density, color: hex(w.color) },
    wet: Math.max(th.wet, w.wet),
  };
}

/** Blend two 0xRRGGBB colours, `k` of the way from `a` to `b`. */
function mixRgb(a: number, b: number, k: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 0xff;
    const y = (b >> s) & 0xff;
    return Math.round(x + (y - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/** Where the land and sky lean in scorching air (dry, dusty) and in freezing air (frosted, pale). */
const HOT = {
  skyTop: 0xc89a5a,
  skyBottom: 0xe8c48a,
  grass: 0xbfa24e,
  ground: 0xffe2b0,
  range: 0xb08858,
  cloud: 0xf0d8a8,
  shadow: 0xa8845a,
};
const COLD = {
  skyTop: 0x9eacbc,
  skyBottom: 0xdde4ec,
  grass: 0xc4d8dc,
  ground: 0xe4eeff,
  range: 0xc8d2de,
  cloud: 0xffffff,
  shadow: 0x9aa6b4,
};

/**
 * The theme as the air temperature leaves it (§3.4): `heat`/`chill` are 0…1 storm strengths. Heat
 * dries the grass to straw and fills the sky with dust; frost pales the grass and greys the sky,
 * so a sandstorm or snowstorm sits in a land that matches it. Quantise k before calling, so the
 * scenery cache isn't redrawn every tick.
 */
export function withTemperature(th: PixelTheme, heat: number, chill: number): PixelTheme {
  const hot = heat > 0;
  const k = Math.min(1, hot ? heat : chill);
  if (k <= 0) return th;
  const c = hot ? HOT : COLD;
  const sky = k * 0.75;
  return {
    ...th,
    skyTop: mixRgb(th.skyTop, c.skyTop, sky),
    skyBottom: mixRgb(th.skyBottom, c.skyBottom, sky),
    grass: th.grass < 0 ? th.grass : mixRgb(th.grass, c.grass, k * 0.85),
    ground: mixRgb(th.ground, c.ground, k * 0.6),
    ranges: th.ranges.map((r) => mixRgb(r, c.range, k * 0.55)),
    clouds: {
      ...th.clouds,
      light: mixRgb(th.clouds.light, c.cloud, k * 0.6),
      shadow: mixRgb(th.clouds.shadow, c.shadow, k * 0.6),
    },
    flowers: th.flowers * (1 - k),
  };
}
