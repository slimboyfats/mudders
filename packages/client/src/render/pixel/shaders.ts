/**
 * GLSL ES 3.00 shaders for the pixel renderer, inlined as strings (§9). Kept to features
 * SwiftShader supports: no derivatives tricks, no float render targets, bounded loops.
 */

/** Shared GLSL helpers: integer hash, 4×4 ordered dither, value noise on whole cells. */
const NOISE = `
float hash(ivec2 c) {
  uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h & 1023u) / 1023.0;
}
const int BAYER[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
float bayer(ivec2 c) { return (float(BAYER[(c.y & 3) * 4 + (c.x & 3)]) + 0.5) / 16.0; }
// ordered dither squeezed into a narrow seam between two tones (wide dither reads as cloth)
float narrow(ivec2 c) { return 0.5 + (bayer(c) - 0.5) * 0.3; }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  ivec2 a = ivec2(i);
  float v00 = hash(a), v10 = hash(a + ivec2(1, 0));
  float v01 = hash(a + ivec2(0, 1)), v11 = hash(a + ivec2(1, 1));
  return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}
float fbm(vec2 p) {
  return (vnoise(p) * 0.5 + vnoise(p * 2.03 + 17.0) * 0.25 + vnoise(p * 4.01 + 41.0) * 0.125 +
    vnoise(p * 8.07 + 73.0) * 0.0625) / 0.9375;
}
float noise1(float x, int seed) { return vnoise(vec2(x, float(seed) * 13.0 + 0.5)); }
`;

/** Fullscreen triangle; `v_uv` is 0..1 with y up. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Background in one fullscreen pass: letterbox, sky gradient (with stateless twinkling stars),
 * the cached terrain colours at the camera's integer scale (nearest-neighbour), palette cycling
 * for animated materials, heat haze over hot ones, sky tint and vignette. One pass keeps software
 * GL (SwiftShader capture) fast. Everything is evaluated per map cell, so it stays on the grid.
 *
 * `u_look` is 256×9: row 0 per material = (cycle length, ticks per step, hot, 0) as bytes,
 * rows 1–8 the cycle colours.
 */
