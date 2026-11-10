/**
 * GLSL ES 3.00 shaders for the pixel renderer, inlined as strings (§9). Kept to features
 * SwiftShader supports: no derivatives tricks, no float render targets, bounded loops.
 */

import { HEAT_STRENGTH, LIGHT_BANDS, MAX_LIGHTS } from './lighting';

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

/** Rows of air a heat source warms (the hottest reach all of them). */
export const HAZE_RISE = 16;
/** Ticks a fresh crater keeps giving off heat haze. */
export const HAZE_TICKS = 420;

/**
 * Background in one fullscreen pass: letterbox, sky gradient (with stateless twinkling stars),
 * the cached terrain colours at the camera's integer scale (nearest-neighbour), palette cycling
 * for animated materials, heat haze over hot ground and fresh craters, sky tint and vignette. One pass keeps software
 * GL (SwiftShader capture) fast. Everything is evaluated per map cell, so it stays on the grid.
 *
 * `u_look` is 256×10: row 0 per material = (cycle length, ticks per step, hot, 0) as bytes,
 * rows 1–8 the cycle colours, row 9 the glow colour (a: 255 steady, 160 flickering, 0 none).
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
uniform float u_white;       // nuke sky whiteout 0..1
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
uniform int u_lightCount;    // dynamic lights (lighting.ts): blasts light the faces around them
uniform vec4 u_lights[${MAX_LIGHTS}];  // x, y (cells), radius, strength
uniform vec3 u_lightCol[${MAX_LIGHTS}];
uniform usampler2D u_heat;   // cells to the nearest glowing cell, 0 = source, 255 = far
uniform usampler2D u_gas;    // gas layer: gas id per air cell, 0 = none
uniform float u_gasOn;
uniform float u_heatOn;
uniform usampler2D u_glow;   // the glowing material that nearest source is made of
uniform float u_reach;       // cells glow lights (further in the dark)
uniform float u_dark;        // 0–1: unlit ground falls toward black, glow and blasts light it
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
vec4 look(uint m) { return texelFetch(u_look, ivec2(int(m), 0), 0); }
// glow colour of a material (row 9), a = 1 steady, ~0.63 flickers like fire, 0 = none
vec4 emitOf(uint m) { return texelFetch(u_look, ivec2(int(m), 9), 0); }
${NOISE}
// banded glow at heat-field distance hd from a source of colour ec: hard steps, ordered dither
// between them, fire-like sources flickering in 8×8 blocks
vec3 glowAt(ivec2 cell, uint hd, vec4 ec, float k) {
  float f = 1.0 - float(hd - 1u) / u_reach;
  float fl = 1.0;
  if (ec.a < 0.9) {
    ivec2 blk = cell >> 3;
    int st = int(floor(u_time / 9.0 + hash(blk) * 13.0));
    fl = 0.8 + 0.35 * hash(blk + ivec2(st * 7, st * 3 + 19));
  }
  float e = f * f * fl * k;
  float q = floor(e * ${LIGHT_BANDS}.0 + bayer(cell) - 0.5) / ${LIGHT_BANDS}.0;
  return ec.rgb * max(q, 0.0);
}
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
  ivec2 wc = ivec2(floor(m));
  // the view never runs out of world: past the left and right edges the battlefield goes on as
  // its own mirror image (under the death wall, drawn as particles in deathwall.ts), above the
  // map the sky goes on with its stars, and below it the ground goes on (the bottom rows,
  // reflected back and forth and darkening with depth)
  int W = int(u_map.x);
  int Hm = int(u_map.y);
  int mx = wc.x < 0 ? min(-wc.x - 1, W - 1) : wc.x >= W ? max(2 * W - 1 - wc.x, 0) : wc.x;
  float below = max(0.0, m.y - u_map.y);
  vec3 c;
  if (m.y < 0.0) {
    // the open sky's top colour (the scenery's top row would stretch its clouds into columns)
    c = u_top;
    ivec2 sc = wc + ivec2(4096, 4096);
    float h = hash(sc + ivec2(31, 17));
    if (u_stars > 0.0 && h > 1.0 - u_stars) {
      float tw = hash(sc + ivec2(int(u_time / 23.0 + h * 97.0), 5));
      c = mix(c, u_starColor, tw > 0.25 ? 0.75 : 0.3);
    }
    c += u_flash;
  } else {
    ivec2 cell = ivec2(mx, wc.y);
    if (cell.y >= Hm) {
      int k = (cell.y - Hm) % 96;
      cell.y = Hm - 1 - (k < 48 ? k : 95 - k);
      cell.y = max(cell.y, 0);
    }
    // heat haze: air over lava, burning napalm and fresh craters shimmers. Rising pockets push
    // the cells sideways (and now and then up a cell) by whole cells, strongest near the source
    float heat = 0.0;
    float streak = 0.0;
    if (u_haze > 0.0 && mat(cell) == 0u) {
      for (int k = 1; k <= ${HAZE_RISE}; k++) {
        ivec2 g = cell + ivec2(0, k);
        uint b = mat(g);
        if (b == 0u) continue;
        float src = look(b).b > 0.5 ? 1.0 : 0.0;
        if (src == 0.0 && u_burnOn > 0.0) {
          // a fresh crater: the scorched floor gives off heat that fades as it cools
          uint bt = texelFetch(u_burn, g, 0).r;
          float age = u_time - float(bt) + 1.0;
          if (bt != 0u && age >= 0.0 && age < ${HAZE_TICKS}.0) {
            float f = 1.0 - age / ${HAZE_TICKS}.0;
            src = 0.9 * f * f;
          }
        }
        // hotter ground sends the haze higher
        float reach = 3.0 + ${HAZE_RISE - 4}.0 * src;
        heat = src * clamp(1.0 - (float(k) - 1.0) / reach, 0.0, 1.0);
        break;
      }
      if (heat > 0.0) {
        // pockets: 3-cell strips with their own phase and speed, so the air tears and wobbles
        // instead of swaying as one sheet; the phase climbs with time, so the waves rise
        float hp = hash(ivec2(cell.x / 3, 61));
        float ph = u_time * (0.2 + hp * 0.12) + float(cell.y) * 0.8 + hp * 6.283;
        float w = sin(ph) * (0.5 + 1.6 * heat) * u_haze;
        int dy = heat > 0.45 && sin(ph * 1.7 + 1.3) > 0.82 ? 1 : 0;
        cell.x = clamp(cell.x + int(floor(w + 0.5)), 0, int(u_map.x) - 1);
        // faint rising ripple lines, dithered on every other cell, so the air itself reads wavy
        float rl = sin(float(cell.y) * 0.45 + u_time * 0.16 + sin(float(cell.x) * 0.38 + hp * 6.283) * 1.3);
        if (rl > 0.86 && ((cell.x + cell.y) & 1) == 0) streak = heat;
        cell.x = clamp(cell.x + int(floor(w + 0.5)), 0, int(u_map.x) - 1);
        cell.y = max(cell.y - dy, 0);
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
          if (sd > 0 && charrable(mm) && (texelFetch(u_grassMask, cell - ivec2(0, sd - 1), 0).r - 1u) >= 2u) {
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
      // dynamic light: each blast lights the faces of the ground turned toward it (cells whose
      // neighbours on its side are open air), in hard bands dithered per cell; buried cells catch
      // only a little. Lava and flames warm the ground near them with a slow flicker.
      vec3 L = vec3(0.0);
      if (u_lightCount > 0) {
        vec2 cc = vec2(cell) + 0.5;
        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
          if (i >= u_lightCount) break;
          vec4 l = u_lights[i];
          vec2 d = l.xy - cc;
          float dist = length(d);
          if (dist >= l.z) continue;
          ivec2 st = ivec2(sign(d) * vec2(greaterThan(abs(d), vec2(dist * 0.38))));
          float face = 0.15;
          if (dist < 2.0) face = 1.0;
          else for (int k = 1; k <= 3; k++) {
            if (mat(cell + st * k) == 0u) { face = k == 1 ? 1.0 : k == 2 ? 0.6 : 0.35; break; }
          }
          float f = 1.0 - dist / l.z;
          float e = f * (0.4 + 0.6 * f) * l.w * face;
          float q = clamp(floor(e * ${LIGHT_BANDS}.0 + bayer(cell) - 0.5) / ${LIGHT_BANDS}.0, 0.0, 1.5);
          L += u_lightCol[i] * q;
        }
      }
      // glow: lava, flames, plasma, crystal and the like light the ground near them in their own
      // colour. In the dark, light reaches further but only cells near open air catch it, and
      // the glowing cells themselves keep their full colour while everything unlit goes dark
      bool glowing = false;
      if (u_heatOn > 0.0) {
        uint hd = texelFetch(u_heat, cell, 0).r;
        if (hd == 0u) glowing = true;
        else if (float(hd) <= u_reach) {
          float face = 1.0;
          if (u_dark > 0.0) {
            face = 0.2;
            for (int k = 1; k <= 3; k++) {
              if (mat(cell + ivec2(0, -k)) == 0u || mat(cell + ivec2(0, k)) == 0u ||
                  mat(cell + ivec2(-k, 0)) == 0u || mat(cell + ivec2(k, 0)) == 0u) {
                face = k == 1 ? 1.0 : k == 2 ? 0.6 : 0.35;
                break;
              }
            }
            face = mix(1.0, face, u_dark);
          }
          vec4 ec = emitOf(texelFetch(u_glow, cell, 0).r);
          L += glowAt(cell, hd, ec, ${HEAT_STRENGTH.toFixed(3)} * (1.0 + 0.5 * u_dark) * face);
        }
      }
      float amb = glowing ? 1.0 : 1.0 - u_dark * 0.86;
      c = min(c * (amb + L * (1.3 + 1.2 * u_dark)) + L * 0.16, vec3(1.0));
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
        // mask 1 grass, 2 withered; 3 (burnt) grows nothing
        bool grown = cell.y + 1 < int(u_map.y) && (texelFetch(u_grassMask, cell + ivec2(0, 1), 0).r - 1u) < 2u;
        if (topsoil(b1) && grown && texelFetch(u_coat, cell + ivec2(0, 1), 0).r == 0u && h > 0.42) {
          // withered by gas (mask 2): dry straw tufts, fewer of them
          bool dry = texelFetch(u_grassMask, cell + ivec2(0, 1), 0).r == 2u;
          if (!dry) c = u_grass.rgb * (h > 0.8 ? 1.12 : 0.92);
          else if (h > 0.62) c = vec3(0.6, 0.5, 0.24) * (h > 0.85 ? 1.1 : 0.9);
        } else if (b1 == 0u && topsoil(mat(cell + ivec2(0, 2))) && cell.y + 2 < int(u_map.y) &&
                   (texelFetch(u_grassMask, cell + ivec2(0, 2), 0).r - 1u) < 2u && hash(cell + ivec2(5, 10)) > 0.86 &&
                   hash(cell + ivec2(2, 3)) > 0.45) {
          c = u_grass.rgb * 0.8;
        }
      }
      // gas (steam, flames, marsh gas): whole cells in the gas's colours, as many of them as its
      // cover lets through an ordered dither, each stepping through the colour cycle on its own
      // beat, and thinner where the cloud is ragged (fewer gas neighbours)
      if (u_gasOn > 0.0) {
        uint gm = texelFetch(u_gas, cell, 0).r;
        if (gm != 0u) {
          vec4 gl = look(gm);
          int nb = 0;
          if (texelFetch(u_gas, clamp(cell + ivec2(1, 0), ivec2(0), ivec2(u_map) - 1), 0).r != 0u) nb++;
          if (texelFetch(u_gas, clamp(cell - ivec2(1, 0), ivec2(0), ivec2(u_map) - 1), 0).r != 0u) nb++;
          if (texelFetch(u_gas, clamp(cell + ivec2(0, 1), ivec2(0), ivec2(u_map) - 1), 0).r != 0u) nb++;
          if (texelFetch(u_gas, clamp(cell - ivec2(0, 1), ivec2(0), ivec2(u_map) - 1), 0).r != 0u) nb++;
          float cover = gl.a * (nb >= 3 ? 1.0 : nb == 2 ? 0.75 : 0.5);
          if (bayer(cell) < cover) {
            int n = int(gl.r * 255.0 + 0.5);
            float h = hash(cell + ivec2(17, 3));
            int st = int(floor(u_time / max(1.0, gl.g * 255.0) + h * 5.0));
            c = n >= 2 ? texelFetch(u_look, ivec2(int(gm), 1 + st % n), 0).rgb
                       : texelFetch(u_palette, ivec2(int(gm), 0), 0).rgb;
          }
        }
      }
      // in the dark the open air and the cave walls behind it go black too
      c *= 1.0 - u_dark * 0.82;
      // the air around a glowing cell catches a little of its colour (much more in the dark),
      // in the same hard dithered bands
      if (u_heatOn > 0.0) {
        uint hd = texelFetch(u_heat, cell, 0).r;
        if (hd > 0u && float(hd) <= u_reach) {
          vec4 ec = emitOf(texelFetch(u_glow, cell, 0).r);
          c += glowAt(cell, hd, ec, 0.12 + 0.5 * u_dark) * 0.55;
        }
      }
      c += u_flash;
    }
    // nuke whiteout: the sky blazes white, then the colour creeps back from the top down in hard
    // steps with an ordered dither between them; the ground catches a little of the light
    if (u_white > 0.0) {
      float k = clamp(float(cell.y) / u_map.y, 0.0, 1.0);
      float a = clamp(u_white * (0.7 + 0.6 * k), 0.0, 1.0);
      float lv = a * 6.0;
      float w = (floor(lv) + (fract(lv) > bayer(cell) ? 1.0 : 0.0)) / 6.0;
      vec3 hot = mix(vec3(1.0, 0.74, 0.46), vec3(1.0, 0.98, 0.93), clamp(a * 1.5, 0.0, 1.0));
      c = mix(c, hot, t.a > 0.5 ? w * 0.3 : w);
    }
    // the ripple lines: a warm lift in two hard steps, stronger near the source
    if (streak > 0.0) c += streak > 0.5 ? vec3(0.13, 0.075, 0.02) : vec3(0.07, 0.04, 0.01);
  }
  // the ground below the map darkens with depth in hard steps
  if (below > 0.0) c *= 1.0 - min(floor(below / 16.0) * 0.07 + 0.05, 0.42);
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
uniform float u_boil;        // slow phase the billows boil to (steps)
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
      // the boil: each billow swells and sinks a little on its own slow beat, and the ragged
      // rim creeps, so the cloud is never quite the same shape twice
      float beat = u_boil * (0.17 + 0.05 * hr) + float(i) * 1.3 + float(seed);
      r *= 1.0 + 0.05 * sin(beat);
      lift += w * 0.012 * sin(beat * 0.7 + 1.0);
      vec2 c = vec2(cx + t * w, by - r * (0.45 + 0.35 * hash(js + ivec2(i + 1, 5))) - lift);
      vec2 l = (p - c) / r;
      float rim = 1.0 + (vnoise(p / 6.0 + float(seed) + vec2(u_boil * 0.09, u_boil * 0.06)) - 0.5) * 0.3;
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
/** Cells beside a crater wall (horizontally) that lose their turf; the renderer widens dirty
 * rects by this much. */
