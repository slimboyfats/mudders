/**
 * GLSL ES 3.00 shaders for the pixel renderer, inlined as strings (§9). Kept to features
 * SwiftShader supports: no derivatives tricks, no float render targets, bounded loops.
 */

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
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
vec4 look(uint m) { return texelFetch(u_look, ivec2(int(m), 0), 0); }
float hash(ivec2 c) {
  uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h & 1023u) / 1023.0;
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
      }
    } else {
      float k = clamp(m.y / u_map.y, 0.0, 1.0);
      c = mix(u_top, u_bottom, k * k * (3.0 - 2.0 * k)) + u_flash;
      // stars: a few sky cells high up twinkle on and off in whole steps
      if (u_stars > 0.0 && k < 0.6) {
        float h = hash(cell + ivec2(31, 17));
        if (h > 1.0 - u_stars) {
          float tw = hash(cell + ivec2(int(u_time / 23.0 + h * 97.0), 5));
          c = mix(c, u_starColor, (tw > 0.25 ? 0.75 : 0.3) * (1.0 - k / 0.6));
        }
      }
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
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
float hash(ivec2 c) {
  uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h & 1023u) / 1023.0;
}
void main() {
  if (v_map.x < 0.0 || v_map.y < 0.0 || v_map.x >= u_map.x || v_map.y >= u_map.y) discard;
  ivec2 c = ivec2(floor(v_map));
  uint m = mat(c);
  if (m == 0u) discard;
  vec3 base = texelFetch(u_palette, ivec2(int(m), 0), 0).rgb;
  float g = (hash(c) - 0.5) * u_grain;
  // lit surface: cells with air above, a softer second row
  float lit = 0.0;
  if (mat(c + ivec2(0, -1)) == 0u) lit = 0.22;
  else if (mat(c + ivec2(0, -2)) == 0u) lit = 0.09;
  // overhang underside
  float under = mat(c + ivec2(0, 1)) == 0u && c.y < int(u_map.y) - 1 ? -0.16 : 0.0;
  // side faces facing open air
  float side = (mat(c + ivec2(-1, 0)) == 0u || mat(c + ivec2(1, 0)) == 0u) ? 0.05 : 0.0;
  float depth = -0.22 * clamp(v_map.y / u_map.y, 0.0, 1.0);
  vec3 col = base * (1.0 + g + under + depth) + u_light * (lit + side);
  // animated materials (water, lava) are left to the cycling pass: no snow or wet sheen on them
  bool still = texelFetch(u_look, ivec2(int(m), 0), 0).r == 0.0;
  if (still && u_wet > 0.0) {
    // rain soaks the top few rows: darker, with glints on the surface
    int soak = 0;
    for (int k = 1; k <= 6; k++) if (mat(c + ivec2(0, -k)) == 0u) { soak = k; break; }
    if (soak > 0) {
      // soaked rows go dark and cold, the rim light dulls to a wet sheen
      col = base * (1.0 + g + depth) * (1.0 - u_wet * (0.5 - 0.05 * float(soak)));
      col = mix(col, col * vec3(0.85, 0.92, 1.08), u_wet);
      if (soak == 1) col += vec3(0.05, 0.06, 0.09) * u_wet;
      if (soak == 1 && hash(c + ivec2(3, 11)) > 0.7) col += vec3(0.14, 0.16, 0.2) * u_wet;
    }
  }
  if (still && u_snow > 0.0) {
    // snow cap: two full rows and a ragged third, also on steep faces open to the sky diagonally
    float h = hash(c + ivec2(13, 5));
    int sd = 0;
    for (int k = 1; k <= 3; k++) {
      if (mat(c + ivec2(0, -k)) == 0u || mat(c + ivec2(-1, -k)) == 0u && mat(c + ivec2(1, -k)) == 0u) { sd = k; break; }
    }
    if (sd == 0 && (mat(c + ivec2(-1, -1)) == 0u || mat(c + ivec2(1, -1)) == 0u)) sd = 2;
    if (sd == 1 || sd == 2 || (sd == 3 && h > 0.55)) {
      vec3 snow = h > 0.5 ? vec3(0.93, 0.95, 1.0) : vec3(0.8, 0.85, 0.94);
      if (sd == 1) snow += 0.04;
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