export const BG_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
in vec2 v_uv;
uniform sampler2D u_color;
uniform usampler2D u_terrain;
uniform usampler2D u_coat;
uniform sampler2D u_look;
uniform sampler2D u_palette;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_map;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_letterbox;
uniform vec3 u_flash;
uniform float u_vignette;
uniform float u_time;
uniform float u_haze;
uniform float u_anim;
uniform float u_stars;
uniform vec3 u_starColor;
uniform sampler2D u_scenery; // sky, clouds and ranges per 2×2 cells; a = open sky
uniform vec4 u_grass;        // rgb, enabled
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
vec4 look(uint m) { return texelFetch(u_look, ivec2(int(m), 0), 0); }
${NOISE}
bool topsoil(uint m) { return m != 0u && look(m).a > 0.5; }
// one cycle step for a cell of animated material m: hard diagonal bands that crawl over time
vec3 cycled(uint m, ivec2 c, vec3 shaded) {
  vec4 l = look(m);
  int n = int(l.r * 255.0 + 0.5);
  if (n < 2) return shaded;
  float ticks = max(1.0, l.g * 255.0);
  int st = int(floor(u_time / ticks)) + (c.x + c.y * 2) / 5 + (hash(c) > 0.86 ? 1 : 0);
  vec3 col = texelFetch(u_look, ivec2(int(m), 1 + st % n), 0).rgb;
  vec3 base = texelFetch(u_palette, ivec2(int(m), 0), 0).rgb;
  // keep the cached lighting (lit rim, depth): scale by how bright the shaded cell is vs its base
  float k = dot(shaded, vec3(1.0)) / max(dot(base, vec3(1.0)), 0.05);
  return col * clamp(k, 0.5, 1.6);
}
void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_view;
  vec2 m = (px - u_origin) / u_scale;
  vec3 c;
  if (m.x < 0.0 || m.y < 0.0 || m.x >= u_map.x || m.y >= u_map.y) {
    c = u_letterbox;
  } else {
    ivec2 cell = ivec2(floor(m));
    // heat haze: air over a hot material shimmers sideways by whole cells
    float heat = 0.0;
    if (u_haze > 0.0) {
      for (int k = 1; k <= 10; k++) {
        uint b = mat(cell + ivec2(0, k));
        if (b == 0u) continue;
        if (look(b).b > 0.5) heat = 1.0 - float(k) / 11.0;
        break;
      }
      if (heat > 0.0) {
        float w = sin(u_time * 0.31 + float(cell.y) * 0.9) * 1.6 * heat * u_haze;
        cell.x = clamp(cell.x + int(floor(w + 0.5)), 0, int(u_map.x) - 1);
      }
    }
    // the cache was rendered through a y-flipped viewport: map row r lives in texel row H-1-r
    vec4 t = texelFetch(u_color, ivec2(cell.x, int(u_map.y) - 1 - cell.y), 0);
    if (t.a > 0.5) {
      c = t.rgb;
      if (u_anim > 0.0) {
        uint mm = mat(cell);
        uint cm = texelFetch(u_coat, cell, 0).r;
        if (cm != 0u && look(cm).r > 0.0) c = mix(c, cycled(cm, cell, c), 0.8);
        else if (look(mm).r > 0.0) c = cycled(mm, cell, c);
      }
    } else {
      float k = clamp(float(cell.y) / u_map.y, 0.0, 1.0);
      vec4 sc = texelFetch(u_scenery, cell >> 1, 0);
      c = sc.rgb;
      // stars: a few open sky cells high up twinkle on and off in whole steps
      if (u_stars > 0.0 && k < 0.6 && sc.a > 0.5) {
        float h = hash(cell + ivec2(31, 17));
        if (h > 1.0 - u_stars) {
          float tw = hash(cell + ivec2(int(u_time / 23.0 + h * 97.0), 5));
          c = mix(c, u_starColor, (tw > 0.25 ? 0.75 : 0.3) * (1.0 - k / 0.6));
        }
      }
      // grass tufts standing in the air over topsoil
      if (u_grass.a > 0.0) {
        uint b1 = mat(cell + ivec2(0, 1));
        float h = hash(cell + ivec2(5, 9));
        if (topsoil(b1) && texelFetch(u_coat, cell + ivec2(0, 1), 0).r == 0u && h > 0.42) {
          c = u_grass.rgb * (h > 0.8 ? 1.12 : 0.92);
        } else if (b1 == 0u && topsoil(mat(cell + ivec2(0, 2))) && hash(cell + ivec2(5, 10)) > 0.86 &&
                   hash(cell + ivec2(2, 3)) > 0.45) {
          c = u_grass.rgb * 0.8;
        }
      }
      c += u_flash;
    }
    // warm dither in the hottest air
    if (heat > 0.55 && ((cell.x + cell.y + int(u_time / 4.0)) & 3) == 0) c += vec3(0.07, 0.025, 0.0);
  }
  if (u_vignette > 0.0) {
    vec2 q = v_uv - 0.5;
    c *= 1.0 - u_vignette * dot(q, q) * 1.6;
  }
  o = vec4(c, 1.0);
}`;

/**
 * Painted scenery behind the battlefield, cached per 2×2 map cells (one "art pixel") and redrawn
 * only when the clouds step or the camera's parallax offsets change: banded sky gradient, shaded
 * cumulus in two decks, and up to three parallax ranges (faceted mountains, hills, a pine
 * treeline) with valley mist in hard dithered bands. Alpha marks open sky (stars may show).
 */
export const SCENERY_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform vec2 u_size;         // texels
uniform vec2 u_map;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec2 u_cloud;        // cover, drift (cells)
uniform vec3 u_cloudLight;
uniform vec3 u_cloudShadow;
uniform vec3 u_ranges[3];    // far to near
uniform int u_rangeCount;
uniform float u_horizon;     // mean ground row
uniform vec2 u_cam;          // camera centre in map cells
out vec4 o;
${NOISE}
// cumulus built from puffs on a flat base: per slot along x, a cloud of up to seven overlapping
// discs (biggest in the middle) with a noisy rim. Returns (local x, local y, coverage, base gap)
// of the front-most puff covering p, or coverage 0.
vec4 cumulus(vec2 p, float slotW, float baseY, float size, int seed) {
  float cover = u_cloud.x;
  float j0 = floor(p.x / slotW);
  vec4 best = vec4(0.0);
  for (int s = -1; s <= 1; s++) {
    float j = j0 + float(s);
    ivec2 js = ivec2(int(j), seed);
    if (hash(js) > cover * 1.25) continue;
    float w = slotW * size * (0.55 + 0.6 * hash(js + ivec2(0, 1))) * (0.7 + 0.5 * cover);
    float cx = j * slotW + slotW * 0.5 + (hash(js + ivec2(0, 2)) - 0.5) * slotW * 0.4;
    float by = floor(baseY - hash(js + ivec2(0, 3)) * baseY * 0.25);
    if (p.y > by) continue;
    // cauliflower: a row of small billows along the base and a stack of rounder ones on top
    for (int i = 0; i < 12; i++) {
      bool top = i >= 7;
      float t = top ? float(i - 7) / 4.0 * 0.6 - 0.3 : float(i) / 6.0 - 0.5;
      t += (hash(js + ivec2(i + 1, 6)) - 0.5) * 0.08;
      float hr = hash(js + ivec2(i + 1, 4));
      float r = top ? w * (0.13 + 0.09 * hr) * (1.0 - abs(t) * 1.2) : w * (0.11 + 0.07 * hr) * (1.0 - abs(t) * 0.8);
      float lift = top ? w * (0.13 + 0.1 * hash(js + ivec2(i + 1, 7))) * (1.0 - abs(t) * 2.0) : 0.0;
      vec2 c = vec2(cx + t * w, by - r * (0.45 + 0.35 * hash(js + ivec2(i + 1, 5))) - lift);
      vec2 l = (p - c) / r;
      float rim = 1.0 + (vnoise(p / 6.0 + float(seed)) - 0.5) * 0.3;
      float k = rim - length(l);
      // the later (front) puff wins where they overlap, so lobes read as separate billows
      if (k > 0.0) best = vec4(l, 1.0, by - p.y);
    }
  }
  return best;
}
// shaded pixel cumulus in two decks: lit crowns toward the sun (up-left), shadowed bellies,
// three hard tones with ordered dither between light and mid
vec4 clouds(vec2 p, ivec2 tx, vec3 sky) {
  float cover = u_cloud.x;
  if (cover <= 0.0) return vec4(sky, 1.0);
  float hz = min(u_horizon, u_map.y * 0.85);
  float drift = floor(u_cloud.y / 2.0) * 2.0;
  float far = 0.0;
  vec2 q = vec2(p.x - floor((u_cam.x - u_map.x * 0.5) * 0.85 / 2.0) * 2.0 + drift, p.y);
  vec2 q2 = vec2(p.x - floor((u_cam.x - u_map.x * 0.5) * 0.9 / 2.0) * 2.0 + floor(drift * 0.5 / 2.0) * 2.0, p.y);
  vec4 cl = cumulus(q, 190.0, hz * 0.44, 1.0, 21);
  vec2 o = q;
  float slot = 190.0, base = hz * 0.44, size = 1.0;
  int seed = 21;
  if (cl.z == 0.0) {
    // the low deck: smaller, further, slower
    cl = cumulus(q2, 110.0, hz * 0.7, 0.8, 37);
    o = q2;
    slot = 110.0;
    base = hz * 0.7;
    size = 0.8;
    seed = 37;
    far = 1.0;
  }
  if (cl.z == 0.0) return vec4(sky, 1.0);
  // tones from the whole cloud's outline: a lit rim where the sun side (up-left) is open sky,
  // a mid body, the lower part of each billow shaded, and a dark rim along the flat base
  vec3 lo = mix(u_cloudLight, u_cloudShadow, 0.22);
  vec3 mid = mix(u_cloudLight, u_cloudShadow, 0.5);
  bool checker = ((tx.x + tx.y) & 1) == 0;
  vec3 c = mid;
  // four tones per billow: a bright cap toward the sun, a light body, a mid flank and a cool
  // shaded underside
  float dh = length(cl.xy + vec2(0.3, 0.42));
  if (dh < 0.5) c = u_cloudLight;
  else if (length(cl.xy + vec2(0.16, 0.22)) < 0.86) c = lo;
  else if (cl.y > 0.25) c = mix(mid, u_cloudShadow, 0.6);
  if (cumulus(o + vec2(-2.0, -4.0), slot, base, size, seed).z == 0.0) c = u_cloudLight;
  if (cl.w < 2.0 || (cl.w < 4.0 && checker)) c = u_cloudShadow;
  return vec4(mix(c, sky, far * 0.42), 0.0);
}
float lin1(float x, int seed) {
  float i = floor(x);
  return mix(hash(ivec2(int(i), seed)), hash(ivec2(int(i) + 1, seed)), x - i);
}
// one parallax silhouette: 0 mountains (straight facets), 1 rolling hills, 2 treeline
float rangeTop(float x, int style) {
  float H = u_map.y;
  float hz = u_horizon;
  if (style == 0) {
    float m = lin1(x / 70.0, 3) * 0.68 + lin1(x / 27.0, 5) * 0.24 + lin1(x / 9.0, 6) * 0.08;
    return hz + H * 0.06 - H * 0.36 * m * m;
  }
  if (style == 1) return hz + H * 0.04 - H * 0.16 * (noise1(x / 52.0, 7) * 0.75 + noise1(x / 17.0, 8) * 0.25);
  return hz + H * 0.08 - H * 0.1 * (noise1(x / 36.0, 11) * 0.8 + noise1(x / 11.0, 12) * 0.2);
}
vec4 ranges(vec2 p, ivec2 tx, vec4 c) {
  for (int i = 0; i < 3; i++) {
    if (i >= u_rangeCount) break;
    // with fewer ranges, the nearest keeps the treeline
    int style = i + 3 - u_rangeCount;
    float par = 0.25 + 0.2 * float(style);
    float lx = p.x - floor((u_cam.x - u_map.x * 0.5) * (1.0 - par) / 2.0) * 2.0;
    float ly = p.y - floor((u_cam.y - u_map.y * 0.5) * (1.0 - par) / 2.0) * 2.0;
    float top = floor(rangeTop(lx, style) / 2.0) * 2.0;
    vec3 rc = u_ranges[i];
    bool hit = ly >= top;
    if (!hit && style == 2) {
      // pines on the near ridge, every few art pixels
      float col = floor(lx / 8.0);
      float h = hash(ivec2(int(col), 77));
      if (h > 0.25) {
        float tx0 = col * 8.0 + 2.0 + floor(hash(ivec2(int(col), 78)) * 2.0) * 2.0;
        float th = 8.0 + floor(h * 7.0) * 2.0;
        float base = floor(rangeTop(tx0, style) / 2.0) * 2.0 + 2.0;
        float dy = base - ly;
        float hw = floor((th - dy) * 0.2 + 0.5) * 2.0;
        if (dy >= 0.0 && dy <= th && abs(lx - tx0) <= hw) {
          hit = true;
          top = base - th;
          rc *= lx < tx0 ? 1.0 : 0.84;
        }
      }
    }
    if (!hit) continue;
    float sl = rangeTop(lx + 1.0, style) - rangeTop(lx - 1.0, style);
    // faceted faces: slopes toward the sun lit, the others shaded; snowy light on the high peaks
    if (style == 0) {
      rc *= sl < 0.0 ? 1.18 : 0.8;
      // rock streaks running down the faces, and light caught on the high peaks
      float st = mod(lx * (sl < 0.0 ? 0.5 : -0.5) + ly, 10.0);
      if (st < 2.0 && hash(ivec2(int(lx) >> 2, 61)) > 0.4) rc *= 0.88;
      float peak = u_horizon - rangeTop(lx, style);
      float cap = 5.0 + floor(vnoise(vec2(lx / 6.0, 4.5)) * 7.0);
      if (peak > u_map.y * 0.13 && ly - top < cap) rc = mix(u_cloudLight, rc, sl < 0.0 ? 0.08 : 0.45);
    } else if (style == 1 && ly - top < 4.0 && sl < 0.0) rc *= 1.07;
    // mist pooling in the valleys: hard dithered bands toward the sky colour going down
    float k = clamp((ly - top) / (u_map.y * 0.2), 0.0, 1.0);
    float q = floor(k * 4.0 + bayer(tx)) / 4.0;
    c = vec4(mix(rc, c.rgb, q * (0.38 - 0.1 * float(style))), 0.0);
  }
  return c;
}
void main() {
  ivec2 tx = ivec2(floor(gl_FragCoord.xy));
  vec2 p = vec2(tx) * 2.0;   // map cells, y down (the target is drawn y-down via the texel row)
  float k = clamp(p.y / u_map.y, 0.0, 1.0);
  // banded gradient: 24 hard steps with a narrow ordered-dither seam between neighbours
  float q = floor((k * k * (3.0 - 2.0 * k)) * 24.0 + narrow(tx)) / 24.0;
  vec3 sky = mix(u_top, u_bottom, q);
  // pale haze over the horizon, in three soft steps
  float hz = min(u_horizon, u_map.y * 0.85);
  float hk = clamp((p.y - hz * 0.5) / (hz * 0.5), 0.0, 1.0);
  sky = mix(sky, mix(u_bottom, vec3(1.0), 0.3), floor(hk * 3.0 + narrow(tx)) / 3.0 * 0.55);
  // thin stratus streaks in the low sky
  if (u_cloud.x > 0.0 && p.y > hz * 0.4 && p.y < hz * 0.95 && (tx.y % 4) == 0) {
    float sx = p.x - floor((u_cam.x - u_map.x * 0.5) * 0.9 / 2.0) * 2.0 + floor(u_cloud.y * 0.25);
    if (vnoise(vec2(sx / 70.0, float(tx.y) * 0.37)) > 0.66) sky = mix(sky, u_cloudLight, 0.28);
  }
  vec4 c = clouds(p, tx, sky);
  o = ranges(p, tx, c);
}`;