export const CUT_REACH = 16;
/** Rows up a cell looks for the old grass surface buried under a heap; the renderer widens dirty
 * rects downward by this much. */
export const BURIED_REACH = 64;

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
uniform usampler2D u_grassMask; // 1 = surface row at round start: grass grows only there
uniform usampler2D u_shade;  // grain a moved cell carries (tone << 2 | fleck), 0 = never moved
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
  // loose grains (cells settle or a blast has moved) carry their own shade: a falling heap reads
  // as grains tumbling down, not as sand sliding under a fixed pattern. The tone is the one the
  // cell showed at rest (same hash), a little stronger, plus a per-grain fleck; ground that never
  // moved keeps its strata, mottling and pebbles.
  uint sh = texelFetch(u_shade, c, 0).r;
  bool loose = sh != 0u;
  float g = loose ? (float((sh >> 2u) - 1u) / 62.0 - 0.5) * u_grain * 1.5 : (hash(ap) - 0.5) * u_grain;
  if (loose) g += (sh & 3u) == 3u ? 0.07 : (sh & 3u) == 0u ? -0.07 : 0.0;
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
  // openness: how much open air is around the cell (two rings of eight). Cells by a face or in
  // a thin ledge catch more light and read warmer; cells deep in a crevice or the corner of a
  // crater go darker and cooler. Stepped into four tones with dither between them.
  float air = 0.0;
  for (int i = 0; i < 8; i++) {
    ivec2 d = ivec2(i == 0 || i == 1 || i == 7 ? 1 : i == 3 || i == 4 || i == 5 ? -1 : 0,
                    i == 1 || i == 2 || i == 3 ? 1 : i == 5 || i == 6 || i == 7 ? -1 : 0);
    if (mat(c + d * 2) == 0u) air += 1.0;
    if (mat(c + d * 5) == 0u) air += 0.6;
  }
  float openK = floor(air / 12.8 * 4.0 + narrow(ap) - 0.25) / 3.0;
  if (sd > 0 && sd <= 12) {
    col *= mix(vec3(0.76, 0.78, 0.9), vec3(1.2, 1.1, 0.94), clamp(openK, 0.0, 1.0));
  }
  // surface-to-depth hue fade: warm, sunlit tones in the first rows under the surface, cooling
  // through the material's own colour into dusky blue-violet deep down, in six dithered steps
  if (still) {
    float sf = floor((sd == 0 ? 1.0 : float(sd - 1) / 31.0) * 6.0 + bayer(ap)) / 6.0;
    vec3 warm = vec3(1.14, 1.03, 0.86);
    vec3 cool = vec3(0.8, 0.82, 1.1);
    col *= sf < 0.5 ? mix(warm, vec3(1.0), sf * 2.0) : mix(vec3(1.0), cool, sf * 2.0 - 1.0);
  }
  // grass, turf and the dark topsoil band belong to the round-start surface only: freshly blasted
  // ground stays bare dirt (render-only, the sim never sees it)
  uint gmask = still && lk.a > 0.75 && sd > 0 ? texelFetch(u_grassMask, c + ivec2(0, 1 - sd), 0).r : 0u;
  bool soil = gmask != 0u;
  // rows below the grass, counted from the round-start surface the column grew it on
  int gsd = sd;
  // ground dumped on top of the grass (dirt bombs, slides, heaps of debris) doesn't cut it off in
  // a straight wall: the old surface is still there underneath, so its grass, turf and topsoil
  // carry on under the heap as a buried, darker layer, and the loose ground sits on top of it
  bool buried = false;
  // (deeper than the 32-row surface scan, sd is 0: look the full reach for those too)
  if (!soil && still && lk.a > 0.75 && (sd > 2 || sd == 0)) {
    for (int k = 1; k <= ${BURIED_REACH}; k++) {
      if (sd > 0 && k >= sd - 1) break;
      if (c.y - k < 0) break;
      uint bm = texelFetch(u_grassMask, c - ivec2(0, k), 0).r;
      if (bm != 0u) {
        gmask = bm;
        soil = true;
        buried = true;
        gsd = k + 1;
        break;
      }
    }
  }
  // grass a gas cloud crept over (mask 2) is withered: dry, yellow-brown, no flowers
  bool dry = gmask == 2u;
  // grass a flame licked (mask 3) is burnt: the same blades and turf, charred black-brown with a
  // few ashen flecks, so a fire leaves a scorched skin where it went instead of a cut to bare dirt
  bool burnt = gmask == 3u;
  vec3 grassRgb = dry ? mix(u_grass.rgb, vec3(0.58, 0.47, 0.2), 0.8) : u_grass.rgb;
  vec3 charRgb = hash(c + ivec2(41, 7)) > 0.85 ? vec3(0.34, 0.31, 0.29) : vec3(0.2, 0.13, 0.09);
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
  if (soil && !buried && sd > 2 && u_grass.a > 0.0) {
    ivec2 dirs[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(-1, -1), ivec2(1, -1));
    int open = 0; // bit per direction: already met air (or the map edge)
    for (int d = 1; d <= ${CUT_REACH} && cut == 0; d++) {
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
  if (still && !loose) {
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
    // fine flecks: single cells a step lighter or darker (grit, roots, mica) under the art pixels
    float fl = hash(c + ivec2(57, 113));
    if (fl > 0.93) col *= 1.1;
    else if (fl < 0.06) col *= 0.88;
    // pebbles: a lit top-left art pixel over a shaded one
    if (sd == 0 || sd > 10) {
      ivec2 pb = ap >> 1;
      if (hash(pb + ivec2(91, 7)) > 0.95) {
        ivec2 o2 = ap & 1;
        col *= o2.y == 0 ? (o2.x == 0 ? 1.22 : 1.08) : (o2.x == 0 ? 0.94 : 0.8);
      }
    }
    // topsoil: a dark rich band under the turf, fading through dither into the subsoil
    if (soil && gsd > 0 && gsd <= 30) {
      float k = gsd <= 22 ? 1.0 : (bayer(ap) > float(gsd - 22) / 9.0 ? 1.0 : 0.0);
      col = mix(col, col * vec3(0.72, 0.66, 0.62), k);
    }
  }
  if (frozen && sd <= 14 && (sd <= 8 || bayer(ap) > float(sd - 8) / 7.0)) {
    col = mix(col, vec3(0.7, 0.8, 0.9) * (0.85 + g) * (sd <= 4 ? 1.12 : 1.0), sd <= 4 ? 0.8 : 0.6);
  }
  float rim = lit + side;
  if (soil && !bare && u_grass.a > 0.0 && gsd > 9 && gsd <= 24) {
    // turf: the hillside under the grass, muted green in short horizontal strokes, darkening
    // with depth and dithering into the topsoil at its foot
    float k = float(gsd - 10) / 14.0;
    if (gsd < 19 || bayer(ap) > (float(gsd) - 19.0) / 6.0) col = turf(grassRgb, ap, k);
  }
  // buried grass is drawn exactly like the grass beside it (only without lit tips or flowers),
  // so the layers run on under a heap with no seam
  if (soil && (!bare || sd <= 2) && u_grass.a > 0.0 && gsd > 0 && gsd <= 9) {
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
    if (burnt && float(gsd) <= len + 2.0) col = charRgb * (gsd == 1 ? 1.2 : stroke);
    else if (gsd == 1 && !buried) col = gr * (h > 0.6 ? 1.3 : 1.16);
    else if (float(gsd) <= len) col = gr * stroke;
    else if (float(gsd) <= len + 2.0) col = gr * (stroke * 0.72);
    else if (h > 0.55) col = gr * 0.6;
    else col = turf(gr, ap, 0.0);
    // flowers: a single bright art pixel with a darker cell under it
    if (u_flowers > 0.0 && !buried && sd <= 3 && !dry && !burnt) {
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
  // where loose ground meets the grass at about the same height, the grass creeps a few cells
  // onto it, thinning out in dither, so the turf doesn't end in a ruled vertical line
  if (!soil && still && lk.a > 0.75 && sd > 0 && sd <= 3 && u_grass.a > 0.0) {
    int near = 0;
    for (int d = 1; d <= 6 && near == 0; d++) {
      for (int s = -1; s <= 1; s += 2) {
        ivec2 n = c + ivec2(s * d, 0);
        for (int k = -3; k <= 3; k++) {
          ivec2 m = n + ivec2(0, k);
          if (m.x < 0 || m.y < 1 || m.x >= int(u_map.x) || m.y >= int(u_map.y)) continue;
          if (texelFetch(u_grassMask, m, 0).r == 1u && mat(m) != 0u && mat(m - ivec2(0, 1)) == 0u) {
            near = d;
            break;
          }
        }
        if (near != 0) break;
      }
    }
    if (near > 0 && bayer(ap) > float(near) / 7.0) {
      float h = hash(c + ivec2(3, 8));
      col = sd == 1 ? u_grass.rgb * (h > 0.6 ? 1.2 : 1.06) : u_grass.rgb * (sd == 2 ? 0.86 : 0.62);
      rim *= 0.35;
    }
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
flat out vec4 v_seg;  // trail head and tail cells (shape 7)
void main() {
  v_seg = vec4(0.0);
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
flat in vec4 v_seg;
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
  } else if (v_shape == 7) { // trail: a cell-snapped line from head to tail, dimming in steps
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale) + 0.5;
    vec2 ab = v_seg.zw - v_seg.xy;
    float l2 = max(dot(ab, ab), 1e-4);
    float f = clamp(dot(cell - v_seg.xy, ab) / l2, 0.0, 1.0);
    vec2 q = v_seg.xy + ab * f - cell;
    if (max(abs(q.x), abs(q.y)) > 0.5) discard;
    a = f < 0.34 ? 1.0 : f < 0.67 ? 0.55 : 0.28;
  } else if (v_shape == 6) { // stipple: a cloud of single opaque cells, denser at the core
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    // each cell's own die, re-rolled as the blob moves a cell, so the cloud shimmers
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + dot(floor(v_blob.xy), vec2(3.1, 7.7))) * 43758.5453);
    if (h > v_color.a * (1.25 - k * 0.7)) discard;
    vec3 c = k > 0.6 ? min(vec3(1.0), v_color.rgb * 1.3) : v_color.rgb; // pale fringe, one step
    o = vec4(c, 1.0);
    return;
  } else if (v_shape == 5) { // solid pixel blob: opaque cells, one dithered edge band
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    ivec2 ic = ivec2(cell) & 1;
    if (k > 0.86 && (ic.x ^ ic.y) == 1) discard;
  }
  o = vec4(v_color.rgb * v_color.a * a, v_color.a * a); // premultiplied
}`;

export const MAX_RIPPLES = 8;

/**
 * Post-process (§2a), only while needed: shockwave distortion (pixels pushed by a moving lens
 * band, evaluated per map cell and displaced by whole cells), impact flash tint, screen shake,
 * chromatic split on nukes and theme scanlines. Ripples: xy = centre (device px, y down), z = radius,
 * w = strength; widths in u_rippleW. A negative width marks a vertical column wave: a band at
 * horizontal distance z from x, running from the top of the screen down to y, snaking sideways
 * with u_wob (the Ion Cannon charging).
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
uniform float u_swirl[${MAX_RIPPLES}];
uniform vec3 u_tint;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_split;
uniform float u_scan;
uniform float u_wob;
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
    float sw = u_swirl[i];
    if (sw != 0.0) {
      // a swirling lens round a black hole: the image is twisted round the centre, hardest at
      // the core and easing out to nothing at radius z, the twist wobbling in and out over time
      // and with distance so it churns; w is the strength (0..1 while it opens or closes)
      float f = 1.0 - clamp(dist / max(r.z, 1.0), 0.0, 1.0);
      float cell = dist / u_scale;
      float ang = sw * r.w * f * f * (1.0 + 0.35 * sin(u_wob * 2.3 - cell * 0.45));
      float cs = cos(ang);
      float sn = sin(ang);
      vec2 rd = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);
      // and pulled a little inward, so the sky around it looks sucked toward the hole
      disp += (d - rd) - d * f * f * f * 0.1 * r.w;
      continue;
    }
    if (w < 0.0) {
      // vertical column wave: pixels on both sides pushed sideways, the column wobbling as it goes
      w = -w;
      float cy = (cellPx.y - u_origin.y) / u_scale;
      float wob = (sin(cy * 0.11 + u_wob) + 0.5 * sin(cy * 0.27 - u_wob * 1.7)) * w * 0.35;
      float dx = d.x - wob;
      float ax = abs(dx);
      float cb = smoothstep(r.z - w, r.z - w * 0.4, ax) * (1.0 - smoothstep(r.z - w * 0.2, r.z, ax));
      // fade out just below the beacon so the ground under it barely moves
      cb *= 1.0 - smoothstep(0.0, w, d.y);
      disp += vec2(sign(dx), 0.0) * cb * r.w * w * 0.9;
      continue;
    }
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
