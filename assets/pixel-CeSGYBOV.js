import{c as e,l as t,o as n,u as r}from"./index-C-Gi6AQ4.js";var i=`
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
`,a=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,o=`#version 300 es
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
uniform usampler2D u_grassMask; // 1 = surface row at round start: grass grows only there
uniform usampler2D u_burn;   // tick + 1 of the last blast over the cell, 0 = none
uniform float u_burnOn;      // any blast recent enough to still smoulder
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
vec4 look(uint m) { return texelFetch(u_look, ivec2(int(m), 0), 0); }
${i}
bool topsoil(uint m) { return m != 0u && look(m).a > 0.75; }
// chars black and smoulders after a blast: topsoil, plus char materials (alpha 0.5)
bool charrable(uint m) { return m != 0u && look(m).a > 0.25; }
bool glints(uint m) { float b = look(m).b; return b > 0.25 && b < 0.5; }
// frost: icy rim on exposed faces, and a few cells glint white for a few ticks in whole steps
vec3 glinted(ivec2 c, vec3 shaded) {
  vec3 col = shaded;
  bool rim = mat(c - ivec2(0, 1)) == 0u;
  if (rim) col = mix(col, vec3(0.94, 0.98, 1.0), 0.55);
  else if ((mat(c + ivec2(1, 0)) == 0u || mat(c - ivec2(1, 0)) == 0u)) col = mix(col, vec3(0.86, 0.94, 1.0), 0.3);
  float h = hash(c + ivec2(41, 7));
  int st = int(floor(u_time / (6.0 + h * 10.0) + h * 53.0));
  float f = hash(c + ivec2(st * 11, st * 5 + 23));
  if (f < (rim ? 0.06 : 0.02)) col = vec3(1.0);
  else if (f < (rim ? 0.12 : 0.05)) col = mix(col, vec3(0.7, 0.88, 1.0), 0.6);
  return col;
}
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
        else if (glints(mm)) c = glinted(cell, c);
      }
      // embers: for a while after a blast, cells of fresh char near the surface flicker red,
      // orange and yellow in whole-cell steps, thinning out and reddening as they cool
      if (u_burnOn > 0.0) {
        uint bt = texelFetch(u_burn, cell, 0).r;
        float age = u_time - float(bt) + 1.0;
        if (bt != 0u && age >= 0.0 && age < 600.0) {
          uint mm = mat(cell);
          int sd = 0;
          for (int k = 1; k <= 3; k++) if (mat(cell - ivec2(0, k)) == 0u) { sd = k; break; }
          if (sd > 0 && charrable(mm) && texelFetch(u_grassMask, cell - ivec2(0, sd - 1), 0).r == 0u) {
            float cool = age / 600.0;
            float h = hash(cell + ivec2(13, 77));
            int st = int(floor(u_time / (5.0 + h * 9.0) + h * 31.0));
            float f = hash(cell + ivec2(st * 7, st * 3 + 91));
            float dens = (sd == 1 ? 0.12 : sd == 2 ? 0.05 : 0.0) * (1.0 - cool) * (1.0 - cool);
            if (f < dens) {
              float pick = hash(cell + ivec2(st * 5 + 3, 17)) + cool * 0.5;
              c = pick < 0.3 ? vec3(1.0, 0.86, 0.32) : pick < 0.7 ? vec3(0.98, 0.5, 0.12) : vec3(0.78, 0.16, 0.08);
            }
          }
        }
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
        bool grown = cell.y + 1 < int(u_map.y) && texelFetch(u_grassMask, cell + ivec2(0, 1), 0).r != 0u;
        if (topsoil(b1) && grown && texelFetch(u_coat, cell + ivec2(0, 1), 0).r == 0u && h > 0.42) {
          // withered by gas (mask 2): dry straw tufts, fewer of them
          bool dry = texelFetch(u_grassMask, cell + ivec2(0, 1), 0).r == 2u;
          if (!dry) c = u_grass.rgb * (h > 0.8 ? 1.12 : 0.92);
          else if (h > 0.62) c = vec3(0.6, 0.5, 0.24) * (h > 0.85 ? 1.1 : 0.9);
        } else if (b1 == 0u && topsoil(mat(cell + ivec2(0, 2))) && cell.y + 2 < int(u_map.y) &&
                   texelFetch(u_grassMask, cell + ivec2(0, 2), 0).r != 0u && hash(cell + ivec2(5, 10)) > 0.86 &&
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
}`,s=`#version 300 es
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
${i}
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
}`,c=`#version 300 es
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
}`,l=`#version 300 es
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
uniform usampler2D u_grassMask; // 1 = surface row at round start: grass grows only there
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
${i}
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
  // grass, turf and the dark topsoil band belong to the round-start surface only: freshly blasted
  // ground stays bare dirt (render-only, the sim never sees it)
  uint gmask = still && lk.a > 0.75 && sd > 0 ? texelFetch(u_grassMask, c + ivec2(0, 1 - sd), 0).r : 0u;
  bool soil = gmask != 0u;
  // grass a gas cloud crept over (mask 2) is withered: dry, yellow-brown, no flowers
  bool dry = gmask == 2u;
  vec3 grassRgb = dry ? mix(u_grass.rgb, vec3(0.58, 0.47, 0.2), 0.8) : u_grass.rgb;
  // ground under a glinting skin (frost) is frozen through: no grass or turf, a cold grey-blue
  // that dithers back into the plain soil a dozen cells down
  float topB = sd > 1 ? texelFetch(u_look, ivec2(int(mat(c + ivec2(0, 1 - sd))), 0), 0).b : 0.0;
  bool frozen = topB > 0.25 && topB < 0.5;
  if (frozen) soil = false;
  // a blast cut through the turf: cells near a crater (air dug out below the round-start surface,
  // beside them or diagonally above) keep only a thin cap of grass; below it the cut face shows
  // the topsoil and dirt instead of a deep band of green. Natural slopes have their air above the
  // surface row, so the scan up that air column finds no grass mask there. Each direction tests
  // only the first air cell it meets.
  int cut = 0;
  if (soil && sd > 2 && u_grass.a > 0.0) {
    ivec2 dirs[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(-1, -1), ivec2(1, -1));
    int open = 0; // bit per direction: already met air (or the map edge)
    for (int d = 1; d <= 16 && cut == 0; d++) {
      for (int i = 0; i < 4; i++) {
        if ((open & (1 << i)) != 0) continue;
        ivec2 n = c + dirs[i] * d;
        if (n.x < 0 || n.y < 0 || n.x >= int(u_map.x)) { open |= 1 << i; continue; }
        if (mat(n) != 0u) continue;
        open |= 1 << i;
        for (int k = 2; k <= 34; k++) {
          if (k > sd + 2 || n.y - k < 0) break;
          if (texelFetch(u_grassMask, n - ivec2(0, k), 0).r != 0u) { cut = d; break; }
        }
        if (cut != 0) break;
      }
    }
  }
  // dither the last few cells so the turf ends in a ragged edge, not a ruled line
  bool bare = cut > 0 && (cut <= 10 || bayer(ap) > float(cut - 10) / 7.0);
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
  if (frozen && sd <= 14 && (sd <= 8 || bayer(ap) > float(sd - 8) / 7.0)) {
    col = mix(col, vec3(0.7, 0.8, 0.9) * (0.85 + g) * (sd <= 4 ? 1.12 : 1.0), sd <= 4 ? 0.8 : 0.6);
  }
  float rim = lit + side;
  if (soil && !bare && u_grass.a > 0.0 && sd > 9 && sd <= 24) {
    // turf: the hillside under the grass, muted green in short horizontal strokes, darkening
    // with depth and dithering into the topsoil at its foot
    float k = float(sd - 10) / 14.0;
    if (sd < 19 || bayer(ap) > (float(sd) - 19.0) / 6.0) col = turf(grassRgb, ap, k);
  }
  if (soil && (!bare || sd <= 2) && u_grass.a > 0.0 && sd > 0 && sd <= 9) {
    // grass: lit blade tips, a body of vertical blade strokes in three tones, a shaded base and
    // roots dithered into the topsoil
    float patchy = vnoise(vec2(float(ap.x) / 9.0, 1.5));
    vec3 gr = grassRgb;
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
    if (u_flowers > 0.0 && sd <= 3 && !dry) {
      float f = hash(ivec2(c.x >> 1, 503));
      if (f > 1.0 - u_flowers * 0.08) {
        float pick = hash(ivec2(c.x >> 1, 504));
        vec3 fc = pick > 0.66 ? vec3(0.96, 0.93, 0.82) : pick > 0.33 ? vec3(0.95, 0.78, 0.25) : vec3(0.86, 0.3, 0.24);
        if (sd <= 2) col = fc * (sd == 1 ? 1.0 : 0.8);
      }
    }
    rim *= 0.35;
  }
  if (still && lk.a > 0.25 && !soil && sd > 0 && sd <= 26) {
    // freshly blasted dirt: scorched near-black at the surface where the blast hit, lightening
    // through charred and baked bands into warm dirt and then the plain subsoil. Hard tone steps
    // with ordered dither between them, in short horizontal strokes of three tones
    int sx = (ap.x + (ap.y & 3) * 3) >> 2;
    float h = hash(ivec2(sx, ap.y + 733));
    float t = h > 0.7 ? 1.07 : h > 0.3 ? 1.0 : 0.93;
    int lv = int(floor(float(sd - 1) / 21.0 * 5.0 + bayer(ap)));
    float k = lv <= 0 ? 0.36 : lv == 1 ? 0.55 : lv == 2 ? 0.74 : lv == 3 ? 0.92 : lv == 4 ? 1.08 : 1.0;
    vec3 tint = lv <= 1 ? vec3(0.95, 0.92, 0.95) : lv <= 3 ? vec3(1.06, 0.97, 0.88) : vec3(1.04, 1.0, 0.92);
    vec3 b = col * tint * k * t;
    // the odd ember still glowing in the char, and dark clods through the baked bands
    if (lv <= 0 && hash(c + ivec2(23, 61)) > 0.985) b = vec3(0.62, 0.22, 0.08);
    else if (lv >= 2 && hash(ap + ivec2(41, 17)) > 0.94) b *= 0.8;
    if (lv <= 5) col = b;
    rim *= 0.2;
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
}`,u=`#version 300 es
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
}`,d=`#version 300 es
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
  } else if (v_shape == 5) { // solid pixel blob: opaque cells, one dithered edge band
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    ivec2 ic = ivec2(cell) & 1;
    if (k > 0.86 && (ic.x ^ ic.y) == 1) discard;
  }
  o = vec4(v_color.rgb * v_color.a * a, v_color.a * a); // premultiplied
}`,f=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_view;
uniform vec2 u_shake;
uniform int u_rippleCount;
uniform vec4 u_ripple[8];
uniform float u_rippleW[8];
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
  for (int i = 0; i < 8; i++) {
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
}`;function p(e,t,n){let r=e.createProgram();for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(!t)throw Error(`createShader failed`);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw Error(`shader compile failed: ${e.getShaderInfoLog(t)??``}\n${a}`);e.attachShader(r,t),e.deleteShader(t)}if(e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw Error(`program link failed: ${e.getProgramInfoLog(r)??``}`);return r}function m(e,t,n){let r={};for(let i of n)r[i]=e.getUniformLocation(t,i);return r}function h(e,t=e.NEAREST){let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),n}function g(e){return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}var _=class{s;constructor(e){this.s=e>>>0||1}next(){let e=this.s=this.s+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,t){return e+(t-e)*this.next()}},v=10,y={Rect:0,Glow:1,Disc:2,Ring:3,Pixel:4,Solid:5},b=class{gl;data;n=0;prog;vao;buf;u;gpuBytes;constructor(e,t=4096){this.gl=e,this.data=new Float32Array(t*v),this.prog=p(e,u,d),this.u=m(e,this.prog,[`u_view`,`u_origin`,`u_scale`]),this.vao=e.createVertexArray(),this.buf=e.createBuffer(),e.bindVertexArray(this.vao),e.bindBuffer(e.ARRAY_BUFFER,this.buf),e.bufferData(e.ARRAY_BUFFER,this.data.byteLength,e.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength;for(let[t,n,r]of[[0,2,0],[1,2,2],[2,1,4],[3,4,5],[4,1,9]])e.enableVertexAttribArray(t),e.vertexAttribPointer(t,n,e.FLOAT,!1,40,r*4),e.vertexAttribDivisor(t,1);e.bindVertexArray(null)}get count(){return this.n}push(e,t,n,r,i,a=1,o=y.Rect,s=0){if((this.n+1)*v>this.data.length){let e=new Float32Array(this.data.length*2);e.set(this.data),this.data=e}let c=this.data,l=this.n*v;c[l]=e,c[l+1]=t,c[l+2]=n,c[l+3]=r,c[l+4]=s,c[l+5]=(i>>16&255)/255,c[l+6]=(i>>8&255)/255,c[l+7]=(i&255)/255,c[l+8]=a,c[l+9]=o,this.n++}rect(e,t,n,r,i,a=1){this.push(e+n/2,t+r/2,n,r,i,a)}line(e,t,n,r,i,a,o=1){let s=n-e,c=r-t,l=Math.hypot(s,c);l<1e-4||this.push((e+n)/2,(t+r)/2,l,i,a,o,y.Rect,Math.atan2(c,s))}flush(e,t,n){if(this.n===0)return;let r=this.gl;r.useProgram(this.prog),r.uniform2f(this.u.u_view,e[0],e[1]),r.uniform2f(this.u.u_origin,t[0],t[1]),r.uniform1f(this.u.u_scale,n),r.bindVertexArray(this.vao),r.bindBuffer(r.ARRAY_BUFFER,this.buf),this.data.byteLength>this.gpuBytes&&(r.bufferData(r.ARRAY_BUFFER,this.data.byteLength,r.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength),r.bufferSubData(r.ARRAY_BUFFER,0,this.data,0,this.n*v),r.drawArraysInstanced(r.TRIANGLES,0,6,this.n),r.bindVertexArray(null),this.n=0}dispose(){this.gl.deleteBuffer(this.buf),this.gl.deleteVertexArray(this.vao),this.gl.deleteProgram(this.prog)}},x={Spark:0,Chunk:1,Smoke:2,Dust:3,Flame:4,Snow:5},S=[16773280,16752672,14699024,3811878],C=class{cap;n=0;x;y;vx;vy;age;life;size;color;kind;constructor(e){this.cap=e,this.x=new Float32Array(e),this.y=new Float32Array(e),this.vx=new Float32Array(e),this.vy=new Float32Array(e),this.age=new Float32Array(e),this.life=new Float32Array(e),this.size=new Float32Array(e),this.color=new Uint32Array(e),this.kind=new Uint8Array(e)}add(e){let t=this.n;if(t>=this.cap){let e=0,n=1/0;for(let t=0;t<this.n;t+=7){let r=this.life[t]-this.age[t];r<n&&(n=r,e=t)}t=e}else this.n++;this.x[t]=e.x,this.y[t]=e.y,this.vx[t]=e.vx,this.vy[t]=e.vy,this.age[t]=0,this.life[t]=e.life,this.size[t]=e.size,this.color[t]=e.color,this.kind[t]=e.kind}step(e,t){let n=0;for(let r=0;r<this.n;r++){let i=this.age[r]+1;if(i>=this.life[r])continue;let a=this.kind[r],o=this.vx[r],s=this.vy[r];a===x.Spark?(s+=e*.6,o*=.97,s*=.97):a===x.Chunk?(s+=e,o*=.99):a===x.Snow?(s=Math.min(s+e*.04,.32),o=o*.95+t*3+Math.sin(i*.11+r*1.7)*.012):a===x.Smoke?(s=s*.94-.012,o=o*.94+t*4):a===x.Flame?(s=s*.95-.02,o=o*.92+t*3):(o*=.9,s=s*.9-.004),this.x[n]=this.x[r]+o,this.y[n]=this.y[r]+s,this.vx[n]=o,this.vy[n]=s,this.age[n]=i,this.life[n]=this.life[r],this.size[n]=this.size[r],this.color[n]=this.color[r],this.kind[n]=a,n++}this.n=n}draw(e,t){for(let n=0;n<this.n;n++){let r=this.age[n]/this.life[n],i=this.kind[n],a=this.size[n],o=this.color[n];if(i===x.Spark){let e=r<.6?1:(1-r)/.4;t.push(Math.floor(this.x[n])+.5,Math.floor(this.y[n])+.5,1,1,o,e)}else if(i===x.Snow)e.push(Math.floor(this.x[n])+.5,Math.floor(this.y[n])+.5,a,a,o,r<.8?.95:(1-r)/.2);else if(i===x.Chunk)e.push(Math.floor(this.x[n])+.5,Math.floor(this.y[n])+.5,a,a,o,r<.7?1:(1-r)/.3);else if(i===x.Flame){let i=Math.min(3,Math.floor(r*4)),o=Math.max(1,Math.round(a*(1-r*.6))),s=Math.floor(this.x[n])+.5,c=Math.floor(this.y[n])+.5;e.push(s,c,o,o,S[i],i===3?.7:1,y.Pixel),i<2&&t.push(s,c,Math.max(1,o-2),Math.max(1,o-2),16765024,.5)}else{let t=i===x.Smoke?1+r*2.2:1+r*1.4,s=(i===x.Smoke?.5:.42)*(1-r)*Math.min(1,r*6+.2);e.push(this.x[n],this.y[n],a*t,a*t,o,s,y.Pixel)}}}clear(){this.n=0}},w=9,T=14,E=12,D=[[2,11540480,.35],[0,16730640,.6],[-2,16751144,.8],[-4,16769136,.9],[-5,16777215,1]],ee=class{particles;charges=[];beams=[];constructor(e){this.particles=e}get active(){return this.charges.length>0||this.beams.length>0}charge(e,t){this.charges.push({x:e.x,y:e.y,start:e.tick,dur:e.params.ticks??60,rng:t})}fire(e,t){this.charges=this.charges.filter(t=>t.x!==e.x),this.beams.push({x:e.x,end:e.y,surface:e.params.surface??e.y,start:e.tick,head:0,done:-1,rng:t})}track(e,t){for(let n of this.beams){if(n.done>=0||t<=n.start)continue;let r=!1;for(let t of e)if(t.kind===`projectile`&&Math.floor(t.x)===n.x&&!(t.y<n.head-1)){n.head=t.y,r=!0;break}r||(n.done=t)}}owns(e,t){for(let n of this.beams)if(n.done<0&&Math.floor(e)===n.x&&t>=n.head-1)return!0;return!1}tick(e,t){let n=this.particles;this.charges=this.charges.filter(r=>{let i=e-r.start;if(i>r.dur+2)return!1;let a=Math.min(1,i/r.dur),o=Math.round((1+3*a)*t);for(let e=0;e<o;e++){let e=r.rng.next()<.5?-1:1,t=r.rng.range(10,34)*(1-.5*a),i=r.rng.range(0,r.y);n.add({x:r.x+.5+e*t,y:i,vx:-e*t/10,vy:0,life:10,size:1,color:r.rng.next()<.3?16777215:16728128,kind:x.Spark})}return!0});let r=0;return this.beams=this.beams.filter(i=>{let a=e-i.start,o=i.done>=0?e-i.done:0;if(o>26)return!1;let s=i.rng;if(i.done<0||o<T){if(r=Math.max(r,i.done<0?2:1.2),i.head>=i.surface-1){let e=Math.round(6*t)+1;for(let t=0;t<e;t++){let e=t%2==0?-1:1;n.add({x:i.x+.5+e*s.range(7,11),y:i.surface-1,vx:e*s.range(.4,2.2),vy:-s.range(1.2,3.6),life:s.range(18,40),size:s.next()<.3?1.5:1,color:s.next()<.35?16773280:s.next()<.6?16752688:16734744,kind:x.Spark})}a%3==0&&n.add({x:i.x+.5+s.range(-9,w),y:i.surface-2,vx:s.range(-.3,.3),vy:-s.range(.3,.8),life:s.range(50,90),size:s.range(4,8),color:s.next()<.5?3813428:5918288,kind:x.Smoke})}if(i.done<0&&i.head>0){let e=Math.round(4*t)+1;for(let t=0;t<e;t++)n.add({x:i.x+.5+s.range(-9,w),y:i.head,vx:s.range(-1.2,1.2),vy:-s.range(.5,2.5),life:s.range(8,18),size:1,color:s.next()<.5?16777215:16765024,kind:x.Spark})}}else a%4==0&&n.add({x:i.x+.5+s.range(-3,3),y:i.surface-1,vx:s.range(-.15,.15),vy:-s.range(.3,.6),life:s.range(60,110),size:s.range(3,6),color:6972006,kind:x.Smoke});return!0}),r}draw(e,t){for(let n of this.charges)this.drawCharge(e,n,t);for(let n of this.beams)this.drawBeam(e,n,t)}drawCharge(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,r/t.dur),a=t.x+.5;if(Math.floor(r/(i<.5?8:i<.85?4:2))%2==0&&(e.push(a,t.y-1.5,3,1,16724016,1),e.push(a,t.y-1.5,1,3,16724016,1),e.push(a,t.y-1.5,1,1,16777215,1)),i>.85)e.push(a,t.y/2,3,t.y,16722448,.35),e.push(a,t.y/2,1,t.y,16769232,.9);else if(r%6!=5){let n=r*3%11;for(let r=n-6;r<t.y;r+=11){let n=Math.max(0,r),o=Math.min(t.y,r+6);o<=n||e.push(a,(n+o)/2,1,o-n,16724016,.4+.5*i)}}let o=Math.round(26-18*i),s=i>.85?16777215:16728128,c=t.y-1.5;for(let t of[-1,1])for(let n of[-1,1]){let r=a+t*o,i=c+n*o;e.push(r-t*3/2,i,4,1,s,.9),e.push(r,i-n*3/2,1,4,s,.9)}}drawBeam(e,t,n){let r=n-t.start;if(r<0)return;let i=t.done>=0?Math.max(0,n-t.done):0,a=w*Math.min(1,(r+1)/3);if(i>T&&(a=w*(1-(i-T)/E)),a<=0)return;let o=O(n*31+t.x);a=Math.max(.5,Math.round(a+(o&3?+((o&3)==3):-1)));let s=Math.max(1,Math.round(t.head)),c=t.x+.5,l=s/2,u=a/w;for(let[t,n,r]of D){let i=Math.round(a+t*u);i<0||e.push(c,l,i*2+1,s,n,r)}for(let t=r*7%18;t<s;t+=18)e.push(c,Math.floor(t)+1,Math.round(a)*2+3,2,16777215,.55);for(let r=0;r<10;r++){let i=O(n*97+r*13+t.x*7),o=i%s,l=i>>12&1?1:-1;e.push(c+l*(Math.round(a)+2+(i>>13&1)),o+.5,1,1,16765056,.9)}if(t.done<0||i<T){let n=t.done<0?1:1-i/T;if(e.push(c,s,27,5,16742944,.7*n),e.push(c,s,19,3,16777215,n),s>=t.surface-1){let r=Math.round((45+(o>>4&3))*n);e.push(c,t.surface-1,r*2+1,1,16760928,.75*n),e.push(c,t.surface-1,Math.round(r*.5)*2+1,2,16777215,.85*n)}}}clear(){this.charges=[],this.beams=[]}};function O(e){let t=Math.imul(e^1540483477,2654435761);return t^=t>>>15,t>>>0&65535}var k=[16775388,16769136,16756784,15757344,13124632,9057312,6175280,4864572,3813430],A=44,te=22,ne=40,re=16;function ie(e,t,n,r,i,a=0){let o=new _(i),s=new Float32Array(488);for(let e=0;e<s.length;e++)s[e]=o.next();return{x:e,y:t,r:n,start:r,fuse:a,life:a+240,top:Math.max(n*.55+6,0),p:s}}var j=e=>1-(1-e)*(1-e);function M(e){return k[Math.max(0,Math.min(k.length-1,Math.floor(e)))]}function N(e,t,n,r,i,a){if(r<1||a<=.02)return;e.push(t,n,r,r,M(i+1.4),a,y.Solid);let o=r*.7;e.push(t-r*.11,n-r*.14,o,o,M(i),a,y.Solid)}function ae(e,t,n,r){let i=r-e.start;if(i<0)return!0;if(i>e.life)return!1;let{x:a,y:o,r:s,p:c,life:l,fuse:u}=e,d=j(Math.min(1,i/(l*.9))),f=o-Math.min(s*2.4,o-e.top)*(.1+.9*d),p=s*(.3+.8*j(Math.min(1,i/l))),m=p*.42,h=Math.min(1,i/(l*.75)),g=i-u,_=g>=0&&g<50?(1-g/50)*3:0,v=.2+h*6.4-_,b=i<l-70?1:(l-i)/70,x=i*.02,S=i*.035,C=o+s*.45,w=f+m*.6,T=Math.max(0,C-w);for(let e=0;e<ne;e++){let n=(66+e)*4,r=(c[n]+i*.012)%1,o=1-.45*Math.sin(Math.PI*Math.min(1,r*1.15)),u=s*.26*o*(.8+.4*c[n+1]),d=a+(c[n+3]-.5)*u*1.2+x*r,f=C-r*T,p=Math.max(3,u*1.7*(.85+.3*c[n+1])),m=v-.8+(1-r)*.9+c[n+2]*.8,h=b*(i<l-110?1:(l-30-i)/80);N(t,d,f,p,m,Math.min(1,Math.max(0,h))*.95)}for(let e=0;e<re;e++){let n=(106+e)*4,r=e%2==0?-1:1,l=s*(.3+1.3*j(Math.min(1,i/140)))*(.4+.6*c[n]),u=s*(.16+.14*c[n+1])*(.6+.6*d);N(t,a+r*l,o-u*.35-c[n+3]*s*.12,u,4.6+h*2.2+c[n+2],b*.85)}for(let e=0;e<A;e++){let n=e*4,r=e%2==0?-1:1,i=c[n]*Math.PI*2+S*r,o=p*(.45+.3*c[n+3]),s=m*.85,l=Math.cos(i),u=Math.sin(i);N(t,a+x+r*(o+l*s),f-u*s,m*(.85+.55*c[n+1]),v+u*1.1+c[n+2]*.9-.4,b)}for(let e=0;e<te;e++){let n=(A+e)*4,r=c[n]*2-1;N(t,a+x+r*p*.6,f+m*.3-m*(.2+1*(1-r*r))*c[n+3],m*(1+.5*c[n+1]),v+c[n+2]*.9-.6,b)}let E=_>0?g:i;if(E<120){let e=1-E/120,t=p*.9;n.push(a+x,f+m*.2,t,t*.7,16747056,.55*e*e,y.Pixel),n.push(a,C-T*.4,s*.3,T*.7,16736288,.35*e*e,y.Pixel)}return!0}var oe=[10131104,8025732,6183528,4670287,3420475],se=64;function ce(e,t){let n=new _(e),r=new Float32Array(256);for(let e=0;e<r.length;e++)r[e]=n.next();return{x:0,y:0,h:100,base:4,top:30,lean:0,wobble:0,age:0,strength:0,down:0,last:t,born:t,dust:9073752,p:r}}function P(e,t){let n=Math.max(0,Math.min(1,t/e.h)),r=e.base+(e.top-e.base)*n*n;return Math.max(1,r*Math.max(e.strength,1/3))}function le(e,t,n=e.age){let r=Math.max(0,Math.min(1,t/e.h)),i=(n*25+Math.min(e.h,Math.max(0,t))*25)/10;return e.x+e.lean*r+Math.sin(i*Math.PI/180)*e.wobble*r}function ue(e,t,n,i){let a=e.age+Math.max(0,i-e.last),o=e.h,s=e.y-o,c=e.p,l=Math.min(1,(i-e.born)/18),u=l*Math.max(0,Math.min(1,1-(i-e.last-1)/10));if(u<=0)return;let d=e.top*3.2+40,f=14+e.top*.35,p=s-f*.4,m=a*.03;for(let n=0;n<se;n++){let r=n*4,i=c[r]*Math.PI*2+m*(.6+.8*c[r+3]),a=.15+.85*c[r+1],o=e.x+e.lean+Math.cos(i)*d*a,s=p+Math.sin(i)*f*.45*a+(1-a)*f*.5-c[r+2]*f*.5,h=(10+14*c[r+2])*(1.2-.45*a)*(.5+.5*l),g=Math.min(oe.length-1,Math.max(0,Math.floor(2.4-Math.sin(i)*1.4-c[r+2]*1.6+(1-a)*1.2)));t.push(Math.round(o),Math.round(s),h,h*.75,oe[g],.95*u,y.Solid)}let h=o*e.down,g=r(e.dust,1.05),_=a*.32;for(let n=0;n<=o;n++){if(o-n>h)continue;let i=e.y-n,s=P(e,n),c=le(e,n,a),l=n/o,d=l<.22?g:7236216,f=Math.round(c-s),p=Math.round(c+s),m=p-f+1;t.push(f+m/2,i+.5,m,1,d,(.5+.2*(1-l))*u),t.push(f+.5,i+.5,1,1,r(d,.7),.75*u),t.push(p+.5,i+.5,1,1,r(d,.7),.75*u);for(let e=0;e<3;e++){let a=_+e*2.0944-n*.11,o=Math.round(c+Math.cos(a)*s),l=Math.sin(a)>0,f=1+Math.round(Math.abs(Math.sin(a))*Math.min(4,s*.35));l?t.push(o+.5,i+.5,f,1,r(d,1.3),.9*u):t.push(o+.5,i+.5,f,1,r(d,.6),.6*u)}}if(e.down>=1&&e.strength>.05)for(let t=0;t<6;t++){let i=_*1.3+t*1.047,a=P(e,0)*2.2+3;n.push(Math.round(e.x+Math.cos(i)*a)+.5,e.y-1-Math.round(Math.abs(Math.sin(i))*3)+.5,2,1,r(e.dust,1.4),.35*e.strength*u)}}var F=[.62,.8,1,1.18,1.32],I=[16777215,15136511,12575994,9227247,6203612],L=[4865834,7233606,9404250,12365446],R=[13682872,11577496,9208948],z=[[16760944,.5,.32,.18],[16769200,.42,.36,.28],[16747056,.62,.24,.06],[11066623,.2,.36,.62],[13162751,.42,.46,.72],[13676672,.34,.27,.16],[12120128,.22,.5,.1]],B={low:{cap:800,mult:.35},medium:{cap:2500,mult:.7},high:{cap:6e3,mult:1}},de=class{particles;probe;ripples=[];glows=[];fronts=[];bolts=[];jets=[];crystals=[];mushrooms=[];vortices=[];funnels=[];shakeAmp=0;shakeStart=0;sky=[0,0,0];skyFlash=0;split=0;mult=1;lances;ricochetHeat=0;ricochetLast=-1e3;constructor(e,t){this.particles=e,this.probe=t,this.lances=new ee(e)}rngFor(e,t){return new _((Math.imul(e.tick+1,2654435761)^Math.imul(e.x+7,40503)^Math.imul(e.y+3,9973))+t)}handle(e){switch(e.type){case`burst`:this.burst(e,e.params.count??24);break;case`flash`:{let t=z[e.params.dt??0]??z[0],n=e.params.strength??1;if(n<=0)break;this.glows.push({x:e.x,y:e.y,r:e.radius*2.2,start:e.tick,dur:14,color:t[0],strength:n}),this.tintSky(t,.008*e.radius*n),e.radius>=60&&(this.glows.push({x:e.x,y:e.y,r:e.radius*1.2,start:e.tick,dur:26,color:16774880,strength:1.4}),this.split=Math.max(this.split,Math.min(4,e.radius/30)));break}case`nukeBlast`:this.nuke(e);break;case`mirvSplit`:this.mirvSplit(e);break;case`fireball`:this.fireball(e,e.params.strength??1);break;case`meteorCall`:this.meteorCall(e);break;case`geyser`:this.geyser(e,e.params.strength??1);break;case`ricochet`:this.ricochet(e);break;case`ricochetBurst`:this.ricochetBurst(e,e.params.strength??1);break;case`dirtBurst`:this.dirtBurst(e);break;case`shake`:this.shakeAmp=Math.max(this.shakeAmp,(e.params.strength??1)*3),this.shakeStart=e.tick;break;case`ripple`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:45,maxR:e.radius*2,width:16,strength:e.params.strength??1});break;case`shockwave`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??20),rng:this.rngFor(e,11)});break;case`muzzle`:{let t=this.rngFor(e,3),n=(e.params.angle??90)*Math.PI/180,r=Math.round(10*this.mult)+2;for(let i=0;i<r;i++){let r=t.range(.6,2.2),i=t.range(-.35,.35);this.particles.add({x:e.x,y:e.y,vx:Math.cos(n+i)*r,vy:-Math.sin(n+i)*r,life:t.range(6,14),size:t.range(.5,1),color:16756800,kind:x.Spark})}for(let r=0;r<3;r++)this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*.4+t.range(-.1,.1),vy:-Math.sin(n)*.4,life:t.range(25,40),size:t.range(2,3.5),color:9076880,kind:x.Smoke});this.glows.push({x:e.x,y:e.y,r:6,start:e.tick,dur:5,color:16765056,strength:1});break}case`land`:{let t=this.rngFor(e,5),n=Math.round(Math.min(20,4+(e.params.distance??0))*this.mult)+2;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+n*t.range(4,9),y:e.y-1,vx:n*t.range(.2,.9),vy:-t.range(0,.25),life:t.range(20,40),size:t.range(2,4),color:this.dustColor(e.x,e.y),kind:x.Dust})}break}case`creak`:case`collapse`:{let t=this.rngFor(e,9),n=e.type===`collapse`,r=Math.round((n?36:10)*this.mult)+2;for(let i=0;i<r;i++){let r=e.x+t.range(-e.radius,e.radius),i=e.y+t.range(-e.radius,e.radius)*.6;this.particles.add({x:r,y:i,vx:t.range(-.35,.35),vy:-t.range(.05,n?.5:.25),life:t.range(25,n?70:40),size:t.range(2,n?5:3),color:this.dustColor(Math.round(r),Math.round(i)),kind:x.Dust})}n&&(this.shakeAmp=Math.max(this.shakeAmp,3),this.shakeStart=e.tick);break}case`bolt`:this.bolt(e);break;case`lanceCharge`:this.lances.charge(e,this.rngFor(e,43)),this.tintSky([0,.5,.06,.04],.12);break;case`lance`:this.lanceFire(e);break;case`pressureWave`:this.pressureWave(e,e.params.strength??1);break;case`vortex`:this.vortices.push({x:e.x,y:e.y,r:Math.max(10,e.radius),start:e.tick,dur:Math.max(8,e.params.ticks??40),rng:this.rngFor(e,61)});break;case`eruption`:this.eruption(e,e.params.strength??1);break;case`arcs`:this.arcs(e,e.params.strength??1);break;case`frostBlast`:this.frostBlast(e);break;case`frostFront`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??30),rng:this.rngFor(e,43),cold:!0});break;case`frosted`:{let t=this.rngFor(e,47),n=Math.round(24*this.mult)+4;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-9,9),y:e.y+t.range(-5,4),vx:t.range(-.3,.3),vy:-t.range(.1,.8),life:t.range(14,30),size:1,color:I[Math.floor(t.next()*3)],kind:x.Spark});this.puff(e,14216954,10);break}case`quake`:{let t=e.params.strength??1;this.shakeAmp=Math.max(this.shakeAmp,t*2.5),this.shakeStart=e.tick;let n=this.rngFor(e,13),r=Math.round(Math.min(40,e.radius/4+6)*this.mult)+2;for(let t=0;t<r;t++){let t=Math.round(e.x+n.range(-e.radius,e.radius)*.5),r=this.surfaceNear(t,e.y,40);r<0||this.particles.add({x:t,y:r-1,vx:n.range(-.3,.3),vy:-n.range(.1,.6),life:n.range(25,50),size:n.range(2,4),color:this.dustColor(t,r+1),kind:x.Dust})}break}case`tsunamiRise`:this.shakeAmp=Math.max(this.shakeAmp,5),this.shakeStart=e.tick;break;case`tsunami`:{let t=e.params.dir??1,n=this.rngFor(e,17);this.shakeAmp=Math.max(this.shakeAmp,Math.min(3,e.radius/12)),this.shakeStart=e.tick;let r=Math.round(Math.min(14,3+e.radius/4)*this.mult)+1;for(let i=0;i<r;i++){let r=Math.round(e.x-t*n.range(0,6)),i=this.surfaceNear(r,e.y,30);i<0||this.particles.add({x:r,y:i-1,vx:t*n.range(.6,1.8),vy:-n.range(.2,.9),life:n.range(16,34),size:n.range(1,3),color:this.dustColor(r,i+1),kind:x.Dust})}break}case`tsunamiCrash`:{let t=e.params.dir??1,n=this.rngFor(e,19);this.shakeAmp=Math.max(this.shakeAmp,9),this.shakeStart=e.tick;let r=Math.round(Math.min(60,12+e.radius)*this.mult)+2;for(let i=0;i<r;i++){let r=Math.round(e.x+t*n.range(-e.radius,e.radius*1.5)),i=this.surfaceNear(r,e.y,60);i<0||this.particles.add({x:r,y:i-Math.round(n.range(1,6)),vx:t*n.range(.2,1.4),vy:-n.range(.1,.7),life:n.range(30,60),size:n.range(2,4),color:this.dustColor(r,i+1),kind:x.Dust})}break}case`rift`:this.rift(e);break;case`resonate`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*1.4,width:10,strength:.8}),this.glows.push({x:e.x,y:e.y,r:e.radius,start:e.tick,dur:18,color:11563263,strength:1}),this.tintSky([0,.36,.18,.6],.25);break;case`zone`:this.puff(e,H[e.params.look??0]??10139706,30);break;case`gasBurst`:this.gasBurst(e);break;case`zoneHurt`:this.puff(e,12120128,8);break;case`burn`:{let t=this.rngFor(e,17),n=Math.round(14*this.mult)+3;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y+t.range(0,3),vx:t.range(-.2,.2),vy:-t.range(.4,1.1),life:t.range(10,24),size:1,color:t.next()<.4?16769136:16738842,kind:x.Spark});break}case`implode`:{let t=this.rngFor(e,19),n=Math.round(40*this.mult)+4,r=Math.max(8,e.params.ticks??20);for(let i=0;i<n;i++){let n=t.range(0,Math.PI*2),i=e.radius*t.range(.7,1.1);this.particles.add({x:e.x+Math.cos(n)*i,y:e.y+Math.sin(n)*i,vx:-Math.cos(n)*i/r,vy:-Math.sin(n)*i/r,life:r,size:1,color:t.next()<.5?13676799:8413376,kind:x.Spark})}this.tintSky([0,.2,.1,.4],.2);break}case`mudGeyser`:this.mudGeyser(e);break;case`mudSplat`:this.mudSplat(e,e.params.count??12);break;case`tornado`:this.tornado(e);break;case`touchdown`:this.shakeAmp=Math.max(this.shakeAmp,3),this.shakeStart=e.tick,this.fronts.push({x:e.x,y:e.y,maxR:46,start:e.tick,dur:24,rng:this.rngFor(e,43)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:60,width:10,strength:.7});break;case`tornadoGrab`:case`tornadoThrow`:{let t=this.rngFor(e,47),n=Math.round(14*this.mult)+2,i=this.dustColor(e.x,e.y+2);for(let a=0;a<n;a++)this.particles.add({x:e.x+t.range(-8,8),y:e.y-t.range(0,6),vx:t.range(-1.2,1.2),vy:-t.range(.2,1.4),life:t.range(20,40),size:1,color:r(i,t.range(.7,1.2)),kind:x.Chunk});e.type===`tornadoGrab`&&(this.shakeAmp=Math.max(this.shakeAmp,2),this.shakeStart=e.tick);break}case`tornadoEnd`:{let t=this.rngFor(e,53),n=Math.round(40*this.mult)+4;for(let r=0;r<n;r++){let n=t.range(0,Math.PI*2),r=t.range(.3,1.4);this.particles.add({x:e.x+Math.cos(n)*e.radius*.5,y:e.y+Math.sin(n)*e.radius*1.2,vx:Math.cos(n)*r,vy:Math.sin(n)*r*.6,life:t.range(40,80),size:t.range(3,7),color:t.next()<.5?6183528:8025732,kind:x.Smoke})}this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*3,width:12,strength:.8});break}case`tankDeath`:this.burst(e,70),this.glows.push({x:e.x,y:e.y,r:40,start:e.tick,dur:20,color:16748608,strength:1.2}),this.tintSky(z[2],.5),this.shakeAmp=Math.max(this.shakeAmp,7),this.shakeStart=e.tick}}nuke(e){let t=e.radius,n=e.params.strength??1;this.mushrooms.push(ie(e.x,e.y,t,e.tick,this.rngFor(e,31).next()*4294967296)),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:70,maxR:t*7,width:26,strength:1.5*n}),this.ripples.push({x:e.x,y:e.y,start:e.tick+6,dur:60,maxR:t*4.5,width:12,strength:.9*n}),this.fronts.push({x:e.x,y:e.y,maxR:t*4,start:e.tick,dur:46,rng:this.rngFor(e,37)}),this.shakeAmp=Math.max(this.shakeAmp,4+t/12),this.shakeStart=e.tick;let i=this.rngFor(e,41),a=this.dustColor(e.x,e.y+t*.5),o=Math.round((120+t*2)*this.mult),s=3+t/20;for(let n=0;n<o;n++){let o=i.range(-.15,1.15)*Math.PI,c=i.range(.35,1)*s,l=n%2==0;this.particles.add({x:e.x+Math.cos(o)*t*.3,y:e.y-Math.sin(o)*t*.3,vx:Math.cos(o)*c,vy:-Math.sin(o)*c,life:i.range(50,100),size:l?1:i.range(1.5,2.5),color:l?i.next()<.4?16773280:16742938:r(a,i.range(.7,1.2)),kind:l?x.Spark:x.Chunk})}}mirvSplit(e){let t=this.rngFor(e,43);this.glows.push({x:e.x,y:e.y,r:12,start:e.tick,dur:8,color:14217471,strength:1.4}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:22,maxR:46,width:8,strength:.9});let n=Math.round(48*this.mult)+8;for(let r=0;r<n;r++){let i=r/n*Math.PI*2+t.range(-.06,.06),a=t.range(1.6,3.2);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*a,vy:Math.sin(i)*a,life:t.range(12,22),size:1,color:r%3==0?16777215:t.next()<.5?10148095:16769136,kind:x.Spark})}for(let n=0;n<6;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y+t.range(-2,2),vx:t.range(-.15,.15),vy:-t.range(0,.1),life:t.range(50,80),size:t.range(3,5),color:t.next()<.5?9076880:6971504,kind:x.Smoke});this.tintSky(z[4],.15),this.shakeAmp=Math.max(this.shakeAmp,2),this.shakeStart=e.tick}geyser(e,t){let n=this.rngFor(e,47),i=Math.max(6,e.radius),a=this.dustColor(e.x,e.y+i*.4),o=(2.2+i/10)*t,s=Math.round((30+i*1.5)*t*this.mult)+4;for(let t=0;t<s;t++){let t=n.range(-1,1);this.particles.add({x:e.x+t*i*.35,y:e.y-n.range(0,i*.3),vx:t*n.range(.1,.7),vy:-n.range(.45,1)*o,life:n.range(45,80),size:n.next()<.3?2:1,color:r(a,n.range(.65,1.15)),kind:x.Chunk})}let c=Math.round((6+i/3)*t*Math.max(.5,this.mult));for(let o=0;o<c;o++)this.particles.add({x:e.x+n.range(-i,i)*.3,y:e.y-n.range(0,i*1.2),vx:n.range(-.2,.2),vy:-n.range(.2,.9)*t,life:n.range(40,75),size:n.range(i*.2,i*.4),color:r(a,n.range(.9,1.2)),kind:x.Dust})}fireball(e,t){let n=this.rngFor(e,53),r=Math.max(6,e.radius)*t*1.5,i=Math.round((14+r*1.5)*Math.max(.5,this.mult));for(let a=0;a<i;a++){let i=n.next();this.particles.add({x:e.x+n.range(-r,r)*.6,y:e.y-n.range(0,r*.8),vx:n.range(-.35,.35),vy:-n.range(.4,1.2)*(.8+t*.2),life:n.range(30,56)*(i<.5?1:.8),size:n.range(r*.35,r*.7),color:0,kind:x.Flame})}let a=Math.round((10+r)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.4,y:e.y-n.range(r*.4,r*1.4),vx:n.range(-.2,.2),vy:-n.range(.3,.8),life:n.range(100,160),size:n.range(r*.5,r*.9),color:n.next()<.5?2367010:3813428,kind:x.Smoke});let o=Math.round((20+r*1.5)*this.mult);for(let r=0;r<o;r++){let r=n.range(.15,.85)*Math.PI,i=n.range(.8,2.6)*(.7+t*.3);this.particles.add({x:e.x,y:e.y-2,vx:Math.cos(r)*i,vy:-Math.sin(r)*i,life:n.range(20,45),size:1,color:n.next()<.4?16769136:16738836,kind:x.Spark})}this.tintSky(z[2],.25*t)}pressureWave(e,t){let n=Math.max(20,e.radius);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:60,maxR:n*3.2*t,width:22,strength:1.4*t}),this.ripples.push({x:e.x,y:e.y,start:e.tick+5,dur:50,maxR:n*2,width:10,strength:.8*t}),this.fronts.push({x:e.x,y:e.y,maxR:n*1.3,start:e.tick,dur:30,rng:this.rngFor(e,67)}),this.shakeAmp=Math.max(this.shakeAmp,3+n/25*t),this.shakeStart=e.tick,this.tintSky([0,.55,.6,.75],.25*t);let i=this.rngFor(e,71),a=this.dustColor(e.x,e.y+4),o=Math.round((60+n)*t*this.mult);for(let t=0;t<o;t++){let o=t%2==0?-1:1,s=i.range(.05,.45)*Math.PI,c=i.range(1.5,4.5)*(.6+n/150);this.particles.add({x:e.x+o*i.range(2,n*.2),y:e.y-i.range(0,4),vx:o*Math.cos(s)*c,vy:-Math.sin(s)*c,life:i.range(40,80),size:i.next()<.3?2:1,color:r(a,i.range(.7,1.2)),kind:x.Chunk})}}eruption(e,t){let n=this.rngFor(e,73),r=Math.max(10,e.radius),i=Math.round((40+r)*t*this.mult);for(let a=0;a<i;a++){let i=n.range(.3,.7)*Math.PI,o=n.range(2,5.5)*t,s=a%3==0;this.particles.add({x:e.x+n.range(-r,r)*.25,y:e.y-2,vx:Math.cos(i)*o,vy:-Math.sin(i)*o,life:n.range(40,75),size:s?2:1,color:s?n.next()<.5?16734751:14172172:n.next()<.4?16769136:16747040,kind:s?x.Chunk:x.Spark})}let a=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(0,r*.4),vx:n.range(-.3,.3),vy:-n.range(.6,1.6),life:n.range(24,44),size:n.range(3,7),color:0,kind:x.Flame});let o=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<o;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(r*.3,r*1.6),vx:n.range(-.2,.2),vy:-n.range(.3,.9),life:n.range(110,170),size:n.range(r*.3,r*.6),color:n.next()<.5?2761252:4208186,kind:x.Smoke});this.tintSky(z[2],.35*t),this.shakeAmp=Math.max(this.shakeAmp,4*t),this.shakeStart=e.tick}drawVortices(e,t,n){for(let r of this.vortices){let i=(n-r.start)/r.dur;if(i<0||i>1)continue;let a=3+Math.round(i*i*r.r*.18);t.push(r.x,r.y,a*2+6,a*2+6,8405247,.35+.3*i,y.Pixel),e.push(r.x,r.y,a*2+2,a*2+2,13676799,.9,y.Pixel),e.push(r.x,r.y,a*2,a*2,459788,1,y.Pixel)}}meteorCall(e){let t=this.rngFor(e,59);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:40,width:8,strength:.6});let n=Math.round(40*this.mult)+10;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-2,vx:t.range(-.25,.25),vy:-t.range(2.5,6),life:t.range(25,50),size:t.next()<.3?2:1,color:t.next()<.3?16769136:16726560,kind:x.Spark});for(let n=0;n<8;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y-t.range(2,14),vx:t.range(-.1,.1),vy:-t.range(.1,.4),life:t.range(60,100),size:t.range(3,6),color:9054756,kind:x.Smoke});this.tintSky(z[2],.45)}frostBlast(e){let t=e.radius,n=e.params.strength??1,r=z[3];this.glows.push({x:e.x,y:e.y,r:t*.8,start:e.tick,dur:16,color:r[0],strength:1.1*n}),this.glows.push({x:e.x,y:e.y,r:t*.35,start:e.tick,dur:20,color:16055295,strength:1.3*n}),this.tintSky(r,.7*n),this.split=Math.max(this.split,1.5*n),this.ripples.push({x:e.x,y:e.y,start:e.tick+4,dur:40,maxR:t*1.6,width:10,strength:.8*n}),this.shakeAmp=Math.max(this.shakeAmp,3+t/25),this.shakeStart=e.tick;let i=this.rngFor(e,53),a=[];for(let n=0;n<11;n++){let r=(-.12+1.24*(n+i.range(.15,.85))/11)*Math.PI,o=t*i.range(.45,.95),s=e.x,c=e.y;for(let t=1;t<=4;t++){let n=o*t/4,l=o/14*(t<4),u=Math.round(e.x+Math.cos(r)*n+i.range(-l,l)),d=Math.round(e.y-Math.sin(r)*n+i.range(-l,l));U(s,c,u,d,a),s=u,c=d}}this.crystals.push({cells:Int32Array.from(a),x:e.x,y:e.y,len:t,start:e.tick,dur:28});let o=Math.round((90+t)*this.mult),s=1.6+t/28;for(let t=0;t<o;t++){let n=i.range(.04,.96)*Math.PI,r=i.range(.3,1)*s,a=t%3==0;this.particles.add({x:e.x+i.range(-3,3),y:e.y+i.range(-3,2),vx:Math.cos(n)*r*1.15,vy:-Math.sin(n)*r,life:i.range(30,70),size:a?1:i.range(1,2.4),color:I[Math.floor(i.next()*(a?2:I.length))],kind:a?x.Spark:x.Chunk})}let c=Math.round((10+t/4)*Math.max(.5,this.mult));for(let n=0;n<c;n++)this.particles.add({x:e.x+i.range(-t,t)*.35,y:e.y+i.range(-t,t)*.15,vx:i.range(-.6,.6),vy:-i.range(.02,.3),life:i.range(70,130),size:i.range(t*.15,t*.3),color:n%2==0?14479359:11852018,kind:x.Smoke});let l=Math.round((60+t*1.2)*this.mult);for(let n=0;n<l;n++)this.particles.add({x:e.x+i.range(-1.3,1.3)*t,y:e.y-i.range(.2,1.8)*t,vx:i.range(-.1,.1),vy:i.range(0,.15),life:i.range(140,260),size:1,color:i.next()<.7?16777215:14085370,kind:x.Snow})}rift(e){let t=this.rngFor(e,43),n=Math.max(8,e.radius),i=Math.max(1,e.params.width??3),a=(e.params.hot??0)>0;this.shakeAmp=Math.max(this.shakeAmp,a?9:6),this.shakeStart=e.tick,this.ripples.push({x:e.x,y:e.y+n*.4,start:e.tick,dur:30,maxR:n*1.6,width:10,strength:a?1.1:.8}),this.fronts.push({x:e.x,y:e.y,maxR:n*.9,start:e.tick,dur:18,rng:this.rngFor(e,47)}),this.tintSky(z[5],a?.3:.18);let o=this.dustColor(e.x,e.y+4),s=Math.round((26+n/2)*this.mult)+4;for(let a=0;a<s;a++)this.particles.add({x:e.x+t.range(-i,i),y:e.y-t.range(0,4),vx:t.range(-.25,.25),vy:-t.range(.6,2.6)*(.6+n/120),life:t.range(30,70),size:t.range(2.5,6),color:r(o,t.range(.85,1.25)),kind:x.Dust});let c=Math.round((30+n/2)*this.mult)+4;for(let n=0;n<c;n++){let n=t.next()<.5?-1:1;this.particles.add({x:e.x+t.range(-i,i)*.5,y:e.y-1,vx:n*t.range(.1,1.4),vy:-t.range(1.2,3.8),life:t.range(40,80),size:t.range(1,2),color:r(o,t.range(.7,1.1)),kind:x.Chunk})}if(!a)return;let l=Math.round(40*this.mult)+6;for(let n=0;n<l;n++)this.particles.add({x:e.x+t.range(-i,i)*.5,y:e.y+t.range(0,3),vx:t.range(-.8,.8),vy:-t.range(1.5,4.2),life:t.range(24,60),size:1,color:t.next()<.35?16769136:t.next()<.6?16742938:15220762,kind:x.Spark});this.glows.push({x:e.x,y:e.y,r:6+i,start:e.tick,dur:12,color:16742948,strength:1})}mudGeyser(e){let t=e.params.height??120,n=Math.max(20,e.params.ticks??90);this.jets.push({x:e.x,y:e.y,height:t,start:e.tick,dur:n,rng:this.rngFor(e,101)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:40,maxR:t*.9,width:14,strength:.9}),this.fronts.push({x:e.x,y:e.y,maxR:t*.55,start:e.tick,dur:30,rng:this.rngFor(e,103)}),this.shakeAmp=Math.max(this.shakeAmp,5),this.shakeStart=e.tick,this.tintSky([0,.34,.27,.16],.45);let r=this.rngFor(e,107),i=Math.sqrt(.24*t),a=Math.round(140*this.mult)+6;for(let t=0;t<a;t++){let t=r.range(.45,1.08)*i;this.particles.add({x:e.x+r.range(-5,5),y:e.y-r.range(0,3),vx:r.range(-.7,.7),vy:-t,life:2*t/.12+r.range(0,4),size:r.next()<.5?2:1,color:L[Math.floor(r.next()*4)],kind:x.Chunk})}}feedJets(e){this.jets=this.jets.filter(t=>{let n=e-t.start;if(n>t.dur)return!1;if(n<0)return!0;let r=n/t.dur,i=r<.45?1:Math.max(.15,1-(r-.45)/.55),a=r>.6&&t.rng.next()<.35?.3:1,o=Math.sqrt(.24*t.height)*Math.sqrt(i)*a,s=t.rng,c=Math.round(32*i*this.mult)+1;for(let e=0;e<c;e++){let n=e%4==0,r=o*s.range(n?.5:.82,1.02);this.particles.add({x:t.x+s.range(-4.5,4.5),y:t.y-s.range(0,2),vx:n?s.range(-.7,.7):s.range(-.24,.24),vy:-r,life:2*r/.12+s.range(0,4),size:n?1:s.next()<.6?2:3,color:L[s.next()<.12?3:Math.floor(s.next()*3)],kind:x.Chunk})}let l=t.height*i*a,u=Math.round(1.5*i*this.mult)+ +(n%3==0);for(let e=0;e<u;e++){let e=.55+.45*s.next();this.particles.add({x:t.x+s.range(-4,4)*(.5+e),y:t.y-e*l,vx:s.range(-.3,.3),vy:-s.range(.2,.9),life:s.range(50,100),size:s.range(3,6),color:R[Math.floor(s.next()*3)],kind:x.Smoke})}if(n%3==0)for(let e of[-1,1])this.particles.add({x:t.x+e*s.range(2,5),y:t.y-1,vx:e*s.range(.4,1.4),vy:-s.range(.6,1.6),life:40,size:1,color:L[1+Math.floor(s.next()*2)],kind:x.Chunk});return!0})}mudSplat(e,t){let n=this.rngFor(e,109),r=Math.round(t*this.mult)+3;for(let t=0;t<r;t++){let r=t%2==0?-1:1;this.particles.add({x:e.x+r*n.range(0,2),y:e.y-1,vx:r*n.range(.3,1.3),vy:-n.range(.5,1.8),life:n.range(25,45),size:1,color:L[Math.floor(n.next()*4)],kind:x.Chunk})}for(let t=0;t<2;t++)this.particles.add({x:e.x+n.range(-2,2),y:e.y-2,vx:n.range(-.2,.2),vy:-n.range(.2,.5),life:n.range(30,50),size:n.range(2,4),color:R[1],kind:x.Smoke})}tornado(e){let t=e.params,n;for(let t of this.funnels)if(e.tick-t.last<=3&&Math.abs(t.x-e.x)<=12){n=t;break}n||(n=ce(this.rngFor(e,59).next()*4294967296,e.tick),this.funnels.push(n)),n.x=e.x,n.y=e.y,n.h=e.radius,n.base=t.base??4,n.top=t.top??30,n.lean=t.lean??0,n.wobble=t.wobble??0,n.age=t.age??0,n.strength=(t.strength??0)/100,n.down=(t.down??100)/100,n.last=e.tick,e.tick&7||(n.dust=this.dustColor(e.x,e.y+2))}funnelDust(e,t){if(e.down<1||e.strength<=.05||t-e.last>2)return;let n=Math.max(1,Math.round(4*this.mult*e.strength)),i=new _((Math.imul(t+1,2654435761)^Math.imul(e.x+11,40503))>>>0),a=P(e,0)+3;for(let t=0;t<n;t++){let t=i.next()<.5?-1:1;this.particles.add({x:e.x+t*i.range(0,a),y:e.y-i.range(0,3),vx:t*i.range(.4,1.6),vy:-i.range(.1,.9),life:i.range(24,50),size:i.range(2.5,5.5),color:r(e.dust,i.range(.95,1.2)),kind:x.Dust})}if(i.next()<.7*this.mult){let t=i.range(0,e.h*.8),n=i.next()<.5?-1:1;this.particles.add({x:e.x+n*(P(e,t)+1),y:e.y-t,vx:n*i.range(.8,2.2),vy:-i.range(0,1),life:i.range(30,60),size:1,color:r(e.dust,i.range(.6,1.1)),kind:x.Chunk})}}drawFunnels(e,t,n){for(let r of this.funnels)ue(r,e,t,n)}lanceFire(e){this.lances.fire(e,this.rngFor(e,47));let t=e.params.surface??e.y;this.tintSky([0,.7,.5,.3],.9),this.ripples.push({x:e.x+.5,y:t,start:e.tick,dur:40,maxR:150,width:18,strength:1.1}),this.shakeAmp=Math.max(this.shakeAmp,5),this.shakeStart=e.tick}drawMushrooms(e,t,n){this.mushrooms.length!==0&&(this.mushrooms=this.mushrooms.filter(r=>ae(r,e,t,n)))}tintSky(e,t){let n=Math.min(.5,t),r=this.sky;r[0]=Math.min(.5,r[0]+e[1]*n),r[1]=Math.min(.5,r[1]+e[2]*n),r[2]=Math.min(.5,r[2]+e[3]*n),this.skyFlash=Math.max(r[0],r[1],r[2])}puff(e,t,n){let i=this.rngFor(e,23),a=Math.round(n*this.mult)+2;for(let n=0;n<a;n++)this.particles.add({x:e.x+i.range(-e.radius,e.radius)*.7,y:e.y+i.range(-e.radius,e.radius)*.5,vx:i.range(-.25,.25),vy:-i.range(0,.25),life:i.range(30,60),size:i.range(3,6),color:r(t,i.range(.8,1.1)),kind:x.Dust})}bolt(e){let t=this.rngFor(e,29),n=[],r=(e,r,i,a)=>{let o=e,s=r;for(;s<i;){let e=Math.min(i-s,Math.round(t.range(3,9))),r=o+Math.round(t.range(-3,3)+a);U(o,s,r,s+e,n),o=r,s+=e}return o};r(e.x+Math.round(t.range(-18,18)),0,e.y,0);let i=e.x-n[n.length-2];for(let t=0;t<n.length;t+=2){let r=n[t+1]/Math.max(1,e.y);n[t]=n[t]+Math.round(i*r)}let a=n.length,o=4+Math.floor(t.next()*3);for(let e=0;e<o;e++){let e=2*Math.floor(t.range(.1,.85)*(a/2)),i=n[e],o=n[e+1],s=r(i,o,o+Math.round(t.range(14,46)),t.next()<.5?-1.6:1.6);t.next()<.5&&r(s,n[n.length-1],n[n.length-1]+10,t.range(-2,2))}this.bolts.push({cells:Int32Array.from(n),main:a,start:e.tick,dur:20}),this.glows.push({x:e.x,y:e.y,r:26,start:e.tick,dur:14,color:13162751,strength:1.4}),this.tintSky([0,.75,.8,1],.5)}arcs(e,t){let n=this.rngFor(e,59),r=Math.max(12,e.radius)*2.5*t,i=4+Math.round(2*t);for(let t=0;t<i;t++){let i=t%2==0?-1:1,a=r*n.range(.5,1),o=[],s=Math.round(e.x),c=this.surfaceNear(s,e.y,30);c<0&&(c=Math.round(e.y));for(let e=0;e<a;){let t=Math.round(n.range(2,5)),r=s+i*t,a=this.surfaceNear(r,c,12),l=(a<0?c:a)-Math.round(n.range(0,3));U(s,c,r,l,o),s=r,c=l+Math.round(n.range(0,2)),e+=t,n.next()<.25&&this.particles.add({x:s,y:c-1,vx:i*n.range(.2,1),vy:-n.range(.5,1.6),life:n.range(10,22),size:1,color:n.next()<.5?16777215:10148095,kind:x.Spark})}if(o.length===0)continue;let l=Math.round(n.range(0,6));this.bolts.push({cells:Int32Array.from(o),main:o.length,start:e.tick+l,dur:Math.round(n.range(10,18))})}}heatAt(e){return e-this.ricochetLast>fe?0:this.ricochetHeat}ricochet(e){let t=this.heatAt(e.tick)+1;this.ricochetHeat=t,this.ricochetLast=e.tick;let n=this.rngFor(e,61),r=Math.min(t,V.length-1),i=V[r],a=V[Math.min(r+1,V.length-1)];this.glows.push({x:e.x,y:e.y,r:8+t*2.5,start:e.tick,dur:7,color:i,strength:1.2}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:12+t*4,width:5,strength:.5+t*.1});let o=Math.round((20+t*12)*this.mult)+4;for(let r=0;r<o;r++){let o=Math.PI+n.range(.1,Math.PI-.1),s=n.range(.8,2+t*.35);this.particles.add({x:e.x,y:e.y-1,vx:Math.cos(o)*s,vy:Math.sin(o)*s,life:n.range(10,18+t*3),size:1,color:r%4==0?16777215:n.next()<.5?i:a,kind:x.Spark})}t>=3&&this.arcs({...e,radius:4+t},.35),this.shakeAmp=Math.max(this.shakeAmp,.6+t*.25),this.shakeStart=e.tick}ricochetBurst(e,t){let n=Math.max(1,this.heatAt(e.tick));this.ricochetHeat=0,this.ricochetLast=-1e3;let r=this.rngFor(e,67),i=Math.max(8,e.radius);this.glows.push({x:e.x,y:e.y,r:i*1.7,start:e.tick,dur:22,color:8405247,strength:1.1*t}),this.glows.push({x:e.x,y:e.y,r:i*1.15,start:e.tick,dur:16,color:16736464,strength:1.3*t}),this.glows.push({x:e.x,y:e.y,r:i*.6,start:e.tick,dur:12,color:16777215,strength:1.6*t}),this.glows.push({x:e.x,y:e.y,r:i*.9,start:e.tick+3,dur:14,color:7397631,strength:.9*t});let a=Math.round((90+n*12)*t*this.mult)+10;for(let t=0;t<a;t++){let n=t/a*Math.PI*2+r.range(-.08,.08),o=r.range(1.2,2.2+i/10),s=r.next();this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*o,vy:Math.sin(n)*o-.6,life:r.range(14,30),size:1,color:s<.3?16777215:s<.55?16740560:s<.8?11567359:7397631,kind:x.Spark})}let o=Math.round(24*t*this.mult)+4;for(let t=0;t<o;t++)this.particles.add({x:e.x+r.range(-i*.6,i*.6),y:e.y+r.range(-i*.6,i*.3),vx:r.range(-.25,.25),vy:-r.range(.6,1.4),life:r.range(40,70),size:1,color:r.next()<.5?16752880:10547455,kind:x.Spark});this.arcs({...e,radius:i*.7},.8*t),this.tintSky([0,.55,.3,.9],.35*t),this.split=Math.max(this.split,1.5*t)}dustColor(e,t){let n=this.probe;for(let r=0;r<12;r+=2)for(let[i,a]of[[0,r],[r,0],[-r,0],[0,-r],[r,r],[-r,r]]){let r=n.material(Math.round(e+i),Math.round(t+a));if(r!==0)return n.color(r)}return 8018490}dirtBurst(e){let t=this.rngFor(e,13),n=this.dustColor(e.x,e.y+4),i=(e.params.low??20)*Math.PI/180,a=(e.params.high??70)*Math.PI/180,o=e.params.speed??4,s=e.params.lift??0,c=Math.round(160*this.mult)+8;for(let l=0;l<c;l++){let c=t.next()<.5?-1:1,l=t.range(i,a),u=t.range(.45,1)*o;this.particles.add({x:e.x+c*t.range(0,6),y:e.y-s+t.range(-3,3),vx:c*Math.cos(l)*u,vy:-Math.sin(l)*u,life:t.range(30,70),size:t.next()<.25?3:2,color:r(n,F[Math.floor(t.next()*F.length)]),kind:x.Chunk})}let l=Math.round(48*this.mult)+4;for(let i=0;i<l;i++){let a=i%2==0?-1:1;this.particles.add({x:e.x+a*t.range(2,10),y:e.y-t.range(0,4),vx:a*t.range(1,3.2),vy:-t.range(0,.3),life:t.range(40,80),size:t.range(3,6),color:r(n,t.next()<.5?.85:1.05),kind:x.Dust})}let u=Math.round(14*Math.max(.5,this.mult));for(let i=0;i<u;i++)this.particles.add({x:e.x+t.range(-12,12),y:e.y-t.range(0,14),vx:t.range(-.3,.3),vy:-t.range(.1,.5),life:t.range(70,120),size:t.range(5,9),color:r(n,.7),kind:x.Smoke});this.shakeAmp=Math.max(this.shakeAmp,5),this.shakeStart=e.tick}burst(e,t){let n=this.rngFor(e,1),i=Math.max(4,e.radius),a=Math.round(t*1.4*this.mult),o=.8+i/14;for(let t=0;t<a;t++){let t=n.range(Math.PI*.05,Math.PI*.95),r=n.range(.3,1)*o;this.particles.add({x:e.x+n.range(-2,2),y:e.y+n.range(-2,2),vx:Math.cos(t)*r*1.2,vy:-Math.sin(t)*r,life:n.range(14,36),size:n.range(.5,1.1),color:n.next()<.3?16773280:16742938,kind:x.Spark})}let s=this.dustColor(e.x,e.y+i*.5),c=Math.round(t*this.mult);for(let t=0;t<c;t++){let t=n.range(Math.PI*.1,Math.PI*.9),a=n.range(.4,1)*o*1.1;this.particles.add({x:e.x+Math.cos(t)*i*.6,y:e.y-Math.sin(t)*i*.4,vx:Math.cos(t)*a,vy:-Math.sin(t)*a,life:n.range(30,60),size:1,color:r(s,n.range(.75,1.15)),kind:x.Chunk})}let l=Math.round((3+i/5)*Math.max(.5,this.mult));for(let t=0;t<l;t++)this.particles.add({x:e.x+n.range(-i,i)*.5,y:e.y+n.range(-i,i)*.3,vx:n.range(-.25,.25),vy:-n.range(.05,.4),life:n.range(50,90),size:n.range(i*.25,i*.5),color:n.next()<.5?4866120:6970978,kind:x.Smoke})}tick(e){this.feedJets(e),this.fronts=this.fronts.filter(t=>{let n=(e-t.start)/t.dur;if(n>1)return!1;let i=t.maxR*n;if(t.cold)return this.frostFrontTick(t,i),!0;for(let e of[-1,1]){let n=Math.round(t.x+e*i),a=this.surfaceNear(n,t.y,t.maxR);if(a<0)continue;let o=Math.max(1,Math.round(3*this.mult)),s=this.dustColor(n,a+1);for(let i=0;i<o;i++)this.particles.add({x:n+t.rng.range(-1.5,1.5),y:a-t.rng.range(0,2),vx:e*t.rng.range(.3,1.2),vy:-t.rng.range(.1,.7),life:t.rng.range(24,48),size:t.rng.range(2.5,5),color:r(s,1.15),kind:x.Dust});t.rng.next()<.6*this.mult&&this.particles.add({x:n,y:a-1,vx:e*t.rng.range(.4,1.4),vy:-t.rng.range(.8,2),life:40,size:1,color:s,kind:x.Chunk})}return!0}),this.vortices=this.vortices.filter(t=>{let n=(e-t.start)/t.dur;if(n>1)return!1;if(n<0)return!0;let r=Math.max(1,Math.round((3+n*6)*this.mult));for(let e=0;e<r;e++){let e=t.rng.range(0,Math.PI*2),n=t.r*t.rng.range(.5,1.1),r=t.rng.range(14,24),i=n/r;this.particles.add({x:t.x+Math.cos(e)*n,y:t.y+Math.sin(e)*n*.8,vx:-Math.cos(e)*i*.9-Math.sin(e)*i*.8,vy:(-Math.sin(e)*i*.9+Math.cos(e)*i*.8)*.8,life:r,size:1,color:t.rng.next()<.35?16777215:t.rng.next()<.5?11563263:6308032,kind:x.Spark})}return e===t.start&&this.tintSky([0,.2,.08,.45],.3),!0});for(let t of this.funnels)this.funnelDust(t,e);if(this.funnels=this.funnels.filter(t=>e-t.last<=12),this.ripples=this.ripples.filter(t=>e-t.start<=t.dur),this.glows=this.glows.filter(t=>e-t.start<=t.dur),this.bolts=this.bolts.filter(t=>e-t.start<=t.dur),this.lances.active){let t=this.lances.tick(e,this.mult);t>0&&(this.shakeAmp=Math.max(this.shakeAmp*.9,t),e-this.shakeStart>6&&(this.shakeStart=e),this.tintSky([0,.7,.45,.2],.06))}this.crystals=this.crystals.filter(t=>e-t.start<=t.dur);let t=this.sky;t[0]*=.86,t[1]*=.86,t[2]*=.86,this.skyFlash=Math.max(t[0],t[1],t[2]),this.skyFlash<.002&&(this.skyFlash=0,t[0]=t[1]=t[2]=0),this.split=this.split>.3?this.split*.9:0;for(let n of this.funnels){if(e-n.last>2)continue;let r=.16*Math.min(1,(e-n.born)/30);t[0]=Math.min(t[0],-r),t[1]=Math.min(t[1],-r*.95),t[2]=Math.min(t[2],-r*.8)}}frostFrontTick(e,t){for(let n of[-1,1])for(let r=0;r<2;r++){let i=Math.round(e.x+n*(t-r*2)),a=this.surfaceNear(i,e.y,e.maxR);if(a<0)continue;let o=Math.max(1,Math.round(3*this.mult));for(let t=0;t<o;t++)this.particles.add({x:i+e.rng.range(-1.5,1.5),y:a-e.rng.range(0,1.5),vx:n*e.rng.range(.05,.6),vy:-e.rng.range(.4,1.6),life:e.rng.range(10,26),size:1,color:I[Math.floor(e.rng.next()*3)],kind:x.Spark});e.rng.next()<.5*this.mult&&this.particles.add({x:i,y:a-1,vx:n*e.rng.range(.1,.5),vy:-e.rng.range(.03,.12),life:e.rng.range(60,110),size:e.rng.range(4,8),color:e.rng.next()<.5?15004412:12771058,kind:x.Dust})}let n=Math.round(e.x-t),r=Math.round(e.x+t);for(let i of[n,r]){let n=this.surfaceNear(i,e.y,e.maxR);n>=0&&this.glows.push({x:i,y:n,r:3,start:Math.floor(e.start+t/e.maxR*e.dur),dur:6,color:12575994,strength:.9})}}surfaceNear(e,t,n){let r=this.probe;if(e<0||e>=r.width)return-1;let i=Math.max(1,Math.round(t-n)),a=Math.min(r.height-1,Math.round(t+n));for(let t=i;t<=a;t++)if(r.material(e,t)!==0&&r.material(e,t-1)===0)return t;return-1}shake(e){let t=e-this.shakeStart;if(this.shakeAmp<=0||t>18||t<0)return[0,0];let n=this.shakeAmp*(1-t/18)**2;return[Math.sin(t*2.1)*n,Math.cos(t*2.9)*n*.6]}gasBurst(e){let t=this.rngFor(e,23),n=Math.round((e.params.count??18)*this.mult)+4;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+t.range(-2,2),y:e.y-t.range(0,3),vx:n*t.range(.4,1.6),vy:-t.range(.05,.5),life:t.range(40,80),size:t.range(4,8),color:t.next()<.5?8369438:11066416,kind:x.Dust})}for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-1,vx:t.range(-.7,.7),vy:-t.range(1.2,2.8),life:t.range(20,40),size:1,color:t.next()<.3?15794064:11066416,kind:x.Chunk});for(let n=0;n<6;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y-2,vx:t.range(-.2,.2),vy:-t.range(.4,.9),life:t.range(40,70),size:t.range(4,7),color:6986266,kind:x.Smoke});this.tintSky([0,.12,.3,.02],.35)}drawGlows(e,t){for(let n of this.glows){let r=Math.max(0,(t-n.start)/n.dur);if(r>1)continue;let i=(1-r)*(1-r)*n.strength,a=n.r*(.55+.45*r);e.push(n.x,n.y,a*2,a*2,n.color,.75*i,y.Pixel),e.push(n.x,n.y,a*.8,a*.8,16774880,.9*i,y.Pixel)}}drawBolts(e,t){for(let n of this.bolts){let r=t-n.start;if(r<0||r>n.dur||!(r<3||r>=4&&r<6||r>=8&&r<10||r>=11))continue;let i=r<11?1:Math.max(0,1-(r-11)/Math.max(1,n.dur-11)),a=n.cells;for(let t=0;t<a.length;t+=2){let r=t>=n.main,o=a[t]+.5,s=a[t+1]+.5;r?(e.push(o,s,3,1,4219072,.4*i),e.push(o,s,1,1,11585791,.75*i)):(e.push(o,s,7,1,3166400,.45*i),e.push(o,s,3,1,13689087,.9*i),e.push(o,s,1,1,16777215,i))}}}drawCrystals(e,t){for(let n of this.crystals){let r=t-n.start;if(r<0||r>n.dur)continue;let i=n.cells,a=i.length,o=n.len*Math.min(1,(r+1)/5),s=r<12?1:1-(r-12)/(n.dur-12),c=n.len*Math.max(0,s);for(let t=0;t<a;t+=2){let r=i[t]-n.x,a=i[t+1]-n.y,l=Math.sqrt(r*r+a*a);if(l>o||l>c+2)continue;let u=(i[t]*73856093^i[t+1]*19349663)>>>0;if(s<1&&(u>>>8&255)/255>s+.3)continue;let d=i[t]+.5,f=i[t+1]+.5;e.push(d,f,3,3,6203612,.45*s),e.push(d,f,1,1,u&7?14086399:16777215,s)}}}drawRippleRings(e,t){for(let n of this.ripples){let r=(t-n.start)/n.dur;if(r<0||r>1)continue;let i=n.maxR*Math.sqrt(r);e.push(n.x,n.y,i*2.35,i*2.35,11587839,.35*(1-r)*n.strength,y.Ring)}}clear(){this.ripples=[],this.glows=[],this.fronts=[],this.bolts=[],this.jets=[],this.crystals=[],this.mushrooms=[],this.lances.clear(),this.vortices=[],this.funnels=[],this.shakeAmp=0,this.skyFlash=0,this.sky[0]=this.sky[1]=this.sky[2]=0,this.split=0}},fe=240,V=[5302527,7385343,10125567,13660415,16738504,16756976,16777215],H=[10139706,12120128,11563263,9225253];function U(e,t,n,r,i){let a=Math.abs(n-e),o=-Math.abs(r-t),s=e<n?1:-1,c=t<r?1:-1,l=a+o,u=e,d=t;for(;u!==n||d!==r;){let e=2*l;e>=o&&(l+=o,u+=s),e<=a&&(l+=a,d+=c),i.push(u,d)}}function W(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var G=(e,t)=>(e%t+t)%t;function pe(e,t,n,r,i,a,o){let s=n.ambient;if(s.kind===`none`||s.kind===`stars`||s.density<=0)return;let c=a.width,l=a.height,u=Math.round(s.density*c*o/1e3),d=Math.max(-1.5,Math.min(1.5,i*120));for(let n=0;n<u;n++){let i=W(n,1),o=W(n,2),u=W(n,3);if(s.kind===`rain`){let t=4+u*2,n=l+40,f=Math.floor(G(r*t+o*n,n))-20,p=Math.floor(G(i*c+(f+20)*(.35+d*.5),c));if(f<0||a.solid(p,f))continue;if(a.solid(p,f+1)){e.push(p-.5,f+.5,1,1,s.color,.7),e.push(p+1.5,f-.5,1,1,s.color,.5);continue}e.push(p+.5,f-2,1,5,s.color,.4+u*.3)}else if(s.kind===`snow`){let t=.25+u*.3,n=l+10,f=Math.floor(G(r*t+o*n,n))-5,p=Math.round(Math.sin(r*.03+i*40)*2+f*d*.3),m=Math.floor(G(i*c+p,c));if(f<0||a.solid(m,f))continue;let h=u>.8?2:1;e.push(m+h/2,f+h/2,h,h,s.color,.85)}else if(s.kind===`embers`){let e=.3+u*.5,f=l+10,p=l-Math.floor(G(r*e+o*f,f)),m=Math.round(Math.sin(r*.05+i*30)*3+(l-p)*d*.4),h=Math.floor(G(i*c+m,c));if(p<0||p>=l||a.solid(h,p))continue;let g=W(n,Math.floor(r/6))>.5;t.push(h+.5,p+.5,1,1,g?16765040:s.color,Math.min(1,p/(l*.4)))}else{let t=Math.floor(G(i*c+r*(.08+u*.1)*(d>=0?1:-1),c)),n=Math.floor(o*l*.85+Math.sin(r*.02+i*50)*4);if(n<0||a.solid(t,n))continue;e.push(t+.5,n+.5,1,1,s.color,.3+u*.3)}}}function me(e,t,n,r,i,a){for(let o=0;o<n.length;o++){let s=n[o];if(s.puffs&&s.puffs.length>0){ve(e,s,r,i,a);continue}let c=Math.max(4,s.radius),l=Math.min(1,.45+s.turns*.2),u=s.x*131+s.y*7;if(s.look===`gas`||s.look===`acid`){let t=s.look===`gas`?H[0]:H[1],n=Math.round(Math.min(40,c*c/60+6)*Math.max(.5,a));for(let i=0;i<n;i++){let n=W(i,u)*Math.PI*2+r*.008*(W(i,u+1)-.5),a=Math.sqrt(W(i,u+2))*c*.85,o=Math.round(s.x+Math.cos(n)*a+Math.sin(r*.02+i)*2),d=Math.round(s.y+Math.sin(n)*a*.6-2),f=5+W(i,u+3)*7;e.push(o,d,f,f,t,(s.look===`gas`?.3:.2)*l,y.Pixel)}if(s.look===`acid`){let t=Math.round(Math.min(30,c/2+4)*Math.max(.5,a));for(let n=0;n<t;n++){let t=Math.round(s.x+(W(n,u+4)-.5)*c*1.6),a=c*1.4,o=Math.round(s.y-c*.4+G(r*1.2+W(n,u+5)*a,a));i.solid(t,o)||e.push(t+.5,o,1,2,14221152,.85*l)}}}else{for(let e=0;e<2;e++){let n=G(r/50+e/2,1),a=Math.max(2,c*n),o=Math.max(12,Math.round(a*5)),u=(1-n)*.8*l,d=NaN,f=NaN;for(let e=0;e<o;e++){let n=e/o*Math.PI*2,r=Math.round(s.x+Math.cos(n)*a),c=Math.round(s.y+Math.sin(n)*a);(r!==d||c!==f)&&(d=r,f=c,i.solid(r,c)||t.push(r+.5,c+.5,1,1,H[2],u))}}let e=G(r,25)<4?1:.5;t.push(s.x+.5,s.y+.5,6,6,H[2],.5*e*l,y.Pixel)}}}var he=4880908,ge=9226266,K=12119084,q=15400826,J=10936356,Y=new Float32Array(4096);function _e(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=X(r,i,n),u=X(r+1,i,n),d=X(r,i+1,n),f=l+(u-l)*s;return f+(d+(X(r+1,i+1,n)-d)*s-f)*c}function X(e,t,n){return W((e&1023)+((t&1023)<<10),n)}function ve(e,t,n,r,i){let a=t.puffs,o=a.length>>1,s=Math.max(3,t.puffRadius??10),c=t.age??1e3,l=Math.min(1,.3+c/50),u=t.turns<=1?.8:1,d=1/0,f=1/0,p=-1/0,m=-1/0;for(let e=0;e<o;e++)d=Math.min(d,a[2*e]),p=Math.max(p,a[2*e]),f=Math.min(f,a[2*e+1]),m=Math.max(m,a[2*e+1]);let h=Math.ceil(s*1.5)+3,g=Math.max(0,d-h),_=Math.max(0,f-h-4),v=Math.min(r.width,p+h),y=Math.min(r.height,m+h),b=v-g,x=y-_;if(b<=0||x<=0)return;Y.length<b*x&&(Y=new Float32Array(b*x*2)),Y.fill(0,0,b*x);for(let e=0;e<o;e++){let t=e*2.399,r=s*l*(.82+.22*Math.sin(n*.045+t)),i=a[2*e]+.5+Math.sin(n*.031+t*1.3)*1.6,o=a[2*e+1]+.5-r*.35+Math.cos(n*.037+t)*1.1,c=r*1.2,d=1/(c*c),f=Math.max(g,Math.floor(i-c)),p=Math.min(v-1,Math.ceil(i+c)),m=Math.max(_,Math.floor(o-c)),h=Math.min(y-1,Math.ceil(o+c));for(let e=m;e<=h;e++){let t=(e+.5-o)*1.25,n=(e-_)*b-g;for(let e=f;e<=p;e++){let r=e+.5-i,a=1-(r*r+t*t)*d;a>0&&(Y[n+e]=Y[n+e]+a*u)}}}let S=n*.05;for(let t=_;t<y;t++){let n=(t-_)*b-g,i=-1,a=0,o=0;for(let s=g;s<=v;s++){let c=0,l=0;if(s<v){let e=Y[n+s];if(e>.12&&!r.solid(s,t)){let r=e*(.6+.8*(_e((s-S)/7,(t+S*.6)/5,41)*.7+_e(s/3,(t+S)/3,42)*.3)),i=t-2>=_?Y[n-2*b+s]:0;r>1.7?(c=he,l=.72):r>.9?(c=i<.45?q:ge,l=i<.45?.78:.62):r>.45?(c=i<.25?q:K,l=.5):r>.2&&!(s+t&1)?(c=J,l=.45):r>.3&&((s^t)&3)==1&&(c=J,l=.35)}}c===a&&l===o&&i>=0||(i>=0&&a!==0&&e.rect(i,t,s-i,1,a,o),i=s,a=c,o=l)}}let C=Math.round(o*1.5*Math.max(.4,i));for(let t=0;t<C;t++){let i=t%o,c=s*l,d=90+W(t,61)*80,f=G(n+W(t,62)*d,d)/d,p=a[2*i]+(W(t,63)-.5)*c*1.6,m=a[2*i+1]-c*.9,h=6+Math.floor(W(t,64)*10);for(let i=0;i<h;i++){let a=Math.floor(m-f*c*1.2-i),o=Math.floor(p+Math.sin(n*.04+i*.45+t)*(1+i*.25));if(!((o+a&1)==1&&i>2)){if(a<0||r.solid(o,a))break;e.push(o+.5,a+.5,1,1,i<3?K:J,(1-f)*(1-i/h)*.6*u)}}}let w=Math.round(o*2*Math.max(.4,i));for(let t=0;t<w;t++){let i=t%o,c=s*l,d=c*1.4,f=G(n*(.18+W(t,977)*.2)+W(t,978)*d,d),p=Math.floor(a[2*i]+(W(t,979)-.5)*c*1.4),m=Math.floor(a[2*i+1]+1-f);p<g||p>=v||m<_||m>=y||Y[(m-_)*b+(p-g)]<.5||r.solid(p,m)||e.push(p+.5,m+.5,1,1,f>d*.85?16777152:q,.9*u)}}function ye(e,t){if(t<=0)return 0;let n=Math.floor(e/30);if(W(n,91)>=30/t)return 0;let r=e-n*30;return r<2?.32:r>=3&&r<5?.18:0}var be=16,xe=class{mapW;mapH;vw=1;vh=1;dpr=1;cx=0;cy=0;s=1;fitted=!0;constructor(e,t){this.mapW=e,this.mapH=t,this.cx=e/2,this.cy=t/2}get scale(){return this.s}get isFit(){return this.fitted}fitScale(){let e=Math.min(this.vw/this.mapW,this.vh/this.mapH);return e>=1&&this.dpr<2?Math.floor(e):e}setViewport(e,t,n){this.dpr=n,this.vw=Math.max(1,Math.round(e*n)),this.vh=Math.max(1,Math.round(t*n)),this.fitted?this.fit():this.clamp()}fit(){this.s=this.fitScale(),this.cx=this.mapW/2,this.cy=this.mapH/2,this.fitted=!0}get ox(){return Math.round(this.vw/2-this.cx*this.s)}get oy(){return Math.round(this.vh/2-this.cy*this.s)}zoomBy(e,t){let n=this.fitScale(),r;e>0?r=this.s<1?1:Math.floor(this.s)+e:(r=Math.ceil(this.s)+e,(r<1||r<n)&&(r=n)),this.zoomAround(Math.min(be,r),t)}zoomTo(e,t){let n=this.fitScale(),r=Math.max(n,Math.min(be,e));r>=1&&(r=Math.max(n,Math.round(r))),this.zoomAround(r,t)}zoomAround(e,t){let n=t?t.x*this.dpr:this.vw/2,r=t?t.y*this.dpr:this.vh/2,i=(n-this.ox)/this.s,a=(r-this.oy)/this.s;this.s=e,this.cx=i-(n-this.vw/2)/e,this.cy=a-(r-this.vh/2)/e,this.fitted=e===this.fitScale()&&this.coversWhole(),this.fitted?this.fit():this.clamp()}coversWhole(){return this.mapW*this.s<=this.vw&&this.mapH*this.s<=this.vh}pan(e,t){this.cx-=e*this.dpr/this.s,this.cy-=t*this.dpr/this.s,this.fitted=!1,this.clamp()}clamp(){let e=this.vw/2/this.s,t=this.vh/2/this.s;this.cx=this.mapW<=2*e?this.mapW/2:Math.max(e,Math.min(this.mapW-e,this.cx)),this.cy=this.mapH<=2*t?this.mapH/2:Math.max(t,Math.min(this.mapH-t,this.cy))}unproject(e){return{x:(e.x*this.dpr-this.ox)/this.s,y:(e.y*this.dpr-this.oy)/this.s}}project(e){return{x:(this.ox+e.x*this.s)/this.dpr,y:(this.oy+e.y*this.s)/this.dpr}}},Se={1:[2,6,2,2,7],2:[6,1,2,4,7],3:[6,1,2,1,6],4:[5,5,7,1,1],5:[7,4,6,1,6],6:[3,4,6,5,2],7:[7,1,2,2,2],8:[2,5,2,5,2],9:[2,5,3,1,6]},Ce=65536,we=[`u_size`,`u_map`,`u_top`,`u_bottom`,`u_cloud`,`u_cloudLight`,`u_cloudShadow`,`u_ranges`,`u_rangeCount`,`u_horizon`,`u_cam`],Te=600,Ee=2048,De=.12,Z=8380671,Oe={sprite:[`......HHHH......`,`.....hhhhhh.....`,`....hhhhhhhh....`,`.HHHHHHHHHHHHHH.`,`.hhhhhhhhhhhhhh.`,`.dhhhhhhhhhhhhd.`,`tttttttttttttttt`,`twwttwwttwwttwwt`,`tttttttttttttttt`],barrel:{x:0,y:7,length:8,width:1}},Q=[`......ccwwwcc......`,`...cccwwcccwwccc...`,`.ccwwcccwwwcccwwcc.`,`cccwwcccwwwcccwwccc`,`cccwwcccwwwcccwwccc`,`d.d.d.d.d.d.d.d.d.d`],ke=[[-9,-6],[-4,-2],[4,2],[9,6]],Ae=45;function je(e,t,n){switch(e){case 72:return r(t,1.3);case 100:return r(t,.72);case 116:return 2827810;case 119:return 5591114;case 109:return 14209736;case 115:return n?Z:4872800;case 103:return 10473696;default:return t}}var Me=[.62,.8,.96,1.12],Ne=class{mapWidth;mapHeight;camera;gl;canvas;unsubscribe;theme=n;quality=`medium`;palette;shakeOn=!0;terrainTex;coatTex;grassTex;grassMask;grassRound=-1;burnTex;burn;lastBurn=-1;wreckY=[];wreckV=[];colorTex;colorFbo;bgProg;sceneryProg;uScn;sceneryTex;sceneryFbo;sceneryW=0;sceneryH=0;sceneryKey=``;uBg;lookTex;lookFlags=new Uint8Array(256);anyCycle=!1;anyHot=!1;flameCells=new Int32Array(Ee);flameN=0;coating=new Uint8Array;dirty=[0,0,0,0];paletteTex;sceneTex;sceneFbo;sceneW=0;sceneH=0;terrainProg;postProg;emptyVao;uTer;uPost;normal;additive;particles;fx;terrain;entities=[];meteors=new Map;zones=[];probe;debris={count:0,x:new Int32Array,y:new Int32Array,vx:new Int32Array,material:new Uint8Array};wind=0;cloudX=0;horizon=-1;rangeBuf=new Float32Array(9);lastTick=0;fxTick=-1;trails=[];rippleBuf=new Float32Array(32);rippleW=new Float32Array(8);shieldHitAt=[];shieldUpAt=[];batteryAt=[];constructor(e,t){this.mapWidth=e,this.mapHeight=t,this.camera=new xe(e,t),this.terrain=new Uint8Array(e*t),this.grassMask=new Uint8Array(e*t),this.burn=new Uint32Array(e*t),this.probe={width:e,height:t,solid:(n,r)=>n>=0&&r>=0&&n<e&&r<t&&this.terrain[r*e+n]!==0}}mount(t,n,r){this.canvas=t;let i=t.getContext(`webgl2`,{antialias:!1,alpha:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,preserveDrawingBuffer:r.preserveDrawingBuffer??!1,powerPreference:`high-performance`});if(!i)throw Error(`WebGL2 is not available`);this.gl=i,this.palette=r.palette,this.theme=e(r.theme,r.palette.themes),this.shakeOn=r.shake??!0,this.terrainProg=p(i,c,l),this.uTer=m(i,this.terrainProg,[`u_view`,`u_origin`,`u_scale`,`u_map`,`u_terrain`,`u_coat`,`u_palette`,`u_grain`,`u_light`,`u_wet`,`u_snow`,`u_look`,`u_grass`,`u_ground`,`u_flowers`,`u_grassMask`]),this.bgProg=p(i,a,o),this.uBg=m(i,this.bgProg,[`u_color`,`u_view`,`u_origin`,`u_scale`,`u_map`,`u_top`,`u_bottom`,`u_letterbox`,`u_flash`,`u_vignette`,`u_terrain`,`u_coat`,`u_look`,`u_palette`,`u_time`,`u_haze`,`u_anim`,`u_stars`,`u_starColor`,`u_scenery`,`u_grass`,`u_grassMask`,`u_burn`,`u_burnOn`]),this.sceneryProg=p(i,a,s),this.uScn=m(i,this.sceneryProg,we),this.postProg=p(i,a,f),this.uPost=m(i,this.postProg,[`u_scene`,`u_view`,`u_shake`,`u_rippleCount`,`u_ripple`,`u_rippleW`,`u_tint`,`u_origin`,`u_scale`,`u_split`,`u_scan`]),this.emptyVao=i.createVertexArray(),i.pixelStorei(i.UNPACK_ALIGNMENT,1),this.terrainTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,this.terrain),this.coatTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,new Uint8Array(this.mapWidth*this.mapHeight)),this.grassTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,this.grassMask),this.burnTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.R32UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_INT,this.burn),this.paletteTex=h(i),this.lookTex=h(i),this.uploadPalette(),this.colorTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,this.mapWidth,this.mapHeight,0,i.RGBA,i.UNSIGNED_BYTE,null),this.sceneryW=Math.ceil(this.mapWidth/2),this.sceneryH=Math.ceil(this.mapHeight/2),this.sceneryTex=h(i),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,this.sceneryW,this.sceneryH,0,i.RGBA,i.UNSIGNED_BYTE,null),this.sceneryFbo=i.createFramebuffer(),i.bindFramebuffer(i.FRAMEBUFFER,this.sceneryFbo),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,this.sceneryTex,0),this.colorFbo=i.createFramebuffer(),i.bindFramebuffer(i.FRAMEBUFFER,this.colorFbo),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,this.colorTex,0),i.bindFramebuffer(i.FRAMEBUFFER,null),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.sceneTex=h(i,i.LINEAR),this.sceneFbo=i.createFramebuffer(),this.normal=new b(i),this.additive=new b(i),this.setQuality(r.quality),this.unsubscribe=n.subscribe(e=>this.push(e)),this.resize(t.clientWidth||t.width,t.clientHeight||t.height,1)}uploadPalette(){let e=this.gl,t=new Uint8Array(1024);for(let e=0;e<256;e++){let n=this.palette.materials[e]??0;t[e*4]=n>>16&255,t[e*4+1]=n>>8&255,t[e*4+2]=n&255,t[e*4+3]=255}e.bindTexture(e.TEXTURE_2D,this.paletteTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,1,0,e.RGBA,e.UNSIGNED_BYTE,t);let n=new Uint8Array(9216);for(let e of this.palette.looks??[]){if(e.cell<=0||e.cell>255)continue;let t=Math.min(8,e.cycle.length);n[e.cell*4]=t>=2?t:0,this.lookFlags[e.cell]=(t>=2||e.glint?1:0)|(e.hot?2:0)|(e.flames?4:0),n[e.cell*4+1]=Math.max(1,Math.min(255,e.ticks)),n[e.cell*4+2]=e.hot?255:e.glint?96:0,n[e.cell*4+3]=e.topsoil?255:e.char?128:0;for(let r=0;r<t;r++){let t=((1+r)*256+e.cell)*4,i=e.cycle[r];n[t]=i>>16&255,n[t+1]=i>>8&255,n[t+2]=i&255,n[t+3]=255}}e.bindTexture(e.TEXTURE_2D,this.lookTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,9,0,e.RGBA,e.UNSIGNED_BYTE,n)}setQuality(e){this.quality=e;let t=B[e],n=this.particles;n&&n.cap===t.cap||(this.particles=new C(t.cap),this.fx=new de(this.particles,{width:this.mapWidth,height:this.mapHeight,material:(e,t)=>e<0||t<0||e>=this.mapWidth||t>=this.mapHeight?0:this.terrain[t*this.mapWidth+e],color:e=>this.palette.materials[e]??8018490})),this.fx.mult=t.mult}setTheme(t){this.theme=e(t,this.palette.themes),this.dirty=[0,0,this.mapWidth,this.mapHeight]}resize(e,t,n){this.camera.setViewport(e,t,n);let r=this.camera.vw,i=this.camera.vh;if(this.canvas.width!==r&&(this.canvas.width=r),this.canvas.height!==i&&(this.canvas.height=i),r!==this.sceneW||i!==this.sceneH){let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.sceneTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,r,i,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,this.sceneFbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.sceneTex,0),e.bindFramebuffer(e.FRAMEBUFFER,null),this.sceneW=r,this.sceneH=i}}unproject(e){return this.camera.unproject(e)}project(e){return this.camera.project(e)}push(e){let t=this.gl;if(e.dirtyRects.length>0){t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.pixelStorei(t.UNPACK_ROW_LENGTH,e.width);for(let n of e.dirtyRects){if(n.w<=0||n.h<=0)continue;t.pixelStorei(t.UNPACK_SKIP_PIXELS,n.x),t.pixelStorei(t.UNPACK_SKIP_ROWS,n.y),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.terrain),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.coating),t.bindTexture(t.TEXTURE_2D,this.terrainTex);let r=this.dirty,i=r[0]>=r[2];r[0]=Math.max(0,Math.min(i?1/0:r[0],n.x-16)),r[1]=Math.max(0,Math.min(i?1/0:r[1],n.y-1)),r[2]=Math.min(this.mapWidth,Math.max(i?-1/0:r[2],n.x+n.w+16)),r[3]=Math.min(this.mapHeight,Math.max(i?-1/0:r[3],n.y+n.h+32))}t.pixelStorei(t.UNPACK_ROW_LENGTH,0),t.pixelStorei(t.UNPACK_SKIP_PIXELS,0),t.pixelStorei(t.UNPACK_SKIP_ROWS,0)}this.terrain=e.terrain,this.coating=e.coating;let n=Math.floor(e.turn/1e3);(this.grassRound<0||n!==this.grassRound&&e.dirtyRects.some(t=>t.x===0&&t.y===0&&t.w>=e.width&&t.h>=e.height))&&e.width===this.mapWidth&&e.height===this.mapHeight&&(this.grassRound=n,Fe(e.terrain,e.width,e.height,this.grassMask),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.texSubImage2D(t.TEXTURE_2D,0,0,0,e.width,e.height,t.RED_INTEGER,t.UNSIGNED_BYTE,this.grassMask),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.burn.fill(0),this.lastBurn=-1,this.uploadBurn(0,0,e.width,e.height),this.wreckY=[],this.wreckV=[]),(e.tick%20==0||this.fxTick<0)&&this.scanLooks(),this.horizon<0&&(this.horizon=Pe(e.terrain,e.width,e.height)),this.entities=e.entities,this.zones=[];for(let t of e.entities)t.kind===`zone`&&this.zones.push(t);for(this.witherGrass(),this.debris=e.debris,this.wind=e.wind,this.lastTick=e.tick,this.fxTick<0&&(this.fxTick=e.tick);this.fxTick<e.tick;)this.stepFx();for(let t of e.effectEvents)this.fx.handle(t),t.type===`flash`?(t.params.strength??1)>0&&this.scorch(t.x,t.y,t.radius,t.tick):t.type===`geyser`?this.scorch(t.x,t.y,t.radius*1.8,t.tick):t.type===`tsunami`&&this.scour(t.x,t.params.dir??1,(t.params.len??0)+12),t.type===`shieldHit`?this.shieldHitAt[t.params.player??-1]=t.tick:t.type===`shieldUp`?this.shieldUpAt[t.params.player??-1]=t.tick:t.type===`battery`&&(this.batteryAt[t.params.player??-1]=t.tick);this.fx.lances.track(e.entities,e.tick),this.updateTrails(e)}witherGrass(){let e=this.grassMask,t=this.mapWidth,n=this.mapHeight,r=t,i=n,a=0,o=0;for(let s of this.zones){let c=s.puffs;if(!c||c.length===0||s.look!==`toxic`)continue;let l=Math.round((s.puffRadius??8)*Math.min(1,.3+(s.age??1e3)/50));for(let s=0;s<c.length;s+=2){let u=c[s],d=c[s+1],f=Math.max(0,d-l),p=Math.min(n-1,d+4);for(let n=Math.max(0,u-l);n<=Math.min(t-1,u+l);n++){let s=n-u;for(let c=f;c<=p;c++){let u=c*t+n;if(e[u]!==1)continue;let f=Math.max(0,d-c);s*s+f*f>l*l||(e[u]=2,n<r&&(r=n),n>a&&(a=n),c<i&&(i=c),c>o&&(o=c))}}}}if(r>a)return;let s=this.gl;s.bindTexture(s.TEXTURE_2D,this.grassTex),s.pixelStorei(s.UNPACK_ROW_LENGTH,t),s.pixelStorei(s.UNPACK_SKIP_PIXELS,r),s.pixelStorei(s.UNPACK_SKIP_ROWS,i),s.texSubImage2D(s.TEXTURE_2D,0,r,i,a-r+1,o-i+1,s.RED_INTEGER,s.UNSIGNED_BYTE,e),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0);let c=this.dirty,l=c[0]>=c[2];c[0]=Math.max(0,Math.min(l?1/0:c[0],r-1)),c[1]=Math.max(0,Math.min(l?1/0:c[1],i-1)),c[2]=Math.min(t,Math.max(l?-1/0:c[2],a+2)),c[3]=Math.min(n,Math.max(l?-1/0:c[3],o+34))}scour(e,t,n){let r=t>0?e-n:e-2,i=t>0?e+2:e+n,a=Math.max(0,Math.floor(r)),o=Math.min(this.mapWidth,Math.ceil(i)+1);if(a>=o)return;let s=this.mapWidth;for(let e=0;e<this.mapHeight;e++)this.grassMask.fill(0,e*s+a,e*s+o);let c=this.gl;c.bindTexture(c.TEXTURE_2D,this.grassTex),c.pixelStorei(c.UNPACK_ROW_LENGTH,s),c.pixelStorei(c.UNPACK_SKIP_PIXELS,a),c.pixelStorei(c.UNPACK_SKIP_ROWS,0),c.texSubImage2D(c.TEXTURE_2D,0,a,0,o-a,this.mapHeight,c.RED_INTEGER,c.UNSIGNED_BYTE,this.grassMask),c.pixelStorei(c.UNPACK_ROW_LENGTH,0),c.pixelStorei(c.UNPACK_SKIP_PIXELS,0);let l=this.dirty,u=l[0]>=l[2];l[0]=u?a:Math.min(l[0],a),l[1]=0,l[2]=u?o:Math.max(l[2],o),l[3]=this.mapHeight}scorch(e,t,n,r){let i=Math.ceil(n*1.15)+2,a=this.mapWidth,o=Math.max(0,Math.floor(e-i)),s=Math.max(0,Math.floor(t-i)),c=Math.min(a,Math.ceil(e+i)+1),l=Math.min(this.mapHeight,Math.ceil(t+i)+1);if(o>=c||s>=l)return;let u=i*i,d=r+1,f=this.burn;for(let n=s;n<l;n++){let r=n-t;for(let t=o;t<c;t++){let i=t-e;i*i+r*r<=u&&(f[n*a+t]=d)}}this.lastBurn=Math.max(this.lastBurn,r),this.uploadBurn(o,s,c-o,l-s)}uploadBurn(e,t,n,r){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.burnTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,this.mapWidth),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,t),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.texSubImage2D(i.TEXTURE_2D,0,e,t,n,r,i.RED_INTEGER,i.UNSIGNED_INT,this.burn),i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0)}restRow(e,t){let n=this.mapWidth,r=this.terrain;for(let i=Math.max(0,Math.floor(t));i<this.mapHeight;i++){let t=i*n;for(let a=Math.max(0,e-7);a<Math.min(n,e+7);a++)if(r[t+a]!==0)return i}return this.mapHeight+12}stepWrecks(){for(let e of this.entities){if(e.kind!==`tank`)continue;let t=e.player;if(e.alive){this.wreckY[t]=NaN;continue}let n=this.wreckY[t]??NaN;Number.isNaN(n)&&(n=e.y,this.wreckV[t]=0);let r=this.restRow(e.x,n);if(n<r){let e=Math.min((this.wreckV[t]??0)+.2,4);this.wreckV[t]=e,n=Math.min(n+e,r)}else this.wreckV[t]=0;this.wreckY[t]=n}}tankY(e){if(e.alive)return e.y;let t=this.wreckY[e.player];return t===void 0||Number.isNaN(t)?e.y:Math.floor(t)}scanLooks(){let e=this.lookFlags,t=0,n=this.terrain;for(let r=0;r<n.length;r++)t|=e[n[r]];let r=this.coating;for(let n=0;n<r.length;n++)t|=e[r[n]];if(this.anyCycle=!!(t&1),this.anyHot=!!(t&2),this.flameN=0,!(t&4))return;let i=this.mapWidth;for(let t=i;t<n.length&&this.flameN<Ee;t++)e[n[t]]&4&&n[t-i]===0&&(this.flameCells[this.flameN++]=t)}stepFlames(){let e=this.flameN;if(e===0)return;let t=this.mapWidth,n=this.terrain,r=this.lookFlags,i=B[this.quality].mult,a=Math.min(e,Math.round((4+e/6)*i)),o=Math.imul(this.fxTick+1,2654435761)>>>0,s=t,c=0,l=this.mapHeight,u=0,d=!1;for(let i=0;i<a;i++){o=Math.imul(o^o>>>15,2246822519)+2654435769>>>0;let i=this.flameCells[o%e];if(!(r[n[i]]&4)||n[i-t]!==0)continue;let a=i%t+.5,f=Math.floor(i/t),p=o>>>8&255,m=i%t,h=this.fxTick+1;for(let e=-1;e<=3;e++){let n=f+e;if(!(n<0||n>=this.mapHeight))for(let e=-1;e<=1;e++){let r=m+e;if(r<0||r>=t)continue;let i=n*t+r;this.burn[i]=h,this.grassMask[i]!==0&&(this.grassMask[i]=0,d=!0)}}m-1<s&&(s=m-1),m+2>c&&(c=m+2),f-1<l&&(l=Math.max(0,f-1)),f+4>u&&(u=f+4),this.particles.add({x:a,y:f-1,vx:((p&15)-7.5)*.02,vy:-.3-(p>>4)*.04,life:8+(p&7),size:1+(p&1)+(p>>7&1),color:0,kind:x.Flame}),p&7||this.particles.add({x:a,y:f-2,vx:((p&15)-7.5)*.04,vy:-.9-(p>>5)*.05,life:18,size:1,color:16760896,kind:x.Spark}),p&15||this.particles.add({x:a,y:f-6,vx:this.wind*.08,vy:-.35,life:70,size:3+(p&3),color:2761768,kind:x.Smoke})}if(c>s){let e=Math.max(0,s),n=Math.min(t,c),r=Math.min(this.mapHeight,u);if(this.lastBurn=Math.max(this.lastBurn,this.fxTick),this.uploadBurn(e,l,n-e,r-l),d){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.grassTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,t),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,l);let a=n-e,o=r-l;i.texSubImage2D(i.TEXTURE_2D,0,e,l,a,o,i.RED_INTEGER,i.UNSIGNED_BYTE,this.grassMask),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0);let s=this.dirty,c=s[0]>=s[2];s[0]=Math.max(0,Math.min(c?1/0:s[0],e-16)),s[1]=Math.max(0,Math.min(c?1/0:s[1],l-1)),s[2]=Math.min(t,Math.max(c?-1/0:s[2],n+16)),s[3]=Math.min(this.mapHeight,Math.max(c?-1/0:s[3],r+32))}}}stepMeteors(e){let t=this.meteorLive;t.clear();for(let n of this.entities){if(n.kind!==`projectile`)continue;let r=e[n.weapon];if(r?.shell!==`meteor`)continue;t.add(n.id);let i=this.meteors.get(n.id);if(!i){this.meteors.set(n.id,{x:n.x,y:n.y,dx:0,dy:0});continue}let a=n.x-i.x,o=n.y-i.y,s=i.x,c=i.y;if(i.x=n.x,i.y=n.y,o<=0||o>24||Math.abs(a)>24){i.dx=0,i.dy=0;continue}if(i.dx=a,i.dy=o,n.y<-8)continue;let l=r.size??1,u=Math.max(1,Math.ceil(Math.max(Math.abs(a),o)/1.5)),d=B[this.quality].mult,f=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n.id+1,40503))>>>0;for(let e=0;e<u;e++){f=Math.imul(f^f>>>15,2246822519)+2654435769>>>0;let t=e/u;this.particles.add({x:s+a*t+((f&3)-1.5)*.6*l,y:c+o*t+((f>>>2&3)-1.5)*.6*l,vx:-a*.03,vy:-o*.03-.15,life:(12+(f>>>4&15))*(.7+l*.3),size:Math.round((2+(f>>>8&1))*l),color:0,kind:x.Flame}),!(f>>>9&3)&&d>.4&&this.particles.add({x:s+a*t,y:c+o*t,vx:-a*.12+((f>>>12&15)-7.5)*.06,vy:-o*.12-.2,life:14+(f>>>16&15),size:1,color:f>>>20&1?16769136:16747040,kind:x.Spark})}(!(f>>>24&1)||l>1)&&this.particles.add({x:s-a*.5,y:c-o*.5,vx:this.wind*.06,vy:-.05,life:110+(f>>>25&63),size:Math.round((3+(f>>>26&3))*l),color:f>>>28&1?2761768:4866116,kind:x.Smoke})}for(let e of[...this.meteors.keys()])t.has(e)||this.meteors.delete(e)}meteorLive=new Set;stepFx(){this.particles.step(De,this.wind),this.stepWrecks(),this.cloudX+=.012+this.wind*.004,this.fx.tick(this.fxTick),this.stepFlames();let e=this.palette.shells;if(e){this.stepMeteors(e);for(let t of this.entities){if(t.kind!==`projectile`)continue;let n=e[t.weapon]?.shell,r=Math.imul(this.fxTick+1,2654435761)^Math.imul(t.id+1,40503);n===`mud`?(r>>>20)%3==0&&this.particles.add({x:t.x+(r>>>4&1)-.5,y:t.y+1.5,vx:0,vy:.1,life:14+(r>>>12&7),size:1,color:r>>>8&1?5917748:8022600,kind:x.Chunk}):n===`fire`&&this.particles.add({x:t.x+(r>>>4&3)-1.5,y:t.y+(r>>>8&3)-1.5,vx:0,vy:-.2,life:10+(r>>>12&7),size:2+(r>>>16&1),color:0,kind:x.Flame})}}if(e){let t=Math.min(this.fx.heatAt(this.fxTick),V.length-1);for(let n of this.entities){if(n.kind!==`projectile`||e[n.weapon]?.shell!==`ricochet`)continue;let r=(Math.imul(this.fxTick+7,2654435761)^Math.imul(n.id+3,40503))>>>0,i=1+(t>>1);for(let e=0;e<i;e++)r=Math.imul(r^r>>>15,2246822519)+2654435769>>>0,this.particles.add({x:n.x+(r>>>4&3)-1.5,y:n.y+(r>>>8&3)-1.5,vx:((r>>>12&15)-7.5)*.04,vy:((r>>>16&15)-7.5)*.04,life:8+(r>>>20&7)+t*2,size:1,color:r&3?V[t]:16777215,kind:x.Spark})}}if(this.fxTick%9==0)for(let e of this.entities){if(e.kind!==`tank`||e.alive)continue;let t=(this.fxTick*31+e.player*17)%13;this.particles.add({x:e.x-3+t%6,y:this.tankY(e)-5,vx:0,vy:-.2,life:70,size:3+t%3,color:3814456,kind:x.Smoke})}this.fxTick++}updateTrails(e){for(let e of this.trails)e.live=!1;for(let t of e.entities){if(t.kind!==`projectile`||this.fx.lances.owns(t.x,t.y)||this.palette.shells?.[t.weapon]?.trail===!1)continue;let n=this.trails.find(e=>e.id===t.id);n||(this.trails=this.trails.filter(t=>t.turn===e.turn),n={id:t.id,turn:e.turn,pts:[],live:!0},this.trails.push(n)),n.live=!0;let r=n.pts.length;r>=2&&Math.abs(n.pts[r-2]-t.x)>e.width/2&&n.pts.push(NaN,NaN),n.pts.push(t.x,t.y)}}render(e){let t=this.gl,n=this.camera,r=n.vw,i=n.vh,a=n.scale,o=n.ox,s=n.oy,c=[r,i],l=[o,s],u=this.theme,d=Math.max(e,this.lastTick),f=this.quality!==`low`,p=0;if(f)for(let e of this.fx.ripples){if(p>=8)break;let t=(d-e.start)/e.dur;t<0||t>1||(this.rippleBuf[p*4]=o+e.x*a,this.rippleBuf[p*4+1]=s+e.y*a,this.rippleBuf[p*4+2]=e.maxR*Math.sqrt(t)*a,this.rippleBuf[p*4+3]=e.strength*(1-t),this.rippleW[p]=e.width*a*(.7+.6*t),p++)}let[m,h]=this.shakeOn?this.fx.shake(d):[0,0],_=Math.round(m)*a,v=Math.round(h)*a,y=this.fx,b=ye(d,u.flicker),x=y.sky,S=Math.max(y.skyFlash,b),C=f?Math.round(y.split)*a:0,w=u.scanlines,T=p>0||_!==0||v!==0||S>0||C>0||w>0;this.shadeTerrain(),this.paintScenery((r/2-o)/a,(i/2-s)/a),t.bindFramebuffer(t.FRAMEBUFFER,T?this.sceneFbo:null),t.viewport(0,0,r,i),t.disable(t.BLEND),t.bindVertexArray(this.emptyVao),t.useProgram(this.bgProg),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.colorTex),t.uniform1i(this.uBg.u_color,0),t.uniform2f(this.uBg.u_view,r,i),t.uniform2f(this.uBg.u_origin,o,s),t.uniform1f(this.uBg.u_scale,a),t.uniform2f(this.uBg.u_map,this.mapWidth,this.mapHeight),t.uniform3fv(this.uBg.u_top,g(u.skyTop)),t.uniform3fv(this.uBg.u_bottom,g(u.skyBottom)),t.uniform3fv(this.uBg.u_letterbox,g(u.letterbox)),t.uniform3f(this.uBg.u_flash,x[0]+b*.55,x[1]+b*.6,x[2]+b*.75),t.uniform1f(this.uBg.u_vignette,this.quality===`low`?0:u.vignette),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.activeTexture(t.TEXTURE3),t.bindTexture(t.TEXTURE_2D,this.lookTex),t.activeTexture(t.TEXTURE4),t.bindTexture(t.TEXTURE_2D,this.paletteTex),t.activeTexture(t.TEXTURE5),t.bindTexture(t.TEXTURE_2D,this.sceneryTex),t.activeTexture(t.TEXTURE6),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.activeTexture(t.TEXTURE7),t.bindTexture(t.TEXTURE_2D,this.burnTex),t.activeTexture(t.TEXTURE0),t.uniform1i(this.uBg.u_grassMask,6),t.uniform1i(this.uBg.u_burn,7),t.uniform1f(this.uBg.u_burnOn,+(this.lastBurn>=0&&d-this.lastBurn<Te)),t.uniform1i(this.uBg.u_terrain,1),t.uniform1i(this.uBg.u_coat,2),t.uniform1i(this.uBg.u_look,3),t.uniform1i(this.uBg.u_palette,4),t.uniform1f(this.uBg.u_time,d),t.uniform1f(this.uBg.u_haze,f&&this.anyHot?1:0),t.uniform1f(this.uBg.u_anim,+!!this.anyCycle),t.uniform1f(this.uBg.u_stars,u.ambient.kind===`stars`?Math.min(.05,u.ambient.density/6e3):0),t.uniform3fv(this.uBg.u_starColor,g(u.ambient.color)),t.uniform1i(this.uBg.u_scenery,5),t.uniform4f(this.uBg.u_grass,...g(u.grass<0?0:u.grass),u.grass<0?0:1),t.drawArrays(t.TRIANGLES,0,3);let E=this.fx.mult;me(this.normal,this.additive,this.zones,d,this.probe,E),this.drawTrails(),this.fx.drawFunnels(this.normal,this.additive,d),this.drawDebris(),this.drawTanks(d),this.particles.draw(this.normal,this.additive),this.fx.drawMushrooms(this.normal,this.additive,d),this.fx.drawVortices(this.normal,this.additive,d),this.drawProjectiles(),this.fx.drawGlows(this.additive,d),this.fx.drawBolts(this.additive,d),this.fx.lances.draw(this.additive,d),this.fx.drawCrystals(this.additive,d),pe(this.normal,this.additive,u,d,this.wind,this.probe,E),f||this.fx.drawRippleRings(this.additive,d),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),this.normal.flush(c,l,a),t.blendFunc(t.ONE,t.ONE),this.additive.flush(c,l,a),t.disable(t.BLEND),T&&(t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,r,i),t.bindVertexArray(this.emptyVao),t.useProgram(this.postProg),t.bindTexture(t.TEXTURE_2D,this.sceneTex),t.uniform1i(this.uPost.u_scene,0),t.uniform2f(this.uPost.u_view,r,i),t.uniform2f(this.uPost.u_shake,_,v),t.uniform2f(this.uPost.u_origin,o,s),t.uniform1f(this.uPost.u_scale,a),t.uniform1i(this.uPost.u_rippleCount,p),t.uniform4fv(this.uPost.u_ripple,this.rippleBuf),t.uniform1fv(this.uPost.u_rippleW,this.rippleW),t.uniform3f(this.uPost.u_tint,x[0]*.36,x[1]*.36,x[2]*.36),t.uniform1f(this.uPost.u_split,C),t.uniform1f(this.uPost.u_scan,w),t.drawArrays(t.TRIANGLES,0,3)),t.bindVertexArray(null)}paintScenery(e,t){let n=this.theme,r=this.mapWidth,i=this.mapHeight,a=e-r/2,o=t-i/2,s=`${n.skyTop},${n.skyBottom},${n.clouds.cover},${n.clouds.light},${n.clouds.shadow},${n.ranges.join(`/`)},${this.horizon},${Math.floor(this.cloudX/2)}`;for(let e of[.9,.85,.75,.55,.35])s+=`,${Math.floor(a*e/2)},${Math.floor(o*e/2)}`;if(s===this.sceneryKey)return;this.sceneryKey=s;let c=this.gl;c.bindFramebuffer(c.FRAMEBUFFER,this.sceneryFbo),c.viewport(0,0,this.sceneryW,this.sceneryH),c.disable(c.BLEND),c.bindVertexArray(this.emptyVao),c.useProgram(this.sceneryProg);let l=this.uScn;c.uniform2f(l.u_size,this.sceneryW,this.sceneryH),c.uniform2f(l.u_map,r,i),c.uniform3fv(l.u_top,g(n.skyTop)),c.uniform3fv(l.u_bottom,g(n.skyBottom)),c.uniform2f(l.u_cloud,n.clouds.cover,this.cloudX),c.uniform3fv(l.u_cloudLight,g(n.clouds.light)),c.uniform3fv(l.u_cloudShadow,g(n.clouds.shadow));let u=n.ranges.length;for(let e=0;e<u;e++)this.rangeBuf.set(g(n.ranges[e]),e*3);c.uniform3fv(l.u_ranges,this.rangeBuf),c.uniform1i(l.u_rangeCount,u),c.uniform1f(l.u_horizon,this.horizon<0?i*.6:this.horizon),c.uniform2f(l.u_cam,e,t),c.drawArrays(c.TRIANGLES,0,3)}shadeTerrain(){let e=this.dirty;if(e[0]>=e[2]||e[1]>=e[3])return;let t=this.gl,n=this.mapWidth,r=this.mapHeight;t.bindFramebuffer(t.FRAMEBUFFER,this.colorFbo),t.viewport(0,0,n,r),t.enable(t.SCISSOR_TEST),t.scissor(e[0],r-e[3],e[2]-e[0],e[3]-e[1]),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),t.bindVertexArray(this.emptyVao),t.useProgram(this.terrainProg),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.paletteTex),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.uniform1i(this.uTer.u_terrain,0),t.uniform1i(this.uTer.u_palette,1),t.uniform1i(this.uTer.u_coat,2),t.uniform2f(this.uTer.u_view,n,r),t.uniform2f(this.uTer.u_origin,0,0),t.uniform1f(this.uTer.u_scale,1),t.uniform2f(this.uTer.u_map,n,r),t.uniform1f(this.uTer.u_grain,this.theme.grain),t.uniform3fv(this.uTer.u_light,g(this.theme.light)),t.uniform1f(this.uTer.u_wet,this.theme.wet),t.uniform1f(this.uTer.u_snow,this.theme.snow);let i=this.theme.grass;t.uniform4f(this.uTer.u_grass,...g(i<0?0:i),i<0?0:1),t.uniform3fv(this.uTer.u_ground,g(this.theme.ground)),t.uniform1f(this.uTer.u_flowers,this.theme.flowers),t.activeTexture(t.TEXTURE3),t.bindTexture(t.TEXTURE_2D,this.lookTex),t.uniform1i(this.uTer.u_look,3),t.activeTexture(t.TEXTURE4),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.uniform1i(this.uTer.u_grassMask,4),t.drawArrays(t.TRIANGLES,0,3),t.disable(t.SCISSOR_TEST),t.activeTexture(t.TEXTURE0),e[0]=1,e[2]=0}drawTrails(){let e=this.normal,t=this.theme.trail;for(let n of this.trails){let r=n.live?.55:.22,i=n.pts;for(let a=2;a<i.length;a+=2){if(Number.isNaN(i[a])||Number.isNaN(i[a-2]))continue;let o=n.live?Math.max(.25,1-(i.length-a)/240):1;e.line(i[a-2],i[a-1],i[a],i[a+1],.7,t,r*o)}}}drawDebris(){let e=this.debris,t=this.palette.materials;for(let n=0;n<e.count;n++){let i=Math.floor(e.x[n]/Ce),a=Math.floor(e.y[n]/Ce),o=Math.imul(e.vx[n]^e.material[n]<<20,2654435761)>>>27,s=r(t[e.material[n]]??8018490,Me[o&3]);o>=30?this.normal.push(i+1,a+1,2,2,s,1):this.normal.push(i+.5,a+.5,1,1,s,1)}}drawTanks(e){let n=this.normal,r=this.palette.tanks;for(let i of this.entities){if(i.kind!==`tank`)continue;let a=i.x,o=this.tankY(i),s=t(i.player),c=i.tank&&r?.[i.tank]||Oe,l=c.sprite,u=l[0]?.length??0,d=l.length,f=a-(u>>1),p=o-d;if(!i.alive){n.rect(f+1,o-3,u-2,3,2761766),n.rect(a-4,o-5,7,2,1906971);continue}let m=this.tankTilt(f,o,u),h=e=>Math.round(m.slope*(e-m.pivot)),g=c.barrel,_=i.angle*Math.PI/180,v=Math.cos(_),b=Math.sin(_),x=a+g.x,S=o-g.y+h(g.x+(u>>1)),C=g.width>>1;for(let e=1;e<=g.length;e++){let t=Math.round(x+v*e),r=Math.round(S-b*e);n.rect(t-C,r-C,g.width,g.width,e===g.length?11051672:14209736)}let w=i.shield>0;for(let e=0;e<d;e++){let t=l[e];for(let r=0;r<u;r++){let i=t.charCodeAt(r);i!==46&&n.rect(f+r,p+e+h(r),1,1,je(i,s,w))}}w&&this.drawShield(i,a,o,u,d,e),this.coverTank(a,o,u,d),i.chute&&this.drawChute(i.player,a,p,e);let T=e-(this.batteryAt[i.player]??-1e9);T<Ae&&this.drawCharge(a,p,T),i.chill>0&&this.frostTank(a,o,e);let E=p;this.drawDigit(a-13,E-7,i.player+1);let D=Math.max(0,Math.min(1,i.health/Math.max(1,i.maxHealth)));if(n.rect(a-8,E-5,16,1.6,0,.55),n.rect(a-8,E-5,16*D,1.6,D>.5?5952346:D>.25?15777856:14696512),i.maxShield>0){let e=Math.max(0,Math.min(1,i.shield/i.maxShield));n.rect(a-8,E-7,16,1,0,.55),e>0&&n.rect(a-8,E-7,Math.max(1,Math.round(16*e)),1,Z)}if(i.active){let t=Math.sin(e*.12)*1.2;n.push(a+.5,E-10+t,3.2,3.2,s,1,y.Rect,Math.PI/4),n.push(a+.5,E-10+t,1.4,1.4,16777215,.9,y.Rect,Math.PI/4)}}}drawShield(e,t,n,r,i,a){let o=this.normal,s=(r>>1)+2,c=i+2,l=Math.max(this.shieldHitAt[e.player]??-1e9,this.shieldUpAt[e.player]??-1e9),u=a-l<18?1-(a-l)/18:0,d=a-(this.shieldUpAt[e.player]??-1e9);if(d>=0&&d<24){let e=n-Math.floor((i+4)*d/24),a=(r>>1)+2;for(let n=t-a;n<=t+a;n++)o.rect(n,e,1,1,n&1?Z:15268863,.9)}let f=e.shield/Math.max(1,e.maxShield),p=Math.min(1,.3+.4*f+.6*u),m=Math.floor(a/8);for(let e=n-c-1;e<n;e++){let r=(e+.5-n)/c;for(let n=t-s-1;n<=t+s;n++){let i=(n+.5-t)/s,a=i*i+r*r;a<.78||a>1.06||n+e+m&1&&u===0||o.rect(n,e,1,1,u>0?15268863:Z,p)}}}drawChute(e,n,r,i){let a=this.normal,o=t(e),s=Math.round(Math.sin(i*.08)),c=n+s,l=r-9-Q.length-6;for(let e=0;e<Q.length;e++){let t=Q[e],n=c-(t.length>>1);for(let r=0;r<t.length;r++){let i=t[r];i!==`.`&&a.rect(n+r,l+e,1,1,i===`w`?15921126:i===`d`?0:o,i===`d`?.35:1)}}let u=l+Q.length;for(let[e,t]of ke){let n=r-u;for(let r=0;r<=n;r++){let i=Math.round(c+e+(t-e-s)*r/Math.max(1,n));a.rect(i,u+r,1,1,13617336,.85)}}}drawCharge(e,t,n){let r=this.normal,i=1-n/Ae;for(let a=0;a<3;a++){let o=n-a*8;if(o<0)continue;let s=e-6+a*6,c=t-2-Math.floor(o/3);r.rect(s,c-1,1,3,8188028,i),r.rect(s-1,c,3,1,8188028,i)}}frostTank(e,t,n){let r=this.normal;r.rect(e-7,t-6,14,3,14085370,.55),r.rect(e-7,t-6,14,1,16777215,.8),r.push(e+.5,t-7,7,5,15136511,.45,y.Disc);for(let n=0;n<$.length;n+=2)r.rect(e+$[n],t-3,1,$[n+1],15136511,.95);let i=Math.floor(n/9),a=e-7+(i*5+e)%14,o=t-6-i*3%3;r.rect(a,o,1,1,16777215);let s=e+10,c=t-16;r.rect(s-1,c-1,7,7,0,.6),r.rect(s+2,c,1,5,12575994),r.rect(s,c+2,5,1,12575994),r.rect(s,c,1,1,12575994),r.rect(s+4,c,1,1,12575994),r.rect(s,c+4,1,1,12575994),r.rect(s+4,c+4,1,1,12575994),r.rect(s+2,c+2,1,1,16777215)}tankTilt(e,t,n){let r=e=>{let n=Math.max(0,Math.min(this.mapWidth-1,e)),r=Math.min(this.mapHeight,t+12);for(let e=Math.max(0,t-6);e<r;e++)if(this.terrain[e*this.mapWidth+n]!==0)return e;return r},i=r(e),a=r(e+n-1);return i===a||n<2?{slope:0,pivot:0}:{slope:Math.max(-.4,Math.min(.4,(a-i)/(n-1))),pivot:a>i?0:n-1}}drawDigit(e,t,n){let r=Se[n];if(!r)return;let i=this.normal;i.rect(e-1,t-1,5,7,0,.6);for(let n=0;n<5;n++){let a=r[n];for(let r=0;r<3;r++)a&4>>r&&i.rect(e+r,t+n,1,1,16777215)}}coverTank(e,t,n,i){let a=this.normal,o=this.mapWidth,s=e-(n>>1);for(let e=Math.max(0,t-i);e<Math.min(this.mapHeight,t);e++)for(let t=Math.max(0,s);t<Math.min(o,s+n);t++){let n=this.terrain[e*o+t];if(n===0)continue;let i=this.palette.materials[n]??8018490;a.rect(t,e,1,1,t+e&1?r(i,.94):i)}}drawProjectiles(){let e=this.additive,t=this.palette.shells;for(let n of this.entities){if(n.kind!==`projectile`||this.fx.lances.owns(n.x,n.y))continue;let r=t?.[n.weapon];if(r?.shell===`ricochet`)this.drawRicochetBall(n.x,n.y,n.id);else if(r?.shell===`meteor`)this.drawMeteor(n.id,n.x,n.y,r.size??1);else if(r?.shell===`fire`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5;e.push(t,r,7,7,16738836,.55,y.Pixel),this.normal.push(t,r,3,3,16747040,1),e.push(t,r,1,1,16773280,1)}else if(t?.[n.weapon]?.shell===`mud`){let e=Math.floor(n.x)+.5,t=Math.floor(n.y)+.5;this.normal.push(e,t,3,3,5917748,1),this.normal.push(e,t+1,1,1,3813408,1),this.normal.push(e-.5,t-1,1,1,12365446,1)}else e.push(n.x,n.y,6,6,16751168,.6,y.Pixel),e.push(Math.floor(n.x)+.5,Math.floor(n.y)+.5,2,2,16777215,1)}}drawRicochetBall(e,t,n){let r=this.additive,i=Math.min(this.fx.heatAt(this.fxTick),V.length-1),a=V[i],o=V[Math.min(i+2,V.length-1)],s=Math.floor(e)+.5,c=Math.floor(t)+.5,l=this.fxTick>>1&1,u=4+i;r.push(s,c,u*2+6+l*2,u*2+6+l*2,a,.3,y.Pixel),r.push(s,c,u+2,u+2,a,.8,y.Pixel),r.push(s,c,u,u,o,1,y.Pixel),r.push(s,c,Math.max(1,u-2),Math.max(1,u-2),16777215,1,y.Pixel);let d=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n+1,40503))>>>0,f=2+i,p=(u>>1)+2+(i>>1);for(let e=0;e<f;e++){d=Math.imul(d^d>>>15,2246822519)+2654435769>>>0;let e=(d>>>4)%(2*p+1)-p,t=(d>>>12)%(2*p+1)-p;r.push(s+e,c+t,1,1,d&1?a:16777215,.9)}}drawMeteor(e,t,n,r){let i=this.meteors.get(e);if(!i||i.dy<=0)return;let a=this.additive,o=Math.hypot(i.dx,i.dy)||1,s=i.dx/o,c=i.dy/o,l=Math.round(14*r),u=[16774864,16765024,16747040,14699024,10496016];for(let e=l;e>=1;e--){let i=e/l,o=Math.floor(t-s*e*1.4)+.5,d=Math.floor(n-c*e*1.4)+.5,f=Math.max(1,Math.round(3*r*(1-i*.75)));a.push(o,d,f,f,u[Math.min(4,Math.floor(i*5))],1-i*.55,y.Pixel)}let d=Math.floor(t)+.5,f=Math.floor(n)+.5,p=Math.round(4+3*r);a.push(d,f,p*2,p*2,16738836,.35,y.Pixel),a.push(d,f,p,p,16751152,.7,y.Pixel),this.normal.push(d,f,Math.round(2+2*r),Math.round(2+2*r),16767120,1),a.push(d,f,Math.round(1+r),Math.round(1+r),16777215,1)}unmount(){this.unsubscribe?.(),this.unsubscribe=void 0;let e=this.gl;this.normal.dispose(),this.additive.dispose(),e.deleteTexture(this.terrainTex),e.deleteTexture(this.coatTex),e.deleteTexture(this.paletteTex),e.deleteTexture(this.lookTex),e.deleteTexture(this.sceneTex),e.deleteTexture(this.colorTex),e.deleteFramebuffer(this.colorFbo),e.deleteProgram(this.bgProg),e.deleteFramebuffer(this.sceneFbo),e.deleteProgram(this.terrainProg),e.deleteProgram(this.postProg),e.deleteVertexArray(this.emptyVao),this.particles.clear(),this.fx.clear()}},$=[-6,2,-3,1,0,3,3,1,5,2];function Pe(e,t,n){let r=0;for(let i=0;i<t;i++){let a=0;for(;a<n&&e[a*t+i]===0;)a++;r+=a}return t>0?r/t:n}function Fe(e,t,n,r){r.fill(0);for(let i=0;i<n;i++){let a=i*t;for(let o=0;o<t;o++)e[a+o]===0||i>0&&e[a-t+o]!==0||(r[a+o]=1,i>0&&(r[a-t+o]=1),i+1<n&&(r[a+t+o]=1))}}export{Ne as PixelRenderer};
//# sourceMappingURL=pixel-CeSGYBOV.js.map