/** Terrain quad covering the map rect; interpolates map coordinates. */
export const TERRAIN_VS = `#version 300 es
uniform vec2 u_view;     // viewport in device px
uniform vec2 u_origin;   // device px of map (0,0)
uniform float u_scale;   // device px per cell
uniform vec2 u_map;      // map size in cells
out vec2 v_map;
void main() {
  // one oversized triangle covering the unit square; fragments outside the map are discarded
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_map = p * u_map;
  vec2 px = u_origin + v_map * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

/**
 * Palette-lookup terrain shader (§2a): one cell = one grid pixel, nearest-neighbour. Shading only
 * lights and colours cells (per-cell grain, a lit top edge, darker overhangs, depth), never smooths.
 */
export const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
in vec2 v_map;
uniform usampler2D u_terrain;
uniform usampler2D u_coat;
uniform sampler2D u_palette;
uniform vec2 u_map;
uniform float u_grain;
uniform vec3 u_light;
uniform float u_wet;
uniform float u_snow;
uniform sampler2D u_look;
uniform vec4 u_grass;
uniform vec3 u_ground;       // theme tint multiplied into still ground
uniform float u_flowers;     // flower specks in the grass, 0–1
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
${NOISE}
vec3 turf(vec3 gr, ivec2 ap, float k) {
  // strokes four art pixels long, staggered row to row, in three tones
  int sx = (ap.x + (ap.y & 3) * 3) >> 2;
  float h = hash(ivec2(sx, ap.y + 911));
  float t = h > 0.7 ? 1.08 : h > 0.3 ? 1.0 : 0.9;
  vec3 c = gr * vec3(0.78, 0.82, 0.86) * mix(0.82, 0.5, k) * t;
  return mix(c, c * vec3(0.9, 1.0, 1.15), k);
}
void main() {
  if (v_map.x < 0.0 || v_map.y < 0.0 || v_map.x >= u_map.x || v_map.y >= u_map.y) discard;
  ivec2 c = ivec2(floor(v_map));
  uint m = mat(c);
  if (m == 0u) discard;
  vec3 base = texelFetch(u_palette, ivec2(int(m), 0), 0).rgb;
  vec4 lk = texelFetch(u_look, ivec2(int(m), 0), 0);
  bool still = lk.r == 0.0;
  // texture works on "art pixels" of 2×2 cells so it reads as chunky pixel art; edges stay per cell
  ivec2 ap = c >> 1;
  float g = (hash(ap) - 0.5) * u_grain;
  // rows down to open air above (1 = surface), 0 = deeper than 32
  int sd = 0;
  for (int k = 1; k <= 32; k++) if (mat(c + ivec2(0, -k)) == 0u) { sd = k; break; }
  // lit surface: cells with air above, a softer second row
  float lit = sd == 1 ? 0.22 : sd == 2 ? 0.09 : 0.0;
  // overhang underside
  float under = mat(c + ivec2(0, 1)) == 0u && c.y < int(u_map.y) - 1 ? -0.16 : 0.0;
  // side faces facing open air
  float side = (mat(c + ivec2(-1, 0)) == 0u || mat(c + ivec2(1, 0)) == 0u) ? 0.05 : 0.0;
  // depth: by map row (cooler and darker going down) and by distance under the surface, in
  // dithered hard bands
  float deep = sd == 0 ? 1.0 : float(sd - 1) / 31.0;
  float band = floor(deep * 3.0 + narrow(ap)) / 3.0;
  float yk = clamp(v_map.y / u_map.y, 0.0, 1.0);
  float yb = floor(yk * 5.0 + narrow(ap)) / 5.0;
  float depth = -0.42 * yb - 0.14 * band;
  vec3 col = base * (1.0 + g + under + depth);
  col = mix(col, col * vec3(0.86, 0.9, 1.08), yb * 0.6);
  bool soil = still && lk.a > 0.5;
  if (still) {
    // mottled ground: two noise scales quantised to four tones with ordered dither between them
    vec2 fp = vec2(ap);
    float mot = vnoise(fp / 7.0) * 0.6 + vnoise(fp / 2.5 + 7.0) * 0.4;
    float tone = clamp(floor(mot * 4.0 + narrow(ap) - 0.5) - 1.5, -1.5, 1.5);
    col *= 1.0 + 0.075 * tone;
    // strata: wavy seams, lighter and darker in turn
    float sy = float(ap.y) + floor(vnoise(vec2(float(ap.x) / 14.0, 3.5)) * 6.0);
    float seam = mod(sy, 11.0);
    // seams come and go along their length so they read as layers, not a weave
    float run = hash(ivec2(ap.x / 9, int(floor(sy / 11.0)) + 300));
    if (run > 0.45 && seam < 1.0 && hash(ap + ivec2(11, 2)) > 0.15) col *= 0.86;
    else if (run > 0.45 && seam < 2.0 && hash(ap + ivec2(12, 2)) > 0.5) col *= 1.07;
    // pebbles: a lit top-left art pixel over a shaded one
    if (sd == 0 || sd > 10) {
      ivec2 pb = ap >> 1;
      if (hash(pb + ivec2(91, 7)) > 0.95) {
        ivec2 o2 = ap & 1;
        col *= o2.y == 0 ? (o2.x == 0 ? 1.22 : 1.08) : (o2.x == 0 ? 0.94 : 0.8);
      }
    }
    // topsoil: a dark rich band under the turf, fading through dither into the subsoil
    if (soil && sd > 0 && sd <= 30) {
      float k = sd <= 22 ? 1.0 : (bayer(ap) > float(sd - 22) / 9.0 ? 1.0 : 0.0);
      col = mix(col, col * vec3(0.72, 0.66, 0.62), k);
    }
  }
  float rim = lit + side;
  if (soil && u_grass.a > 0.0 && sd > 9 && sd <= 24) {
    // turf: the hillside under the grass, muted green in short horizontal strokes, darkening
    // with depth and dithering into the topsoil at its foot
    float k = float(sd - 10) / 14.0;
    if (sd < 19 || bayer(ap) > (float(sd) - 19.0) / 6.0) col = turf(u_grass.rgb, ap, k);
  }
  if (soil && u_grass.a > 0.0 && sd > 0 && sd <= 9) {
    // grass: lit blade tips, a body of vertical blade strokes in three tones, a shaded base and
    // roots dithered into the topsoil
    float patchy = vnoise(vec2(float(ap.x) / 9.0, 1.5));
    vec3 gr = u_grass.rgb;
    if (patchy > 0.66) gr = mix(gr, gr * vec3(1.22, 1.14, 0.62), 0.6);
    else if (patchy < 0.3) gr *= vec3(0.86, 0.96, 1.04);
    // blades: each column of cells carries its own length and shade
    float bl = hash(ivec2(c.x, 401));
    float stroke = bl > 0.66 ? 1.1 : bl > 0.33 ? 0.97 : 0.86;
    float len = 3.0 + floor(hash(ivec2(c.x, 402)) * 4.0);
    float h = hash(c + ivec2(3, 8));
    if (sd == 1) col = gr * (h > 0.6 ? 1.3 : 1.16);
    else if (float(sd) <= len) col = gr * stroke;
    else if (float(sd) <= len + 2.0) col = gr * (stroke * 0.72);
    else if (h > 0.55) col = gr * 0.6;
    else col = turf(gr, ap, 0.0);
    // flowers: a single bright art pixel with a darker cell under it
    if (u_flowers > 0.0 && sd <= 3) {
      float f = hash(ivec2(c.x >> 1, 503));
      if (f > 1.0 - u_flowers * 0.08) {
        float pick = hash(ivec2(c.x >> 1, 504));
        vec3 fc = pick > 0.66 ? vec3(0.96, 0.93, 0.82) : pick > 0.33 ? vec3(0.95, 0.78, 0.25) : vec3(0.86, 0.3, 0.24);
        if (sd <= 2) col = fc * (sd == 1 ? 1.0 : 0.8);
      }
    }
    rim *= 0.35;
  }
  if (still) col *= u_ground;
  col += u_light * rim;
  // animated materials (water, lava) are left to the cycling pass: no snow or wet sheen on them
  if (still && u_wet > 0.0) {
    // rain soaks the top few rows: darker, with glints on the surface
    int soak = 0;
    for (int k = 1; k <= 6; k++) if (mat(c + ivec2(0, -k)) == 0u) { soak = k; break; }
    if (soak > 0) {
      // soaked rows go dark and cold, the rim light dulls to a wet sheen
      col = (col - u_light * rim) * (1.0 - u_wet * (0.5 - 0.05 * float(soak)));
      col = mix(col, col * vec3(0.85, 0.92, 1.08), u_wet);
      if (soak == 1) col += vec3(0.05, 0.06, 0.09) * u_wet;
      if (soak == 1 && hash(c + ivec2(3, 11)) > 0.7) col += vec3(0.14, 0.16, 0.2) * u_wet;
    }
  }
  if (still && u_snow > 0.0) {
    // snow cap: two full rows and a ragged third, also on steep faces open to the sky diagonally
    float h = hash(c + ivec2(13, 5));
    int sn = 0;
    for (int k = 1; k <= 3; k++) {
      if (mat(c + ivec2(0, -k)) == 0u || mat(c + ivec2(-1, -k)) == 0u && mat(c + ivec2(1, -k)) == 0u) { sn = k; break; }
    }
    if (sn == 0 && (mat(c + ivec2(-1, -1)) == 0u || mat(c + ivec2(1, -1)) == 0u)) sn = 2;
    if (sn == 1 || sn == 2 || (sn == 3 && h > 0.55)) {
      vec3 snow = h > 0.5 ? vec3(0.93, 0.95, 1.0) : vec3(0.8, 0.85, 0.94);
      if (sn == 1) snow += 0.04;
      col = mix(col, snow, u_snow);
    }
  }
  // coating overlay (§4b): the coating's colour laid over the cell in a hard 2-tone dither, with a
  // one-cell sheen band on exposed surfaces; stays on the pixel grid
  uint cm = texelFetch(u_coat, c, 0).r;
  if (cm != 0u) {
    vec3 cc = texelFetch(u_palette, ivec2(int(cm), 0), 0).rgb;
    float k = ((c.x + c.y) & 1) == 0 ? 0.78 : 0.62;
    col = mix(col, cc * (1.0 + depth), k);
    if (lit > 0.2 && hash(c + ivec2(7, 3)) > 0.55) col += vec3(0.16, 0.15, 0.2);
  }
  o = vec4(col, 1.0);
}`;

/**
 * Instanced quads in map space: rects, rotated rects, soft glows and discs. Per instance:
 * a_pos (centre), a_size (w,h in cells), a_rot (radians), a_color (rgba), a_shape.
 */
export const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_size;
layout(location = 2) in float a_rot;
layout(location = 3) in vec4 a_color;
layout(location = 4) in float a_shape;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
out vec2 v_local;
out vec4 v_color;
flat out int v_shape;
flat out vec3 v_blob; // centre (map cells) + radius, for pixel blobs
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 l = corner - 0.5;
  v_local = l * 2.0;
  v_color = a_color;
  v_shape = int(a_shape + 0.5);
  v_blob = vec3(a_pos, a_size.x * 0.5);
  float c = cos(a_rot), s = sin(a_rot);
  vec2 off = vec2(l.x * a_size.x, l.y * a_size.y);
  off = vec2(off.x * c - off.y * s, off.x * s + off.y * c);
  vec2 px = u_origin + (a_pos + off) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

export const QUAD_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_color;
flat in int v_shape;
flat in vec3 v_blob;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
out vec4 o;
void main() {
  float a = 1.0;
  float d = length(v_local);
  if (v_shape == 1) {        // soft glow
    a = clamp(1.0 - d, 0.0, 1.0);
    a = a * a;
  } else if (v_shape == 2) { // disc with a 1px-ish soft edge
    if (d > 1.0) discard;
    a = clamp((1.0 - d) * 6.0, 0.0, 1.0);
  } else if (v_shape == 3) { // ring
    a = clamp(1.0 - abs(d - 0.85) * 8.0, 0.0, 1.0);
  } else if (v_shape == 4) { // pixel blob: snapped to map cells, hard bands, ordered dither
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    ivec2 ic = ivec2(cell) & 1;
    float bayer = float(ic.x * 2 + ic.y * 3 & 3) / 4.0; // 2x2 ordered dither
    if (k < 0.45) a = 1.0;
    else if (k < 0.75) a = 0.6;
    else a = bayer < 0.5 ? 0.35 : 0.0;
    if (a <= 0.0) discard;
  }
  o = vec4(v_color.rgb * v_color.a * a, v_color.a * a); // premultiplied
}`;

export const MAX_RIPPLES = 8;

/**
 * Post-process (§2a), only while needed: shockwave distortion (pixels pushed by a moving lens
 * band, evaluated per map cell and displaced by whole cells), impact flash tint, screen shake,
 * chromatic split on nukes and theme scanlines. Ripples: xy = centre (device px, y down), z = radius,
 * w = strength; widths in u_rippleW.
 */
export const POST_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_view;
uniform vec2 u_shake;
uniform int u_rippleCount;
uniform vec4 u_ripple[${MAX_RIPPLES}];
uniform float u_rippleW[${MAX_RIPPLES}];
uniform vec3 u_tint;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_split;
uniform float u_scan;
out vec4 o;
void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_view + u_shake;
  // evaluate the wave per map cell so the ripple reads as pixels, like the terrain
  vec2 cellPx = u_origin + (floor((px - u_origin) / u_scale) + 0.5) * u_scale;
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= u_rippleCount) break;
    vec4 r = u_ripple[i];
    vec2 d = cellPx - r.xy;
    float dist = length(d);
    float w = u_rippleW[i];
    // a lens band (inner and outer edges eased in) that pulls the image toward the centre, so
    // terrain and sky visibly bulge and slide as the ring passes; no added light
    float band = smoothstep(r.z - w, r.z - w * 0.4, dist) * (1.0 - smoothstep(r.z - w * 0.2, r.z, dist));
    disp += (d / max(dist, 0.001)) * band * r.w * w * 0.9;
  }
  // displace by whole cells so the refraction stays on the pixel grid
  disp = floor(disp / u_scale + 0.5) * u_scale;
  vec2 uv = (px - disp) / u_view;
  uv.y = 1.0 - uv.y;
  vec3 c = texture(u_scene, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  if (u_split > 0.0) {
    // chromatic split on the biggest blasts: red and blue pulled apart by whole cells
    vec2 sh = vec2(u_split / u_view.x, 0.0);
    c.r = texture(u_scene, clamp(uv + sh, vec2(0.0), vec2(1.0))).r;
    c.b = texture(u_scene, clamp(uv - sh, vec2(0.0), vec2(1.0))).b;
  }
  c += u_tint;
  if (u_scan > 0.0 && (int(gl_FragCoord.y) & 1) == 0) c *= 1.0 - u_scan;
  o = vec4(c, 1.0);
}`;
