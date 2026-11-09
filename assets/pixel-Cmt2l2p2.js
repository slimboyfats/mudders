import{B as e,V as t,c as n,d as r,f as i,h as a,m as o,p as s,u as c}from"./index-D7c26XIf.js";import{a as l,o as u}from"./MatchView-CCu8ODVg.js";var d=[1,.42,.1],f=.5,p=class{pos=new Float32Array(32);col=new Float32Array(24);count=0;clear(){this.count=0}add(e,t,n,r,i){if(r<=.01||n<1)return;let a=this.count;if(a>=8){let e=0;for(let t=1;t<8;t++)this.weight(t)<this.weight(e)&&(e=t);if(this.weight(e)>=r*n)return;a=e}else this.count++;this.pos[a*4]=e,this.pos[a*4+1]=t,this.pos[a*4+2]=n,this.pos[a*4+3]=r,this.col[a*3]=(i>>16&255)/255,this.col[a*3+1]=(i>>8&255)/255,this.col[a*3+2]=(i&255)/255}weight(e){return this.pos[e*4+2]*this.pos[e*4+3]}},m=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];function h(e,t){return(m[(t&3)*4+(e&3)]+.5)/16}function g(e,t,n){if(e<=0)return 0;let r=Math.floor(e*4+h(t,n)-.5)/4;return Math.min(1.5,Math.max(0,r))}function _(e,t,n,r){r[0]=0,r[1]=0,r[2]=0;let i=t+.5,a=n+.5;for(let o=0;o<e.count;o++){let s=e.pos[o*4+2],c=e.pos[o*4]-i,l=e.pos[o*4+1]-a,u=Math.hypot(c,l);if(u>=s)continue;let d=1-u/s,f=g(d*(.4+.6*d)*e.pos[o*4+3],t,n);r[0]+=e.col[o*3]*f,r[1]+=e.col[o*3+1]*f,r[2]+=e.col[o*3+2]*f}return r}function v(e){if(e===0||e>10)return 0;let t=1-(e-1)/10;return t*t}function y(e,t){let n=Math.min(.7,t);return Math.min(255,Math.round(e*(1+n*1.1)+n*30))}function b(e,t){return t[0]<=0&&t[1]<=0&&t[2]<=0?e:y(e>>16&255,t[0])<<16|y(e>>8&255,t[1])<<8|y(e&255,t[2])}function x(e,t,n,r,i,a){a.fill(255);let o=r,s=i,c=-1,l=-1;for(let i=0;i<e.length;i++){if(!(n[e[i]]&6)&&!(n[t[i]]&6))continue;a[i]=0;let u=i%r,d=(i-u)/r;u<o&&(o=u),u>c&&(c=u),d<s&&(s=d),d>l&&(l=d)}if(c<0)return!1;o=Math.max(0,o-10),s=Math.max(0,s-10),c=Math.min(r-1,c+10),l=Math.min(i-1,l+10);for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t;a[n]=a[n]===0?0:250}for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t,i=a[n];i!==0&&(t>o&&(i=Math.min(i,a[n-1]+3)),e>s&&(i=Math.min(i,a[n-r]+3),t>o&&(i=Math.min(i,a[n-r-1]+4)),t<c&&(i=Math.min(i,a[n-r+1]+4))),a[n]=Math.min(i,250))}for(let e=l;e>=s;e--)for(let t=c;t>=o;t--){let n=e*r+t,i=a[n];i!==0&&(t<c&&(i=Math.min(i,a[n+1]+3)),e<l&&(i=Math.min(i,a[n+r]+3),t<c&&(i=Math.min(i,a[n+r+1]+4)),t>o&&(i=Math.min(i,a[n+r-1]+4))),a[n]=Math.min(i,250))}for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t,i=a[n];a[n]=i===0?0:i>33?255:Math.max(1,Math.round(i/3))}return!0}var S=`
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
`,C=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,w=`#version 300 es
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
uniform vec4 u_lights[8];  // x, y (cells), radius, strength
uniform vec3 u_lightCol[8];
uniform usampler2D u_heat;   // cells to the nearest hot or burning cell, 0 = source, 255 = far
uniform float u_heatOn;
out vec4 o;

uint mat(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_map.x) || c.y >= int(u_map.y)) return 0u;
  return texelFetch(u_terrain, c, 0).r;
}
vec4 look(uint m) { return texelFetch(u_look, ivec2(int(m), 0), 0); }
${S}
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
      for (int k = 1; k <= 16; k++) {
        ivec2 g = cell + ivec2(0, k);
        uint b = mat(g);
        if (b == 0u) continue;
        float src = look(b).b > 0.5 ? 1.0 : 0.0;
        if (src == 0.0 && u_burnOn > 0.0) {
          // a fresh crater: the scorched floor gives off heat that fades as it cools
          uint bt = texelFetch(u_burn, g, 0).r;
          float age = u_time - float(bt) + 1.0;
          if (bt != 0u && age >= 0.0 && age < 420.0) {
            float f = 1.0 - age / 420.0;
            src = 0.9 * f * f;
          }
        }
        // hotter ground sends the haze higher
        float reach = 3.0 + 12.0 * src;
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
      // dynamic light: each blast lights the faces of the ground turned toward it (cells whose
      // neighbours on its side are open air), in hard bands dithered per cell; buried cells catch
      // only a little. Lava and flames warm the ground near them with a slow flicker.
      vec3 L = vec3(0.0);
      if (u_lightCount > 0) {
        vec2 cc = vec2(cell) + 0.5;
        for (int i = 0; i < 8; i++) {
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
          float q = clamp(floor(e * 4.0 + bayer(cell) - 0.5) / 4.0, 0.0, 1.5);
          L += u_lightCol[i] * q;
        }
      }
      if (u_heatOn > 0.0) {
        uint hd = texelFetch(u_heat, cell, 0).r;
        if (hd > 0u && hd <= 10u) {
          float f = 1.0 - float(hd - 1u) / 10.0;
          ivec2 blk = cell >> 3;
          int st = int(floor(u_time / 9.0 + hash(blk) * 13.0));
          float fl = 0.8 + 0.35 * hash(blk + ivec2(st * 7, st * 3 + 19));
          float e = f * f * fl * ${f.toFixed(3)};
          float q = floor(e * 4.0 + bayer(cell) - 0.5) / 4.0;
          L += vec3(${d.map(e=>e.toFixed(3)).join(`, `)}) * max(q, 0.0);
        }
      }
      c = min(c * (1.0 + L * 1.3) + L * 0.16, vec3(1.0));
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
}`,T=`#version 300 es
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
${S}
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
}`,E=`#version 300 es
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
}`,D=`#version 300 es
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
${S}
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
}`,ee=`#version 300 es
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
}`,te=`#version 300 es
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
}`,ne=`#version 300 es
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
uniform float u_wob;
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
}`;function O(e,t,n){let r=e.createProgram();for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(!t)throw Error(`createShader failed`);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw Error(`shader compile failed: ${e.getShaderInfoLog(t)??``}\n${a}`);e.attachShader(r,t),e.deleteShader(t)}if(e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw Error(`program link failed: ${e.getProgramInfoLog(r)??``}`);return r}function re(e,t,n){let r={};for(let i of n)r[i]=e.getUniformLocation(t,i);return r}function k(e,t=e.NEAREST){let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),n}function A(e){return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}var j=class{s;constructor(e){this.s=e>>>0||1}next(){let e=this.s=this.s+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,t){return e+(t-e)*this.next()}},ie=10,M={Rect:0,Glow:1,Disc:2,Ring:3,Pixel:4,Solid:5,Stipple:6},ae=class{gl;data;n=0;prog;vao;buf;u;gpuBytes;constructor(e,t=4096){this.gl=e,this.data=new Float32Array(t*ie),this.prog=O(e,ee,te),this.u=re(e,this.prog,[`u_view`,`u_origin`,`u_scale`]),this.vao=e.createVertexArray(),this.buf=e.createBuffer(),e.bindVertexArray(this.vao),e.bindBuffer(e.ARRAY_BUFFER,this.buf),e.bufferData(e.ARRAY_BUFFER,this.data.byteLength,e.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength;for(let[t,n,r]of[[0,2,0],[1,2,2],[2,1,4],[3,4,5],[4,1,9]])e.enableVertexAttribArray(t),e.vertexAttribPointer(t,n,e.FLOAT,!1,40,r*4),e.vertexAttribDivisor(t,1);e.bindVertexArray(null)}get count(){return this.n}push(e,t,n,r,i,a=1,o=M.Rect,s=0){if((this.n+1)*ie>this.data.length){let e=new Float32Array(this.data.length*2);e.set(this.data),this.data=e}let c=this.data,l=this.n*ie;c[l]=e,c[l+1]=t,c[l+2]=n,c[l+3]=r,c[l+4]=s,c[l+5]=(i>>16&255)/255,c[l+6]=(i>>8&255)/255,c[l+7]=(i&255)/255,c[l+8]=a,c[l+9]=o,this.n++}rect(e,t,n,r,i,a=1){this.push(e+n/2,t+r/2,n,r,i,a)}line(e,t,n,r,i,a,o=1){let s=n-e,c=r-t,l=Math.hypot(s,c);l<1e-4||this.push((e+n)/2,(t+r)/2,l,i,a,o,M.Rect,Math.atan2(c,s))}flush(e,t,n){if(this.n===0)return;let r=this.gl;r.useProgram(this.prog),r.uniform2f(this.u.u_view,e[0],e[1]),r.uniform2f(this.u.u_origin,t[0],t[1]),r.uniform1f(this.u.u_scale,n),r.bindVertexArray(this.vao),r.bindBuffer(r.ARRAY_BUFFER,this.buf),this.data.byteLength>this.gpuBytes&&(r.bufferData(r.ARRAY_BUFFER,this.data.byteLength,r.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength),r.bufferSubData(r.ARRAY_BUFFER,0,this.data,0,this.n*ie),r.drawArraysInstanced(r.TRIANGLES,0,6,this.n),r.bindVertexArray(null),this.n=0}dispose(){this.gl.deleteBuffer(this.buf),this.gl.deleteVertexArray(this.vao),this.gl.deleteProgram(this.prog)}},N={Spark:0,Chunk:1,Smoke:2,Dust:3,Flame:4,Snow:5,Streak:6,Glitter:7,Plume:8,Cloud:9,Ember:10,Ash:11,Rain:12,Flake:13},oe=[[4,16765500,16777215],[6,16765500,16774848],[7,16052456,16777215],[8,14690364,16769136],[8,14690364,16777215],[7,10491944,16756800]],se=7,ce=3,le=9080992,ue=4869982,de=13159640,fe=3817034,pe=46,me=14;function he(e,t,n,r){return{x:e,y:t,start:n,windup:r}}function ge(e,t){let n=oe.length+se,r=t-e.start;if(r<0)return;let i=r-e.windup;if(i>60)return;let a;if(i<0){let t=Math.min(1,r/Math.max(1,e.windup-2));a=Math.round(n*t)+ +(i===-1||i===-2)}else a=i<=pe?n:Math.round(n*(1-(i-pe)/me));let o=i>=0&&i<3?3:+(i>=3&&i<6),s=i>=0&&i<8||i>=8&&i<38&&!(i>>2&3);return{rise:a,lift:o,lit:s}}function _e(e,t,n){let r=ge(e,Math.floor(n));if(!r)return Math.floor(n)-e.start<0;let{rise:i,lift:a,lit:o}=r,s=Math.round(e.x),c=Math.round(e.y),l=se+a,u=oe.length+l,d=c-i-a;for(let e=0;e<u;e++){let n=d+e;if(n>=c)break;if(e<oe.length){let[r,i,a]=oe[e];t.rect(s-r,n,r*2+1,1,o?a:i),e>=1&&e<=3&&t.rect(s-r+2,n,2,1,16777215,o?1:.85)}else t.rect(s-ce,n,7,1,le),t.rect(s-ce,n,1,1,ue),t.rect(s+ce,n,1,1,ue),t.rect(s-1,n,1,1,o?16777215:de)}return i>0&&t.rect(s-ce-2,c-1,11,1,fe),!0}var ve=.42,ye=.72,be=.55,xe=.8,Se=24,Ce=6,we=class{probe;onThud;cap;n=0;x;y;vx;vy;w;h;color;age;rest;gone;ground;constructor(e,t,n){this.probe=t,this.onThud=n,this.cap=e,this.x=new Float32Array(e),this.y=new Float32Array(e),this.vx=new Float32Array(e),this.vy=new Float32Array(e),this.w=new Uint8Array(e),this.h=new Uint8Array(e),this.color=new Uint32Array(e),this.age=new Uint16Array(e),this.rest=new Uint16Array(e),this.gone=new Uint8Array(e),this.ground=new Uint8Array(e)}add(e){let t=Math.max(1,Math.min(4,Math.round(e.w))),n=Math.max(1,Math.min(4,Math.round(e.h))),r=Math.floor(e.x-t/2),i=Math.floor(e.y-n/2),a=i;for(;a>i-8&&this.hit(r,a,t,n);)a--;if(this.hit(r,a,t,n))return;let o=this.n;if(o>=this.cap){let e=0,t=1/0;for(let n=0;n<this.n;n++){let r=this.ground[n]?this.rest[n]-this.gone[n]:1e6;r<t&&(t=r,e=n)}o=e}else this.n++;this.x[o]=r,this.y[o]=a,this.vx[o]=e.vx,this.vy[o]=e.vy,this.w[o]=t,this.h[o]=n,this.color[o]=e.color,this.age[o]=0,this.rest[o]=Math.max(1,Math.min(65535,Math.round(e.rest))),this.gone[o]=0,this.ground[o]=0}hit(e,t,n,r){let i=Math.floor(e),a=Math.floor(t);for(let e=0;e<r;e++)for(let t=0;t<n;t++)if(this.probe.solid(i+t,a+e))return!0;return!1}step(e,t){let n=0;for(let r=0;r<this.n;r++){let i=this.x[r],a=this.y[r],o=this.vx[r],s=this.vy[r],c=this.w[r],l=this.h[r],u=this.rest[r],d=this.gone[r],f=this.ground[r],p=this.age[r]+1;if(f&&this.hit(i,a+1,c,l)){if(o!==0){let e=i+o;this.hit(e,a,c,l)?this.hit(e,a-1,c,l)?o=-o*.3:(i=e,--a):i=e,o*=xe,Math.abs(o)<.05&&(o=0,i=Math.floor(i))}else if(u>0)u--;else if(++d>=Se)continue}else{if(f=0,s=Math.min(Ce,s+e),o*=.995,c!==l&&!(p&7)&&!this.hit(i,a,l,c)){let e=c;c=l,l=e}let t=Math.max(1,Math.ceil(Math.max(Math.abs(o),Math.abs(s)))),n=o/t,r=s/t;for(let e=0;e<t;e++){if(!this.hit(i+n,a,c,l))i+=n;else{o=-o*.45;break}if(!this.hit(i,a+r,c,l))a+=r;else{if(r>0){for(a=Math.floor(a+r);this.hit(i,a,c,l);)a--;let e=s;if(e>1.2&&this.onThud&&this.onThud(i+c/2,a+l,e),e<be){if(s=0,f=1,l>c&&!this.hit(i,a+l-c,l,c)){let e=l;l=c,c=e,a+=e-l}}else s=-e*ve,o*=ye}else s=0;break}}}a>t+8||(this.x[n]=i,this.y[n]=a,this.vx[n]=o,this.vy[n]=s,this.w[n]=c,this.h[n]=l,this.color[n]=this.color[r],this.age[n]=Math.min(65535,p),this.rest[n]=u,this.gone[n]=d,this.ground[n]=f,n++)}this.n=n}draw(e){for(let t=0;t<this.n;t++){let n=this.w[t],r=this.h[t],i=Math.floor(this.x[t]),a=Math.floor(this.y[t]),o=this.color[t],c=this.gone[t];if(c>0){let t=Math.floor(c*(r+1)/Se);if(t>=r){for(let t=c&1;t<n;t+=2)e.push(i+t+.5,a+r-.5,1,1,s(o,.8),1);continue}a+=t,r-=t}let l=i+n/2;e.push(l,a+r/2,n,r,o,1),r>=2?(e.push(l,a+.5,n,1,s(o,1.22),1),e.push(l,a+r-.5,n,1,s(o,.68),1)):e.push(i+.5,a+.5,1,1,s(o,1.22),1)}}clear(){this.n=0}},Te=3,Ee=34,De=18,Oe=[[1.15,3807376,.35],[1,2907391,.6],[.75,5812479,.8],[.5,11593983,.9],[.28,16777215,1]],ke=class{particles;charges=[];beams=[];constructor(e){this.particles=e}get active(){return this.charges.length>0||this.beams.length>0}charge(e,t){this.charges.push({x:e.x,y:e.y,start:e.tick,dur:e.params.ticks??70,rng:t})}fire(e,t,n){this.charges=this.charges.filter(t=>Math.abs(t.x-e.x)>2),this.beams.push({x:Math.round(e.x),y:Math.round(n),hw:Math.max(10,Math.round(e.radius*.13)),start:e.tick,rng:t})}tick(e,t){let n=this.particles;this.charges=this.charges.filter(r=>{let i=e-r.start;if(i>r.dur+2)return!1;let a=Math.min(1,i/r.dur),o=Math.round((1+5*a)*t);for(let e=0;e<o;e++){let e=r.rng.next()<.5?-1:1,t=r.rng.range(14,60)*(1-.6*a);n.add({x:r.x+.5+e*t,y:r.rng.range(0,r.y),vx:-e*t/9,vy:0,life:9,size:1,color:r.rng.next()<.35?16777215:6340863,kind:N.Spark})}return!0});let r=0;return this.beams=this.beams.filter(i=>{let a=e-i.start;if(a>55)return!1;if(a>37)return!0;r=Math.max(r,3);let o=i.rng,s=Math.round(10*t)+2;for(let e=0;e<s;e++){let t=e%2==0?-1:1;n.add({x:i.x+.5+t*o.range(i.hw*.6,i.hw*1.3),y:i.y-o.range(1,6),vx:t*o.range(.8,4),vy:-o.range(.6,4.2),life:o.range(16,40),size:o.next()<.25?2:1,color:o.next()<.4?16777215:o.next()<.6?10148095:4881663,kind:N.Spark})}for(let e=0;e<2;e++){let e=o.next()<.5?-1:1;n.add({x:i.x+.5+e*(i.hw+1),y:o.range(0,i.y),vx:e*o.range(.2,.8),vy:-o.range(.2,1.2),life:o.range(8,16),size:1,color:13693183,kind:N.Spark})}return!0}),r}draw(e,t){for(let n of this.charges)this.drawCharge(e,n,t);for(let n of this.beams)this.drawBeam(e,n,t)}drawCharge(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,r/t.dur),a=t.x+.5;if(Math.floor(r/(i<.5?8:i<.85?4:2))%2==0&&(e.push(a,t.y-1.5,3,1,4245759,1),e.push(a,t.y-1.5,1,3,4245759,1),e.push(a,t.y-1.5,1,1,16777215,1)),i>.85){let n=1+2*Math.round((i-.85)*20);e.push(a,t.y/2,n+4,t.y,2907391,.35),e.push(a,t.y/2,n,t.y,13693183,.9)}else if(r%6!=5){let n=r*3%11;for(let r=n-6;r<t.y;r+=11){let n=Math.max(0,r),o=Math.min(t.y,r+6);o<=n||e.push(a,(n+o)/2,1,o-n,5290239,.4+.5*i)}}let o=i>.85?16777215:6342911,s=t.y-1.5;for(let t of[44,22]){let n=Math.round(t-(t-6)*i),r=t>30?6:4;for(let t of[-1,1])for(let i of[-1,1]){let c=a+t*n,l=s+i*n;e.push(c-t*(r-1)/2,l,r,1,o,.9),e.push(c,l-i*(r-1)/2,1,r,o,.9)}}}drawBeam(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,(r+1)/Te);if(r>37&&(i=1-(r-Te-Ee)/De),i<=0)return;let a=Ae(n*31+t.x),o=a&3?(a&3)==3?2:0:-1,s=Math.max(.5,t.hw*i+o),c=t.x+.5,l=t.y/2;for(let[n,r,i]of Oe){let a=Math.round(s*n);a<0||e.push(c,l,a*2+1,t.y,r,i)}let u=Math.round(s*1.15)*2+3;for(let n=r*9%22;n<t.y;n+=22)e.push(c,Math.floor(n)+1,u,2,14742783,.6*i);for(let r=0;r<24;r++){let i=Ae(n*97+r*13+t.x*7),a=i%Math.max(1,t.y),o=i>>12&1?1:-1,l=Math.round(s*1.15)+1+(i>>13&3);e.push(c+o*l,a+.5,1,1,i>>10&1?16777215:8442111,.9)}if(r<=37){let n=r<29?1:(37-r)/8,i=Math.round((t.hw*4+(a>>4&7))*n);e.push(c,t.y-1,i*2+1,2,5812479,.7*n),e.push(c,t.y-1,Math.round(i*.55)*2+1,3,13693183,.85*n),e.push(c,t.y-1,Math.round(t.hw*1.4)*2+1,6,16777215,n)}}clear(){this.charges=[],this.beams=[]}};function Ae(e){let t=Math.imul(e^1540483477,2654435761);return t^=t>>>15,t>>>0&65535}var je=9,Me=14,Ne=12,Pe=[[2,11540480,.35],[0,16730640,.6],[-2,16751144,.8],[-4,16769136,.9],[-5,16777215,1]],Fe=class{particles;charges=[];beams=[];constructor(e){this.particles=e}get active(){return this.charges.length>0||this.beams.length>0}charge(e,t){this.charges.push({x:e.x,y:e.y,start:e.tick,dur:e.params.ticks??60,rng:t})}fire(e,t){this.charges=this.charges.filter(t=>t.x!==e.x),this.beams.push({x:e.x,end:e.y,surface:e.params.surface??e.y,start:e.tick,head:0,done:-1,rng:t})}track(e,t){for(let n of this.beams){if(n.done>=0||t<=n.start)continue;let r=!1;for(let t of e)if(t.kind===`projectile`&&Math.floor(t.x)===n.x&&!(t.y<n.head-1)){n.head=t.y,r=!0;break}r||(n.done=t)}}owns(e,t){for(let n of this.beams)if(n.done<0&&Math.floor(e)===n.x&&t>=n.head-1)return!0;return!1}tick(e,t){let n=this.particles;this.charges=this.charges.filter(r=>{let i=e-r.start;if(i>r.dur+2)return!1;let a=Math.min(1,i/r.dur),o=Math.round((1+3*a)*t);for(let e=0;e<o;e++){let e=r.rng.next()<.5?-1:1,t=r.rng.range(10,34)*(1-.5*a),i=r.rng.range(0,r.y);n.add({x:r.x+.5+e*t,y:i,vx:-e*t/10,vy:0,life:10,size:1,color:r.rng.next()<.3?16777215:16728128,kind:N.Spark})}return!0});let r=0;return this.beams=this.beams.filter(i=>{let a=e-i.start,o=i.done>=0?e-i.done:0;if(o>26)return!1;let s=i.rng;if(i.done<0||o<Me){if(r=Math.max(r,i.done<0?2:1.2),i.head>=i.surface-1){let e=Math.round(6*t)+1;for(let t=0;t<e;t++){let e=t%2==0?-1:1;n.add({x:i.x+.5+e*s.range(7,11),y:i.surface-1,vx:e*s.range(.4,2.2),vy:-s.range(1.2,3.6),life:s.range(18,40),size:s.next()<.3?1.5:1,color:s.next()<.35?16773280:s.next()<.6?16752688:16734744,kind:N.Spark})}a%3==0&&n.add({x:i.x+.5+s.range(-9,je),y:i.surface-2,vx:s.range(-.3,.3),vy:-s.range(.3,.8),life:s.range(50,90),size:s.range(4,8),color:s.next()<.5?3813428:5918288,kind:N.Smoke})}if(i.done<0&&i.head>0){let e=Math.round(4*t)+1;for(let t=0;t<e;t++)n.add({x:i.x+.5+s.range(-9,je),y:i.head,vx:s.range(-1.2,1.2),vy:-s.range(.5,2.5),life:s.range(8,18),size:1,color:s.next()<.5?16777215:16765024,kind:N.Spark})}}else a%4==0&&n.add({x:i.x+.5+s.range(-3,3),y:i.surface-1,vx:s.range(-.15,.15),vy:-s.range(.3,.6),life:s.range(60,110),size:s.range(3,6),color:6972006,kind:N.Smoke});return!0}),r}draw(e,t){for(let n of this.charges)this.drawCharge(e,n,t);for(let n of this.beams)this.drawBeam(e,n,t)}drawCharge(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,r/t.dur),a=t.x+.5;if(Math.floor(r/(i<.5?8:i<.85?4:2))%2==0&&(e.push(a,t.y-1.5,3,1,16724016,1),e.push(a,t.y-1.5,1,3,16724016,1),e.push(a,t.y-1.5,1,1,16777215,1)),i>.85)e.push(a,t.y/2,3,t.y,16722448,.35),e.push(a,t.y/2,1,t.y,16769232,.9);else if(r%6!=5){let n=r*3%11;for(let r=n-6;r<t.y;r+=11){let n=Math.max(0,r),o=Math.min(t.y,r+6);o<=n||e.push(a,(n+o)/2,1,o-n,16724016,.4+.5*i)}}let o=Math.round(26-18*i),s=i>.85?16777215:16728128,c=t.y-1.5;for(let t of[-1,1])for(let n of[-1,1]){let r=a+t*o,i=c+n*o;e.push(r-t*3/2,i,4,1,s,.9),e.push(r,i-n*3/2,1,4,s,.9)}}drawBeam(e,t,n){let r=n-t.start;if(r<0)return;let i=t.done>=0?Math.max(0,n-t.done):0,a=je*Math.min(1,(r+1)/3);if(i>Me&&(a=je*(1-(i-Me)/Ne)),a<=0)return;let o=Ie(n*31+t.x);a=Math.max(.5,Math.round(a+(o&3?+((o&3)==3):-1)));let s=Math.max(1,Math.round(t.head)),c=t.x+.5,l=s/2,u=a/je;for(let[t,n,r]of Pe){let i=Math.round(a+t*u);i<0||e.push(c,l,i*2+1,s,n,r)}for(let t=r*7%18;t<s;t+=18)e.push(c,Math.floor(t)+1,Math.round(a)*2+3,2,16777215,.55);for(let r=0;r<10;r++){let i=Ie(n*97+r*13+t.x*7),o=i%s,l=i>>12&1?1:-1;e.push(c+l*(Math.round(a)+2+(i>>13&1)),o+.5,1,1,16765056,.9)}if(t.done<0||i<Me){let n=t.done<0?1:1-i/Me;if(e.push(c,s,27,5,16742944,.7*n),e.push(c,s,19,3,16777215,n),s>=t.surface-1){let r=Math.round((45+(o>>4&3))*n);e.push(c,t.surface-1,r*2+1,1,16760928,.75*n),e.push(c,t.surface-1,Math.round(r*.5)*2+1,2,16777215,.85*n)}}}clear(){this.charges=[],this.beams=[]}};function Ie(e){let t=Math.imul(e^1540483477,2654435761);return t^=t>>>15,t>>>0&65535}var Le=4870232,Re=9081500,ze=2501168,Be=14168122,Ve=14212324,He=[12580095,8378608,4892888],Ue=16728128,We=5904922,Ge=3,P=42;function Ke(e,t,n,r,i=1){e.push(Math.round(t)+.5,Math.round(n)+.5,1,1,r,i,M.Rect)}function qe(e,t,n,r,i,a){e.push(t+r/2,n+i/2,r,i,a,1,M.Rect)}function Je(e,t){let n=Math.imul(e^2654435769,2246822507)^Math.imul(t+1663821227,3266489909);return n^=n>>>15,n=Math.imul(n,739982445),(n^n>>>13)>>>0}function Ye(e,t,n,r){let i=e.age+Math.max(0,r-e.last),a=i-e.arm,o=a>=0&&a<e.life&&e.strength>0,s=Math.round(e.x),c=Math.round(e.y);if(o){let r=e.strength;for(let i=0;i<Ge;i++){let o=((a+i*P/Ge)%P+P)%P,l=1-o/P,u=6+(e.r-6)*l*l,d=Math.max(16,Math.round(u*1.6)),f=He[l>.66?2:+(l>.33)],p=Math.min(1,r*(.6+.4*(1-l))),m=i*.7+(a-o)*.013;for(let e=0;e<d;e++){if(Je(e,i+Math.floor((a-o)/P)*7)%4==0)continue;let r=m+e/d*Math.PI*2,h=c-2+Math.sin(r)*u*.75;h>c-2||(Ke(t,s+Math.cos(r)*u,h,f,p),l<.4&&Ke(n,s+Math.cos(r)*u,h-1,f,.5*p))}}for(let n=-1;n<=1;n+=2)for(let i=0;i<6;i++){let o=e.r-8,l=8+((i*o/6-a*(1.2+r))%o+o)%o,u=Math.round(Math.sin(l/e.r*Math.PI)*e.r*.22),d=s+n*l,f=c-3-u,p=He[l<e.r*.33?0:1];Ke(t,d,f,p,r),Ke(t,d+n,f,p,.6*r)}}let l=s-4,u=c-4;qe(t,l,u,9,4,Le),qe(t,l,u,9,1,Re),qe(t,l,u+4-1,9,1,ze),qe(t,l-1,u+1,2,3,Be),qe(t,l+9-1,u+1,2,3,Ve);let d=Math.floor(i/((o?6:16)/2))%2==0;qe(t,s-1,u-2,3,2,ze),Ke(t,s,u-2,d?Ue:We),d&&Ke(n,s,u-3,Ue,.6)}var Xe=[16775388,16769136,16756784,15757344,13124632,9057312,6175280,4864572,3813430],Ze=44,Qe=22,$e=40,et=16;function tt(e,t,n,r,i,a=0){let o=new j(i),s=new Float32Array(488);for(let e=0;e<s.length;e++)s[e]=o.next();return{x:e,y:t,r:n,start:r,fuse:a,life:a+240,top:Math.max(n*.55+6,0),p:s}}var nt=e=>1-(1-e)*(1-e);function rt(e){return Xe[Math.max(0,Math.min(Xe.length-1,Math.floor(e)))]}function it(e,t,n,r,i,a){if(r<1||a<=.02)return;e.push(t,n,r,r,rt(i+1.4),a,M.Solid);let o=r*.7;e.push(t-r*.11,n-r*.14,o,o,rt(i),a,M.Solid)}function at(e,t,n,r,i=!0){return ct(e,r,n,i?(e,n,r,i,a)=>it(t,e,n,r,i,a):null)}var ot=new WeakMap;function st(e,t,n,r){let i=ot.get(e)??new Float32Array(244).fill(NaN),a=new Float32Array(244),o=new j(e.start*7919+t*104729>>>0),s=0;ct(e,t,null,(e,t,c,l,u)=>{let d=s++;if(a[d*2]=e,a[d*2+1]=t,c<1||u<=.02)return;let f=i[d*2],p=i[d*2+1],m=Number.isFinite(f)&&Math.abs(e-f)<3&&Math.abs(t-p)<3,h=m?e-f:0,g=m?t-p:0,_=Math.max(1,Math.min(10,Math.round(c*c*.01*r*u))),v=c/2;for(let r=0;r<_;r++){let r=o.next()*6.283185,i=Math.sqrt(o.next()),a=Math.cos(r)*i,s=Math.sin(r)*i;n.add({x:e+a*v,y:t+s*v,vx:h+(o.next()-.5)*.06,vy:g+(o.next()-.5)*.06,life:26+o.next()*20,size:1,color:rt(l+(s-a*.4>.1?1.4:0)),kind:N.Cloud|128})}}),ot.set(e,a)}function ct(e,t,n,r){let i=t-e.start;if(i<0)return!0;if(i>e.life)return!1;let{x:a,y:o,r:s,p:c,life:l,fuse:u}=e,d=nt(Math.min(1,i/(l*.9))),f=o-Math.min(s*2.4,o-e.top)*(.1+.9*d),p=s*(.3+.8*nt(Math.min(1,i/l))),m=p*.42,h=Math.min(1,i/(l*.75)),g=i-u,_=g>=0&&g<50?(1-g/50)*3:0,v=.2+h*6.4-_,y=i<l-70?1:(l-i)/70,b=i*.02,x=i*.035,S=o+s*.45,C=f+m*.6,w=Math.max(0,S-C);for(let e=0;e<$e;e++){let t=(66+e)*4,n=(c[t]+i*.012)%1,o=1-.45*Math.sin(Math.PI*Math.min(1,n*1.15)),u=s*.26*o*(.8+.4*c[t+1]),d=a+(c[t+3]-.5)*u*1.2+b*n,f=S-n*w,p=Math.max(3,u*1.7*(.85+.3*c[t+1])),m=v-.8+(1-n)*.9+c[t+2]*.8,h=y*(i<l-110?1:(l-30-i)/80);r?.(d,f,p,m,Math.min(1,Math.max(0,h))*.95)}for(let e=0;e<et;e++){let t=(106+e)*4,n=e%2==0?-1:1,l=s*(.3+1.3*nt(Math.min(1,i/140)))*(.4+.6*c[t]),u=s*(.16+.14*c[t+1])*(.6+.6*d);r?.(a+n*l,o-u*.35-c[t+3]*s*.12,u,4.6+h*2.2+c[t+2],y*.85)}for(let e=0;e<Ze;e++){let t=e*4,n=e%2==0?-1:1,i=c[t]*Math.PI*2+x*n,o=p*(.45+.3*c[t+3]),s=m*.85,l=Math.cos(i),u=Math.sin(i),d=a+b+n*(o+l*s),h=f-u*s,g=m*(.85+.55*c[t+1]),_=v+u*1.1+c[t+2]*.9-.4;r?.(d,h,g,_,y)}for(let e=0;e<Qe;e++){let t=(Ze+e)*4,n=c[t]*2-1,i=a+b+n*p*.6,o=f+m*.3-m*(.2+1*(1-n*n))*c[t+3],s=m*(1+.5*c[t+1]);r?.(i,o,s,v+c[t+2]*.9-.6,y)}let T=_>0?g:i;if(n&&T<120){let e=1-T/120,t=p*.9;n.push(a+b,f+m*.2,t,t*.7,16747056,.55*e*e,M.Pixel),n.push(a,S-w*.4,s*.3,w*.7,16736288,.35*e*e,M.Pixel)}return!0}var lt=[10131104,8025732,6183528,4670287,3420475],ut=64;function dt(e,t){let n=new j(e),r=new Float32Array(256);for(let e=0;e<r.length;e++)r[e]=n.next();return{x:0,y:0,h:100,base:4,top:30,lean:0,wobble:0,age:0,strength:0,down:0,last:t,born:t,dust:9073752,p:r}}function ft(e,t){let n=Math.max(0,Math.min(1,t/e.h)),r=e.base+(e.top-e.base)*n*n;return Math.max(1,r*Math.max(e.strength,1/3))}function pt(e,t,n=e.age){let r=Math.max(0,Math.min(1,t/e.h)),i=(n*25+Math.min(e.h,Math.max(0,t))*25)/10;return e.x+e.lean*r+Math.sin(i*Math.PI/180)*e.wobble*r}function mt(e,t,n,r){let i=e.age+Math.max(0,r-e.last),a=e.h,o=e.y-a,c=e.p,l=Math.min(1,(r-e.born)/18),u=l*Math.max(0,Math.min(1,1-(r-e.last-1)/10));if(u<=0)return;let d=e.top*3.2+40,f=14+e.top*.35,p=o-f*.4,m=i*.03;for(let n=0;n<ut;n++){let r=n*4,i=c[r]*Math.PI*2+m*(.6+.8*c[r+3]),a=.15+.85*c[r+1],o=e.x+e.lean+Math.cos(i)*d*a,s=p+Math.sin(i)*f*.45*a+(1-a)*f*.5-c[r+2]*f*.5,h=(10+14*c[r+2])*(1.2-.45*a)*(.5+.5*l),g=Math.min(lt.length-1,Math.max(0,Math.floor(2.4-Math.sin(i)*1.4-c[r+2]*1.6+(1-a)*1.2)));t.push(Math.round(o),Math.round(s),h,h*.75,lt[g],.95*u,M.Solid)}let h=a*e.down,g=s(e.dust,1.05),_=i*.32;for(let n=0;n<=a;n++){if(a-n>h)continue;let r=e.y-n,o=ft(e,n),c=pt(e,n,i),l=n/a,d=l<.22?g:7236216,f=Math.round(c-o),p=Math.round(c+o),m=p-f+1;t.push(f+m/2,r+.5,m,1,d,(.5+.2*(1-l))*u),t.push(f+.5,r+.5,1,1,s(d,.7),.75*u),t.push(p+.5,r+.5,1,1,s(d,.7),.75*u);for(let e=0;e<3;e++){let i=_+e*2.0944-n*.11,a=Math.round(c+Math.cos(i)*o),l=Math.sin(i)>0,f=1+Math.round(Math.abs(Math.sin(i))*Math.min(4,o*.35));l?t.push(a+.5,r+.5,f,1,s(d,1.3),.9*u):t.push(a+.5,r+.5,f,1,s(d,.6),.6*u)}}if(e.down>=1&&e.strength>.05)for(let t=0;t<6;t++){let r=_*1.3+t*1.047,i=ft(e,0)*2.2+3;n.push(Math.round(e.x+Math.cos(r)*i)+.5,e.y-1-Math.round(Math.abs(Math.sin(r))*3)+.5,2,1,s(e.dust,1.4),.35*e.strength*u)}}var ht=[.62,.8,1,1.18,1.32],gt=[16728128,4259696,5934335,16764992,16734950,4255999,16752688],_t=26,vt=400,yt=[16777215,15136511,12575994,9227247,6203612],F=[16776170,15918772,14206853,11046732],bt=[3814454,6972002,3419178],xt=[4865834,7233606,9404250,12365446],St=[13682872,11577496,9208948],Ct=8;function wt(e){let t=e>>>16&255,n=e>>>8&255,r=e&255,i=Math.max(t,n,r);return i<=152&&i-Math.min(t,n,r)<=36}var Tt=10;function Et(e,t,n){if(e<0||t<=0)return 0;if(e<=8)return t;let r=1-(e-8)/n;return r<=0?0:t*r*r*(3-2*r)}function Dt(e){return{peak:Math.min(1,.45+e/130),fade:Math.round(60+e*3)}}var Ot=[.45,1,.7,.95,0,.85,.4,0,.9,.3,.6,0,.5],I=[[16760944,.5,.32,.18],[16769200,.42,.36,.28],[16747056,.62,.24,.06],[11066623,.2,.36,.62],[13162751,.42,.46,.72],[13676672,.34,.27,.16],[12120128,.22,.5,.1]],kt=192,At=18,jt=.12,Mt={low:{cap:3e4,mult:.35},medium:{cap:1e5,mult:.7},high:{cap:3e5,mult:1}};function Nt(e){let t=(e>>16&255)*.5+127.5,n=(e>>8&255)*.5+75,r=(e&255)*.5+30;return Math.round(t)<<16|Math.round(n)<<8|Math.round(r)}var Pt=class{sink;fluid;probe;ripples=[];glows=[];fronts=[];bolts=[];jets=[];crystals=[];mushrooms=[];vortices=[];funnels=[];strands=[];splats=[];fireworks=[];posts=[];magnets=[];columns=[];shakeAmp=0;shakeStart=0;shakeDur=14;held=0;sky=[0,0,0];skyFlash=0;whiteStart=0;whitePeak=0;whiteFade=1;split=0;mult=1;wind=0;lances;ions;ricochetHeat=0;ricochetLast=-1e3;chunks;particles;smoke=[];constructor(e,t,n){this.sink=e,this.fluid=t,this.probe=n,this.particles={add:e=>this.addParticle(e)},this.lances=new Fe(e),this.ions=new ke(e),this.chunks=new we(kt,{solid:(e,t)=>n.material(e,t)!==0},(e,t,n)=>this.thud(e,t,n))}addParticle(e){if(e.kind!==N.Smoke||!wt(e.color)){this.sink.add(e);return}let t=this.smoke;for(let n=0;n<t.length;n++){let r=t[n];if(Math.abs(r.x/r.n-e.x)<=24&&Math.abs(r.y/r.n-e.y)<=24){r.n++,r.x+=e.x,r.y+=e.y,r.vx+=e.vx,r.vy+=e.vy,r.size+=e.size;return}}t.length<Ct&&t.push({n:1,x:e.x,y:e.y,vx:e.vx,vy:e.vy,size:e.size})}flushSmoke(){let e=this.smoke;for(let t=0;t<e.length;t++){let n=e[t],r=n.n,i=n.size/r,a=Math.max(4,i*1.2+Math.sqrt(r)*2),o=Math.min(1.6,.12*i*Math.sqrt(r));this.fluid.splat(n.x/r,n.y/r,a,n.vx/r*1.5,n.vy/r*1.5,o,0)}e.length=0}thud(e,t,n){if(this.mult<.5)return;let r=s(this.dustColor(e,t+1),1.15),i=n>2.5?2:1;for(let a=0;a<i;a++){let i=a===0?-1:1;this.particles.add({x:e+i,y:t-1,vx:i*.25,vy:-.12,life:18+Math.round(n*4),size:2+Math.min(2,n*.5),color:r,kind:N.Dust})}}rngFor(e,t){return new j((Math.imul(e.tick+1,2654435761)^Math.imul(e.x+7,40503)^Math.imul(e.y+3,9973))+t)}handle(e){switch(e.type){case`burst`:this.burst(e,e.params.count??24);break;case`flash`:{let t=I[e.params.dt??0]??I[0],n=e.params.strength??1;if(n<=0)break;this.glows.push({x:e.x,y:e.y,r:e.radius*2.2,start:e.tick,dur:14,color:t[0],strength:n}),this.tintSky(t,.008*e.radius*n),this.kick(l(e.radius,n),e.tick),this.smokeColumn(e,e.params.dt??0),e.radius>=60&&(this.glows.push({x:e.x,y:e.y,r:e.radius*1.2,start:e.tick,dur:26,color:16774880,strength:1.4}),this.split=Math.max(this.split,Math.min(4,e.radius/30)));break}case`nukeBlast`:this.nuke(e);break;case`mirvSplit`:this.mirvSplit(e);break;case`fireball`:this.fireball(e,e.params.strength??1);break;case`meteorCall`:this.meteorCall(e);break;case`fireworkLaunch`:this.fireworkLaunch(e);break;case`fireworkBurst`:this.fireworkBurst(e);break;case`fireworkStar`:this.fireworkStar(e);break;case`geyser`:this.geyser(e,e.params.strength??1);break;case`ricochet`:this.ricochet(e);break;case`ricochetBurst`:this.ricochetBurst(e,e.params.strength??1);break;case`dirtBurst`:this.dirtBurst(e);break;case`shake`:this.kick((e.params.strength??1)*3,e.tick);break;case`ripple`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:45,maxR:e.radius*2,width:16,strength:e.params.strength??1});break;case`shockwave`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??20),rng:this.rngFor(e,11)});break;case`muzzle`:{let t=this.rngFor(e,3),n=(e.params.angle??90)*Math.PI/180,r=Math.round(10*this.mult)+2;for(let i=0;i<r;i++){let r=t.range(.6,2.2),i=t.range(-.35,.35);this.particles.add({x:e.x,y:e.y,vx:Math.cos(n+i)*r,vy:-Math.sin(n+i)*r,life:t.range(6,14),size:t.range(.5,1),color:16756800,kind:N.Spark})}for(let r=0;r<3;r++)this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*.4+t.range(-.1,.1),vy:-Math.sin(n)*.4,life:t.range(25,40),size:t.range(2,3.5),color:9076880,kind:N.Smoke});this.glows.push({x:e.x,y:e.y,r:6,start:e.tick,dur:5,color:16765056,strength:1});break}case`land`:{let t=this.rngFor(e,5),n=Math.round(Math.min(20,4+(e.params.distance??0))*this.mult)+2;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+n*t.range(4,9),y:e.y-1,vx:n*t.range(.2,.9),vy:-t.range(0,.25),life:t.range(20,40),size:t.range(2,4),color:this.dustColor(e.x,e.y),kind:N.Dust})}break}case`gust`:{let t=this.rngFor(e,13),n=e.params.dir??1,r=Math.max(.2,(e.params.strength??500)/1e3),i=this.probe.width,a=this.probe.height,o=Math.round((10+26*r)*this.mult)+2;for(let e=0;e<o;e++){let e=t.range(0,i),o=this.surfaceNear(Math.floor(e),a*.5,a*.5),s=o>0?o-4:a*.7;this.particles.add({x:e,y:t.range(a*.04,Math.max(a*.06,s)),vx:n*t.range(1.6,3.2)*(.6+r),vy:0,life:t.range(30,60),size:Math.round(t.range(6,18)),color:15660287,kind:N.Streak})}let s=Math.round(8*r*this.mult);for(let e=0;e<s;e++){let e=Math.floor(t.range(0,i)),r=this.surfaceNear(e,a*.5,a*.5);r<0||this.particles.add({x:e,y:r-1,vx:n*t.range(.5,1.4),vy:-t.range(.05,.3),life:t.range(25,45),size:t.range(2,4),color:this.dustColor(e,r+1),kind:N.Dust})}break}case`creak`:case`collapse`:{let t=this.rngFor(e,9),n=e.type===`collapse`,r=Math.round((n?36:10)*this.mult)+2;for(let i=0;i<r;i++){let r=e.x+t.range(-e.radius,e.radius),i=e.y+t.range(-e.radius,e.radius)*.6;this.particles.add({x:r,y:i,vx:t.range(-.35,.35),vy:-t.range(.05,n?.5:.25),life:t.range(25,n?70:40),size:t.range(2,n?5:3),color:this.dustColor(Math.round(r),Math.round(i)),kind:N.Dust})}n&&this.kick(3,e.tick);break}case`bolt`:this.bolt(e);break;case`lanceCharge`:this.lances.charge(e,this.rngFor(e,43)),this.tintSky([0,.5,.06,.04],.12);break;case`lance`:this.lanceFire(e);break;case`pressureWave`:this.pressureWave(e,e.params.strength??1);break;case`ionCharge`:this.ions.charge(e,this.rngFor(e,151)),this.ionColumnWaves(e),this.tintSky([0,.15,.3,.7],.15);break;case`ionBlast`:this.ionBlast(e,e.params.strength??1);break;case`ionPulse`:this.ionPulse(e,e.params.strength??1);break;case`vortex`:this.vortices.push({x:e.x,y:e.y,r:Math.max(10,e.radius),start:e.tick,dur:Math.max(8,e.params.ticks??40),rng:this.rngFor(e,61)});break;case`swallow`:this.swallow(e);break;case`mineTrip`:this.mineTrip(e);break;case`eruption`:this.eruption(e,e.params.strength??1);break;case`volcanoGrow`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:50,maxR:e.radius*1.6,width:10,strength:.6}),this.fronts.push({x:e.x,y:e.y,maxR:e.radius*1.2,start:e.tick,dur:Math.max(10,e.params.ticks??40),rng:this.rngFor(e,131)}),this.kick(3,e.tick);break;case`volcanoErupt`:this.eruption(e,.9);break;case`arcs`:this.arcs(e,e.params.strength??1);break;case`frostBlast`:this.frostBlast(e);break;case`glueSplat`:this.glueSplat(e);break;case`glued`:this.glued(e);break;case`unglued`:this.unglued(e);break;case`frostFront`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??30),rng:this.rngFor(e,43),cold:!0});break;case`frosted`:{let t=this.rngFor(e,47),n=Math.round(24*this.mult)+4;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-9,9),y:e.y+t.range(-5,4),vx:t.range(-.3,.3),vy:-t.range(.1,.8),life:t.range(14,30),size:1,color:yt[Math.floor(t.next()*3)],kind:N.Spark});this.puff(e,14216954,10);break}case`iceGrow`:{let t=this.rngFor(e,71),n=Math.max(1,Math.round(3*this.mult));for(let r=0;r<n;r++)this.particles.add({x:Math.round(e.x+t.range(-e.radius,e.radius)),y:e.y-1,vx:t.range(-.6,.6),vy:-t.range(.3,1.2),life:t.range(10,22),size:1,color:yt[Math.floor(t.next()*4)],kind:N.Spark});t.next()<.35*this.mult&&this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y,vx:t.range(-.2,.2),vy:-t.range(.02,.1),life:t.range(40,80),size:t.range(3,6),color:t.next()<.5?15004412:12771058,kind:N.Dust});break}case`iceWall`:this.kick(1.5,e.tick);break;case`quake`:{let t=e.params.strength??1;this.kick(t*2.5,e.tick);let n=this.rngFor(e,13),r=Math.round(Math.min(40,e.radius/4+6)*this.mult)+2;for(let t=0;t<r;t++){let t=Math.round(e.x+n.range(-e.radius,e.radius)*.5),r=this.surfaceNear(t,e.y,40);r<0||this.particles.add({x:t,y:r-1,vx:n.range(-.3,.3),vy:-n.range(.1,.6),life:n.range(25,50),size:n.range(2,4),color:this.dustColor(t,r+1),kind:N.Dust})}break}case`tsunamiRise`:this.kick(5,e.tick);break;case`tsunami`:{let t=e.params.dir??1,n=this.rngFor(e,17);this.kick(Math.min(3,e.radius/12),e.tick);let r=Math.round(Math.min(14,3+e.radius/4)*this.mult)+1;for(let i=0;i<r;i++){let r=Math.round(e.x-t*n.range(0,6)),i=this.surfaceNear(r,e.y,30);i<0||this.particles.add({x:r,y:i-1,vx:t*n.range(.6,1.8),vy:-n.range(.2,.9),life:n.range(16,34),size:n.range(1,3),color:this.dustColor(r,i+1),kind:N.Dust})}break}case`tsunamiCrash`:{let t=e.params.dir??1,n=this.rngFor(e,19);this.kick(9,e.tick);let r=Math.round(Math.min(60,12+e.radius)*this.mult)+2;for(let i=0;i<r;i++){let r=Math.round(e.x+t*n.range(-e.radius,e.radius*1.5)),i=this.surfaceNear(r,e.y,60);i<0||this.particles.add({x:r,y:i-Math.round(n.range(1,6)),vx:t*n.range(.2,1.4),vy:-n.range(.1,.7),life:n.range(30,60),size:n.range(2,4),color:this.dustColor(r,i+1),kind:N.Dust})}break}case`rift`:this.rift(e);break;case`sinkhole`:this.sinkhole(e);break;case`sinkholeDust`:this.sinkholeDust(e);break;case`resonate`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*1.4,width:10,strength:.8}),this.glows.push({x:e.x,y:e.y,r:e.radius,start:e.tick,dur:18,color:11563263,strength:1}),this.tintSky([0,.36,.18,.6],.25);break;case`zone`:this.puff(e,It[e.params.look??0]??10139706,30);break;case`gasBurst`:this.gasBurst(e);break;case`reflect`:this.reflect(e);break;case`pocketBurst`:this.pocketBurst(e);break;case`zoneHurt`:this.puff(e,12120128,8);break;case`rusted`:case`rustHurt`:this.rustFlakes(e,e.type===`rusted`?14:8);break;case`rustWobble`:this.rustFlakes(e,4);break;case`burn`:{let t=this.rngFor(e,17),n=Math.round(14*this.mult)+3;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y+t.range(0,3),vx:t.range(-.2,.2),vy:-t.range(.4,1.1),life:t.range(10,24),size:1,color:t.next()<.4?16769136:16738842,kind:N.Spark});break}case`implode`:{let t=this.rngFor(e,19),n=Math.round(40*this.mult)+4,r=Math.max(8,e.params.ticks??20);for(let i=0;i<n;i++){let n=t.range(0,Math.PI*2),i=e.radius*t.range(.7,1.1);this.particles.add({x:e.x+Math.cos(n)*i,y:e.y+Math.sin(n)*i,vx:-Math.cos(n)*i/r,vy:-Math.sin(n)*i/r,life:r,size:1,color:t.next()<.5?13676799:8413376,kind:N.Spark})}this.tintSky([0,.2,.1,.4],.2);break}case`mudGeyser`:this.mudGeyser(e);break;case`mudSplat`:this.mudSplat(e,e.params.count??12);break;case`tornado`:this.tornado(e);break;case`magnet`:this.magnet(e);break;case`magnetOn`:this.kick(2,e.tick),this.tintSky([0,.05,.2,.3],.15);break;case`magnetClank`:{let t=this.rngFor(e,67),n=Math.round(18*this.mult)+3;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-3,3),y:e.y+t.range(-2,2),vx:t.range(-1.6,1.6),vy:-t.range(.3,1.8),life:t.range(8,20),size:1,color:t.next()<.5?16777215:8378608,kind:N.Spark});this.kick(3,e.tick);break}case`touchdown`:this.kick(3,e.tick),this.fronts.push({x:e.x,y:e.y,maxR:46,start:e.tick,dur:24,rng:this.rngFor(e,43)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:60,width:10,strength:.7});break;case`tornadoGrab`:case`tornadoThrow`:{let t=this.rngFor(e,47),n=Math.round(14*this.mult)+2,r=this.dustColor(e.x,e.y+2);for(let i=0;i<n;i++)this.particles.add({x:e.x+t.range(-8,8),y:e.y-t.range(0,6),vx:t.range(-1.2,1.2),vy:-t.range(.2,1.4),life:t.range(20,40),size:1,color:s(r,t.range(.7,1.2)),kind:N.Chunk});e.type===`tornadoGrab`&&this.kick(2,e.tick);break}case`bumper`:this.posts.push(he(e.x,e.y+1,e.tick,e.params.windup??10)),this.dirtPop(e,10);break;case`bumpKick`:this.bumpKick(e);break;case`bumpLaunch`:this.dirtPop(e,14),this.stars(e,12,1.6);break;case`bumpFly`:this.stars(e,2,.4);break;case`bumpBounce`:this.stars(e,14,1.4),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:18,width:5,strength:.5}),this.kick(2,e.tick);break;case`tornadoEnd`:{let t=this.rngFor(e,53),n=Math.round(40*this.mult)+4;for(let r=0;r<n;r++){let n=t.range(0,Math.PI*2),r=t.range(.3,1.4);this.particles.add({x:e.x+Math.cos(n)*e.radius*.5,y:e.y+Math.sin(n)*e.radius*1.2,vx:Math.cos(n)*r,vy:Math.sin(n)*r*.6,life:t.range(40,80),size:t.range(3,7),color:t.next()<.5?6183528:8025732,kind:N.Smoke})}this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*3,width:12,strength:.8});break}case`tankDeath`:this.burst(e,70),this.glows.push({x:e.x,y:e.y,r:40,start:e.tick,dur:20,color:16748608,strength:1.2}),this.tintSky(I[2],.5),this.kick(7,e.tick)}}nuke(e){let t=e.radius,n=e.params.strength??1,r=Dt(t*n),i=this.whiteout(e.tick);this.whiteStart=e.tick,this.whitePeak=Math.max(r.peak,i),this.whiteFade=Math.max(r.fade,i>0?this.whiteFade:1),this.mushrooms.push(tt(e.x,e.y,t,e.tick,this.rngFor(e,31).next()*4294967296)),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:70,maxR:t*7,width:26,strength:1.5*n}),this.ripples.push({x:e.x,y:e.y,start:e.tick+6,dur:60,maxR:t*4.5,width:12,strength:.9*n}),this.fronts.push({x:e.x,y:e.y,maxR:t*4,start:e.tick,dur:46,rng:this.rngFor(e,37)}),this.kick(4+t/12,e.tick);let a=this.rngFor(e,41),o=this.dustColor(e.x,e.y+t*.5),c=Math.round((120+t*2)*this.mult),l=3+t/20;for(let n=0;n<c;n++){let r=a.range(-.15,1.15)*Math.PI,i=a.range(.35,1)*l,c=n%2==0;this.particles.add({x:e.x+Math.cos(r)*t*.3,y:e.y-Math.sin(r)*t*.3,vx:Math.cos(r)*i,vy:-Math.sin(r)*i,life:a.range(50,100),size:c?1:a.range(1.5,2.5),color:c?a.next()<.4?16773280:16742938:s(o,a.range(.7,1.2)),kind:c?N.Spark:N.Chunk})}}mirvSplit(e){let t=this.rngFor(e,43);this.glows.push({x:e.x,y:e.y,r:12,start:e.tick,dur:8,color:14217471,strength:1.4}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:22,maxR:46,width:8,strength:.9});let n=Math.round(48*this.mult)+8;for(let r=0;r<n;r++){let i=r/n*Math.PI*2+t.range(-.06,.06),a=t.range(1.6,3.2);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*a,vy:Math.sin(i)*a,life:t.range(12,22),size:1,color:r%3==0?16777215:t.next()<.5?10148095:16769136,kind:N.Spark})}for(let n=0;n<6;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y+t.range(-2,2),vx:t.range(-.15,.15),vy:-t.range(0,.1),life:t.range(50,80),size:t.range(3,5),color:t.next()<.5?9076880:6971504,kind:N.Smoke});this.tintSky(I[4],.15),this.kick(2,e.tick)}fireworkLaunch(e){let t=this.rngFor(e,61);this.glows.push({x:e.x,y:e.y,r:5,start:e.tick,dur:6,color:16773312,strength:1});let n=Math.round(20*this.mult)+6;for(let r=0;r<n;r++){let i=r/n*Math.PI*2+t.range(-.1,.1),a=t.range(.8,1.6);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*a,vy:Math.sin(i)*a,life:t.range(10,18),size:1,color:r%3==0?16777215:16765024,kind:N.Spark})}for(let n=0;n<4;n++)this.particles.add({x:e.x+t.range(-2,2),y:e.y+t.range(-2,2),vx:t.range(-.1,.1),vy:-t.range(0,.08),life:t.range(40,70),size:t.range(2,4),color:9077904,kind:N.Smoke})}fireworkBurst(e){let t=this.rngFor(e,67),n=gt[Math.floor(t.next()*gt.length)],r=gt[Math.floor(t.next()*gt.length)];r===n&&(r=16777215),this.fireworks.push({x:e.x,y:e.y,start:e.tick,main:n,inner:r,rng:t}),this.glows.push({x:e.x,y:e.y,r:6,start:e.tick,dur:5,color:n,strength:1.2});let i=Math.round(56*this.mult)+12,a=t.range(0,Math.PI*2);for(let r=0;r<i;r++){let o=a+r/i*Math.PI*2,s=1.2*Math.sqrt(1-t.next()*t.next());this.particles.add({x:e.x,y:e.y,vx:Math.cos(o)*s,vy:Math.sin(o)*s,life:t.range(48,70),size:1,color:n,kind:N.Glitter})}let o=Math.round(20*this.mult)+6;for(let n=0;n<o;n++){let i=a+n/o*Math.PI*2+.1,s=t.range(.42,.55);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*s,vy:Math.sin(i)*s,life:t.range(34,46),size:1,color:r,kind:N.Glitter})}let s=n>>16&255,c=n>>8&255,l=n&255;this.tintSky([n,s/255,c/255,l/255],.03)}fireworkStar(e){let t=this.rngFor(e,71),n=this.fireworkColor(e.x,e.tick,!1),r=n<0?16764992:n,i=Math.round(8*this.mult)+3;for(let n=0;n<i;n++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-1,vx:t.range(-.7,.7),vy:-t.range(.4,1.2),life:t.range(10,20),size:1,color:n%3==0?16777215:r,kind:N.Spark});this.glows.push({x:e.x,y:e.y-1,r:3,start:e.tick,dur:4,color:r,strength:.8})}fireworkColor(e,t,n){let r=-1,i=1/0;for(let a=0;a<this.fireworks.length;a++){let o=this.fireworks[a];if(o.start>t)continue;let s=(t-o.start)*(n?4:.3)+Math.abs(o.x-e);s<i&&(i=s,r=a)}return r<0?-1:this.fireworks[r].main}fireworkInner(e){for(let t=this.fireworks.length-1;t>=0;t--){let n=this.fireworks[t];if(n.main===e)return n.inner}return 16777215}fireworkTick(e){this.fireworks=this.fireworks.filter(t=>e-t.start<=vt);for(let t of this.fireworks){let n=e-t.start;if(n<_t||n>34)continue;let r=Math.max(1,Math.round(3*this.mult)),i=17+(n-_t);for(let e=0;e<r;e++){let e=t.rng.range(0,Math.PI*2),r=i*Math.sqrt(t.rng.next());this.particles.add({x:t.x+Math.cos(e)*r,y:t.y+Math.sin(e)*r+(n-_t)*.4,vx:0,vy:.05,life:t.rng.range(4,9),size:1,color:16777215,kind:N.Spark})}}}geyser(e,t){let n=this.rngFor(e,47),r=Math.max(6,e.radius),i=this.dustColor(e.x,e.y+r*.4),a=(2.2+r/10)*t,o=Math.round((30+r*1.5)*t*this.mult)+4;for(let t=0;t<o;t++){let t=n.range(-1,1);this.particles.add({x:e.x+t*r*.35,y:e.y-n.range(0,r*.3),vx:t*n.range(.1,.7),vy:-n.range(.45,1)*a,life:n.range(45,80),size:n.next()<.3?2:1,color:s(i,n.range(.65,1.15)),kind:N.Chunk})}let c=Math.round((6+r/3)*t*Math.max(.5,this.mult));for(let a=0;a<c;a++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(0,r*1.2),vx:n.range(-.2,.2),vy:-n.range(.2,.9)*t,life:n.range(40,75),size:n.range(r*.2,r*.4),color:s(i,n.range(.9,1.2)),kind:N.Dust})}fireball(e,t){let n=this.rngFor(e,53),r=Math.max(6,e.radius)*t*1.5,i=Math.round((14+r*1.5)*Math.max(.5,this.mult));for(let a=0;a<i;a++){let i=n.next();this.particles.add({x:e.x+n.range(-r,r)*.6,y:e.y-n.range(0,r*.8),vx:n.range(-.35,.35),vy:-n.range(.4,1.2)*(.8+t*.2),life:n.range(30,56)*(i<.5?1:.8),size:n.range(r*.35,r*.7),color:0,kind:N.Flame})}let a=Math.round((10+r)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.4,y:e.y-n.range(r*.4,r*1.4),vx:n.range(-.2,.2),vy:-n.range(.3,.8),life:n.range(100,160),size:n.range(r*.5,r*.9),color:n.next()<.5?2367010:3813428,kind:N.Smoke});let o=Math.round((20+r*1.5)*this.mult);for(let r=0;r<o;r++){let r=n.range(.15,.85)*Math.PI,i=n.range(.8,2.6)*(.7+t*.3);this.particles.add({x:e.x,y:e.y-2,vx:Math.cos(r)*i,vy:-Math.sin(r)*i,life:n.range(20,45),size:1,color:n.next()<.4?16769136:16738836,kind:N.Spark})}this.tintSky(I[2],.25*t)}pressureWave(e,t){let n=Math.max(20,e.radius);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:60,maxR:n*3.2*t,width:22,strength:1.4*t}),this.ripples.push({x:e.x,y:e.y,start:e.tick+5,dur:50,maxR:n*2,width:10,strength:.8*t}),this.fronts.push({x:e.x,y:e.y,maxR:n*1.3,start:e.tick,dur:30,rng:this.rngFor(e,67)}),this.kick(3+n/25*t,e.tick),this.tintSky([0,.55,.6,.75],.25*t);let r=this.rngFor(e,71),i=this.dustColor(e.x,e.y+4),a=Math.round((60+n)*t*this.mult);for(let t=0;t<a;t++){let a=t%2==0?-1:1,o=r.range(.05,.45)*Math.PI,c=r.range(1.5,4.5)*(.6+n/150);this.particles.add({x:e.x+a*r.range(2,n*.2),y:e.y-r.range(0,4),vx:a*Math.cos(o)*c,vy:-Math.sin(o)*c,life:r.range(40,80),size:r.next()<.3?2:1,color:s(i,r.range(.7,1.2)),kind:N.Chunk})}}eruption(e,t){let n=this.rngFor(e,73),r=Math.max(10,e.radius),i=Math.round((40+r)*t*this.mult);for(let a=0;a<i;a++){let i=n.range(.3,.7)*Math.PI,o=n.range(2,5.5)*t,s=a%3==0;this.particles.add({x:e.x+n.range(-r,r)*.25,y:e.y-2,vx:Math.cos(i)*o,vy:-Math.sin(i)*o,life:n.range(40,75),size:s?2:1,color:s?n.next()<.5?16734751:14172172:n.next()<.4?16769136:16747040,kind:s?N.Chunk:N.Spark})}let a=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(0,r*.4),vx:n.range(-.3,.3),vy:-n.range(.6,1.6),life:n.range(24,44),size:n.range(3,7),color:0,kind:N.Flame});let o=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<o;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(r*.3,r*1.6),vx:n.range(-.2,.2),vy:-n.range(.3,.9),life:n.range(110,170),size:n.range(r*.3,r*.6),color:n.next()<.5?2761252:4208186,kind:N.Smoke});this.tintSky(I[2],.35*t),this.kick(4*t,e.tick)}drawVortices(e,t,n){for(let r of this.vortices){let i=(n-r.start)/r.dur;if(i<0||i>1)continue;if(r.snap){let n=Math.min(1,i*6),a=2*Math.max(1,Math.round(r.r*.55*n*(1-i)*(1-i)))+1;t.push(r.x+.5,r.y+.5,a+6,a+6,6299856,.5*(1-i),M.Pixel),e.push(r.x+.5,r.y+.5,a+2,a+2,13148415,1,M.Pixel),e.push(r.x+.5,r.y+.5,a,a,328458,1,M.Pixel);continue}let a=3+Math.round(i*i*r.r*.18);t.push(r.x,r.y,a*2+6,a*2+6,8405247,.35+.3*i,M.Pixel),e.push(r.x,r.y,a*2+2,a*2+2,13676799,.9,M.Pixel),e.push(r.x,r.y,a*2,a*2,459788,1,M.Pixel)}}mineTrip(e){let t=this.rngFor(e,71);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:18,maxR:e.radius*2,width:6,strength:.5}),this.glows.push({x:e.x,y:e.y,r:Math.max(6,e.radius*.5),start:e.tick,dur:10,color:10510591,strength:.9});let n=Math.round(16*this.mult)+6;for(let r=0;r<n;r++){let i=r/n*Math.PI*2,a=t.range(1.2,2.2);this.particles.add({x:e.x,y:e.y-1,vx:Math.cos(i)*a,vy:Math.sin(i)*a*.7,life:t.range(8,14),size:1,color:t.next()<.4?16777215:11563263,kind:N.Spark})}this.tintSky([0,.36,.08,.6],.35)}swallow(e){let t=this.rngFor(e,73),n=Math.max(8,e.radius),r=Math.max(8,e.params.ticks??22);this.vortices.push({x:e.x,y:e.y,r:n,start:e.tick,dur:r,rng:t,snap:!0});let i=Math.round(70*this.mult)+20;for(let r=0;r<i;r++){let r=t.range(0,Math.PI*2),i=n*t.range(.6,1.5),a=t.range(6,14),o=Math.round(e.x+Math.cos(r)*i),s=Math.round(e.y+Math.sin(r)*i*.8),c=this.probe.material(o,s);this.particles.add({x:o,y:s,vx:(e.x-o)/a,vy:(e.y-s)/a,life:a,size:1,color:c!==0&&t.next()<.6?this.probe.color(c):t.next()<.5?14205183:7356640,kind:N.Spark})}this.ripples.push({x:e.x,y:e.y,start:e.tick+Math.round(r*.7),dur:26,maxR:n*2.6,width:9,strength:1.1}),this.tintSky([0,.3,.05,.55],.5),this.split=Math.max(this.split,1)}meteorCall(e){let t=this.rngFor(e,59);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:40,width:8,strength:.6});let n=Math.round(40*this.mult)+10;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-2,vx:t.range(-.25,.25),vy:-t.range(2.5,6),life:t.range(25,50),size:t.next()<.3?2:1,color:t.next()<.3?16769136:16726560,kind:N.Spark});for(let n=0;n<8;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y-t.range(2,14),vx:t.range(-.1,.1),vy:-t.range(.1,.4),life:t.range(60,100),size:t.range(3,6),color:9054756,kind:N.Smoke});this.tintSky(I[2],.45)}frostBlast(e){let t=e.radius,n=e.params.strength??1,r=I[3];this.glows.push({x:e.x,y:e.y,r:t*.8,start:e.tick,dur:16,color:r[0],strength:1.1*n}),this.glows.push({x:e.x,y:e.y,r:t*.35,start:e.tick,dur:20,color:16055295,strength:1.3*n}),this.tintSky(r,.7*n),this.split=Math.max(this.split,1.5*n),this.ripples.push({x:e.x,y:e.y,start:e.tick+4,dur:40,maxR:t*1.6,width:10,strength:.8*n}),this.kick(3+t/25,e.tick);let i=this.rngFor(e,53),a=[];for(let n=0;n<11;n++){let r=(-.12+1.24*(n+i.range(.15,.85))/11)*Math.PI,o=t*i.range(.45,.95),s=e.x,c=e.y;for(let t=1;t<=4;t++){let n=o*t/4,l=o/14*(t<4),u=Math.round(e.x+Math.cos(r)*n+i.range(-l,l)),d=Math.round(e.y-Math.sin(r)*n+i.range(-l,l));Lt(s,c,u,d,a),s=u,c=d}}this.crystals.push({cells:Int32Array.from(a),x:e.x,y:e.y,len:t,start:e.tick,dur:28});let o=Math.round((90+t)*this.mult),s=1.6+t/28;for(let t=0;t<o;t++){let n=i.range(.04,.96)*Math.PI,r=i.range(.3,1)*s,a=t%3==0;this.particles.add({x:e.x+i.range(-3,3),y:e.y+i.range(-3,2),vx:Math.cos(n)*r*1.15,vy:-Math.sin(n)*r,life:i.range(30,70),size:a?1:i.range(1,2.4),color:yt[Math.floor(i.next()*(a?2:yt.length))],kind:a?N.Spark:N.Chunk})}let c=Math.round((10+t/4)*Math.max(.5,this.mult));for(let n=0;n<c;n++)this.particles.add({x:e.x+i.range(-t,t)*.35,y:e.y+i.range(-t,t)*.15,vx:i.range(-.6,.6),vy:-i.range(.02,.3),life:i.range(70,130),size:i.range(t*.15,t*.3),color:n%2==0?14479359:11852018,kind:N.Smoke});let l=Math.round((60+t*1.2)*this.mult);for(let n=0;n<l;n++)this.particles.add({x:e.x+i.range(-1.3,1.3)*t,y:e.y-i.range(.2,1.8)*t,vx:i.range(-.1,.1),vy:i.range(0,.15),life:i.range(140,260),size:1,color:i.next()<.7?16777215:14085370,kind:N.Snow})}sinkhole(e){let t=this.rngFor(e,53),n=Math.max(8,e.radius),r=Math.max(8,e.params.depth??40);this.kick(8,e.tick),this.ripples.push({x:e.x,y:e.y+r*.5,start:e.tick,dur:26,maxR:n*1.8,width:10,strength:.9});for(let r=-1;r<=1;r+=2){let i=Math.round(e.x+r*n),a=this.surfaceNear(i,e.y,60);if(a<0)continue;let o=this.dustColor(i,a+2),c=Math.round(22*this.mult)+3;for(let e=0;e<c;e++)this.particles.add({x:i+t.range(-3,3),y:a-t.range(0,3),vx:r*t.range(-.1,.5),vy:-t.range(.6,2.2),life:t.range(24,50),size:t.range(2,5),color:s(o,t.range(.85,1.2)),kind:N.Dust})}let i=Math.round(36*this.mult)+4;for(let r=0;r<i;r++){let r=t.next()<.5?-1:1,i=Math.round(e.x+r*n*t.range(.7,1.05)),a=this.surfaceNear(i,e.y,60);a<0||this.particles.add({x:i,y:a-1,vx:-r*t.range(.1,.9),vy:t.range(-.8,.2),life:t.range(30,60),size:t.range(1,2),color:s(this.dustColor(i,a+2),t.range(.7,1.05)),kind:N.Chunk})}}sinkholeDust(e){let t=this.rngFor(e,59),n=Math.max(8,e.radius),r=(e.params.plume??0)>0,i=Math.round((r?70:10)*this.mult)+2;for(let a=0;a<i;a++){let i=Math.round(e.x+t.range(-n,n)*(r?.8:1)),a=this.surfaceNear(i,e.y,r?120:30);a<0||this.particles.add({x:i,y:a-t.range(1,r?10:2),vx:t.range(-.3,.3),vy:-t.range(.1,r?1.3:.5),life:t.range(r?40:18,r?90:36),size:t.range(r?3:1,r?6:3),color:s(this.dustColor(i,a+1),t.range(.85,1.15)),kind:N.Dust})}}rift(e){let t=this.rngFor(e,43),n=Math.max(8,e.radius),r=Math.max(1,e.params.width??3),i=(e.params.hot??0)>0;this.kick(i?9:6,e.tick),this.ripples.push({x:e.x,y:e.y+n*.4,start:e.tick,dur:30,maxR:n*1.6,width:10,strength:i?1.1:.8}),this.fronts.push({x:e.x,y:e.y,maxR:n*.9,start:e.tick,dur:18,rng:this.rngFor(e,47)}),this.tintSky(I[5],i?.3:.18);let a=this.dustColor(e.x,e.y+4),o=Math.round((26+n/2)*this.mult)+4;for(let i=0;i<o;i++)this.particles.add({x:e.x+t.range(-r,r),y:e.y-t.range(0,4),vx:t.range(-.25,.25),vy:-t.range(.6,2.6)*(.6+n/120),life:t.range(30,70),size:t.range(2.5,6),color:s(a,t.range(.85,1.25)),kind:N.Dust});let c=Math.round((30+n/2)*this.mult)+4;for(let n=0;n<c;n++){let n=t.next()<.5?-1:1;this.particles.add({x:e.x+t.range(-r,r)*.5,y:e.y-1,vx:n*t.range(.1,1.4),vy:-t.range(1.2,3.8),life:t.range(40,80),size:t.range(1,2),color:s(a,t.range(.7,1.1)),kind:N.Chunk})}if(!i)return;let l=Math.round(40*this.mult)+6;for(let n=0;n<l;n++)this.particles.add({x:e.x+t.range(-r,r)*.5,y:e.y+t.range(0,3),vx:t.range(-.8,.8),vy:-t.range(1.5,4.2),life:t.range(24,60),size:1,color:t.next()<.35?16769136:t.next()<.6?16742938:15220762,kind:N.Spark});this.glows.push({x:e.x,y:e.y,r:6+r,start:e.tick,dur:12,color:16742948,strength:1})}mudGeyser(e){let t=e.params.height??120,n=Math.max(20,e.params.ticks??90);this.jets.push({x:e.x,y:e.y,height:t,start:e.tick,dur:n,rng:this.rngFor(e,101)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:40,maxR:t*.9,width:14,strength:.9}),this.fronts.push({x:e.x,y:e.y,maxR:t*.55,start:e.tick,dur:30,rng:this.rngFor(e,103)}),this.kick(5,e.tick),this.tintSky([0,.34,.27,.16],.45);let r=this.rngFor(e,107),i=Math.sqrt(.24*t),a=Math.round(140*this.mult)+6;for(let t=0;t<a;t++){let t=r.range(.45,1.08)*i;this.particles.add({x:e.x+r.range(-5,5),y:e.y-r.range(0,3),vx:r.range(-.7,.7),vy:-t,life:2*t/.12+r.range(0,4),size:r.next()<.5?2:1,color:xt[Math.floor(r.next()*4)],kind:N.Chunk})}}feedJets(e){this.jets=this.jets.filter(t=>{let n=e-t.start;if(n>t.dur)return!1;if(n<0)return!0;let r=n/t.dur,i=r<.45?1:Math.max(.15,1-(r-.45)/.55),a=r>.6&&t.rng.next()<.35?.3:1,o=Math.sqrt(.24*t.height)*Math.sqrt(i)*a,s=t.rng,c=Math.round(32*i*this.mult)+1;for(let e=0;e<c;e++){let n=e%4==0,r=o*s.range(n?.5:.82,1.02);this.particles.add({x:t.x+s.range(-4.5,4.5),y:t.y-s.range(0,2),vx:n?s.range(-.7,.7):s.range(-.24,.24),vy:-r,life:2*r/.12+s.range(0,4),size:n?1:s.next()<.6?2:3,color:xt[s.next()<.12?3:Math.floor(s.next()*3)],kind:N.Chunk})}let l=t.height*i*a,u=Math.round(1.5*i*this.mult)+ +(n%3==0);for(let e=0;e<u;e++){let e=.55+.45*s.next();this.particles.add({x:t.x+s.range(-4,4)*(.5+e),y:t.y-e*l,vx:s.range(-.3,.3),vy:-s.range(.2,.9),life:s.range(50,100),size:s.range(3,6),color:St[Math.floor(s.next()*3)],kind:N.Smoke})}if(n%3==0)for(let e of[-1,1])this.particles.add({x:t.x+e*s.range(2,5),y:t.y-1,vx:e*s.range(.4,1.4),vy:-s.range(.6,1.6),life:40,size:1,color:xt[1+Math.floor(s.next()*2)],kind:N.Chunk});return!0})}mudSplat(e,t){let n=this.rngFor(e,109),r=Math.round(t*this.mult)+3;for(let t=0;t<r;t++){let r=t%2==0?-1:1;this.particles.add({x:e.x+r*n.range(0,2),y:e.y-1,vx:r*n.range(.3,1.3),vy:-n.range(.5,1.8),life:n.range(25,45),size:1,color:xt[Math.floor(n.next()*4)],kind:N.Chunk})}for(let t=0;t<2;t++)this.particles.add({x:e.x+n.range(-2,2),y:e.y-2,vx:n.range(-.2,.2),vy:-n.range(.2,.5),life:n.range(30,50),size:n.range(2,4),color:St[1],kind:N.Smoke})}glueSplat(e){let t=this.rngFor(e,131),n=e.params.strength??1,r=this.surfaceNear(Math.round(e.x),Math.round(e.y),24);this.splats.push({x:e.x,y:r>=0?r:e.y,r:10*n,start:e.tick,dur:90});let i=Math.round(9*this.mult*n)+5;for(let r=0;r<i;r++){let a=Math.PI*(.08+.84*((r+t.next())/i)),o=t.range(1.1,2.6)*Math.sqrt(n);this.strands.push({ax:e.x+t.range(-3,3),ay:e.y-t.range(1,5),hx:e.x,hy:e.y-2,vx:Math.cos(a)*o,vy:-Math.sin(a)*o,start:e.tick,life:Math.round(t.range(24,60)),stuck:!1})}let a=Math.round(46*this.mult*n)+6;for(let n=0;n<a;n++){let r=n%2==0?-1:1;this.particles.add({x:e.x+r*t.range(0,4),y:e.y-t.range(1,4),vx:r*t.range(.2,1.8),vy:-t.range(.6,2.6),life:t.range(30,60),size:t.next()<.3?2:1,color:F[Math.floor(t.next()*4)],kind:N.Chunk})}this.kick(2,e.tick)}glued(e){let t=this.rngFor(e,137),n=Math.max(4,e.radius);for(let r=0;r<4;r++){let i=r<2?-1:1;this.strands.push({ax:e.x+i*t.range(2,n),ay:e.y-t.range(3,7),hx:e.x+i*n,hy:e.y-4,vx:i*t.range(.3,.9),vy:t.range(0,.4),start:e.tick,life:Math.round(t.range(40,70)),stuck:!1})}let r=Math.round(18*this.mult)+4;for(let i=0;i<r;i++)this.particles.add({x:e.x+t.range(-n,n),y:e.y-t.range(2,9),vx:t.range(-.6,.6),vy:-t.range(.2,1.2),life:t.range(16,30),size:1,color:F[Math.floor(t.next()*3)],kind:N.Chunk})}unglued(e){let t=this.rngFor(e,139),n=Math.max(4,e.radius);for(let r=0;r<6;r++){let r=e.x+t.range(-n-2,n+2);this.strands.push({ax:r,ay:e.y,hx:r,hy:e.y-3,vx:t.range(-.2,.2),vy:-t.range(.4,.9),start:e.tick,life:Math.round(t.range(8,16)),stuck:!0})}}tickStrands(e){if(this.strands.length===0)return;let t=[];for(let n of this.strands){let r=e-n.start;if(r>n.life){let e=(n.ax+n.hx)/2,t=(n.ay+n.hy)/2;for(let r=0;r<2;r++)this.particles.add({x:r===0?e:n.hx,y:r===0?t:n.hy,vx:(r===0?-.2:.2)+n.vx*.1,vy:.2,life:26,size:1,color:F[2],kind:N.Chunk})}else{if(n.stuck)n.vy<0&&(n.hx+=n.vx,n.hy+=n.vy);else if(r>=0){n.vy+=.1;let e=n.hx+n.vx,t=n.hy+n.vy,r=this.probe,i=Math.floor(e),a=Math.floor(t);i<0||i>=r.width||a>=r.height||a>=0&&r.material(i,a)!==0?(n.stuck=!0,n.vy=0):(n.hx=e,n.hy=t)}t.push(n)}}this.strands=t,this.splats=this.splats.filter(t=>e-t.start<=t.dur)}tornado(e){let t=e.params,n;for(let t of this.funnels)if(e.tick-t.last<=3&&Math.abs(t.x-e.x)<=12){n=t;break}n||(n=dt(this.rngFor(e,59).next()*4294967296,e.tick),this.funnels.push(n)),n.x=e.x,n.y=e.y,n.h=e.radius,n.base=t.base??4,n.top=t.top??30,n.lean=t.lean??0,n.wobble=t.wobble??0,n.age=t.age??0,n.strength=(t.strength??0)/100,n.down=(t.down??100)/100,n.last=e.tick,e.tick&7||(n.dust=this.dustColor(e.x,e.y+2))}magnet(e){let t=e.params,n;for(let t of this.magnets)if(e.tick-t.last<=3&&t.x===e.x&&t.y===e.y){n=t;break}n||(n={x:e.x,y:e.y,r:e.radius,age:0,arm:0,life:0,strength:0,last:e.tick},this.magnets.push(n)),n.r=e.radius,n.age=t.age??0,n.arm=t.arm??0,n.life=t.life??0,n.strength=(t.strength??0)/100,n.last=e.tick}drawMagnets(e,t,n){for(let r of this.magnets)Ye(r,e,t,n)}funnelDust(e,t){if(e.down<1||e.strength<=.05||t-e.last>2)return;let n=Math.max(1,Math.round(4*this.mult*e.strength)),r=new j((Math.imul(t+1,2654435761)^Math.imul(e.x+11,40503))>>>0),i=ft(e,0)+3;for(let t=0;t<n;t++){let t=r.next()<.5?-1:1;this.particles.add({x:e.x+t*r.range(0,i),y:e.y-r.range(0,3),vx:t*r.range(.4,1.6),vy:-r.range(.1,.9),life:r.range(24,50),size:r.range(2.5,5.5),color:s(e.dust,r.range(.95,1.2)),kind:N.Dust})}if(r.next()<.7*this.mult){let t=r.range(0,e.h*.8),n=r.next()<.5?-1:1;this.particles.add({x:e.x+n*(ft(e,t)+1),y:e.y-t,vx:n*r.range(.8,2.2),vy:-r.range(0,1),life:r.range(30,60),size:1,color:s(e.dust,r.range(.6,1.1)),kind:N.Chunk})}}bumpKick(e){this.ripples.push({x:e.x,y:e.y-8,start:e.tick,dur:22,maxR:e.radius*1.6,width:10,strength:.9}),this.kick(4,e.tick),this.stars({...e,y:e.y-12},30,2.2),this.tintSky([0,.45,.35,.1],.18)}stars(e,t,n){let r=this.rngFor(e,71),i=Math.round(t*this.mult)+1;for(let t=0;t<i;t++){let t=r.range(0,Math.PI*2),i=r.range(.3,1)*n,a=r.next();this.particles.add({x:e.x+r.range(-1.5,1.5),y:e.y+r.range(-1.5,1.5),vx:Math.cos(t)*i,vy:Math.sin(t)*i-.3,life:r.range(10,26),size:1,color:a<.4?16769136:a<.7?16777215:a<.85?16734860:7004415,kind:N.Spark})}}dirtPop(e,t){let n=this.rngFor(e,73),r=Math.round(t*this.mult)+1,i=this.dustColor(e.x,e.y+2);for(let t=0;t<r;t++)this.particles.add({x:e.x+n.range(-6,6),y:e.y-n.range(0,3),vx:n.range(-1.1,1.1),vy:-n.range(.5,1.8),life:n.range(18,34),size:1,color:s(i,n.range(.7,1.2)),kind:N.Chunk})}drawPosts(e,t){this.posts.length!==0&&(this.posts=this.posts.filter(n=>_e(n,e,t)))}drawFunnels(e,t,n){for(let r of this.funnels)mt(r,e,t,n)}lanceFire(e){this.lances.fire(e,this.rngFor(e,47));let t=e.params.surface??e.y;this.tintSky([0,.7,.5,.3],.9),this.ripples.push({x:e.x+.5,y:t,start:e.tick,dur:40,maxR:150,width:18,strength:1.1}),this.kick(5,e.tick)}drawMushrooms(e,t,n){this.mushrooms.length!==0&&(this.mushrooms=this.mushrooms.filter(r=>at(r,e,t,n,!1)))}whiteout(e){return Et(e-this.whiteStart,this.whitePeak,this.whiteFade)}tintSky(e,t){let n=Math.min(.5,t),r=this.sky;r[0]=Math.min(.5,r[0]+e[1]*n),r[1]=Math.min(.5,r[1]+e[2]*n),r[2]=Math.min(.5,r[2]+e[3]*n),this.skyFlash=Math.max(r[0],r[1],r[2])}puff(e,t,n){let r=this.rngFor(e,23),i=Math.round(n*this.mult)+2;for(let n=0;n<i;n++)this.particles.add({x:e.x+r.range(-e.radius,e.radius)*.7,y:e.y+r.range(-e.radius,e.radius)*.5,vx:r.range(-.25,.25),vy:-r.range(0,.25),life:r.range(30,60),size:r.range(3,6),color:s(t,r.range(.8,1.1)),kind:N.Dust})}rustFlakes(e,t){let n=this.rngFor(e,71),r=Math.round(t*this.mult)+2;for(let t=0;t<r;t++)this.particles.add({x:e.x+n.range(-e.radius,e.radius),y:e.y+n.range(-3,2),vx:n.range(-.35,.35),vy:-n.range(.1,.7),life:n.range(20,40),size:1,color:R[Math.floor(n.next()*4)],kind:N.Chunk})}bolt(e){let t=e.params.w??1;this.skyBolt(e.x,e.y,e.tick,this.rngFor(e,29),t,Math.round(20*Math.min(2,t)),e.params.top??0,e.params.storm===1),this.glows.push({x:e.x,y:e.y,r:Math.round(26*t),start:e.tick,dur:14,color:13162751,strength:1.4}),this.tintSky([0,.75,.8,1],.5)}skyBolt(e,t,n,r,i,a,o=0,s=!1){let c={x:Math.round(e),y:Math.max(1,Math.round(t))},l=[],u=(e,t,n,i)=>{let a=e,o=t;for(;o<n;){let e=Math.min(n-o,Math.round(r.range(3,9))),t=a+Math.round(r.range(-3,3)+i);Lt(a,o,t,o+e,l),a=t,o+=e}return a},d=Math.max(0,Math.min(c.y-1,Math.round(o)));if(u(c.x+Math.round(r.range(s?-8:-18,s?8:18)),d,c.y,0),l.length===0)return;let f=c.x-l[l.length-2];for(let e=0;e<l.length;e+=2){let t=(l[e+1]-d)/Math.max(1,c.y-d);l[e]=l[e]+Math.round(f*t)}let p=l.length,m=4+Math.floor(r.next()*3);for(let e=0;e<m;e++){let e=2*Math.floor(r.range(.1,.85)*(p/2)),t=l[e],n=l[e+1],i=u(t,n,n+Math.round(r.range(14,46)),r.next()<.5?-1.6:1.6);r.next()<.5&&u(i,l[l.length-1],l[l.length-1]+10,r.range(-2,2))}this.bolts.push({cells:Int32Array.from(l),main:p,start:n,dur:a,w:i,seed:r.next()*4294967296})}ionBlast(e,t){let n=e.radius,r=this.craterFloor(Math.round(e.x),e.y,n);this.ions.fire(e,this.rngFor(e,157),r);let i=Dt(n*.6*t),a=this.whiteout(e.tick);this.whiteStart=e.tick,this.whitePeak=Math.max(i.peak,a),this.whiteFade=Math.max(i.fade,a>0?this.whiteFade:1),this.tintSky([0,.5,.7,1],.5),this.split=Math.max(this.split,4),this.kick(6+n/14,e.tick);for(let r=0;r<4;r++)this.ripples.push({x:e.x,y:e.y,start:e.tick+r*9,dur:80-r*8,maxR:n*(4.2-r*.7),width:28-r*4,strength:(1.6-r*.25)*t});this.fronts.push({x:e.x,y:e.y,maxR:n*2.2,start:e.tick,dur:50,rng:this.rngFor(e,163)});let o=this.rngFor(e,167),s=Math.round(30*t);for(let t=0;t<s;t++){let r=Math.round(110*(t/s)**1.6+o.range(0,4)),i=Math.round(e.x+o.range(-1.25,1.25)*n),a=this.surfaceNear(i,e.y,n*1.4),c=t<6?2.2:o.range(1.2,1.8);this.skyBolt(i,a<0?e.y:a,e.tick+r,o,c,Math.round(o.range(14,24))),t%3==0&&this.glows.push({x:i,y:a<0?e.y:a,r:18,start:e.tick+r,dur:10,color:11063551,strength:1.2})}for(let t=0;t<4;t++)this.arcs({...e,tick:e.tick+t*18,radius:n*.5,x:e.x+o.range(-.6,.6)*n},1.6);let c=Math.round((140+n)*this.mult),l=3+n/25;for(let t=0;t<c;t++){let i=o.range(-.1,1.1)*Math.PI,a=o.range(.3,1)*l;this.particles.add({x:e.x+Math.cos(i)*n*.2,y:r-Math.sin(i)*n*.2,vx:Math.cos(i)*a,vy:-Math.sin(i)*a,life:o.range(40,90),size:t%5==0?2:1,color:t%3==0?16777215:t%3==1?9490687:4877567,kind:N.Spark})}}ionColumnWaves(e){let t=e.params.ticks??70;for(let n=0;n<5;n++){let r=(n+1)/5;this.ripples.push({x:e.x+.5,y:e.y,start:e.tick+Math.round((t-14)*(n/5)),dur:26,maxR:18+34*r,width:8+6*r,strength:.7+.7*r,column:!0})}}ionPulse(e,t){let n=e.radius;this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:60,maxR:n*2.4,width:22,strength:1.2*t}),this.fronts.push({x:e.x,y:e.y,maxR:n*1.1,start:e.tick,dur:36,rng:this.rngFor(e,173)}),this.kick(4+n/60,e.tick),this.tintSky([0,.4,.6,1],.3),this.arcs({...e,radius:n*.35},1.4);let r=this.rngFor(e,179);for(let t=0;t<3;t++){let i=Math.round(e.x+r.range(-.5,.5)*n),a=this.surfaceNear(i,e.y,n);this.skyBolt(i,a<0?e.y:a,e.tick+t*4,r,1.6,18)}}arcs(e,t){let n=this.rngFor(e,59),r=Math.max(12,e.radius)*2.5*t,i=4+Math.round(2*t);for(let t=0;t<i;t++){let i=t%2==0?-1:1,a=r*n.range(.5,1),o=[],s=Math.round(e.x),c=this.surfaceNear(s,e.y,30);c<0&&(c=Math.round(e.y));for(let e=0;e<a;){let t=Math.round(n.range(2,5)),r=s+i*t,a=this.surfaceNear(r,c,12),l=(a<0?c:a)-Math.round(n.range(0,3));Lt(s,c,r,l,o),s=r,c=l+Math.round(n.range(0,2)),e+=t,n.next()<.25&&this.particles.add({x:s,y:c-1,vx:i*n.range(.2,1),vy:-n.range(.5,1.6),life:n.range(10,22),size:1,color:n.next()<.5?16777215:10148095,kind:N.Spark})}if(o.length===0)continue;let l=Math.round(n.range(0,6));this.bolts.push({cells:Int32Array.from(o),main:o.length,start:e.tick+l,dur:Math.round(n.range(10,18)),seed:n.next()*4294967296})}}heatAt(e){return e-this.ricochetLast>Ft?0:this.ricochetHeat}reflect(e){let t=this.rngFor(e,71);this.glows.push({x:e.x,y:e.y,r:5,start:e.tick,dur:5,color:15128319,strength:1.1});let n=(e.params.vx??0)/256,r=(e.params.vy??0)/256,i=Math.max(.01,Math.hypot(n,r)),a=Math.round(12*this.mult)+3;for(let o=0;o<a;o++){let a=t.range(.6,2.2);this.particles.add({x:e.x+.5,y:e.y+.5,vx:n/i*a+t.range(-.6,.6),vy:r/i*a+t.range(-.6,.6),life:t.range(6,16),size:1,color:t.next()<.5?16777215:12821236,kind:N.Spark})}}pocketBurst(e){let t=this.rngFor(e,73),n=Math.max(4,e.radius),r=Math.round((24+n*2)*this.mult)+6;for(let i=0;i<r;i++)this.particles.add({x:e.x+Math.round(t.range(-n,n)),y:e.y+Math.round(t.range(-n/2,n/2)),vx:t.range(-.5,.5),vy:-t.range(.6,2.2),life:t.range(14,34),size:t.next()<.3?3:2,color:16747040,kind:N.Flame});let i=Math.round(10*this.mult)+2;for(let r=0;r<i;r++)this.particles.add({x:e.x+t.range(-n,n),y:e.y-t.range(0,n),vx:t.range(-.2,.2),vy:-t.range(.2,.6),life:t.range(40,80),size:t.range(4,8),color:2761248,kind:N.Smoke})}ricochet(e){let t=this.heatAt(e.tick)+1;this.ricochetHeat=t,this.ricochetLast=e.tick;let n=this.rngFor(e,61),r=Math.min(t,L.length-1),i=L[r],a=L[Math.min(r+1,L.length-1)];this.glows.push({x:e.x,y:e.y,r:8+t*2.5,start:e.tick,dur:7,color:i,strength:1.2}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:12+t*4,width:5,strength:.5+t*.1});let o=Math.round((20+t*12)*this.mult)+4;for(let r=0;r<o;r++){let o=Math.PI+n.range(.1,Math.PI-.1),s=n.range(.8,2+t*.35);this.particles.add({x:e.x,y:e.y-1,vx:Math.cos(o)*s,vy:Math.sin(o)*s,life:n.range(10,18+t*3),size:1,color:r%4==0?16777215:n.next()<.5?i:a,kind:N.Spark})}t>=3&&this.arcs({...e,radius:4+t},.35),this.kick(.6+t*.25,e.tick)}ricochetBurst(e,t){let n=Math.max(1,this.heatAt(e.tick));this.ricochetHeat=0,this.ricochetLast=-1e3;let r=this.rngFor(e,67),i=Math.max(8,e.radius);this.glows.push({x:e.x,y:e.y,r:i*1.7,start:e.tick,dur:22,color:8405247,strength:1.1*t}),this.glows.push({x:e.x,y:e.y,r:i*1.15,start:e.tick,dur:16,color:16736464,strength:1.3*t}),this.glows.push({x:e.x,y:e.y,r:i*.6,start:e.tick,dur:12,color:16777215,strength:1.6*t}),this.glows.push({x:e.x,y:e.y,r:i*.9,start:e.tick+3,dur:14,color:7397631,strength:.9*t});let a=Math.round((90+n*12)*t*this.mult)+10;for(let t=0;t<a;t++){let n=t/a*Math.PI*2+r.range(-.08,.08),o=r.range(1.2,2.2+i/10),s=r.next();this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*o,vy:Math.sin(n)*o-.6,life:r.range(14,30),size:1,color:s<.3?16777215:s<.55?16740560:s<.8?11567359:7397631,kind:N.Spark})}let o=Math.round(24*t*this.mult)+4;for(let t=0;t<o;t++)this.particles.add({x:e.x+r.range(-i*.6,i*.6),y:e.y+r.range(-i*.6,i*.3),vx:r.range(-.25,.25),vy:-r.range(.6,1.4),life:r.range(40,70),size:1,color:r.next()<.5?16752880:10547455,kind:N.Spark});this.arcs({...e,radius:i*.7},.8*t),this.tintSky([0,.55,.3,.9],.35*t),this.split=Math.max(this.split,1.5*t)}dustColor(e,t){let n=this.probe;for(let r=0;r<12;r+=2)for(let[i,a]of[[0,r],[r,0],[-r,0],[0,-r],[r,r],[-r,r]]){let r=n.material(Math.round(e+i),Math.round(t+a));if(r!==0)return n.color(r)}return 8018490}dirtBurst(e){let t=this.rngFor(e,13),n=this.dustColor(e.x,e.y+4),r=(e.params.low??20)*Math.PI/180,i=(e.params.high??70)*Math.PI/180,a=e.params.speed??4,o=e.params.lift??0,c=Math.round(160*this.mult)+8;for(let l=0;l<c;l++){let c=t.next()<.5?-1:1,l=t.range(r,i),u=t.range(.45,1)*a;this.particles.add({x:e.x+c*t.range(0,6),y:e.y-o+t.range(-3,3),vx:c*Math.cos(l)*u,vy:-Math.sin(l)*u,life:t.range(30,70),size:t.next()<.25?3:2,color:s(n,ht[Math.floor(t.next()*ht.length)]),kind:N.Chunk})}let l=Math.round(48*this.mult)+4;for(let r=0;r<l;r++){let i=r%2==0?-1:1;this.particles.add({x:e.x+i*t.range(2,10),y:e.y-t.range(0,4),vx:i*t.range(1,3.2),vy:-t.range(0,.3),life:t.range(40,80),size:t.range(3,6),color:s(n,t.next()<.5?.85:1.05),kind:N.Dust})}let u=Math.round(14*Math.max(.5,this.mult));for(let r=0;r<u;r++)this.particles.add({x:e.x+t.range(-12,12),y:e.y-t.range(0,14),vx:t.range(-.3,.3),vy:-t.range(.1,.5),life:t.range(70,120),size:t.range(5,9),color:s(n,.7),kind:N.Smoke});this.kick(5,e.tick)}burst(e,t){let n=this.rngFor(e,1),r=Math.max(4,e.radius);this.fluid.splat(e.x,e.y,r*1.5,.3+r*.05,0,1+r/30,.5+r/60,0,!0);let i=Math.round(t*1.4*this.mult),a=.8+r/14;for(let t=0;t<i;t++){let t=n.range(Math.PI*.05,Math.PI*.95),r=n.range(.3,1)*a;this.particles.add({x:e.x+n.range(-2,2),y:e.y+n.range(-2,2),vx:Math.cos(t)*r*1.2,vy:-Math.sin(t)*r,life:n.range(14,36),size:n.range(.5,1.1),color:n.next()<.3?16773280:16742938,kind:N.Spark})}let o=this.dustColor(e.x,e.y+r*.5),c=Math.round(t*this.mult);for(let t=0;t<c;t++){let t=n.range(Math.PI*.1,Math.PI*.9),i=n.range(.4,1)*a*1.1;this.particles.add({x:e.x+Math.cos(t)*r*.6,y:e.y-Math.sin(t)*r*.4,vx:Math.cos(t)*i,vy:-Math.sin(t)*i,life:n.range(30,60),size:1,color:s(o,n.range(.75,1.15)),kind:N.Chunk})}t>0&&e.radius>=At&&this.throwChunks(e,n);let l=Math.round((24+r*1.2)*Math.max(.5,this.mult)),u=.9+r/10;for(let t=0;t<l;t++){let r=(t+n.next()*.6)/l*Math.PI*2,i=u*n.range(.85,1.1);this.particles.add({x:e.x,y:e.y,vx:Math.cos(r)*i,vy:Math.sin(r)*i,life:n.range(8,16),size:1,color:n.next()<.5?16777215:16765056,kind:N.Spark})}let d=Math.round((10+r)*Math.max(.5,this.mult));for(let t=0;t<d;t++){let t=n.next()*Math.PI*2,i=Math.sqrt(n.next())*r*.7;this.particles.add({x:e.x+Math.cos(t)*i,y:e.y+Math.sin(t)*i,vx:Math.cos(t)*.3,vy:Math.sin(t)*.3,life:n.range(5,11),size:1,color:n.next()<.6?16777215:16773280,kind:N.Glitter})}this.groundDust(e,n,r);let f=Math.round((3+r/5)*Math.max(.5,this.mult));for(let t=0;t<f;t++)this.particles.add({x:e.x+n.range(-r,r)*.5,y:e.y+n.range(-r,r)*.3,vx:n.range(-.25,.25),vy:-n.range(.05,.4),life:n.range(50,90),size:n.range(r*.25,r*.5),color:n.next()<.5?4866120:6970978,kind:N.Smoke})}smokeColumn(e,t){if(e.radius<18||t>2)return;let n=Math.round(420+e.radius*10);for(let r of this.columns)if(!(Math.abs(r.x-e.x)>Math.max(r.r,e.radius)||e.tick-r.start>r.dur*.5)){r.r=Math.min(120,Math.max(r.r,e.radius)+4),r.dur=Math.max(r.dur,e.tick-r.start+n),t===2&&(r.color=bt[2]);return}this.columns.length>=Tt&&this.columns.shift();let r=this.craterFloor(Math.round(e.x),e.y,e.radius),i=t===2?bt[2]:t===1?s(this.dustColor(e.x,e.y+4),.45):bt[1];this.columns.push({x:e.x,y:r,r:e.radius,start:e.tick,dur:n,color:i,rng:this.rngFor(e,53)})}groundDust(e,t,n){let r=this.probe,i=Math.round(n*2.2),a=Math.round(i*.5*Math.max(.5,this.mult));for(let o=-1;o<=1;o+=2)for(let c=0;c<a;c++){let a=n*.8+t.next()*(i-n*.8),c=Math.round(e.x+o*a);if(c<0||c>=r.width)continue;let l=-1,u=Math.max(0,Math.round(e.y-n)),d=Math.min(r.height-1,Math.round(e.y+n*1.5));for(let e=u;e<=d;e++)if(r.material(c,e)!==0){l=e;break}if(l<0)continue;let f=a/i;this.particles.add({x:c,y:l-.5,vx:o*(.5+t.next()*.8)*(1-f*.5),vy:-t.range(.1,.5)*(1-f*.6),life:t.range(14,30)*(1.2-f*.5),size:1,color:s(this.dustColor(c,l),t.range(.9,1.3)),kind:N.Chunk})}}craterFloor(e,t,n){let r=this.probe;if(e<0||e>=r.width)return t;let i=Math.min(r.height-1,Math.round(t+n*1.3)+4);for(let n=Math.max(0,Math.round(t));n<=i;n++)if(r.material(e,n)!==0)return n-1;return t}tickColumns(e){for(let t=this.columns.length-1;t>=0;t--){let n=this.columns[t],r=(e-n.start)/n.dur;if(r>=1){this.columns.splice(t,1);continue}if(r<0)continue;let i=n.r/24,a=(1-r)*(1-r),o=n.r*(.18+.12*(1-r)),s=n.x+n.rng.range(-o,o),c=.5*(1+(1-r)*.8)*Math.min(1.8,.75+i*.25);this.fluid.splat(s,n.y-2,Math.max(4,o*.6+i*2),0,-c,(.3+i*.25)*a,.25*a*a)}}throwChunks(e,t){let n=e.radius,r=Math.round(Math.min(64,6+(n-At)*.7)*Math.max(.6,this.mult)),i=+(n>=50),a=1.3+Math.min(2.4,n/32);for(let o=0;o<r;o++){let r=t.range(Math.PI*.12,Math.PI*.88),o=Math.cos(r),c=Math.sin(r),l=this.dustColor(e.x+o*(n+1),e.y+c*(n*.6+1)),u=t.range(.55,1)*a,d=2+Math.floor(t.next()*(2+i)),f=Math.max(1,d-Math.floor(t.next()*2));this.particles.add({x:e.x+o*n*.55,y:e.y-c*n*.35,vx:o*u*1.15+t.range(-.2,.2),vy:-c*u-t.range(.4,1),size:Math.max(d,f),life:t.range(150,260)+60,color:s(l,ht[Math.floor(t.next()*ht.length)]*.8),kind:N.Chunk})}}drawChunks(e){this.chunks.draw(e)}tick(e){this.chunks.step(jt,this.probe.height),this.groundLife(e);for(let t of this.mushrooms){e>=t.start&&e<=t.start+t.life&&st(t,e,this.particles,this.mult);let n=e-t.start-t.fuse;if(n>=0&&n<90){let e=1-n/90;this.fluid.splat(t.x,t.y-t.r*.3,t.r*.9,0,-2.5*e,1.2*e,1.5*e)}}this.feedJets(e),this.tickColumns(e),this.tickStrands(e),this.fireworkTick(e),this.fronts=this.fronts.filter(t=>{let n=(e-t.start)/t.dur;if(n>1)return!1;let r=t.maxR*n;if(t.cold)return this.frostFrontTick(t,r),!0;for(let e of[-1,1]){let n=Math.round(t.x+e*r),i=this.surfaceNear(n,t.y,t.maxR);if(i<0)continue;let a=Math.max(1,Math.round(3*this.mult)),o=this.dustColor(n,i+1);for(let r=0;r<a;r++)this.particles.add({x:n+t.rng.range(-1.5,1.5),y:i-t.rng.range(0,2),vx:e*t.rng.range(.3,1.2),vy:-t.rng.range(.1,.7),life:t.rng.range(24,48),size:t.rng.range(2.5,5),color:s(o,1.15),kind:N.Dust});t.rng.next()<.6*this.mult&&this.particles.add({x:n,y:i-1,vx:e*t.rng.range(.4,1.4),vy:-t.rng.range(.8,2),life:40,size:1,color:o,kind:N.Chunk})}return!0}),this.vortices=this.vortices.filter(t=>{let n=(e-t.start)/t.dur;if(n>1)return!1;if(n<0)return!0;let r=Math.max(1,Math.round((3+n*6)*this.mult));for(let e=0;e<r;e++){let e=t.rng.range(0,Math.PI*2),n=t.r*t.rng.range(.5,1.1),r=t.rng.range(14,24),i=n/r;this.particles.add({x:t.x+Math.cos(e)*n,y:t.y+Math.sin(e)*n*.8,vx:-Math.cos(e)*i*.9-Math.sin(e)*i*.8,vy:(-Math.sin(e)*i*.9+Math.cos(e)*i*.8)*.8,life:r,size:1,color:t.rng.next()<.35?16777215:t.rng.next()<.5?11563263:6308032,kind:N.Spark})}return e===t.start&&this.tintSky([0,.2,.08,.45],.3),!0});for(let t of this.funnels)this.funnelDust(t,e);this.funnels=this.funnels.filter(t=>e-t.last<=12),this.magnets=this.magnets.filter(t=>e-t.last<=2),this.ripples=this.ripples.filter(t=>e-t.start<=t.dur),this.glows=this.glows.filter(t=>e-t.start<=t.dur);for(let t of this.bolts)this.boltBits(t,e);if(this.bolts=this.bolts.filter(t=>e-t.start<=t.dur),this.ions.active){let t=this.ions.tick(e,this.mult);t>0&&(this.shakeLeft(e)<t*.6&&this.kick(t,e),this.tintSky([0,.3,.5,.9],.08))}if(this.lances.active){let t=this.lances.tick(e,this.mult);t>0&&(this.shakeLeft(e)<t*.6&&this.kick(t,e),this.tintSky([0,.7,.45,.2],.06))}this.crystals=this.crystals.filter(t=>e-t.start<=t.dur);let t=this.sky;t[0]*=.86,t[1]*=.86,t[2]*=.86,this.skyFlash=Math.max(t[0],t[1],t[2]),this.skyFlash<.002&&(this.skyFlash=0,t[0]=t[1]=t[2]=0),this.split=this.split>.3?this.split*.9:0;for(let n of this.funnels){if(e-n.last>2)continue;let r=.16*Math.min(1,(e-n.born)/30);t[0]=Math.min(t[0],-r),t[1]=Math.min(t[1],-r*.95),t[2]=Math.min(t[2],-r*.8)}this.flushSmoke()}frostFrontTick(e,t){for(let n of[-1,1])for(let r=0;r<2;r++){let i=Math.round(e.x+n*(t-r*2)),a=this.surfaceNear(i,e.y,e.maxR);if(a<0)continue;let o=Math.max(1,Math.round(3*this.mult));for(let t=0;t<o;t++)this.particles.add({x:i+e.rng.range(-1.5,1.5),y:a-e.rng.range(0,1.5),vx:n*e.rng.range(.05,.6),vy:-e.rng.range(.4,1.6),life:e.rng.range(10,26),size:1,color:yt[Math.floor(e.rng.next()*3)],kind:N.Spark});e.rng.next()<.5*this.mult&&this.particles.add({x:i,y:a-1,vx:n*e.rng.range(.1,.5),vy:-e.rng.range(.03,.12),life:e.rng.range(60,110),size:e.rng.range(4,8),color:e.rng.next()<.5?15004412:12771058,kind:N.Dust})}let n=Math.round(e.x-t),r=Math.round(e.x+t);for(let i of[n,r]){let n=this.surfaceNear(i,e.y,e.maxR);n>=0&&this.glows.push({x:i,y:n,r:3,start:Math.floor(e.start+t/e.maxR*e.dur),dur:6,color:12575994,strength:.9})}}surfaceNear(e,t,n){let r=this.probe;if(e<0||e>=r.width)return-1;let i=Math.max(1,Math.round(t-n)),a=Math.min(r.height-1,Math.round(t+n));for(let t=i;t<=a;t++)if(r.material(e,t)!==0&&r.material(e,t-1)===0)return t;return-1}cookOff(e,t,n,r,i){let a={type:`cookOff`,tick:i,x:e,y:t,radius:n,params:{}};this.burst(a,r?26:12),this.glows.push({x:e,y:t,r:n*2.2,start:i,dur:r?16:10,color:16752704,strength:r?1.1:.8}),r&&(this.ripples.push({x:e,y:t,start:i,dur:18,maxR:26,width:6,strength:.5}),this.tintSky(I[2],.15)),this.kick(r?4:2,i)}shakeLeft(e){let t=e+this.held-this.shakeStart;return this.shakeAmp<=0||t>this.shakeDur||t<0?0:this.shakeAmp*(1-t/this.shakeDur)**2}kick(e,t){e<=0||e<this.shakeLeft(t)||(this.shakeAmp=e,this.shakeStart=t+this.held,this.shakeDur=u(e))}shake(e){let t=this.shakeLeft(e);if(t<=0)return[0,0];let n=e+this.held-this.shakeStart;return[Math.sin(n*2.1)*t,Math.sin(n*2.9+1.6)*t*.6]}gasBurst(e){let t=this.rngFor(e,23),n=Math.round((e.params.count??18)*this.mult)+4;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+t.range(-2,2),y:e.y-t.range(0,3),vx:n*t.range(.4,1.6),vy:-t.range(.05,.5),life:t.range(40,80),size:t.range(4,8),color:t.next()<.5?8369438:11066416,kind:N.Dust})}for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-1,vx:t.range(-.7,.7),vy:-t.range(1.2,2.8),life:t.range(20,40),size:1,color:t.next()<.3?15794064:11066416,kind:N.Chunk});this.fluid.splat(e.x,e.y-2,8,0,-.6,0,0,.5),this.tintSky([0,.12,.3,.02],.35)}collectLights(e,t){for(let n of this.glows){let r=n.dur*4+16,i=(t-n.start)/r;if(i<0||i>1)continue;let a=Math.floor(i*6)/6,o=(i<.1?1.4:1.1*(1-a))*Math.min(1.4,n.strength);e.add(n.x,n.y,Math.max(12,n.r*2.2),o,Nt(n.color))}}drawGlows(e,t){for(let n of this.glows){let r=Math.max(0,(t-n.start)/n.dur);if(r>1)continue;let i=(1-r)*(1-r)*n.strength,a=n.r*(.55+.45*r);e.push(n.x,n.y,a*2,a*2,n.color,.75*i,M.Pixel),e.push(n.x,n.y,a*.8,a*.8,16774880,.9*i,M.Pixel)}}groundLife(e){let t=this.probe,n=t.width,r=t.height,i=this.wind,a=Math.min(1,Math.abs(i)*150),o=i<0?-1:1,c=n/160*(.6+a*1.6)*Math.max(.3,this.mult),l=Math.floor(c),u=new j(Math.imul(e+1,2246822519)^1540483477);u.next()<c-l&&l++;for(let e=0;e<l;e++){let e=Math.floor(u.next()*n),c=this.surfaceNear(e,r*.5,r*.5);if(c<0)continue;let l=t.material(e,c);if(t.grass?.(e,c)&&l!==52&&l!==19){if(u.next()>.25+a*.6)continue;let t=u.next()<.6;this.particles.add({x:e+.5,y:c-1,vx:o*u.range(.1,.5)*(.4+a)+u.range(-.1,.1),vy:-u.range(.08,.3),life:Math.round(u.range(40,110)),size:1,color:t?15788176:14209184,kind:N.Ash})}else if(l===1||l===2||l===6||l===43||l===23){if(u.next()>a*.8-.1)continue;this.particles.add({x:e+.5,y:c-1,vx:o*u.range(.4,1.4)*a,vy:-u.range(.1,.45),life:Math.round(u.range(16,40)),size:1,color:s(t.color(l),u.range(1,1.35)),kind:N.Chunk})}else if(l===52||l===41){if(u.next()>.15+a*.8)continue;this.particles.add({x:e+.5,y:c-1,vx:o*u.range(.6,1.8)*(.3+a),vy:-u.range(.05,.3),life:Math.round(u.range(20,50)),size:1,color:16777215,kind:N.Flake})}else if(l===5||l===63||l===73){if(u.next()>.5)continue;this.particles.add({x:e+.5,y:c-1,vx:u.range(-.3,.3)+i*40,vy:-u.range(.3,1.1),life:Math.round(u.range(16,44)),size:1,color:u.next()<.5?16756800:16736288,kind:N.Ember})}else if(l===19){if(u.next()>.3)continue;this.particles.add({x:e+.5,y:c-1,vx:i*30,vy:-u.range(.04,.12),life:Math.round(u.range(20,40)),size:1,color:12110040,kind:N.Ash})}}}boltBits(e,t){let n=t-e.start;if(e.w===void 0||n!==1&&n!==e.dur)return;let r=e.cells,i=e.main;if(i<4)return;let a=new j(e.seed+n),o=e.w??1,s=r[i-2],c=r[i-1],l=r[1],u=Math.max(1,c-l);if(n===1){let e=Math.max(2,Math.round(6/o));for(let t=0;t<i;t+=2*e){if((r[t+1]-l)/u<.45||a.next()>.7)continue;let e=a.next()<.5?-1:1;this.particles.add({x:r[t]+.5,y:r[t+1]+.5,vx:e*a.range(.6,2.2),vy:a.range(-1.2,.6),life:Math.round(a.range(8,18)),size:1,color:a.next()<.5?16777215:13162751,kind:N.Spark})}let t=Math.max(.3,this.mult),n=Math.round(14*o*t);for(let e=0;e<n;e++){let e=a.range(-2.4,-.7),t=a.range(1,3.5)*o;this.particles.add({x:s+a.range(-2,2),y:c-1,vx:Math.cos(e)*t,vy:Math.sin(e)*t,life:Math.round(a.range(18,40)),size:1,color:a.next()<.4?16769184:9071176,kind:a.next()<.55?N.Ember:N.Chunk})}let d=Math.round(3*o);for(let e=0;e<d;e++){let t=e%2==0?-1:1;this.particles.add({x:s+t*a.range(1,5),y:c-2,vx:t*a.range(.3,1),vy:a.range(-.6,-.1),life:Math.round(a.range(20,36)),size:4+Math.round(a.range(0,3)*o),color:10128040,kind:N.Dust})}}else for(let e=0;e<i;e+=4)a.next()>.6||this.particles.add({x:r[e]+.5,y:r[e+1]+.5,vx:a.range(-.4,.4),vy:a.range(-.3,.3),life:Math.round(a.range(10,26)),size:1,color:a.next()<.3?13689087:7377120,kind:N.Glitter})}drawBolts(e,t){for(let n of this.bolts){let r=t-n.start;if(r<0||r>n.dur)continue;let i;if(r<Ot.length)i=Ot[r];else{let e=Math.max(0,1-(r-Ot.length+1)/Math.max(1,n.dur-Ot.length+1));i=(Math.imul(r+1,374761393)^(n.seed|0))>>>0&3?Math.round(e*.6*4)/4:0}if(i<=0)continue;let a=n.cells,o=n.w??1,s=Math.max(1,Math.round(o)*2-1),c=r===0?n.main*.7:1/0;for(let t=0;t<a.length;t+=2){let l=t>=n.main;if(t>=c)break;if(l&&r>1&&((Math.imul((t>>4)+1,2246822519)^Math.imul(r+1,3266489917)^(n.seed|0))>>>0>>>8&255)/255>(r<Ot.length?.75:.35))continue;let u=a[t]+.5,d=a[t+1]+.5;l?(e.push(u,d,Math.round(3*o),o>1.5?2:1,4219072,.4*i),e.push(u,d,Math.round(o),1,11585791,.75*i)):(e.push(u,d,Math.round(7*o),o>1.5?2:1,3166400,.45*i),e.push(u,d,Math.round(3*o),1,13689087,.9*i),e.push(u,d,s,1,16777215,i))}}}drawCrystals(e,t){for(let n of this.crystals){let r=t-n.start;if(r<0||r>n.dur)continue;let i=n.cells,a=i.length,o=n.len*Math.min(1,(r+1)/5),s=r<12?1:1-(r-12)/(n.dur-12),c=n.len*Math.max(0,s);for(let t=0;t<a;t+=2){let r=i[t]-n.x,a=i[t+1]-n.y,l=Math.sqrt(r*r+a*a);if(l>o||l>c+2)continue;let u=(i[t]*73856093^i[t+1]*19349663)>>>0;if(s<1&&(u>>>8&255)/255>s+.3)continue;let d=i[t]+.5,f=i[t+1]+.5;e.push(d,f,3,3,6203612,.45*s),e.push(d,f,1,1,u&7?14086399:16777215,s)}}}drawGoo(e,t){for(let n of this.splats){let r=t-n.start;if(r<0||r>n.dur)continue;let i=r/n.dur,a=Math.min(1,(r+1)/4),o=r<24?r>>2&1?.86:1.18:1,s=Math.max(1,Math.round(n.r*.75*a*o*(1-.8*i))),c=n.r*a*(1+.6*i)*(o>1?.92:1.08);for(let t=0;t<s;t++){let r=t/s,a=Math.round(c*Math.sqrt(1-r*r));if(a<=0)continue;let o=Math.floor(n.y)-1-t;if(i>.75&&((Math.imul(o+3,2654435761)^Math.imul(n.start+1,40503))>>>24)/255<(i-.75)*4*(.4+r))continue;let l=r>.7?F[0]:r>.35?F[1]:t===0?F[3]:F[2];e.rect(Math.floor(n.x)-a,o,a*2+1,1,l)}s>3&&e.rect(Math.floor(n.x)-(s>>1),Math.floor(n.y)-s,1,1,16777215)}for(let n of this.strands){let r=t-n.start;if(r<0)continue;let i=n.hx-n.ax,a=n.hy-n.ay,o=Math.ceil(Math.max(Math.abs(i),Math.abs(a))),s=Math.min(6,r*.25)*Math.min(1,o/12),c=r>n.life*.7;for(let t=0;t<=o;t++){let r=o===0?0:t/o;if(c&&r>.4&&r<.6&&!(t&1))continue;let l=Math.floor(n.ax+i*r),u=Math.floor(n.ay+a*r+s*4*r*(1-r));e.rect(l,u,1,1,t%6==2?F[1]:F[2])}e.rect(Math.floor(n.hx)-1,Math.floor(n.hy)-1,2,2,F[1]),e.rect(Math.floor(n.hx)-1,Math.floor(n.hy)-1,1,1,F[0])}}drawRippleRings(e,t){for(let n of this.ripples){let r=(t-n.start)/n.dur;if(r<0||r>1||n.column)continue;let i=n.maxR*Math.sqrt(r);e.push(n.x,n.y,i*2.35,i*2.35,11587839,.35*(1-r)*n.strength,M.Ring)}}clear(){this.ripples=[],this.glows=[],this.fronts=[],this.bolts=[],this.jets=[],this.crystals=[],this.mushrooms=[],this.lances.clear(),this.ions.clear(),this.chunks.clear(),this.vortices=[],this.funnels=[],this.strands=[],this.splats=[],this.posts=[],this.magnets=[],this.columns.length=0,this.shakeAmp=0,this.shakeDur=14,this.skyFlash=0,this.sky[0]=this.sky[1]=this.sky[2]=0,this.split=0}},Ft=240,L=[5302527,7385343,10125567,13660415,16738504,16756976,16777215],It=[10139706,12120128,11563263,9225253,3813164,3949136],R=[5909012,9325086,12084266,14191172];function Lt(e,t,n,r,i){let a=Math.abs(n-e),o=-Math.abs(r-t),s=e<n?1:-1,c=t<r?1:-1,l=a+o,u=e,d=t;for(;u!==n||d!==r;){let e=2*l;e>=o&&(l+=o,u+=s),e<=a&&(l+=a,d+=c),i.push(u,d)}}function z(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var B=(e,t)=>(e%t+t)%t;function Rt(e,t,n,r,i,a,o){let s=n.ambient;if(s.kind===`none`||s.kind===`stars`||s.density<=0||s.kind===`rain`||s.kind===`snow`)return;let c=a.width,l=a.height,u=Math.round(s.density*c*o/1e3),d=Math.max(-1.5,Math.min(1.5,i*120));for(let n=0;n<u;n++){let i=z(n,1),o=z(n,2),u=z(n,3);if(s.kind===`embers`){let e=.3+u*.5,f=l+10,p=l-Math.floor(B(r*e+o*f,f)),m=Math.round(Math.sin(r*.05+i*30)*3+(l-p)*d*.4),h=Math.floor(B(i*c+m,c));if(p<0||p>=l||a.solid(h,p))continue;let g=z(n,Math.floor(r/6))>.5;t.push(h+.5,p+.5,1,1,g?16765040:s.color,Math.min(1,p/(l*.4)))}else{let t=Math.floor(B(i*c+r*(.08+u*.1)*(d>=0?1:-1),c)),n=Math.floor(o*l*.85+Math.sin(r*.02+i*50)*4);if(n<0||a.solid(t,n))continue;e.push(t+.5,n+.5,1,1,s.color,.3+u*.3)}}}function zt(e,t,n,r,i,a){let o=t.ambient;if(o.kind!==`rain`&&o.kind!==`snow`||o.density<=0)return;let s=i.width,c=i.height,l=o.kind===`rain`,u=l?4.8:.65,d=o.density*s*a/1e3*(l?14:15)/(c/u),f=Math.floor(d);z(n,977)<d-f&&f++;let p=Math.max(-1.5,Math.min(1.5,r*120)),m=Math.abs(p)*c*.4+10;for(let t=0;t<f;t++){let r=z(n*131+t,1),i=z(n*131+t,2),a=z(n*131+t,3),u=-m*+(p>0)+r*(s+m);l?e.add({x:u,y:-2-i*6,vx:p*.9,vy:4+a*2,life:c/4+60,size:1,color:o.color,kind:N.Rain}):e.add({x:u,y:-2-i*6,vx:p*.3+(a-.5)*.3,vy:.45+a*.4,life:c/.55+120+i*200,size:a>.7?2:1,color:o.color,kind:N.Flake})}}function Bt(e,t,n,r,i,a){for(let o=0;o<n.length;o++){let s=n[o];if(s.puffs&&s.puffs.length>0){rn(e,s,r,i,a);continue}let c=Math.max(4,s.radius),l=Math.min(1,.45+s.turns*.2),u=s.x*131+s.y*7;if(s.look===`gas`||s.look===`acid`){let t=s.look===`gas`?It[0]:It[1],n=Math.round(Math.min(40,c*c/60+6)*Math.max(.5,a));for(let i=0;i<n;i++){let n=z(i,u)*Math.PI*2+r*.008*(z(i,u+1)-.5),a=Math.sqrt(z(i,u+2))*c*.85,o=Math.round(s.x+Math.cos(n)*a+Math.sin(r*.02+i)*2),d=Math.round(s.y+Math.sin(n)*a*.6-2),f=5+z(i,u+3)*7;e.push(o,d,f,f,t,(s.look===`gas`?.3:.2)*l,M.Pixel)}if(s.look===`acid`){let t=Math.round(Math.min(30,c/2+4)*Math.max(.5,a));for(let n=0;n<t;n++){let t=Math.round(s.x+(z(n,u+4)-.5)*c*1.6),a=c*1.4,o=Math.round(s.y-c*.4+B(r*1.2+z(n,u+5)*a,a));i.solid(t,o)||e.push(t+.5,o,1,2,14221152,.85*l)}}}else if(s.look===`volcano`)Ut(e,t,s,r,i,a,l,u);else if(s.look===`storm`)Jt(e,t,s,r,i,a,l,u);else{for(let e=0;e<2;e++){let n=B(r/50+e/2,1),a=Math.max(2,c*n),o=Math.max(12,Math.round(a*5)),u=(1-n)*.8*l,d=NaN,f=NaN;for(let e=0;e<o;e++){let n=e/o*Math.PI*2,r=Math.round(s.x+Math.cos(n)*a),c=Math.round(s.y+Math.sin(n)*a);(r!==d||c!==f)&&(d=r,f=c,i.solid(r,c)||t.push(r+.5,c+.5,1,1,It[2],u))}}let e=B(r,25)<4?1:.5;t.push(s.x+.5,s.y+.5,6,6,It[2],.5*e*l,M.Pixel)}}}var Vt=[3813428,5524046,7234664,9076868],Ht=[16742948,16754744,16769136];function Ut(e,t,n,r,i,a,o,s){let c=0;for(;c<i.height&&!i.solid(n.x,c);)c++;if(c>=i.height)return;let l=Math.round(40*Math.max(.5,a)*o);for(let t=0;t<l;t++){let i=B(r/150+z(t,s),1),a=i*(60+z(t,s+1)*40),l=i*i*26*(z(t,s+9)<.5?1:.6),u=Math.round(n.x+(z(t,s+2)-.5)*(4+i*22)+l),d=Math.round(c-3-a),f=2*Math.round(1+i*3+z(t,s+3)*1.5),p=Math.min(3,Math.floor(i*4+z(t,s+4)*.8)),m=(i<.08?i/.08:1-(i-.08)/.92)*.85*o;e.push(u,d,f,f,Vt[p],m,M.Pixel)}let u=Math.round(8*Math.max(.5,a)*o);for(let e=0;e<u;e++){let a=B(r/60+z(e,s+5),1),l=Math.round(n.x+(z(e,s+6)-.5)*8+(z(e,s+7)-.5)*a*20),u=Math.round(c-2-a*(20+z(e,s+8)*30));i.solid(l,u)||t.push(l+.5,u+.5,1,1,Ht[e%3],(1-a)*.9*o)}}var Wt=[9081508,6186100,4409430,2895929],Gt=10135748,Kt=14213375,qt=90;function Jt(e,t,n,r,i,a,o,s){let c=Math.max(8,n.radius),l=Math.round(c+18),u=n.y,d=c>150,f=d?Math.max(6,Math.round(l*2/72)):3,p=l*2/f,m=p*1.7,h=d?26:15,g=Math.floor(r/7),_=z(g,s+11)<.14,v=Math.floor(z(g,s+12)*f),y=0;for(let a=0;a<f;a++){let c=n.x-l+p*(a+.5)+(z(a,s+30)-.5)*p*.4,d=qt*(.55+.45*z(a,s+31)),f=Math.min(1,(n.age??qt)/d),g=1-(1-f)*(1-f)*(1-f);y+=g;let b=c<n.x?n.x-l-m:n.x+l+m;Yt(e,t,Math.round(b+(c-b)*g+Math.sin(r*.01+a*1.7)*2),u+Math.round((z(a,s+32)-.5)*6),m,h*(.75+.25*o)*(.8+.4*z(a,s+33)),a*97+s,r,i,_&&a===v)}let b=y/f,x=Math.round(c*1.6*Math.max(.4,a)*o*b);for(let t=0;t<x;t++){let a=z(t,s+20),l=z(t,s+21),d=4+z(t,s+22)*2,f=i.height-u+10,p=Math.floor(B(r*d+l*f,f)),m=u+2+p,h=Math.round(n.x+(a-.5)*c*2+p*.25);m>=i.height||h<0||h>=i.width||i.solid(h,m)||(i.solid(h,m+1)?(e.push(h-.5,m+.5,1,1,Gt,.7*o),e.push(h+1.5,m-.5,1,1,Gt,.5*o)):e.push(h+.5,m-2,1,4,Gt,.55*o))}}function Yt(e,t,n,r,i,a,o,s,c,l){let u=[],d=[],f=[];for(let e=0;e<4;e++){let t=a*(.6+.45*z(e,o+1))*(e===1||e===2?1.15:.8);u.push((e/3-.5)*(i-a*1.4)+(z(e,o+2)-.5)*a*.4),d.push(-t*.55+Math.sin(s*.015+e+o)*.8),f.push(t)}let p=Math.floor(n-i/2),m=Math.ceil(n+i/2);for(let i=p;i<=m;i++){if(i<0||i>=c.width)continue;let a=i-n,s=1/0;for(let e=0;e<4;e++){let t=a-u[e],n=f[e];t*t>=n*n||(s=Math.min(s,r+d[e]-Math.sqrt(n*n-t*t)))}if(s===1/0)continue;let p=Math.round(s),m=r+Math.round(1.5+Math.sin(i*.4+o)*1.2),h=Math.max(1,m-p);for(let n=p;n<=m;n++){if(n<0||n>=c.height)continue;let r=n===p||n===m;if(r&&!(i+n&1))continue;let a=(n-p)/h,o=a<.22?0:a<.5?1:a<.8?2:3;e.push(i+.5,n+.5,1,1,Wt[o],r?.75:1),l&&a>.3&&i*3+n&3&&t.push(i+.5,n+.5,1,1,Kt,.4)}}}var Xt=4880908,Zt=9226266,Qt=12119084,$t=15400826,en=10936356,V=new Float32Array(4096);function tn(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=nn(r,i,n),u=nn(r+1,i,n),d=nn(r,i+1,n),f=l+(u-l)*s;return f+(d+(nn(r+1,i+1,n)-d)*s-f)*c}function nn(e,t,n){return z((e&1023)+((t&1023)<<10),n)}function rn(e,t,n,r,i){let a=t.puffs,o=a.length>>1,s=Math.max(3,t.puffRadius??10),c=t.age??1e3,l=Math.min(1,.3+c/50),u=t.turns<=1?.8:1,d=1/0,f=1/0,p=-1/0,m=-1/0;for(let e=0;e<o;e++)d=Math.min(d,a[2*e]),p=Math.max(p,a[2*e]),f=Math.min(f,a[2*e+1]),m=Math.max(m,a[2*e+1]);let h=Math.ceil(s*1.5)+3,g=Math.max(0,d-h),_=Math.max(0,f-h-4),v=Math.min(r.width,p+h),y=Math.min(r.height,m+h),b=v-g,x=y-_;if(b<=0||x<=0)return;V.length<b*x&&(V=new Float32Array(b*x*2)),V.fill(0,0,b*x);for(let e=0;e<o;e++){let t=e*2.399,r=s*l*(.82+.22*Math.sin(n*.045+t)),i=a[2*e]+.5+Math.sin(n*.031+t*1.3)*1.6,o=a[2*e+1]+.5-r*.35+Math.cos(n*.037+t)*1.1,c=r*1.2,d=1/(c*c),f=Math.max(g,Math.floor(i-c)),p=Math.min(v-1,Math.ceil(i+c)),m=Math.max(_,Math.floor(o-c)),h=Math.min(y-1,Math.ceil(o+c));for(let e=m;e<=h;e++){let t=(e+.5-o)*1.25,n=(e-_)*b-g;for(let e=f;e<=p;e++){let r=e+.5-i,a=1-(r*r+t*t)*d;a>0&&(V[n+e]=V[n+e]+a*u)}}}let S=n*.05;for(let t=_;t<y;t++){let n=(t-_)*b-g,i=-1,a=0,o=0;for(let s=g;s<=v;s++){let c=0,l=0;if(s<v){let e=V[n+s];if(e>.12&&!r.solid(s,t)){let r=e*(.6+.8*(tn((s-S)/7,(t+S*.6)/5,41)*.7+tn(s/3,(t+S)/3,42)*.3)),i=t-2>=_?V[n-2*b+s]:0;r>1.7?(c=Xt,l=.72):r>.9?(c=i<.45?$t:Zt,l=i<.45?.78:.62):r>.45?(c=i<.25?$t:Qt,l=.5):r>.2&&!(s+t&1)?(c=en,l=.45):r>.3&&((s^t)&3)==1&&(c=en,l=.35)}}c===a&&l===o&&i>=0||(i>=0&&a!==0&&e.rect(i,t,s-i,1,a,o),i=s,a=c,o=l)}}let C=Math.round(o*1.5*Math.max(.4,i));for(let t=0;t<C;t++){let i=t%o,c=s*l,d=90+z(t,61)*80,f=B(n+z(t,62)*d,d)/d,p=a[2*i]+(z(t,63)-.5)*c*1.6,m=a[2*i+1]-c*.9,h=6+Math.floor(z(t,64)*10);for(let i=0;i<h;i++){let a=Math.floor(m-f*c*1.2-i),o=Math.floor(p+Math.sin(n*.04+i*.45+t)*(1+i*.25));if(!((o+a&1)==1&&i>2)){if(a<0||r.solid(o,a))break;e.push(o+.5,a+.5,1,1,i<3?Qt:en,(1-f)*(1-i/h)*.6*u)}}}let w=Math.round(o*2*Math.max(.4,i));for(let t=0;t<w;t++){let i=t%o,c=s*l,d=c*1.4,f=B(n*(.18+z(t,977)*.2)+z(t,978)*d,d),p=Math.floor(a[2*i]+(z(t,979)-.5)*c*1.4),m=Math.floor(a[2*i+1]+1-f);p<g||p>=v||m<_||m>=y||V[(m-_)*b+(p-g)]<.5||r.solid(p,m)||e.push(p+.5,m+.5,1,1,f>d*.85?16777152:$t,.9*u)}}function an(e,t){if(t<=0)return 0;let n=Math.floor(e/30);if(z(n,91)>=30/t)return 0;let r=e-n*30;return r<2?.32:r>=3&&r<5?.18:0}var on=[461320,725004,1054482,1515545,2042401],sn=[2766123,3424303,4016694],cn=8188576,ln=3115602;function H(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+11,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var un=(e,t)=>(e%t+t)%t,dn=260,fn=70,pn=40,U=9,mn=2,hn=.03,gn=26,_n=[2502954,3029809,3622458],vn=e=>e*977;function yn(e,t,n,r,i){for(let a=0;a<2;a++){let o=a===0,s=Math.floor(o?r.x0:r.width-r.x1)-2;if(s>=t+8)continue;let c=e=>o?e:r.width-e,l=Math.floor(r.y0)-6,u=Math.ceil(r.y1-r.y0)+12,d=t-3;if(d>s){let t=Math.round(Math.min(c(s),c(d))),n=Math.round(Math.max(c(s),c(d)));e.rect(t,l,Math.max(1,n-t),u,on[0],.4)}let f=n*hn,p=Math.floor(f/U),m=f-p*U,h=Math.floor((r.y0-m)/U)-2,g=Math.ceil((r.y1-m)/U)+2,_=Math.floor((t-4)/U),v=Math.max(Math.floor(s/U)-1,_-60);for(let r=v;r<=_;r++)for(let i=h;i<=g;i++){let o=(r+4096)*8192+(i-p+4096);for(let s=0;s<mn;s++){let l=o*mn+s,u=H(l,51+vn(a)),d=H(l,52+vn(a)),f=H(l,53+vn(a)),p=u*6.283,h=2+f*4,g=r*U+u*U+Math.sin(n*.012+p)*h;if(g>t-2)continue;let _=i*U+m+d*U+Math.cos(n*.01+p)*h*.8,v=.5+.5*Math.sin(n*.006+d*6.283),y=Math.round(11+f*12+v*5),b=H(l,54+a)<.16,x=b?_n[Math.floor(d*_n.length)]:on[Math.floor(f*3)];e.push(Math.round(c(g)),Math.round(_),y,y,x,b?.55:.6+.25*v,M.Pixel)}}for(let i=v;i<=_;i+=1)for(let o=Math.floor(r.y0/gn)-1;o<=Math.ceil(r.y1/gn);o++){let r=(i+4096)*8192+(o+4096),s=un(n/(180+H(r,61)*240)+H(r,62+a),1),l=i*U+H(r,63)*U;if(l>t-3)continue;let u=o*gn+H(r,64)*gn-s*18,d=Math.sin(s*Math.PI);d<.25||e.push(Math.round(c(l)),Math.round(u),1,1,s>.5?ln:cn,.7*d)}let y=Math.ceil(u/100*dn),b=a*7919;for(let r=0;r<y;r++){let i=H(r,1+b),a=H(r,2+b),o=H(r,3+b),d=H(r,4+b),f=H(r,5+b),p=un(n/(160+o*220)+d,1),m=i*i*pn,h=m<10?Math.sin((p+f)*Math.PI*2)*(10-m)*.45:0,g=t-m+h+1;if(g<s-6)continue;let _=.035+o*.05,v=l+un(a*u+n*_,u),y=Math.round(6+o*10+p*6),x=Math.sin(p*Math.PI)*(m<6?.55:.8);if(x<.06)continue;let S=on[Math.min(on.length-1,Math.floor(f*on.length*(1-m/pn)+.6))];e.push(Math.round(c(g)),Math.round(v),y,y,S,x,m<12?M.Stipple:M.Pixel)}let x=Math.ceil(u/100*fn);for(let r=0;r<x;r++){let a=un(n/(120+H(r,11+b)*160)+H(r,12+b),1),o=l+H(r,13+b)*u,s=t+1+a*(6+H(r,14+b)*14),d=o+Math.sin(a*5+r)*2-a*4,f=Math.round(2+H(r,15+b)*3),p=(1-a)*.45,m=sn[r%sn.length];i>0&&r%3==0&&(m=ln),e.push(Math.round(c(s)),Math.round(un(d-l,u)+l),f,f,m,p,M.Stipple)}let S=Math.floor(n/6);if(H(S,30+a)>.82){let n=t-(14+H(S,31+a)*Math.max(10,t-s-14));if(n>s){let t=c(n),r=l+H(S,32+a)*u*.7,i=6+Math.floor(H(S,33+a)*8);for(let n=0;n<i;n++){let i=t+(H(S*31+n,34+a)-.5)*8,o=r+3+H(S*31+n,35+a)*6;e.line(Math.round(t),Math.round(r),Math.round(i),Math.round(o),3,ln,.35),e.line(Math.round(t),Math.round(r),Math.round(i),Math.round(o),1,cn,.95),t=i,r=o}}}if(i>.05){let r=Math.round(c(t+1));for(let t=l;t<l+u;t+=6)H(Math.floor(t/6),40+a+Math.floor(n/8))<.5||e.push(r,t,5,5,ln,.3*i,M.Pixel)}}}var bn={low:{div:4,iters:8},medium:{div:2,iters:12},high:{div:1,iters:16}},xn=24,Sn=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // one triangle over the whole target
  vec2 p = vec2((gl_VertexID & 1) << 2, (gl_VertexID & 2) << 1);
  v_uv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}`,W=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
in vec2 v_uv;
uniform vec2 u_size;   // fluid cells across and down
uniform usampler2D u_terrain;
uniform ivec2 u_map;
uniform int u_div;
bool solidAt(ivec2 f) {
  ivec2 c = f * u_div + u_div / 2;
  if (c.x < 0 || c.x >= u_map.x || c.y < 0) return false;
  if (c.y >= u_map.y) return true;
  return texelFetch(u_terrain, c, 0).r != 0u;
}
bool solidAt(vec2 uv) { return solidAt(ivec2(floor(uv * u_size))); }
`,Cn=W+`uniform sampler2D u_vel;
uniform sampler2D u_dye;
uniform int u_n;
uniform vec4 u_sA[${xn}]; // x, y (fluid cells), r (negative = radial), gas
uniform vec4 u_sB[${xn}]; // vx, vy (or strength), smoke, heat
layout(location = 0) out vec4 oVel;
layout(location = 1) out vec4 oDye;
void main() {
  vec2 p = v_uv * u_size;
  vec2 v = texture(u_vel, v_uv).xy;
  vec4 d = texture(u_dye, v_uv);
  for (int i = 0; i < ${xn}; i++) {
    if (i >= u_n) break;
    vec4 a = u_sA[i];
    vec4 b = u_sB[i];
    float r = abs(a.z);
    vec2 off = p - a.xy;
    float dist = length(off);
    if (dist > r) continue;
    float w = 1.0 - smoothstep(0.0, r, dist);
    if (a.z < 0.0) v += (dist > 0.01 ? off / dist : vec2(0.0)) * b.x * w;
    else v += b.xy * w;
    d.xyz += vec3(b.z, b.w, a.w) * w;
  }
  oVel = vec4(v, 0.0, 1.0);
  oDye = vec4(min(d.xyz, vec3(3.0)), 1.0);
}`,wn=W+`uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec4 u_keep;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 v = texture(u_vel, v_uv).xy;
  vec2 from = v_uv - v / u_size;
  o = texture(u_src, from) * u_keep;
}`,Tn=W+`uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  float L = texture(u_vel, v_uv - vec2(t.x, 0.0)).y;
  float R = texture(u_vel, v_uv + vec2(t.x, 0.0)).y;
  float T = texture(u_vel, v_uv - vec2(0.0, t.y)).x;
  float B = texture(u_vel, v_uv + vec2(0.0, t.y)).x;
  o = vec4(0.5 * ((R - L) - (B - T)), 0.0, 0.0, 1.0);
}`,En=W+`uniform sampler2D u_vel;
uniform sampler2D u_curl;
uniform sampler2D u_dye;
uniform float u_eps;
uniform float u_wind;
uniform vec2 u_jit;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 t = 1.0 / u_size;
  float L = texture(u_curl, v_uv - vec2(t.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(t.x, 0.0)).x;
  float T = texture(u_curl, v_uv - vec2(0.0, t.y)).x;
  float B = texture(u_curl, v_uv + vec2(0.0, t.y)).x;
  float C = texture(u_curl, v_uv).x;
  vec2 force = 0.5 * vec2(abs(B) - abs(T), abs(L) - abs(R));
  force /= length(force) + 0.0001;
  force *= u_eps * C;
  vec2 v = texture(u_vel, v_uv).xy + force;
  vec4 d = texture(u_dye, v_uv);
  // hot air climbs, smoke drifts up a little on its own, gas sinks
  v.y -= d.y * 0.07 + d.x * 0.01 - d.z * 0.01;
  v.x += u_wind;
  // a whisper of turbulence, so a symmetric blast still curls into eddies
  if (d.x + d.y + d.z > 0.02) {
    vec2 c = floor(v_uv * u_size);
    float h = fract(sin(dot(c + u_jit, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(c + u_jit, vec2(39.3467, 11.135))) * 24634.6345);
    v += (vec2(h, h2) - 0.5) * 0.16 * min(1.0, d.y * 2.0 + d.x);
  }
  float sp = length(v);
  if (sp > 2.5) v *= 2.5 / sp;
  o = vec4(v, 0.0, 1.0);
}`,Dn=W+`uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float L = solidAt(f - ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv - vec2(0.0, t.y)).y;
  float B = solidAt(f + ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv + vec2(0.0, t.y)).y;
  o = vec4(0.5 * (R - L + B - T), 0.0, 0.0, 1.0);
}`,On=W+`uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float C = texture(u_pressure, v_uv).x;
  float L = solidAt(f - ivec2(1, 0)) ? C : texture(u_pressure, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? C : texture(u_pressure, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? C : texture(u_pressure, v_uv - vec2(0.0, t.y)).x;
  float B = solidAt(f + ivec2(0, 1)) ? C : texture(u_pressure, v_uv + vec2(0.0, t.y)).x;
  float div = texture(u_divergence, v_uv).x;
  o = vec4((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
}`,kn=W+`uniform sampler2D u_pressure;
uniform sampler2D u_vel;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float C = texture(u_pressure, v_uv).x;
  float L = solidAt(f - ivec2(1, 0)) ? C : texture(u_pressure, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? C : texture(u_pressure, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? C : texture(u_pressure, v_uv - vec2(0.0, t.y)).x;
  float B = solidAt(f + ivec2(0, 1)) ? C : texture(u_pressure, v_uv + vec2(0.0, t.y)).x;
  vec2 v = texture(u_vel, v_uv).xy - 0.5 * vec2(R - L, B - T);
  o = vec4(v, 0.0, 1.0);
}`,An=`#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D u_dye;
uniform usampler2D u_terrain;
uniform ivec2 u_map;
uniform vec2 u_fsize;  // fluid cells across and down
uniform int u_div;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_tick;
out vec4 o;
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
  vec2 cellF = floor((px - u_origin) / u_scale);
  ivec2 cell = ivec2(cellF);
  if (cell.x < 0 || cell.y < 0 || cell.x >= u_map.x || cell.y >= u_map.y) discard;
  if (texelFetch(u_terrain, cell, 0).r != 0u) discard;
  vec2 uv = (cellF + 0.5) / (u_fsize * float(u_div));
  vec3 d = texture(u_dye, uv).xyz;
  // a coarse checker dither between bands (hard bands, a one-cell checker seam), crawling a
  // cell every few ticks so a still cloud still shimmers
  int ox = int(mod(floor(u_tick / 3.0), 2.0));
  float dither = (((cell.x + ox) & 1) == (cell.y & 1)) ? 0.3 : 0.7;
  float smoke = d.x;
  float heat = d.y;
  float gas = d.z;
  vec3 col;
  float alpha;
  if (gas > smoke && gas > 0.04) {
    float b = floor(min(gas, 1.0) * 3.0 + dither);
    if (b < 1.0) discard;
    col = b < 2.0 ? vec3(0.17, 0.35, 0.16) : b < 3.0 ? vec3(0.31, 0.54, 0.23) : vec3(0.48, 0.72, 0.29);
    alpha = b < 2.0 ? 0.45 : b < 3.0 ? 0.65 : 0.8;
  } else {
    float b = floor(min(smoke, 1.2) * 3.4 + dither);
    if (b < 1.0) discard;
    // soot bands: thin skirts a dark haze, the body a mid grey, the thickest a lit pale top
    col = b < 2.0 ? vec3(0.13, 0.11, 0.12) : b < 3.0 ? vec3(0.27, 0.24, 0.26) : b < 4.0 ? vec3(0.45, 0.42, 0.45) : vec3(0.64, 0.61, 0.64);
    alpha = b < 2.0 ? 0.55 : b < 3.0 ? 0.75 : b < 4.0 ? 0.88 : 0.95;
    // heat lights the smoke from inside, in three steps
    float h = floor(min(heat, 1.0) * 3.0 + dither * 0.999);
    if (h >= 3.0) col = vec3(1.0, 0.75, 0.25);
    else if (h >= 2.0) col = vec3(0.88, 0.38, 0.12);
    else if (h >= 1.0) col = mix(col, vec3(0.54, 0.23, 0.06), 0.7);
    if (h >= 1.0) alpha = max(alpha, 0.6 + h * 0.1);
  }
  o = vec4(col * alpha, alpha);
}`,jn=class{ok;div;iters;w;h;gl;mapW;mapH;vel;dye;pressure;div1;curl;pair;cur=0;progs={};uni={};vao;pending=[];tick=0;sA=new Float32Array(96);sB=new Float32Array(96);live=!1;constructor(e,t,n,r,i){if(this.gl=e,this.mapW=t,this.mapH=n,this.div=r,this.iters=i,this.w=Math.max(1,Math.ceil(t/r)),this.h=Math.max(1,Math.ceil(n/r)),this.ok=e.getExtension(`EXT_color_buffer_float`)!==null,!this.ok)return;let a=()=>{let t=k(e,e.LINEAR);e.texImage2D(e.TEXTURE_2D,0,e.RGBA16F,this.w,this.h,0,e.RGBA,e.HALF_FLOAT,null);let n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),{tex:t,fbo:n}};this.vel=[a(),a()],this.dye=[a(),a()],this.pressure=[a(),a()],this.div1=a(),this.curl=a();let o=t=>{let n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.vel[t].tex,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,this.dye[t].tex,0),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),n};this.pair=[o(0),o(1)];let s=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!s){this.ok=!1,this.dispose();return}let c=(t,n,r)=>{let i=O(e,Sn,n);this.progs[t]=i;let a={};for(let t of[`u_size`,`u_terrain`,`u_map`,`u_div`,...r])a[t]=e.getUniformLocation(i,t);this.uni[t]=a};c(`splat`,Cn,[`u_vel`,`u_dye`,`u_n`,`u_sA`,`u_sB`]),c(`advect`,wn,[`u_vel`,`u_src`,`u_keep`]),c(`curl`,Tn,[`u_vel`]),c(`force`,En,[`u_vel`,`u_curl`,`u_dye`,`u_eps`,`u_wind`,`u_jit`]),c(`div`,Dn,[`u_vel`]),c(`pressure`,On,[`u_pressure`,`u_divergence`]),c(`gradient`,kn,[`u_pressure`,`u_vel`]);let l=O(e,Sn,An);this.progs.draw=l;let u={};for(let t of[`u_dye`,`u_terrain`,`u_map`,`u_fsize`,`u_div`,`u_view`,`u_origin`,`u_scale`,`u_tick`])u[t]=e.getUniformLocation(l,t);this.uni.draw=u,this.vao=e.createVertexArray()}splat(e,t,n,r,i,a,o,s=0,c=!1){if(!this.ok)return;this.ensureStep();let l=this.pending[this.pending.length-1].splats;if(l.length>=xn)return;let u=this.div;l.push({a:[e/u,t/u,Math.max(1,n)/u*(c?-1:1),s],b:[r/u,i/u,a,o]}),this.live=!0}step(e){this.ok&&this.pending.push({wind:e,splats:[]})}ensureStep(){this.pending.length===0&&this.pending.push({wind:0,splats:[]})}clear(){if(!this.ok)return;this.pending=[],this.live=!1;let e=this.gl;e.clearColor(0,0,0,0);for(let t of[...this.vel,...this.dye,...this.pressure,this.div1,this.curl])e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.clear(e.COLOR_BUFFER_BIT);e.bindFramebuffer(e.FRAMEBUFFER,null)}update(e){if(!this.ok)return;let t=this.pending;if(this.pending=[],!this.live){this.tick+=t.length;return}let n=this.gl;n.disable(n.BLEND),n.viewport(0,0,this.w,this.h),n.bindVertexArray(this.vao),n.activeTexture(n.TEXTURE9),n.bindTexture(n.TEXTURE_2D,e);for(let e of t)this.runStep(e),this.tick++;n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindVertexArray(null),n.activeTexture(n.TEXTURE0)}use(e){let t=this.gl,n=this.uni[e];return t.useProgram(this.progs[e]),t.uniform2f(n.u_size,this.w,this.h),t.uniform1i(n.u_terrain,9),t.uniform2i(n.u_map,this.mapW,this.mapH),t.uniform1i(n.u_div,this.div),n}bind(e,t,n){let r=this.gl;r.activeTexture(r.TEXTURE0+e),r.bindTexture(r.TEXTURE_2D,t),r.uniform1i(n,e)}target(e){let t=this.gl;t.bindFramebuffer(t.FRAMEBUFFER,e),t.drawArrays(t.TRIANGLES,0,3)}runStep(e){let t=this.gl,n=this.vel,r=this.dye,i=this.pressure,a=this.cur,o=a^1;if(e.splats.length>0){let i=this.use(`splat`),s=e.splats.length;for(let t=0;t<s;t++)this.sA.set(e.splats[t].a,t*4),this.sB.set(e.splats[t].b,t*4);t.uniform1i(i.u_n,s),t.uniform4fv(i.u_sA,this.sA),t.uniform4fv(i.u_sB,this.sB),this.bind(0,n[a].tex,i.u_vel),this.bind(1,r[a].tex,i.u_dye),this.target(this.pair[o]),a=o,o=a^1}{let e=this.use(`curl`);this.bind(0,n[a].tex,e.u_vel),this.target(this.curl.fbo)}{let i=this.use(`force`);t.uniform1f(i.u_eps,.5),t.uniform1f(i.u_wind,e.wind*1.5/this.div),t.uniform2f(i.u_jit,this.tick%977*.37,this.tick%613*.53),this.bind(0,n[a].tex,i.u_vel),this.bind(1,this.curl.tex,i.u_curl),this.bind(2,r[a].tex,i.u_dye),this.target(n[o].fbo)}{let e=this.use(`div`);this.bind(0,n[o].tex,e.u_vel),this.target(this.div1.fbo)}{let e=this.use(`pressure`);this.bind(1,this.div1.tex,e.u_divergence);let t=0;for(let n=0;n<this.iters;n++)this.bind(0,i[t].tex,e.u_pressure),this.target(i[t^1].fbo),t^=1;let r=this.use(`gradient`);this.bind(0,i[t].tex,r.u_pressure),this.bind(1,n[o].tex,r.u_vel),this.target(n[a].fbo)}{let e=this.use(`advect`);this.bind(0,n[a].tex,e.u_vel),this.bind(1,n[a].tex,e.u_src),t.uniform4f(e.u_keep,.992,.992,1,1),this.target(n[o].fbo),this.bind(1,r[a].tex,e.u_src),t.uniform4f(e.u_keep,.997,.96,.998,1),this.target(r[o].fbo)}this.cur=o}draw(e,t,n,r){if(!this.ok||!this.live)return;let i=this.gl,a=this.uni.draw;i.useProgram(this.progs.draw),i.bindVertexArray(this.vao),this.bind(0,this.dye[this.cur].tex,a.u_dye),i.activeTexture(i.TEXTURE9),i.bindTexture(i.TEXTURE_2D,e),i.uniform1i(a.u_terrain,9),i.uniform2i(a.u_map,this.mapW,this.mapH),i.uniform2f(a.u_fsize,this.w,this.h),i.uniform1i(a.u_div,this.div),i.uniform2f(a.u_view,t[0],t[1]),i.uniform2f(a.u_origin,n[0],n[1]),i.uniform1f(a.u_scale,r),i.uniform1f(a.u_tick,this.tick),i.enable(i.BLEND),i.blendFunc(i.ONE,i.ONE_MINUS_SRC_ALPHA),i.drawArrays(i.TRIANGLES,0,3),i.disable(i.BLEND),i.bindVertexArray(null),i.activeTexture(i.TEXTURE0)}dispose(){let e=this.gl;for(let t of[...this.vel??[],...this.dye??[],...this.pressure??[]])e.deleteTexture(t.tex),e.deleteFramebuffer(t.fbo);for(let t of[this.div1,this.curl])t&&(e.deleteTexture(t.tex),e.deleteFramebuffer(t.fbo));for(let t of this.pair??[])e.deleteFramebuffer(t);for(let t of Object.values(this.progs))e.deleteProgram(t);this.vel=this.dye=this.pressure=this.pair=void 0,this.progs={}}},Mn=-3,Nn=33;function Pn(n){if(n<=Mn){let t=e(Mn);return{kind:`snow`,k:Math.min(1,(e(n)-t)/(1e3-t)+.25)}}if(n>=Nn){let e=t(Nn);return{kind:`sand`,k:Math.min(1,(t(n)-e)/(1e3-e)+.25)}}return{kind:`snow`,k:0}}var Fn={snow:{haze:15660287,sheet:16777215,grain:[16777215,15791871,14214904],streak:16777215},sand:{haze:12617802,sheet:13146716,grain:[14728320,13146202,11041344,9067056],streak:14200944}};function G(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+11,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var In=(e,t)=>(e%t+t)%t,K=new Int16Array;function Ln(e,t,n,r,i,a,o){if(n<=.01)return;let s=Fn[t],c=a.width,l=a.height,u=i<0?-1:1,d=Math.min(1.5,Math.abs(i)*120),f=(t===`snow`?1.6:2.2)+d*1.6,p=t===`sand`,m=c>>1;K.length<m&&(K=new Int16Array(m));for(let e=0;e<m;e++){let t=e<<1,n=0;for(;n<l&&!a.solid(t,n)&&!a.solid(t+1,n);)n++;K[e]=n}let h=p?.22:.2,g=p?.5:.45;for(let t=0;t<4;t++){let r=Math.floor(l*t/4),i=Math.floor(l*(t+1)/4),a=n*h*(1+t*g),o=-1;for(let t=0;t<=m;t++){let n=t<m?Math.min(i,K[t]):r;if(o>=0&&(t===m||n!==Math.min(i,K[o]))){let n=Math.min(i,K[o]);n>r&&e.rect(o<<1,r,t-o<<1,n-r,s.haze,a),o=-1}o<0&&t<m&&(o=t)}}for(let t=0;t<m;t++){let r=t<<1,i=K[t];for(;i<l;){for(;i<l&&(a.solid(r,i)||a.solid(r+1,i));)i++;let t=i;for(;i<l&&!a.solid(r,i)&&!a.solid(r+1,i);)i++;if(i>=l)break;if(i>t){let a=Math.min(3,Math.floor((t+i>>1)*4/l));e.rect(r,t,2,i-t,s.haze,n*h*(1+a*g))}}}let _=Math.round(3+n*5);for(let t=0;t<_;t++){let i=Math.round(80+G(t,1)*140),a=Math.round(8+G(t,2)*(p?26:18)),o=c+i*2,d=Math.floor(In(G(t,3)*o+r*f*.55*u,o))-i,m=p?.3:.08,h=Math.floor(l*(m+G(t,4)*(.75-m))+Math.sin(r*.01+t)*3),g=n*(p?.2:.26);for(let t=0;t<3;t++){let n=Math.round(i*(1-t*.28)),r=Math.max(2,Math.round(a*(1-t*.3))),o=d+(i-n>>1),l=h-(r>>1);for(let t=Math.max(0,o&-2);t<Math.min(c,o+n);t+=2){let n=Math.min(l+r,K[t>>1]);n>l&&e.rect(t,l,2,n-l,s.sheet,g)}}}let v=Math.round(n*(p?1100:1400)*(c/1e3)*Math.max(.4,o));for(let t=0;t<v;t++){let i=G(t,5),o=G(t,6),m=G(t,7),h=f*(.6+m*.8),g=c+40,_=Math.floor(In(i*g+r*h*u,g))-20,v=p?.25+.75*Math.sqrt(o):o,y=p?Math.sin(r*.09+i*50)*1.5:Math.sin(r*.06+i*40)*3,b=p?0:In(r*(.2+m*.3),l*.2),x=Math.floor(In(v*l+y+b,l));if(!(_<0||_>=c||a.solid(_,x))){if(m>(p?.6:.72)){let t=Math.round(3+o*(p?6:5)+d*2),r=u>0?_-t:_+1;e.rect(r,x,t,1,s.streak,(p?.7:.75)*Math.min(1,n+.3))}else{let n=s.grain[t%s.grain.length],r=p?o>.7?2:1:o>.9?3:o>.3?2:1;e.rect(_,x,r,r,n,.95)}}}let y=Math.round(n*30*(c/1e3)*Math.max(.5,o));for(let t=0;t<y;t++){let i=G(t,8),a=f*(.9+G(t,9)*.6),o=Math.floor(In(i*c+r*a*u,c)),d=K[o>>1];if(d>=l||d<2)continue;let p=Math.round(4+G(t,10)*8),m=u>0?o-p:o+1;e.rect(m,d-1,p,1,s.streak,.6*n),e.rect(m+(p>>2),d-2,p>>1,1,s.streak,.35*n)}}var q=1200,Rn=48,zn=.6,Bn=120,Vn=6,Hn=260,Un=.16,J=15923455;function Wn(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),(n^n>>>15)>>>0}function Gn(e,t){if(t<=0)return{pos:0,hits:99};let n=Math.floor(e/t),r=e-n*t;return{pos:n&1?t-r:r,hits:n}}var Kn=class{width;height;colors;liquid=new Uint8Array(256);terrain;dx=new Float32Array(q);dy=new Float32Array(q);dvx=new Float32Array(q);dvy=new Float32Array(q);dage=new Uint16Array(q);dlife=new Uint16Array(q);dcolor=new Uint32Array(q);nDrops=0;waves=[];shells=new Map;tanks=[];lastCue=-100;cues=[];budgetTick=-1;budget=0;mult=1;listener;constructor(e,t,n,r){this.width=e,this.height=t,this.colors=r;for(let e of n)e>0&&e<256&&(this.liquid[e]=1);this.terrain=new Uint8Array(e*t)}get enabled(){for(let e=1;e<256;e++)if(this.liquid[e])return!0;return!1}setTerrain(e){this.terrain=e}cell(e,t){return e<0||t<0||e>=this.width||t>=this.height?0:this.terrain[t*this.width+e]}isLiquid(e,t){return this.liquid[this.cell(Math.floor(e),Math.floor(t))]===1}depth(e,t,n){let r=0;for(;r<n&&this.liquid[this.cell(e,t+r)]===1;)r++;return r}surface(e,t){let n=t;for(;n>0&&this.liquid[this.cell(e,n-1)]===1;)n--;return n}open(e,t){return this.liquid[this.cell(e,t)]===1&&this.cell(e,t-1)===0}surfaceNear(e,t){if(this.open(e,t))return t;for(let n=1;n<=2;n++){if(this.open(e,t+n))return t+n;if(this.open(e,t-n))return t-n}return-1}reach(e,t,n){let r=0,i=t;for(;r<Hn;){let a=e+n*(r+1),o=this.surfaceNear(a,i);if(o<0||Math.abs(o-t)>2)break;i=o,r++}return r}colorAt(e,t){return this.colors[this.cell(e,t)]??3832008}addDrop(e,t,n,r,i,a){let o=this.nDrops;o>=q?o=Wn(Math.floor(e*7+t),Math.floor(n*100))%q:this.nDrops++,this.dx[o]=e,this.dy[o]=t,this.dvx[o]=n,this.dvy[o]=r,this.dage[o]=0,this.dlife[o]=i,this.dcolor[o]=a}addWave(e,t,n,r){if(this.waves.length>=Rn){let e=0;for(let t=1;t<this.waves.length;t++)this.waves[t].amp<this.waves[e].amp&&(e=t);if(this.waves[e].amp>n)return;this.waves.splice(e,1)}this.listener?.disturb(e,t,n);for(let i of this.waves)if(r-i.start<4&&Math.abs(i.x-e)<4&&Math.abs(i.y-t)<3){i.amp=Math.min(3.5,Math.max(i.amp,n)+Math.min(i.amp,n)*.3);return}this.waves.push({x:e,y:t,start:r,amp:n,left:this.reach(e,t,-1),right:this.reach(e,t,1),color:this.colorAt(e,t)})}splash(e,t,n,r,i,a){let o=this.depth(e,t,6),c=Math.max(.2,Math.min(4,n*(.35+.65*Math.min(1,o/5))));if(this.budgetTick!==i&&(this.budgetTick=i,this.budget=0),this.budget++,this.budget>3){this.budget<12&&this.addWave(e,t,Math.min(1.2,.3+c*.3),i);return}let l=this.colorAt(e,t),u=s(l,1.35),d=s(l,1.7),f=Math.round((3+c*6)*this.mult);for(let n=0;n<f;n++){let o=Wn(a+n,i),s=o&1?1:-1,f=(o>>>1&1023)/1023,p=(o>>>11&1023)/1023,m=.3+f*(.4+c*.35),h=.6+p*(.5+c*.5),g=(o>>>21)%5==0?J:(o>>>21)%3==0?d:o>>>24&1?u:l;this.addDrop(e+s*(.5+f*1.5),t-1,s*m+r*.15,-h,40+(o>>>25&31),g)}if(c>=1.4){let n=Math.round((1+c*2.5)*this.mult);for(let r=0;r<n;r++){let n=Wn(a+977+r,i),o=(n&1023)/1023;this.addDrop(e+(n>>>10)%3-1,t-1,((n>>>12&255)/255-.5)*.3,-(1.3+c*.6+o*c*.6),60,n>>>20&1?J:d)}}this.addWave(e,t,Math.min(3.5,.5+c*.6),i),c>=.6&&i-this.lastCue>=4&&(this.lastCue=i,this.cues.push({type:`waterSplash`,tick:i,x:e,y:t,radius:0,params:{strength:Math.round(Math.min(3,c)*100)/100}}))}blast(e){if((e.params.strength??1)<=0||e.radius<6)return;let t=Math.round(e.radius*1.6+4),n=e.x,r=e.y,i=1/0,a=0,o=0,c=t>40?2:1;for(let l=n-t;l<=n+t;l+=c)if(!(l<0||l>=this.width))for(let c=Math.max(1,r-t);c<=Math.min(this.height-1,r+t);c++){if(!this.open(l,c))continue;let u=l-n,d=c-r,f=u*u+d*d;if(f>t*t)continue;let p=Math.sqrt(f);p<i&&(i=p,a=l,o=c);let m=1-p/t,h=Wn(l*31+c,e.tick);if((h&255)/255<(.25+m*.6)*this.mult){let t=u===0?h&256?1:-1:Math.sign(u),n=this.colorAt(l,c),r=(h>>>9&1023)/1023;this.addDrop(l,c-1,t*(.3+m*2.2*r),-(.8+m*(2.4+e.radius*.03)*(.5+r*.5)),50+(h>>>19&31),(h>>>24)%4==0?J:s(n,h>>>26&1?1.35:1))}}if(i<1/0){let n=1-i/t;this.splash(a,o,.5+n*(1+e.radius/14),0,e.tick,e.x*13+e.y)}}tick(e,t){for(let n of e)if(n.kind===`projectile`){let e=this.shells.get(n.id);if(!e){this.shells.set(n.id,{x:n.x,y:n.y,vx:0,vy:0,seen:t});continue}let r=n.x-e.x,i=n.y-e.y;Math.abs(r)<40&&Math.abs(i)<40&&(r!==0||i!==0)&&this.shellPath(e.x,e.y,r,i,t,n.id),e.x=n.x,e.y=n.y,e.vx=r,e.vy=i,e.seen=t}else n.kind===`tank`&&this.tankStep(n.player,n.x,n.y,n.alive,t);for(let[e,n]of this.shells){if(n.seen===t||(this.shells.delete(e),Math.abs(n.vx)>40||Math.abs(n.vy)>40))continue;let r=Math.round(n.x+n.vx),i=Math.round(n.y+n.vy);for(let[a,o]of[[0,0],[0,1],[0,2],[-1,1],[1,1]])if(this.isLiquid(r+a,i+o)||this.isLiquid(n.x+a,n.y+o)){let s=this.isLiquid(r+a,i+o)?r+a:Math.floor(n.x)+a,c=this.isLiquid(r+a,i+o)?i+o:Math.floor(n.y)+o,l=this.surface(s,c);this.splash(s,l,.3+Math.hypot(n.vx,n.vy)*.2,n.vx,t,e*71);break}}this.stepDrops(t),this.waves=this.waves.filter(e=>t-e.start<Bn*Math.min(1.4,.6+e.amp*.3))}shellPath(e,t,n,r,i,a){let o=Math.max(1,Math.ceil(Math.max(Math.abs(n),Math.abs(r)))),s=this.isLiquid(e,t);for(let c=1;c<=o;c++){let l=Math.floor(e+n*c/o),u=Math.floor(t+r*c/o),d=this.isLiquid(l,u);if(d!==s){let e=Math.hypot(n,r);d?this.splash(l,this.surface(l,u),.3+e*.2,n,i,a*71):r<0&&this.isLiquid(l,u+1)&&this.splash(l,u+1,.3+e*.15,n,i,a*71+5);return}s=d}}tankStep(e,t,n,r,i){let a=-1;for(let e of[0,-4,4])if(this.isLiquid(t+e,n-1)){a=t+e;break}let o=a>=0,c=this.tanks[e];if(this.tanks[e]={x:t,y:n,wet:o},!c||!r)return;let l=n-c.y;if(o&&!c.wet&&Math.abs(t-c.x)<20&&l>=0&&l<40){let r=this.surface(a,n-1),o=.6+l*.5;this.splash(t-5,r,o*.7,-.5,i,e*131),this.splash(t+5,r,o*.7,.5,i,e*131+17)}else if(o&&t!==c.x&&i%3==0){let r=Math.sign(t-c.x),o=this.surface(a,n-1),l=Wn(e*17+t,i),u=this.colorAt(a,o);for(let e=0;e<2;e++){let n=(l>>>e*8&255)/255;this.addDrop(t-r*6,o-1,-r*(.3+n*.6),-(.6+n*.8),30,e?J:s(u,1.35))}i%12==0&&this.addWave(t+r*5,this.surfaceNear(t+r*5,o)<0?o:this.surfaceNear(t+r*5,o),.6,i)}}stepDrops(e){let t=0;for(let n=0;n<this.nDrops;n++){let r=this.dage[n]+1;if(r>=this.dlife[n])continue;let i=this.dvx[n]*.985,a=Math.min(this.dvy[n]+Un,5),o=this.dx[n]+i,s=this.dy[n]+a;if(!(o<0||o>=this.width||s>=this.height)){if(s>=0&&a>0){let t=this.cell(Math.floor(o),Math.floor(s));if(t!==0){if(this.liquid[t]===1&&!(n&7)){let t=Math.floor(o),n=this.surface(t,Math.floor(s));this.open(t,n)&&this.addWave(t,n,.3,e)}continue}}this.dx[t]=o,this.dy[t]=s,this.dvx[t]=i,this.dvy[t]=a,this.dage[t]=r,this.dlife[t]=this.dlife[n],this.dcolor[t]=this.dcolor[n],t++}}this.nDrops=t}drainCues(){if(this.cues.length===0)return qn;let e=this.cues;return this.cues=[],e}draw(e,t){for(let t=0;t<this.nDrops;t++){let n=Math.floor(this.dx[t])+.5,r=Math.floor(this.dy[t])+.5,i=this.dvy[t],a=this.dcolor[t];i>1.6||i<-1.6?e.push(n,r-Math.sign(i)*.5,1,2,a,1):e.push(n,r,1,1,a,1)}for(let n of this.waves)this.drawWave(e,n,t)}drawWave(e,t,n){let r=n-t.start;if(r<0)return;let i=1-r/(Bn*Math.min(1.4,.6+t.amp*.3));if(i<=0)return;let a=s(t.color,1.4),o=s(t.color,.62),c=Math.round(t.amp*2);if(r<6+t.amp*6)for(let r=-c;r<=c;r++){let i=t.x+r,a=this.surfaceNear(i,t.y);if(a<0)continue;let o=Wn(i,Math.floor(n/2));o&1&&e.push(i+.5,a+.5,1,1,J,1),t.amp>1.2&&!(o>>>1&3)&&e.push(i+.5,a-.5,1,1,J,1)}let l=t.amp>=1.6?3:t.amp>=.8?2:1;for(let n=0;n<l;n++){let c=r*zn-n*Vn;if(!(c<1))for(let r=-1;r<=1;r+=2){let{pos:l,hits:u}=Gn(c,r<0?t.left:t.right);if(u>3)continue;let d=t.amp*i*(1-n*.3)*(u===0?1:.5/u);if(d<.15)continue;let f=Math.round(t.x+r*l),p=this.surfaceNear(f,t.y);if(p<0)continue;let m=r*(u&1?-1:1);d>=.45&&e.push(f+.5,p-.5,1,1,d>=1.4?J:a,1),d>=1.2&&this.cell(f-m,p-1)===0&&e.push(f-m+.5,p-.5,1,1,t.color,1),d>=2.2&&this.cell(f,p-2)===0&&e.push(f+.5,p-1.5,1,1,a,1),d>=2.2&&this.cell(f-m,p-1)===0&&e.push(f-m+.5,p-.5,1,1,a,1),e.push(f+.5,p+.5,1,1,d>=.5?a:s(t.color,1.2),1),d>=.5&&this.surfaceNear(f+m,p)===p&&e.push(f+m+.5,p+.5,1,1,s(t.color,1.2),1);for(let t=2;t<=(d>=1.2?3:2);t++){let n=f-m*t;this.surfaceNear(n,p)===p&&e.push(n+.5,p+.5,1,1,o,1)}}}}clear(){this.nDrops=0,this.waves=[],this.shells.clear(),this.tanks=[],this.cues=[]}},qn=[],Jn=[{c2:0,damp:0,decay:0,glint:0},{c2:.3,damp:.985,decay:.992,glint:.06},{c2:.08,damp:.93,decay:.985,glint:.04},{c2:.06,damp:.9,decay:.98,glint:.015}],Yn=4,Xn=48,Zn=4;function Y(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),(n^n>>>15)>>>0}var Qn=class{width;height;colors;kinds=new Uint8Array(256);terrain;sy;kind;mat;h;hn;v;bubbles=[];scanned=-1;any=!1;mult=1;constructor(e,t,n,r,i,a){this.width=e,this.height=t,this.colors=a;for(let e of n)e>0&&e<256&&(this.kinds[e]=1);for(let e of r)e>0&&e<256&&(this.kinds[e]=2);for(let e of i)e>0&&e<256&&(this.kinds[e]=3);this.terrain=new Uint8Array(e*t),this.sy=new Int16Array(e).fill(-1),this.kind=new Uint8Array(e),this.mat=new Uint8Array(e),this.h=new Float32Array(e),this.hn=new Float32Array(e),this.v=new Float32Array(e)}get enabled(){for(let e=1;e<256;e++)if(this.kinds[e])return!0;return!1}setTerrain(e){this.terrain=e,this.scanned=-1}cell(e,t){return e<0||t<0||e>=this.width||t>=this.height?0:this.terrain[t*this.width+e]}heightAt(e){return e>=0&&e<this.width?this.h[e]:0}surfaceAt(e){return e>=0&&e<this.width?this.sy[e]:-1}scan(){let e=this.width,t=this.height,n=this.terrain,r=this.kinds;this.any=!1;for(let i=0;i<e;i++){let a=-1,o=0;for(let s=0;s<t;s++){let t=n[s*e+i];if(o===0&&r[t]!==0){a=s;break}o=t}let s=this.sy[i];if(this.sy[i]=a,a<0){this.kind[i]=0,this.h[i]=0,this.v[i]=0;continue}let c=n[a*e+i];this.mat[i]=c,this.kind[i]=r[c],this.any=!0,(s<0||Math.abs(s-a)>3)&&(this.h[i]=0,this.v[i]=0)}}joined(e,t){if(t<0||t>=this.width)return!1;let n=this.sy[t];return n>=0&&this.kind[t]===this.kind[e]&&Math.abs(n-this.sy[e])<=2}disturb(e,t,n){let r=Math.round(e);if(r<0||r>=this.width)return;let i=this.sy[r];if(i<0||Math.abs(i-t)>4)return;let a=Math.min(Zn,n);this.h[r]=Math.max(-4,this.h[r]-a),this.v[r]=this.v[r]-a*.6;for(let e of[-1,1])this.joined(r,r+e)&&(this.v[r+e]=this.v[r+e]+a*.3)}blast(e,t,n){let r=Math.round(n*1.5+3),i=Math.max(0,Math.round(e-r)),a=Math.min(this.width-1,Math.round(e+r)),o=0,s=0;for(let c=i;c<=a;c++){let i=this.sy[c];if(i<0)continue;let a=c-e,l=i-t,u=Math.sqrt(a*a+l*l);if(u>r)continue;let d=1-u/r,f=(l<0?1:-1)*d*n*.05;this.v[c]=this.v[c]+f,o+=f,s++}if(s>1){let n=o/s;for(let o=i;o<=a;o++){let i=this.sy[o];if(i<0)continue;let a=o-e,s=i-t;a*a+s*s>r*r||(this.v[o]=this.v[o]-n)}}}tick(e,t,n){if((this.scanned<0||e-this.scanned>=Yn)&&(this.scan(),this.scanned=e),!this.any)return;let r=this.width,i=this.h,a=this.hn,o=this.v;for(let n=0;n<r;n++){let r=this.kind[n];if(r===0){a[n]=0;continue}let s=Jn[r],c=i[n],l=this.joined(n,n-1)?i[n-1]:c,u=this.joined(n,n+1)?i[n+1]:c,d=(o[n]+s.c2*(l+u-2*c))*s.damp;if(r===1&&t!==0){let r=Y(n-Math.round(e*t*60),5);r&31||(d+=t*24*(r>>>5&1?1:-1))}o[n]=d;let f=(c+d)*s.decay;f>Zn?f=Zn:f<-4&&(f=-4),a[n]=f}this.h=a,this.hn=i,this.stepBubbles(e,n)}stepBubbles(e,t){if(e%3==0&&this.bubbles.length<Xn){let t=Y(e,11),n=t%this.width,r=this.kind[n];if(r===2||r===3){let i=r===2?.5:.2;(t>>>10&255)/255<i*Math.max(.3,this.mult)&&this.bubbles.push({x:n,start:e,kind:r,size:1+(t>>>20)%3})}}this.bubbles=this.bubbles.filter(n=>{if(e-n.start<(n.kind===2?14+n.size*4:24+n.size*6))return!0;let r=this.sy[n.x];if(r<0)return!1;this.disturb(n.x,r,.4+n.size*.3);let i=Math.round(n.size*(n.kind===2?2:1)*Math.max(.3,this.mult));for(let a=0;a<i;a++){let i=Y(n.x*7+a,e),o=(i&255)/255;n.kind===2?t.add({x:n.x+(i>>>8)%3-1,y:r-n.size-1,vx:(o-.5)*.8,vy:-(.6+(i>>>12&255)/255*1.2),life:24+(i>>>20&31),size:1,color:i>>>16&1?16769136:16742948,kind:N.Ember}):t.add({x:n.x+(i>>>8)%3-1,y:r-n.size-1,vx:(o-.5)*.6,vy:-(.3+(i>>>12&255)/255*.5),life:16+(i>>>20&15),size:1,color:s(this.colors[this.mat[n.x]]??6965802,1.2),kind:N.Chunk})}return!1})}draw(e,t,n){if(!this.any)return;let r=this.width,i=this.h;for(let a=0;a<r;a++){let r=this.kind[a];if(r===0)continue;let o=this.sy[a],c=this.colors[this.mat[a]]??3832008,l=s(c,1.35),u=s(c,.68),d=r===1?15923455:r===2?16773280:s(c,1.6),f=Math.round(i[a]),p=a+.5;if(f>0)for(let t=1;t<=f&&this.cell(a,o-t)===0;t++)e.push(p,o-t+.5,1,1,t===f?l:c,1);else if(f<0)for(let t=0;t<-f&&this.kinds[this.cell(a,o+t)]===r;t++)e.push(p,o+t+.5,1,1,u,1);let m=(this.joined(a,a-1)?i[a-1]:i[a])-(this.joined(a,a+1)?i[a+1]:i[a]);m>.5&&f<=0?e.push(p,o+.5,1,1,l,1):m<-.5&&f>=0&&e.push(p,o+.5,1,1,u,1);let h=Jn[r];if(r===1)(Y(a-(n>>1),3)&1023)/1023<h.glint*.5&&(t.push(p,o+.5,1,1,d,.55),this.joined(a,a+1)&&t.push(p+1,o+.5,1,1,d,.25));else if(r===2){let r=Y(a,n>>3);(r&1023)/1023<h.glint?t.push(p,o+.5,1,1,d,.5):(r>>>10&1023)/1023<h.glint&&e.push(p,o+.5,1,1,u,1)}else(Y(a-(n>>3),7)&1023)/1023<h.glint&&e.push(p,o+.5,1,1,s(c,1.25),1)}for(let r of this.bubbles){let i=this.sy[r.x];if(i<0)continue;let a=n-r.start,o=r.kind===2?14+r.size*4:24+r.size*6,c=Math.min(r.size,1+Math.floor(a/o*(r.size+1))),l=this.colors[this.mat[r.x]]??3832008,u=s(l,r.kind===2?1.5:1.25);for(let t=-c;t<=c;t++){if(!this.joined(r.x,r.x+t))continue;let n=c-Math.abs(t);for(let a=1;a<=n&&this.cell(r.x+t,i-a)===0;a++)e.push(r.x+t+.5,i-a+.5,1,1,a===n&&t<=0?u:l,1)}r.kind===2&&t.push(r.x+.5,i-c+.5,1,1,16773280,.6)}}clear(){this.h.fill(0),this.v.fill(0),this.bubbles=[],this.scanned=-1}},$n=16,er=45,tr=220,nr=4,rr=class{mapW;mapH;vw=1;vh=1;dpr=1;cx=0;cy=0;s=1;fitted=!0;glide=null;vx=0;vy=0;constructor(e,t){this.mapW=e,this.mapH=t,this.cx=e/2,this.cy=t/2}get scale(){return this.s}get isFit(){return this.fitted}fitScale(){let e=Math.min(this.vw/this.mapW,this.vh/this.mapH);return e>=1&&this.dpr<2?Math.floor(e):e}setViewport(e,t,n){this.dpr=n,this.vw=Math.max(1,Math.round(e*n)),this.vh=Math.max(1,Math.round(t*n)),this.fitted?this.fit():this.clamp()}fit(){this.hold(),this.s=this.fitScale(),this.cx=this.mapW/2,this.cy=this.mapH/2,this.fitted=!0}get ox(){return Math.round(this.vw/2-this.cx*this.s)}get oy(){return Math.round(this.vh/2-this.cy*this.s)}zoomBy(e,t){let n=this.fitScale(),r;e>0?r=this.s<1?1:Math.floor(this.s)+e:(r=Math.ceil(this.s)+e,(r<1||r<n)&&(r=n)),this.zoomAround(Math.min($n,r),t)}zoomTo(e,t,n=!0){let r=this.fitScale(),i=Math.max(r,Math.min($n,e));n&&i>=1&&(i=Math.max(r,Math.round(i))),this.zoomAround(i,t)}glideBy(e,t){let n=this.glide?.to??this.s,r=this.fitScale(),i;e>0?i=n<1?1:Math.floor(n)+e:(i=Math.ceil(n)+e,(i<1||i<r)&&(i=r)),this.vx=this.vy=0,this.glide={to:Math.min($n,i),at:t}}settle(e){if(this.dpr>=2||this.s<1||this.fitted)return;let t=Math.max(this.fitScale(),Math.round(this.s));t!==this.s&&(this.glide={to:t,at:e})}fling(e,t){let n=Math.hypot(e,t),r=n>nr?nr/n:1;this.vx=e*r,this.vy=t*r}hold(){this.vx=this.vy=0,this.glide=null}update(e){if(!(e<=0)){if(this.glide){let{to:t,at:n}=this.glide,r=1-Math.exp(-e/er),i=Math.abs(t-this.s)<.01*t?t:this.s+(t-this.s)*r;i===t&&(this.glide=null),this.zoomAround(i,n)}if(this.vx!==0||this.vy!==0){this.pan(this.vx*e,this.vy*e);let t=Math.exp(-e/tr);this.vx*=t,this.vy*=t,Math.hypot(this.vx,this.vy)<.02&&(this.vx=this.vy=0)}}}get moving(){return this.glide!==null||this.vx!==0||this.vy!==0}zoomAround(e,t){let n=t?t.x*this.dpr:this.vw/2,r=t?t.y*this.dpr:this.vh/2,i=(n-this.ox)/this.s,a=(r-this.oy)/this.s;this.s=e,this.cx=i-(n-this.vw/2)/e,this.cy=a-(r-this.vh/2)/e,this.fitted=e===this.fitScale(),this.fitted?this.fit():this.clamp()}pan(e,t){(e!==0||t!==0)&&(this.cx-=e*this.dpr/this.s,this.cy-=t*this.dpr/this.s,this.fitted=!1,this.clamp())}clamp(){this.cx=Math.max(0,Math.min(this.mapW,this.cx)),this.cy=Math.max(0,Math.min(this.mapH,this.cy))}unproject(e){return{x:(e.x*this.dpr-this.ox)/this.s,y:(e.y*this.dpr-this.oy)/this.s}}project(e){return{x:(this.ox+e.x*this.s)/this.dpr,y:(this.oy+e.y*this.s)/this.dpr}}},X=e=>({gravity:0,dragX:1,dragY:1,lift:0,liftFade:0,wind:0,windAge:0,maxFall:0,sway:0,swirl:0,spread:.4,collide:!1,bounce:0,friction:1,siblings:0,...e}),ir=[X({gravity:.6,dragX:.97,dragY:.97,collide:!0,bounce:.45,friction:.75,siblings:3,swirl:.006}),X({gravity:1,dragX:.99,collide:!0,bounce:.3,friction:.55,siblings:2}),X({dragX:.94,dragY:.94,lift:.012,wind:4,collide:!0,friction:.9,swirl:.03}),X({dragX:.9,dragY:.9,lift:.004,swirl:.03}),X({dragX:.92,dragY:.95,lift:.02,wind:3,collide:!0,friction:.85,swirl:.05}),X({gravity:.04,dragX:.95,wind:3,maxFall:.32,sway:.012,collide:!0,friction:0,swirl:.01}),X({dragY:.9,wind:2}),X({gravity:.25,dragX:.93,dragY:.93,collide:!0,bounce:.3,friction:.8,siblings:1,swirl:.01}),X({dragX:.985,dragY:.985,lift:.0036,liftFade:1,wind:.25,windAge:1.1,collide:!0,friction:.9,swirl:.005}),X({dragX:.95,dragY:.95,swirl:.006,spread:.3}),X({gravity:.02,dragX:.97,dragY:.97,lift:.004,liftFade:1,wind:3,swirl:.012,collide:!0,bounce:.2,friction:.5}),X({gravity:.03,dragX:.95,maxFall:.12,wind:3.5,sway:.01,swirl:.008,collide:!0,friction:0}),X({gravity:1,dragX:.9,maxFall:5.5,wind:12,spread:0,collide:!0,bounce:.12,friction:0}),X({gravity:.08,dragX:.96,wind:7,maxFall:.85,sway:.03,collide:!0,friction:0,swirl:.02})],Z=ir.length;function ar(e,t){let n=n=>Math.min(255,Math.round((e>>n&255)*t));return n(16)<<16|n(8)<<8|n(0)}var or={[N.Smoke]:2.2,[N.Dust]:1.4,[N.Plume]:2.4,[N.Flame]:-.3},sr=240,cr=`#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) in vec4 a_dyn;  // x, y, vx, vy
layout(location = 1) in vec3 a_stat; // spawn tick, life, size
layout(location = 2) in uint a_ck;   // kind << 24 | rgb
uniform float u_tick;
uniform float u_gravity;
uniform float u_wind;
uniform vec4 u_kA[${Z}]; // gravity, dragX, dragY, lift
uniform vec4 u_kB[${Z}]; // liftFade, wind, windAge, maxFall
uniform vec4 u_kC[${Z}]; // sway, collide, bounce, friction
uniform vec4 u_kD[${Z}]; // swirl, spread
// value noise and its curl: a divergence-free swirl field drifting with time
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float psi(vec2 p, float t) {
  return noise(p * 0.07 + vec2(t * 0.004, -t * 0.006)) + 0.5 * noise(p * 0.16 - vec2(t * 0.009, 0.0));
}
vec2 curl(vec2 p, float t) {
  const float e = 0.75;
  float dx = psi(p + vec2(e, 0.0), t) - psi(p - vec2(e, 0.0), t);
  float dy = psi(p + vec2(0.0, e), t) - psi(p - vec2(0.0, e), t);
  return vec2(dy, -dx) / (2.0 * e) * 14.0;
}
uniform usampler2D u_terrain;
uniform ivec2 u_map;
out vec4 v_dyn;
bool solid(vec2 p) {
  ivec2 c = ivec2(floor(p));
  if (c.x < 0 || c.x >= u_map.x || c.y < 0) return false;
  if (c.y >= u_map.y) return true;
  return texelFetch(u_terrain, c, 0).r != 0u;
}
void main() {
  float age = u_tick - a_stat.x;
  if (age <= 0.0 || age >= a_stat.y) { v_dyn = a_dyn; return; }
  int k = int((a_ck >> 24u) & 127u);
  bool mote = (a_ck & 0x80000000u) != 0u;
  vec4 A = u_kA[k];
  vec4 B = u_kB[k];
  vec4 C = u_kC[k];
  vec4 D = u_kD[k];
  // motes are single cells of a broken-up puff: lighter, so the swirl carries them further
  if (mote) D.x *= 2.5;
  float t = age / a_stat.y;
  // each particle a little different, so a burst spreads instead of moving as one sheet
  float h = hash(vec2(float(gl_VertexID), a_stat.x)) - 0.5;
  A.w *= 1.0 + h * D.y * 2.0;
  A.yz = 1.0 - (1.0 - A.yz) * (1.0 + h * D.y);
  vec2 p = a_dyn.xy;
  vec2 v = a_dyn.zw;
  v.y += u_gravity * A.x;
  v *= A.yz;
  v.y -= A.w * (1.0 - B.x * t);
  v.x += u_wind * (B.y + B.z * t);
  if (B.w > 0.0) v.y = min(v.y, B.w);
  if (C.x > 0.0) v.x += sin(age * 0.11 + float(gl_VertexID) * 1.7) * C.x;
  // swirl grows as smoke ages and spreads into bigger eddies
  if (D.x > 0.0) v += curl(p, u_tick) * D.x * (0.4 + t);
  vec2 q = p + v;
  // terrain: only from open air, so bits spawned inside fresh rubble still fly out
  if (C.y > 0.5 && solid(q) && !solid(p)) {
    float bounce = C.z;
    float fr = C.w;
    if (!solid(vec2(q.x, p.y))) {
      // hit a floor or ceiling: slide along it, bounce off it
      q = vec2(p.x + v.x * fr, p.y);
      if (solid(q)) q = p;
      v.x *= fr;
      v.y = abs(v.y) * bounce > 0.12 ? -v.y * bounce : 0.0;
    } else if (!solid(vec2(p.x, q.y))) {
      // hit a wall
      q = vec2(p.x, q.y);
      v.x = -v.x * bounce;
      v.y *= fr;
    } else {
      q = p;
      v = -v * bounce;
    }
  }
  v_dyn = vec4(q, v);
}`,lr=`#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`,ur=`#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_dyn;
layout(location = 1) in vec3 a_stat;
layout(location = 2) in uint a_ck;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_tick;
uniform int u_pass; // 0 normal blend, 1 additive
out vec2 v_local;
out vec4 v_color;
flat out int v_shape;
flat out vec3 v_blob;
flat out vec4 v_seg;
vec3 unpack(uint c) {
  return vec3(float((c >> 16u) & 255u), float((c >> 8u) & 255u), float(c & 255u)) / 255.0;
}
vec3 shade(vec3 c, float k) { return min(vec3(1.0), floor(c * 255.0 * k + 0.5) / 255.0); }
// colour fades: life stepped into n hard tones, each particle crossing a step at a slightly
// different moment, so a fade shows as pixels flipping colour rather than a smooth blend
float stepT(float t, float th, float n) {
  return clamp(floor((t + (th - 0.5) * 0.18) * n) / (n - 1.0), 0.0, 1.0);
}
vec3 ramp3(vec3 a, vec3 b, vec3 c, float x) {
  return floor((x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, x * 2.0 - 1.0)) * 31.0 + 0.5) / 31.0;
}
const vec3 EMBER = vec3(1.0, 0.52, 0.16);
const vec3 SOOT = vec3(0.21, 0.18, 0.19);
void main() {
  float age = u_tick - a_stat.x;
  float life = a_stat.y;
  float s = a_stat.z;
  int k = int((a_ck >> 24u) & 127u);
  bool mote = (a_ck & 0x80000000u) != 0u;
  uint rgb = a_ck & 0xffffffu;
  vec3 col = unpack(rgb);
  float t = age / life;
  // a mote's own threshold: as a cloud thins, motes wink out one by one (hard pixels, no alpha)
  float th = fract(sin(float(gl_InstanceID) * 12.9898 + a_stat.x * 78.233) * 43758.5453);
  vec2 cell = floor(a_dyn.xy) + 0.5;
  vec2 pos = cell;
  vec2 size = vec2(1.0);
  float alpha = 1.0;
  int shape = 0;
  bool show = age >= 0.0 && age < life;
  v_seg = vec4(0.0);
  if (mote) {
    float cover = 1.0;
    if (k == ${N.Plume}) {
      int band = min(4, int(t * 5.0));
      if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
      cover = band < 3 ? 1.0 : band == 3 ? 0.55 : 0.3;
      show = show && u_pass == 0;
    } else if (k == ${N.Flame}) {
      int band = min(3, int(t * 4.0 + th * 0.6));
      float x = stepT(t, th, 7.0);
      // white-hot, yellow, orange, red, ember, soot
      col = x < 0.5 ? ramp3(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.8, 0.25), vec3(1.0, 0.45, 0.1), x * 2.0)
                    : ramp3(vec3(1.0, 0.45, 0.1), vec3(0.72, 0.16, 0.06), SOOT, x * 2.0 - 1.0);
      cover = band == 3 ? 0.7 : 1.0;
      if (u_pass == 1) {
        show = show && band < 2;
        col = vec3(1.0, 0.816, 0.376);
        alpha = 0.35;
      }
    } else if (k == ${N.Chunk}) {
      show = show && u_pass == 0;
      cover = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
      // grains leave the blast glowing and cool to their own colour
      col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
    } else if (k == ${N.Cloud}) {
      show = show && u_pass == 0;
      cover = t < 0.6 ? 1.0 : (1.0 - t) / 0.4;
      // each mote cools on its way out of the fireball
      col = mix(col, SOOT, stepT(t, th, 5.0) * 0.65);
    } else {
      show = show && u_pass == 0;
      bool smoke = k == ${N.Smoke};
      cover = (smoke ? 1.1 : 0.9) * (1.0 - t) * min(1.0, t * 6.0 + 0.2);
      // smoke: ember-lit at the blast, its own grey, then pale as it thins; dust just pales
      float x = stepT(t, th, 6.0);
      col = smoke ? ramp3(mix(col, EMBER, 0.6), col, shade(col, 1.4), min(1.0, x * 1.4))
                  : mix(col, shade(col, 1.3), x);
    }
    show = show && th < cover;
  } else if (k == ${N.Ember}) {
    // flickers: each ember blinks off now and then, on its own beat
    float fl = fract(sin(floor(age / 3.0) * 7.13 + th * 91.7) * 4375.85);
    show = show && fl > 0.18;
    col = ramp3(vec3(1.0, 0.92, 0.55), vec3(1.0, 0.55, 0.12), vec3(0.62, 0.12, 0.04), stepT(t, th, 6.0));
    if (u_pass == 0) {
      // a dark-red body under the glow, so it reads on bright skies too
      col *= 0.7;
      show = show && t < 0.85;
    } else {
      alpha = t < 0.7 ? 0.9 : (1.0 - t) / 0.3 * 0.9;
    }
  } else if (k == ${N.Rain}) {
    show = show && u_pass == 0;
    float sp = length(a_dyn.zw);
    if (a_dyn.w > 1.0) {
      // falling: a streak back along its path. Three depths: far drops are short and faint,
      // near ones long and bright, so the sheet of rain has some air in it
      float depth = th < 0.45 ? 0.0 : th < 0.85 ? 1.0 : 2.0;
      vec2 tail = floor(a_dyn.xy - a_dyn.zw * (0.4 + depth * 0.4)) + 0.5;
      v_seg = vec4(cell, tail);
      pos = (cell + tail) * 0.5;
      size = abs(cell - tail) + 1.0;
      shape = 7;
      alpha = depth == 0.0 ? 0.3 : depth == 1.0 ? 0.55 : 0.9;
      col = depth == 2.0 ? min(vec3(1.0), col * 1.15 + 0.08) : col;
    } else if (sp > 0.25) {
      // the splash: a lit droplet hopping back up
      col = min(vec3(1.0), col * 1.3 + 0.12);
      alpha = 0.85;
    } else show = false; // settled: gone
  } else if (k == ${N.Ash}) {
    show = show && u_pass == 0 && th < (t < 0.75 ? 1.0 : (1.0 - t) / 0.25);
    col = mix(col, shade(col, 1.5), stepT(t, th, 4.0));
  } else if (k == ${N.Spark}) {
    show = show && u_pass == 1;
    alpha = t < 0.6 ? 1.0 : (1.0 - t) / 0.4;
    // white-hot, its own colour, then a dull red as it dies
    col = ramp3(vec3(1.0, 1.0, 0.86), col, vec3(0.62, 0.13, 0.05), stepT(t, th, 6.0));
    // a short pixel trail back along its path, longer the faster it flies
    vec2 tail = floor(a_dyn.xy - a_dyn.zw * 2.5) + 0.5;
    if (any(greaterThan(abs(tail - cell), vec2(0.5)))) {
      v_seg = vec4(cell, tail);
      pos = (cell + tail) * 0.5;
      size = abs(cell - tail) + 1.0;
      shape = 7;
    }
  } else if (k == ${N.Glitter}) {
    show = show && u_pass == 1;
    if (t > 0.55 && ((int(age) + int(rgb & 7u)) & 2) == 0) show = false;
    size = vec2(s);
    alpha = t < 0.55 ? 1.0 : 0.85;
    // a white flash, its colour, then deeper as it burns out
    col = ramp3(vec3(1.0), col, col * 0.5, stepT(t, th, 5.0));
  } else if (k == ${N.Snow} || k == ${N.Flake}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.8 ? 0.95 : (1.0 - t) / 0.2;
  } else if (k == ${N.Streak}) {
    show = show && u_pass == 0;
    float len = max(2.0, floor(s + 0.5));
    pos = vec2(floor(a_dyn.x) + len * 0.5, cell.y);
    size = vec2(len, 1.0);
    alpha = t < 0.2 ? 0.3 : t < 0.75 ? 0.62 : 0.3;
  } else if (k == ${N.Chunk}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
    col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
  } else if (k == ${N.Plume}) {
    show = show && u_pass == 0;
    int band = min(4, int(t * 5.0));
    size = vec2(floor(s * (1.0 + t * 2.4) + 0.5));
    if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
    bool solidBlob = band < 3 && age >= 6.0;
    shape = solidBlob ? 5 : 4;
    alpha = solidBlob ? 1.0 : (band == 3 ? 0.55 : band == 4 ? 0.3 : 0.6);
  } else if (k == ${N.Flame}) {
    int band = min(3, int(t * 4.0));
    float sz = max(1.0, floor(s * (1.0 - t * 0.6) + 0.5));
    if (u_pass == 0) {
      col = band == 0 ? vec3(1.0, 0.941, 0.627)
          : band == 1 ? vec3(1.0, 0.627, 0.125)
          : band == 2 ? vec3(0.878, 0.29, 0.063)
          : vec3(0.227, 0.165, 0.149);
      size = vec2(sz);
      alpha = band == 3 ? 0.7 : 1.0;
      shape = 4;
    } else {
      show = show && band < 2;
      col = vec3(1.0, 0.816, 0.376);
      size = vec2(max(1.0, sz - 2.0));
      alpha = 0.5;
    }
  } else {
    // smoke and dust: soft dithered puffs that grow as they thin
    show = show && u_pass == 0;
    bool smoke = k == ${N.Smoke};
    float grow = smoke ? 1.0 + t * 2.2 : 1.0 + t * 1.4;
    pos = a_dyn.xy;
    size = vec2(s * grow);
    alpha = (smoke ? 0.5 : 0.42) * (1.0 - t) * min(1.0, t * 6.0 + 0.2);
    shape = 4;
  }
  if (!show || alpha <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_local = vec2(0.0);
    v_color = vec4(0.0);
    v_shape = 0;
    v_blob = vec3(0.0);
    return;
  }
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 l = corner - 0.5;
  v_local = l * 2.0;
  v_color = vec4(col, alpha);
  v_shape = shape;
  v_blob = vec3(pos, size.x * 0.5);
  vec2 px = u_origin + (pos + l * size) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;function dr(e,t,n){let r=e.createProgram();for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(!t)throw Error(`createShader failed`);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw Error(`shader compile failed: ${e.getShaderInfoLog(t)??``}`);e.attachShader(r,t),e.deleteShader(t)}if(e.transformFeedbackVaryings(r,[`v_dyn`],e.INTERLEAVED_ATTRIBS),e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw Error(`program link failed: ${e.getProgramInfoLog(r)??``}`);return r}var Q=16,$=16,fr=class{density;cap;tick=0;passes=0;head=0;tail=0;count=0;death;lastDeath=0;pendStart=0;pendCount=0;dyn;statF;statU;gl;dynBuf;statBuf;updVao;drawVao;tf;updProg;drawProg;uUpd={};uDraw={};cur=0;constructor(e,t,n=1){this.density=n,this.gl=e,this.cap=t,this.dyn=new Float32Array(t*4),this.death=new Float32Array(t);let r=new ArrayBuffer(t*Q);this.statF=new Float32Array(r),this.statU=new Uint32Array(r),this.updProg=dr(e,cr,lr),this.drawProg=O(e,ur,te);for(let t of[`u_tick`,`u_gravity`,`u_wind`,`u_kA`,`u_kB`,`u_kC`,`u_kD`,`u_terrain`,`u_map`])this.uUpd[t]=e.getUniformLocation(this.updProg,t);for(let t of[`u_view`,`u_origin`,`u_scale`,`u_tick`,`u_pass`])this.uDraw[t]=e.getUniformLocation(this.drawProg,t);let i=new Float32Array(Z*4),a=new Float32Array(Z*4),o=new Float32Array(Z*4),s=new Float32Array(Z*4);ir.forEach((e,t)=>{i.set([e.gravity,e.dragX,e.dragY,e.lift],t*4),a.set([e.liftFade,e.wind,e.windAge,e.maxFall],t*4),o.set([e.sway,+!!e.collide,e.bounce,e.friction],t*4),s.set([e.swirl,e.spread,0,0],t*4)}),e.useProgram(this.updProg),e.uniform4fv(this.uUpd.u_kA,i),e.uniform4fv(this.uUpd.u_kB,a),e.uniform4fv(this.uUpd.u_kC,o),e.uniform4fv(this.uUpd.u_kD,s);let c=(t,n)=>{let r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,t,n),r};this.dynBuf=[c(t*$,e.DYNAMIC_COPY),c(t*$,e.DYNAMIC_COPY)],this.statBuf=c(t*Q,e.DYNAMIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,null);let l=(t,n)=>{let r=e.createVertexArray();return e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,t),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,$,0),e.vertexAttribDivisor(0,n),e.bindBuffer(e.ARRAY_BUFFER,this.statBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,Q,0),e.vertexAttribDivisor(1,n),e.enableVertexAttribArray(2),e.vertexAttribIPointer(2,1,e.UNSIGNED_INT,Q,12),e.vertexAttribDivisor(2,n),e.bindVertexArray(null),e.bindBuffer(e.ARRAY_BUFFER,null),r};this.updVao=[l(this.dynBuf[0],0),l(this.dynBuf[1],0)],this.drawVao=l(this.dynBuf[0],1),this.tf=e.createTransformFeedback()}get n(){return this.count}add(e){if(or[e.kind]&&e.size>=2){this.motes(e);return}if(e.kind===N.Chunk&&e.size>=2){this.grains(e);return}this.put(e.x,e.y,e.vx,e.vy,e.life,e.size,e.kind,e.color);let t=Math.round((ir[e.kind]?.siblings??0)*this.density);for(let n=0;n<t;n++){let t=this.rand()*.5+.75,n=this.rand()*.5+.75;this.put(e.x+this.rand()-.5,e.y+this.rand()-.5,e.vx*t+(this.rand()-.5)*.3,e.vy*n+(this.rand()-.5)*.3,e.life*(.55+this.rand()*.45),Math.max(1,e.size-1),e.kind,e.color)}}motes(e){let t=or[e.kind],n=e.size/2,r=Math.max(4,Math.min(64,Math.round(e.size*e.size*.7*Math.max(.3,this.density)))),i=n*t/Math.max(1,e.life);for(let t=0;t<r;t++){let t=this.rand()*6.283185,r=Math.sqrt(this.rand()),a=Math.cos(t)*r,o=Math.sin(t)*r;this.put(e.x+a*n,e.y+o*n,e.vx+a*i+(this.rand()-.5)*.04,e.vy+o*i+(this.rand()-.5)*.04,e.life*(.7+this.rand()*.3),1,e.kind|128,e.color);let s=this.rand();e.kind===N.Flame&&s<.1?this.put(e.x+a*n,e.y+o*n,e.vx*.6+(this.rand()-.5)*.5,e.vy*.6-.2-this.rand()*.3,80+this.rand()*90,1,N.Ember,16760896):(e.kind===N.Smoke||e.kind===N.Plume)&&s<.05&&this.put(e.x+a*n,e.y+o*n,e.vx*.5+(this.rand()-.5)*.2,e.vy*.5-this.rand()*.15,200+this.rand()*120,1,N.Ash,ar(e.color,.62))}}grains(e){let t=Math.min(6,Math.round(e.size)),n=t/2;for(let r=0;r<t;r++)for(let i=0;i<t;i++){let t=this.rand(),a=t<.25?.82:t>.8?1.16:1;this.put(e.x-n+i+.5,e.y-n+r+.5,e.vx+(this.rand()-.5)*.14,e.vy+(this.rand()-.5)*.14,e.life*(.75+this.rand()*.25),1,N.Chunk|128,ar(e.color,a))}}seed=2654435769;rand(){let e=this.seed=this.seed+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}put(e,t,n,r,i,a,o,s){let c=this.head;this.head=c+1===this.cap?0:c+1,this.count===this.cap?this.tail=this.head:this.count++,this.death[c]=this.tick+i;let l=c*4;this.dyn[l]=e,this.dyn[l+1]=t,this.dyn[l+2]=n,this.dyn[l+3]=r,this.statF[l]=this.tick,this.statF[l+1]=i,this.statF[l+2]=a,this.statU[l+3]=(o&255)<<24|s&16777215,this.tick+i>this.lastDeath&&(this.lastDeath=this.tick+i),this.pendCount===0&&(this.pendStart=c),this.pendCount<this.cap&&this.pendCount++}step(e,t){if(this.gravity=e,this.wind=t,this.tick++,this.tick>=this.lastDeath){this.clear();return}let n=this.death;for(;this.count>0&&n[this.tail]<=this.tick;)this.tail=this.tail+1===this.cap?0:this.tail+1,this.count--;this.passes++}gravity=0;wind=0;upload(){if(this.pendCount===0)return;let e=this.gl,t=(t,n)=>{e.bindBuffer(e.ARRAY_BUFFER,this.dynBuf[this.cur]),e.bufferSubData(e.ARRAY_BUFFER,t*$,this.dyn,t*4,n*4),e.bindBuffer(e.ARRAY_BUFFER,this.statBuf),e.bufferSubData(e.ARRAY_BUFFER,t*Q,this.statF,t*4,n*4)};if(this.pendCount>=this.cap)t(0,this.cap);else{let e=Math.min(this.pendCount,this.cap-this.pendStart);t(this.pendStart,e),e<this.pendCount&&t(0,this.pendCount-e)}e.bindBuffer(e.ARRAY_BUFFER,null),this.pendCount=0}update(e,t,n){let r=Math.min(this.passes,sr);if(this.passes=0,r===0||this.count===0)return;let i=this.segments(),a=this.gl;a.useProgram(this.updProg),a.activeTexture(a.TEXTURE9),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(this.uUpd.u_terrain,9),a.uniform2i(this.uUpd.u_map,t,n),a.uniform1f(this.uUpd.u_gravity,this.gravity),a.uniform1f(this.uUpd.u_wind,this.wind),a.enable(a.RASTERIZER_DISCARD),a.bindTransformFeedback(a.TRANSFORM_FEEDBACK,this.tf);let o=this.tick-r+1;for(let e=0;e<r;e++){let t=this.cur,n=+(t===0);a.uniform1f(this.uUpd.u_tick,o+e),a.bindVertexArray(this.updVao[t]);for(let e=0;e<i.length;e+=2){let t=i[e],r=i[e+1];a.bindBufferRange(a.TRANSFORM_FEEDBACK_BUFFER,0,this.dynBuf[n],t*$,r*$),a.beginTransformFeedback(a.POINTS),a.drawArrays(a.POINTS,t,r),a.endTransformFeedback(),a.bindBufferBase(a.TRANSFORM_FEEDBACK_BUFFER,0,null)}this.cur=n}a.bindTransformFeedback(a.TRANSFORM_FEEDBACK,null),a.disable(a.RASTERIZER_DISCARD),a.bindVertexArray(null),a.activeTexture(a.TEXTURE0)}draw(e,t,n,r,i,a){if(this.upload(),this.update(e,t,n),this.count===0)return;let o=this.gl,s=this.segments();o.useProgram(this.drawProg),o.uniform2f(this.uDraw.u_view,r[0],r[1]),o.uniform2f(this.uDraw.u_origin,i[0],i[1]),o.uniform1f(this.uDraw.u_scale,a),o.uniform1f(this.uDraw.u_tick,this.tick),o.bindVertexArray(this.drawVao),o.enable(o.BLEND);for(let e=0;e<2;e++){e===0?o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA):o.blendFunc(o.ONE,o.ONE),o.uniform1i(this.uDraw.u_pass,e);for(let e=0;e<s.length;e+=2)this.pointDraw(this.dynBuf[this.cur],s[e]),o.drawArraysInstanced(o.TRIANGLES,0,6,s[e+1])}o.disable(o.BLEND),o.bindVertexArray(null),o.bindBuffer(o.ARRAY_BUFFER,null)}segments(){let e=this.tail+this.count;return e<=this.cap?[this.tail,this.count]:[this.tail,this.cap-this.tail,0,e-this.cap]}pointDraw(e,t){let n=this.gl;n.bindBuffer(n.ARRAY_BUFFER,e),n.vertexAttribPointer(0,4,n.FLOAT,!1,$,t*$),n.bindBuffer(n.ARRAY_BUFFER,this.statBuf),n.vertexAttribPointer(1,3,n.FLOAT,!1,Q,t*Q),n.vertexAttribIPointer(2,1,n.UNSIGNED_INT,Q,t*Q+12)}clear(){this.head=0,this.tail=0,this.count=0,this.passes=0,this.pendCount=0,this.lastDeath=this.tick}dispose(){let e=this.gl;e.deleteBuffer(this.dynBuf[0]),e.deleteBuffer(this.dynBuf[1]),e.deleteBuffer(this.statBuf);for(let t of[...this.updVao,this.drawVao])e.deleteVertexArray(t);e.deleteTransformFeedback(this.tf),e.deleteProgram(this.updProg),e.deleteProgram(this.drawProg)}},pr=[34,72,118,168],mr=150,hr=.14,gr=[1906971,2761766,3813428],_r=[16773280,16752672,14699024,9054736];function vr(e){let t=e[0]?.length??0;for(let n=0;n<e.length;n++){let r=0,i=e[n];for(let e=0;e<i.length;e++)i.charCodeAt(e)!==46&&r++;if(r*4>=t*3)return n}return 0}function yr(e,t,n,r,i,a,o){let s=e.sprite,c=s[0]?.length??0,l=s.length,u=vr(s),d=[],f=[];for(let e=0;e<l;e++){let n=s[e];for(let r=0;r<c;r++){let i=n.charCodeAt(r);if(i===46)continue;let a={dx:r-(c>>1),dy:e-l,rgb:t(i)};(e<u?f:d).push(a)}}let p=e.barrel,m=a*Math.PI/180,h=p.width>>1;for(let e=1;e<=p.length;e++){let t=Math.round(p.x+Math.cos(m)*e),n=Math.round(-p.y-Math.sin(m)*e);for(let r=0;r<p.width;r++)for(let i=0;i<p.width;i++)f.push({dx:t-h+r,dy:n-h+i,rgb:e===p.length?11051672:14209736})}let g=0,_=0,v=0;for(let e=0;e<u;e++){let t=s[e];for(let n=0;n<c;n++)t.charCodeAt(n)!==46&&(g+=n-(c>>1),_+=e-l,v++)}let y=v>0?Math.round(g/v):0,b=v>0?Math.round(_/v):-l,x=0;for(let e of f)x=Math.max(x,Math.abs(e.dx-y),Math.abs(e.dy-b));let S=2*x+1,C=new Int32Array(S*S).fill(-1);for(let e of f)C[(e.dy-b+x)*S+e.dx-y+x]=e.rgb;let w=Math.max(1,Math.min(3,Math.ceil(u/2))),T=new j(Math.imul(o+1,2654435761)^Math.imul(n+11,40503)^r),E=Math.cos(m)>=0?-1:1,D=T.next()<.25?-E:E;return{player:n,start:o,hull:d,w:c,h:l-u,turret:C,reach:x,tx:r+y,ty:i+b,vx:D*T.range(.5,1.3),vy:-T.range(3.2,4.2),spin:0,rate:D*T.range(.18,.32),foot:w,rest:!1,gone:!1,rng:T}}function br(e,t,n,r,i,a,o,s){let c=t-e.start;if(e.gone||xr(e,c,i,a,s),c>=0&&c<420){let t=c/420,i=(1-t)*(1-t)*1.6*o+.15,s=Math.floor(i);e.rng.next()<i-s&&s++;for(let i=0;i<s;i++){let i=n+Math.round(e.rng.range(-.45,.45)*e.w);a.add({x:i+.5,y:r-e.h-e.rng.range(0,1.5),vx:e.rng.range(-.12,.12),vy:-e.rng.range(.25,.6),life:e.rng.range(16,32)*(1-t*.5),size:e.rng.range(1.5,3.2)*(1-t*.4),color:0,kind:N.Flame})}c%5==0&&a.add({x:n+e.rng.range(-3,3),y:r-e.h-4,vx:0,vy:-e.rng.range(.25,.45),life:e.rng.range(80,120),size:e.rng.range(4,6)*(1-t*.5),color:e.rng.next()<.5?1972764:3024938,kind:N.Smoke})}let l=pr.indexOf(c);if(l<0)return;let u=l===pr.length-1;return{x:n+Math.round(e.rng.range(-.35,.35)*e.w),y:r-e.h+1,radius:u?9:5+l,big:u}}function xr(e,t,n,r,i){if(t<0)return;let a=(t,r)=>n(Math.round(t),Math.round(r)+e.foot+1);if(e.rest){if(!a(e.tx,e.ty))e.rest=!1;else return}e.vy=Math.min(e.vy+hr,5);let o=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))));for(let t=0;t<o;t++){let t=e.tx+e.vx/o;n(Math.round(t)+Math.sign(e.vx)*e.foot,Math.round(e.ty))?e.vx=-e.vx*.4:e.tx=t;let i=e.ty+e.vy/o;if(e.vy>0&&a(e.tx,i)){for(e.ty=Math.round(i);a(e.tx,e.ty-1)&&e.ty>0;)e.ty--;if(e.vy<1.2){e.rest=!0,e.vx=0,e.vy=0,e.spin=Math.round(e.spin/Math.PI)*Math.PI,e.rate=0;return}e.vy=-e.vy*.35,e.vx*=.6,e.rate*=.5;for(let t=0;t<4;t++)r.add({x:e.tx,y:e.ty+e.foot,vx:e.rng.range(-.8,.8),vy:-e.rng.range(.4,1.2),life:e.rng.range(10,22),size:1,color:e.rng.next()<.4?16773280:16742938,kind:N.Spark});break}e.vy<0&&n(Math.round(e.tx),Math.round(i)-e.foot)?e.vy=0:e.ty=i}e.spin+=e.rate,e.ty>i+16&&(e.gone=!0),t%2==0&&r.add({x:e.tx,y:e.ty,vx:0,vy:-.08,life:50,size:2+ +(t%4==0),color:3024938,kind:N.Smoke}),t<50&&r.add({x:e.tx+e.rng.range(-1,1),y:e.ty+e.rng.range(-1,1),vx:e.rng.range(-.4,.4),vy:e.rng.range(-.2,.4),life:e.rng.range(8,16),size:1,color:e.rng.next()<.5?16773280:16752672,kind:N.Spark})}function Sr(e,t,n){let r=Math.imul(e+1,73856093)^Math.imul(t+1,19349663)^Math.imul(n+1,83492791);return r^=r>>>13,r=Math.imul(r,1540483477),(r^r>>>15)>>>0}function Cr(e,t,n,r,i){let a=Math.max(0,i-t.start),o=a<420?1-a/420:0,c=a<840?1-a/840:0,l=Math.floor(i/4);for(let i of t.hull){let a=n+i.dx,u=r+i.dy,d=Sr(a,u,l),f=i.dy+t.h,p=gr[(d>>>8)%3];f>=1&&f<=2&&!(d>>>12&7)&&(p=s(i.rgb,.35));let m=(d&255)/255;o>0&&f<=2&&m<.35*o?p=_r[Math.min(3,Math.floor((1-o)*3+m*4))]:c>0&&m<.06*c&&(p=_r[3]),e.rect(a,u,1,1,p)}}function wr(e,t,n){if(t.gone)return;let r=n-t.start;if(r<0)return;let i=Math.min(1,r/mr),a=i<.34?.85:.5,o=Math.cos(t.spin),c=Math.sin(t.spin),l=Math.round(t.tx),u=Math.round(t.ty),d=Math.floor(n/4),f=t.reach,p=2*f+1,m=Math.ceil(f*1.42);for(let n=-m;n<=m;n++)for(let r=-m;r<=m;r++){let m=Math.round(r*o+n*c),h=Math.round(-r*c+n*o);if(m<-f||m>f||h<-f||h>f)continue;let g=t.turret[(h+f)*p+m+f];if(g<0)continue;let _=l+r,v=u+n,y=Sr(r,n,t.player),b=i<.67||!(y&7)?s(g,i<.67?a:.35):gr[(y>>>8)%3];i<1&&(Sr(_,v,d)&255)<50*(1-i)&&(b=_r[1+(d&1)]),e.rect(_,v,1,1,b)}}var Tr={1:[2,6,2,2,7],2:[6,1,2,4,7],3:[6,1,2,1,6],4:[5,5,7,1,1],5:[7,4,6,1,6],6:[3,4,6,5,2],7:[7,1,2,2,2],8:[2,5,2,5,2],9:[2,5,3,1,6]},Er=65536,Dr=[`u_size`,`u_map`,`u_top`,`u_bottom`,`u_cloud`,`u_boil`,`u_cloudLight`,`u_cloudShadow`,`u_ranges`,`u_rangeCount`,`u_horizon`,`u_cam`],Or=600,kr=2048,Ar=.12,jr=8380671,Mr={sprite:[`......HHHH......`,`.....hhhhhh.....`,`....hhhhhhhh....`,`.HHHHHHHHHHHHHH.`,`.hhhhhhhhhhhhhh.`,`.dhhhhhhhhhhhhd.`,`tttttttttttttttt`,`twwttwwttwwttwwt`,`tttttttttttttttt`],barrel:{x:0,y:7,length:8,width:1}},Nr=[`......ccwwwcc......`,`...cccwwcccwwccc...`,`.ccwwcccwwwcccwwcc.`,`cccwwcccwwwcccwwccc`,`cccwwcccwwwcccwwccc`,`d.d.d.d.d.d.d.d.d.d`],Pr=[[-9,-6],[-4,-2],[4,2],[9,6]],Fr=45;function Ir(e,t,n){switch(e){case 72:return s(t,1.3);case 100:return s(t,.72);case 116:return 2827810;case 119:return 5591114;case 109:return 14209736;case 115:return n?jr:4872800;case 103:return 10473696;default:return t}}var Lr=3,Rr=40,zr=140,Br=[.62,.8,.96,1.12],Vr=180,Hr=class{mapWidth;mapHeight;camera;gl;canvas;unsubscribe;theme=n;baseTheme=n;weather=void 0;temperature=15;deathZone=0;zoneGrewAt=-1e9;zoneFrom=0;stormKind=`snow`;stormK=-1;themeStep=0;quality=`medium`;palette;shakeOn=!0;terrainTex;coatTex;grassTex;grassMask;grassRound=-1;burnTex;burn;lastBurn=-1;wreckY=[];wrecks=[];wreckV=[];colorTex;colorFbo;bgProg;sceneryProg;uScn;sceneryTex;sceneryFbo;sceneryW=0;sceneryH=0;sceneryKey=``;uBg;lookTex;lookFlags=new Uint8Array(256);anyCycle=!1;anyHot=!1;lights=new p;lightTmp=[0,0,0];heat=new Uint8Array;heatTex;heatOn=!1;flameCells=new Int32Array(kr);flameN=0;coating=new Uint8Array;dirty=[0,0,0,0];paletteTex;sceneTex;sceneFbo;sceneW=0;sceneH=0;terrainProg;postProg;emptyVao;uTer;uPost;normal;additive;particles;fluid;liquid;fx;water;onCues;terrain;entities=[];meteors=new Map;zones=[];probe;debris={count:0,x:new Int32Array,y:new Int32Array,vx:new Int32Array,material:new Uint8Array};wind=0;cloudX=0;horizon=-1;rangeBuf=new Float32Array(9);lastTick=0;fxTick=-1;trails=[];rippleBuf=new Float32Array(32);rippleW=new Float32Array(8);shieldHitAt=[];shieldUpAt=[];batteryAt=[];constructor(e,t){this.mapWidth=e,this.mapHeight=t,this.camera=new rr(e,t),this.terrain=new Uint8Array(e*t),this.grassMask=new Uint8Array(e*t),this.burn=new Uint32Array(e*t),this.probe={width:e,height:t,solid:(n,r)=>n>=0&&r>=0&&n<e&&r<t&&this.terrain[r*e+n]!==0,liquid:(e,t)=>this.water.isLiquid(e,t)}}mount(e,t,n){this.canvas=e;let i=e.getContext(`webgl2`,{antialias:!1,alpha:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,preserveDrawingBuffer:n.preserveDrawingBuffer??!1,powerPreference:`high-performance`});if(!i)throw Error(`WebGL2 is not available`);this.gl=i,this.palette=n.palette,this.baseTheme=r(n.theme,n.palette.themes),this.theme=this.baseTheme,this.shakeOn=n.shake??!0,this.onCues=n.onCues,this.water=new Kn(this.mapWidth,this.mapHeight,n.palette.liquids??[],n.palette.materials),this.liquid=new Qn(this.mapWidth,this.mapHeight,n.palette.liquids??[],n.palette.hotLiquids??[],n.palette.heavyLiquids??[],n.palette.materials),this.water.listener=this.liquid,this.terrainProg=O(i,E,D),this.uTer=re(i,this.terrainProg,[`u_view`,`u_origin`,`u_scale`,`u_map`,`u_terrain`,`u_coat`,`u_palette`,`u_grain`,`u_light`,`u_wet`,`u_snow`,`u_look`,`u_grass`,`u_ground`,`u_flowers`,`u_grassMask`]),this.bgProg=O(i,C,w),this.uBg=re(i,this.bgProg,`u_color.u_view.u_origin.u_scale.u_map.u_top.u_bottom.u_letterbox.u_flash.u_white.u_vignette.u_terrain.u_coat.u_look.u_palette.u_time.u_haze.u_anim.u_stars.u_starColor.u_scenery.u_grass.u_grassMask.u_burn.u_burnOn.u_lightCount.u_lights.u_lightCol.u_heat.u_heatOn`.split(`.`)),this.sceneryProg=O(i,C,T),this.uScn=re(i,this.sceneryProg,Dr),this.postProg=O(i,C,ne),this.uPost=re(i,this.postProg,[`u_scene`,`u_view`,`u_shake`,`u_rippleCount`,`u_ripple`,`u_rippleW`,`u_tint`,`u_origin`,`u_scale`,`u_split`,`u_scan`,`u_wob`]),this.emptyVao=i.createVertexArray(),i.pixelStorei(i.UNPACK_ALIGNMENT,1),this.terrainTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,this.terrain),this.coatTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,new Uint8Array(this.mapWidth*this.mapHeight)),this.grassTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,this.grassMask),this.burnTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.R32UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_INT,this.burn),this.heat=new Uint8Array(this.mapWidth*this.mapHeight).fill(255),this.heatTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.R8UI,this.mapWidth,this.mapHeight,0,i.RED_INTEGER,i.UNSIGNED_BYTE,this.heat),this.paletteTex=k(i),this.lookTex=k(i),this.uploadPalette(),this.colorTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,this.mapWidth,this.mapHeight,0,i.RGBA,i.UNSIGNED_BYTE,null),this.sceneryW=Math.ceil(this.mapWidth/2),this.sceneryH=Math.ceil(this.mapHeight/2),this.sceneryTex=k(i),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,this.sceneryW,this.sceneryH,0,i.RGBA,i.UNSIGNED_BYTE,null),this.sceneryFbo=i.createFramebuffer(),i.bindFramebuffer(i.FRAMEBUFFER,this.sceneryFbo),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,this.sceneryTex,0),this.colorFbo=i.createFramebuffer(),i.bindFramebuffer(i.FRAMEBUFFER,this.colorFbo),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,this.colorTex,0),i.bindFramebuffer(i.FRAMEBUFFER,null),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.sceneTex=k(i,i.LINEAR),this.sceneFbo=i.createFramebuffer(),this.normal=new ae(i),this.additive=new ae(i),this.setQuality(n.quality),this.unsubscribe=t.subscribe(e=>this.push(e)),this.resize(e.clientWidth||e.width,e.clientHeight||e.height,1)}uploadPalette(){let e=this.gl,t=new Uint8Array(1024);for(let e=0;e<256;e++){let n=this.palette.materials[e]??0;t[e*4]=n>>16&255,t[e*4+1]=n>>8&255,t[e*4+2]=n&255,t[e*4+3]=255}e.bindTexture(e.TEXTURE_2D,this.paletteTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,1,0,e.RGBA,e.UNSIGNED_BYTE,t);let n=new Uint8Array(9216);for(let e of this.palette.looks??[]){if(e.cell<=0||e.cell>255)continue;let t=Math.min(8,e.cycle.length);n[e.cell*4]=t>=2?t:0,this.lookFlags[e.cell]=(t>=2||e.glint?1:0)|(e.hot?2:0)|(e.flames?4:0),n[e.cell*4+1]=Math.max(1,Math.min(255,e.ticks)),n[e.cell*4+2]=e.hot?255:e.glint?96:0,n[e.cell*4+3]=e.topsoil?255:e.char?128:0;for(let r=0;r<t;r++){let t=((1+r)*256+e.cell)*4,i=e.cycle[r];n[t]=i>>16&255,n[t+1]=i>>8&255,n[t+2]=i&255,n[t+3]=255}}e.bindTexture(e.TEXTURE_2D,this.lookTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,9,0,e.RGBA,e.UNSIGNED_BYTE,n)}setQuality(e){this.quality=e;let t=Mt[e],n=this.particles,r=t.cap,i=bn[e];n&&n.cap===r||(n?.dispose(),this.fluid?.dispose(),this.particles=new fr(this.gl,r,t.mult),this.fluid=new jn(this.gl,this.mapWidth,this.mapHeight,i.div,i.iters),this.fx=new Pt(this.particles,this.fluid,{width:this.mapWidth,height:this.mapHeight,material:(e,t)=>e<0||t<0||e>=this.mapWidth||t>=this.mapHeight?0:this.terrain[t*this.mapWidth+e],color:e=>this.palette.materials[e]??8018490,grass:(e,t)=>this.grassMask[t*this.mapWidth+e]!==0})),this.fx.mult=t.mult,this.water.mult=t.mult,this.liquid.mult=t.mult}setTheme(e){this.baseTheme=r(e,this.palette.themes),this.applyTheme()}resize(e,t,n){this.camera.setViewport(e,t,n);let r=this.camera.vw,i=this.camera.vh;if(this.canvas.width!==r&&(this.canvas.width=r),this.canvas.height!==i&&(this.canvas.height=i),r!==this.sceneW||i!==this.sceneH){let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.sceneTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,r,i,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,this.sceneFbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.sceneTex,0),e.bindFramebuffer(e.FRAMEBUFFER,null),this.sceneW=r,this.sceneH=i}}unproject(e){return this.camera.unproject(e)}project(e){return this.camera.project(e)}push(e){let t=this.gl;if(e.dirtyRects.length>0){t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.pixelStorei(t.UNPACK_ROW_LENGTH,e.width);for(let n of e.dirtyRects){if(n.w<=0||n.h<=0)continue;t.pixelStorei(t.UNPACK_SKIP_PIXELS,n.x),t.pixelStorei(t.UNPACK_SKIP_ROWS,n.y),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.terrain),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.coating),t.bindTexture(t.TEXTURE_2D,this.terrainTex);let r=this.dirty,i=r[0]>=r[2];r[0]=Math.max(0,Math.min(i?1/0:r[0],n.x-16)),r[1]=Math.max(0,Math.min(i?1/0:r[1],n.y-1)),r[2]=Math.min(this.mapWidth,Math.max(i?-1/0:r[2],n.x+n.w+16)),r[3]=Math.min(this.mapHeight,Math.max(i?-1/0:r[3],n.y+n.h+32))}t.pixelStorei(t.UNPACK_ROW_LENGTH,0),t.pixelStorei(t.UNPACK_SKIP_PIXELS,0),t.pixelStorei(t.UNPACK_SKIP_ROWS,0)}this.terrain=e.terrain,this.water.setTerrain(e.terrain),this.liquid.setTerrain(e.terrain),this.coating=e.coating;let n=Math.floor(e.turn/1e3);(this.grassRound<0||n!==this.grassRound&&e.dirtyRects.some(t=>t.x===0&&t.y===0&&t.w>=e.width&&t.h>=e.height))&&e.width===this.mapWidth&&e.height===this.mapHeight&&(this.grassRound=n,Gr(e.terrain,e.width,e.height,this.grassMask),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.texSubImage2D(t.TEXTURE_2D,0,0,0,e.width,e.height,t.RED_INTEGER,t.UNSIGNED_BYTE,this.grassMask),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.burn.fill(0),this.lastBurn=-1,this.uploadBurn(0,0,e.width,e.height),this.wreckY=[],this.wreckV=[],this.wrecks=[],this.clearRoundFx()),(e.tick%20==0||this.fxTick<0)&&this.scanLooks(),this.horizon<0&&(this.horizon=Wr(e.terrain,e.width,e.height)),this.entities=e.entities,this.zones=[];for(let t of e.entities)t.kind===`zone`&&this.zones.push(t);this.witherGrass(),this.debris=e.debris,this.wind=e.wind,this.temperature=e.temperature??15;let r=e.deathZone??0;if(r>this.deathZone?(this.zoneFrom=this.shownZone(e.tick),this.zoneGrewAt=e.tick):r<this.deathZone&&(this.zoneFrom=r),this.deathZone=r,this.stormK<0){let e=Pn(this.temperature);this.stormKind=e.kind,this.stormK=e.k,this.applyTheme()}for((e.weather?.id??``)!==(this.weather?.id??``)&&(this.weather=e.weather,this.applyTheme(),this.dirty=[0,0,this.mapWidth,this.mapHeight]),this.lastTick=e.tick,this.fxTick<0&&(this.fxTick=e.tick);this.fxTick<e.tick;)this.stepFx();for(let t of e.effectEvents)this.fx.handle(t),t.type===`flash`?(this.water.blast(t),this.liquid.blast(t.x,t.y,t.radius),(t.params.strength??1)>0&&this.scorch(t.x,t.y,t.radius,t.tick)):t.type===`geyser`?this.scorch(t.x,t.y,t.radius*1.8,t.tick):t.type===`tsunami`&&this.scour(t.x,t.params.dir??1,(t.params.len??0)+12),t.type===`tankDeath`&&this.startWreck(t.params.player??-1,t.tick),t.type===`shieldHit`?this.shieldHitAt[t.params.player??-1]=t.tick:t.type===`shieldUp`?this.shieldUpAt[t.params.player??-1]=t.tick:t.type===`battery`&&(this.batteryAt[t.params.player??-1]=t.tick);this.fx.lances.track(e.entities,e.tick),this.tagStars(),this.updateTrails(e);let i=this.water.drainCues();i.length>0&&this.onCues?.(i)}clearRoundFx(){this.trails=[],this.particles.clear(),this.fluid.clear(),this.fx.clear(),this.water.clear(),this.liquid.clear(),this.meteors.clear(),this.starColor=new Map,this.shieldHitAt=[],this.shieldUpAt=[],this.batteryAt=[]}tagStars(){let e=this.palette.shells;if(!e)return;let t=this.starColor,n=null;for(let r of this.entities){if(r.kind!==`projectile`||e[r.weapon]?.shell!==`star`)continue;n??=new Map;let i=t.get(r.id);if(i===void 0){let e=this.fx.fireworkColor(r.x,this.fxTick,!0);i=e<0?16764992:e}n.set(r.id,i)}this.starColor=n??(t.size>0?new Map:t)}witherGrass(){let e=this.grassMask,t=this.mapWidth,n=this.mapHeight,r=t,i=n,a=0,o=0;for(let s of this.zones){let c=s.puffs;if(!c||c.length===0||s.look!==`toxic`)continue;let l=Math.round((s.puffRadius??8)*Math.min(1,.3+(s.age??1e3)/50));for(let s=0;s<c.length;s+=2){let u=c[s],d=c[s+1],f=Math.max(0,d-l),p=Math.min(n-1,d+4);for(let n=Math.max(0,u-l);n<=Math.min(t-1,u+l);n++){let s=n-u;for(let c=f;c<=p;c++){let u=c*t+n;if(e[u]!==1)continue;let f=Math.max(0,d-c);s*s+f*f>l*l||(e[u]=2,n<r&&(r=n),n>a&&(a=n),c<i&&(i=c),c>o&&(o=c))}}}}if(r>a)return;let s=this.gl;s.bindTexture(s.TEXTURE_2D,this.grassTex),s.pixelStorei(s.UNPACK_ROW_LENGTH,t),s.pixelStorei(s.UNPACK_SKIP_PIXELS,r),s.pixelStorei(s.UNPACK_SKIP_ROWS,i),s.texSubImage2D(s.TEXTURE_2D,0,r,i,a-r+1,o-i+1,s.RED_INTEGER,s.UNSIGNED_BYTE,e),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0);let c=this.dirty,l=c[0]>=c[2];c[0]=Math.max(0,Math.min(l?1/0:c[0],r-1)),c[1]=Math.max(0,Math.min(l?1/0:c[1],i-1)),c[2]=Math.min(t,Math.max(l?-1/0:c[2],a+2)),c[3]=Math.min(n,Math.max(l?-1/0:c[3],o+34))}scour(e,t,n){let r=t>0?e-n:e-2,i=t>0?e+2:e+n,a=Math.max(0,Math.floor(r)),o=Math.min(this.mapWidth,Math.ceil(i)+1);if(a>=o)return;let s=this.mapWidth;for(let e=0;e<this.mapHeight;e++)this.grassMask.fill(0,e*s+a,e*s+o);let c=this.gl;c.bindTexture(c.TEXTURE_2D,this.grassTex),c.pixelStorei(c.UNPACK_ROW_LENGTH,s),c.pixelStorei(c.UNPACK_SKIP_PIXELS,a),c.pixelStorei(c.UNPACK_SKIP_ROWS,0),c.texSubImage2D(c.TEXTURE_2D,0,a,0,o-a,this.mapHeight,c.RED_INTEGER,c.UNSIGNED_BYTE,this.grassMask),c.pixelStorei(c.UNPACK_ROW_LENGTH,0),c.pixelStorei(c.UNPACK_SKIP_PIXELS,0);let l=this.dirty,u=l[0]>=l[2];l[0]=u?a:Math.min(l[0],a),l[1]=0,l[2]=u?o:Math.max(l[2],o),l[3]=this.mapHeight}scorch(e,t,n,r){let i=Math.ceil(n*1.15)+2,a=this.mapWidth,o=Math.max(0,Math.floor(e-i)),s=Math.max(0,Math.floor(t-i)),c=Math.min(a,Math.ceil(e+i)+1),l=Math.min(this.mapHeight,Math.ceil(t+i)+1);if(o>=c||s>=l)return;let u=i*i,d=r+1,f=this.burn;for(let n=s;n<l;n++){let r=n-t;for(let t=o;t<c;t++){let i=t-e;i*i+r*r<=u&&(f[n*a+t]=d)}}this.lastBurn=Math.max(this.lastBurn,r),this.uploadBurn(o,s,c-o,l-s)}uploadBurn(e,t,n,r){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.burnTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,this.mapWidth),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,t),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.texSubImage2D(i.TEXTURE_2D,0,e,t,n,r,i.RED_INTEGER,i.UNSIGNED_INT,this.burn),i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0)}restRow(e,t){let n=this.mapWidth,r=this.terrain;for(let i=Math.max(0,Math.floor(t));i<this.mapHeight;i++){let t=i*n;for(let a=Math.max(0,e-7);a<Math.min(n,e+7);a++)if(r[t+a]!==0)return i}return this.mapHeight+12}stepWrecks(){for(let e of this.entities){if(e.kind!==`tank`)continue;let t=e.player;if(e.alive){this.wreckY[t]=NaN;continue}let n=this.wreckY[t]??NaN;Number.isNaN(n)&&(n=e.y,this.wreckV[t]=0);let r=this.restRow(e.x,n);if(n<r){let e=Math.min((this.wreckV[t]??0)+.2,4);this.wreckV[t]=e,n=Math.min(n+e,r)}else this.wreckV[t]=0;this.wreckY[t]=n}}startWreck(e,t){for(let n of this.entities){if(n.kind!==`tank`||n.player!==e)continue;let r=n.tank&&this.palette.tanks?.[n.tank]||Mr,a=i(e);this.wrecks[e]=yr(r,e=>Ir(e,a,!1),e,n.x,n.y,n.angle,t)}}stepDeaths(){let e=this.fxTick;for(let t of this.entities){if(t.kind!==`tank`||t.alive)continue;let n=this.wrecks[t.player];if(!n)continue;let r=br(n,e,t.x,this.tankY(t),(e,t)=>this.probe.solid(e,t),this.particles,this.fx.mult,this.mapHeight);r&&this.fx.cookOff(r.x,r.y,r.radius,r.big,e)}}tankY(e){if(e.alive)return e.y;let t=this.wreckY[e.player];return t===void 0||Number.isNaN(t)?e.y:Math.floor(t)}scanLooks(){let e=this.lookFlags,t=0,n=this.terrain;for(let r=0;r<n.length;r++)t|=e[n[r]];let r=this.coating;for(let n=0;n<r.length;n++)t|=e[r[n]];if(this.anyCycle=!!(t&1),this.anyHot=!!(t&2),this.scanHeat(!!(t&6)),this.flameN=0,!(t&4))return;let i=this.mapWidth;for(let t=i;t<n.length&&this.flameN<kr;t++)e[n[t]]&4&&n[t-i]===0&&(this.flameCells[this.flameN++]=t)}scanHeat(e){if(!e&&!this.heatOn)return;let t=this.mapWidth,n=this.mapHeight;if(this.heatOn=e&&x(this.terrain,this.coating,this.lookFlags,t,n,this.heat),!this.heatTex)return;let r=this.gl;r.bindTexture(r.TEXTURE_2D,this.heatTex),r.texSubImage2D(r.TEXTURE_2D,0,0,0,t,n,r.RED_INTEGER,r.UNSIGNED_BYTE,this.heat)}feedFluid(){let e=this.fluid;if(e.ok)for(let t of this.zones)(t.look===`gas`||t.look===`toxic`)&&e.splat(t.x,t.y,t.radius*.8,this.wind*20,0,0,0,.06);e.step(this.wind)}stepFlames(){let e=this.flameN;if(e===0)return;let t=this.mapWidth,n=this.terrain,r=this.lookFlags,i=Mt[this.quality].mult,a=Math.min(e,Math.round((4+e/6)*i)),o=Math.imul(this.fxTick+1,2654435761)>>>0,s=t,c=0,l=this.mapHeight,u=0,d=!1,f=.4+(Math.imul((this.fxTick>>5)+1,1597334677)>>>0)/4294967296*1.2,p=this.wind*50*f;for(let i=0;i<a;i++){o=Math.imul(o^o>>>15,2246822519)+2654435769>>>0;let i=this.flameCells[o%e];if(!(r[n[i]]&4)||n[i-t]!==0)continue;let a=i%t+.5,m=Math.floor(i/t),h=o>>>8&255,g=i%t,_=this.fxTick+1;for(let e=-1;e<=3;e++){let n=m+e;if(!(n<0||n>=this.mapHeight))for(let e=-1;e<=1;e++){let r=g+e;if(r<0||r>=t)continue;let i=n*t+r;this.burn[i]=_,this.grassMask[i]!==0&&(this.grassMask[i]=0,d=!0)}}g-1<s&&(s=g-1),g+2>c&&(c=g+2),m-1<l&&(l=Math.max(0,m-1)),m+4>u&&(u=m+4),this.particles.add({x:a,y:m-1,vx:((h&15)-7.5)*.02+p,vy:(-.3-(h>>4)*.04)*(.7+f*.4),life:8+(h&7)+(f>1.2?3:0),size:1+(h&1)+(h>>7&1),color:0,kind:N.Flame}),(h&3)==2&&this.fluid.splat(a,m-2,5,0,-.4,.22,.5),(h&3)==1&&(h>>2)%3<(f>1?2:1)&&this.particles.add({x:a+(h>>2&3)-1.5,y:m-3,vx:p*.6+(h>>4&3)*.1-.15,vy:-.5-(h>>6&3)*.2,life:30+(h&31),size:1,color:h&8?16740400:16765024,kind:N.Ember}),h&7||this.particles.add({x:a,y:m-2,vx:((h&15)-7.5)*.04,vy:-.9-(h>>5)*.05,life:18,size:1,color:16760896,kind:N.Spark}),h&15||this.particles.add({x:a,y:m-6,vx:this.wind*.08,vy:-.35,life:70,size:3+(h&3),color:2761768,kind:N.Smoke})}if(c>s){let e=Math.max(0,s),n=Math.min(t,c),r=Math.min(this.mapHeight,u);if(this.lastBurn=Math.max(this.lastBurn,this.fxTick),this.uploadBurn(e,l,n-e,r-l),d){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.grassTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,t),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,l);let a=n-e,o=r-l;i.texSubImage2D(i.TEXTURE_2D,0,e,l,a,o,i.RED_INTEGER,i.UNSIGNED_BYTE,this.grassMask),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0);let s=this.dirty,c=s[0]>=s[2];s[0]=Math.max(0,Math.min(c?1/0:s[0],e-16)),s[1]=Math.max(0,Math.min(c?1/0:s[1],l-1)),s[2]=Math.min(t,Math.max(c?-1/0:s[2],n+16)),s[3]=Math.min(this.mapHeight,Math.max(c?-1/0:s[3],r+32))}}}stepMeteors(e){let t=this.meteorLive;t.clear();for(let n of this.entities){if(n.kind!==`projectile`)continue;let r=e[n.weapon];if(r?.shell!==`meteor`)continue;t.add(n.id);let i=this.meteors.get(n.id);if(!i){this.meteors.set(n.id,{x:n.x,y:n.y,dx:0,dy:0});continue}let a=n.x-i.x,o=n.y-i.y,s=i.x,c=i.y;if(i.x=n.x,i.y=n.y,o<=0||o>24||Math.abs(a)>24){i.dx=0,i.dy=0;continue}if(i.dx=a,i.dy=o,n.y<-8)continue;let l=r.size??1,u=Math.max(1,Math.ceil(Math.max(Math.abs(a),o)/1.5)),d=Mt[this.quality].mult,f=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n.id+1,40503))>>>0;for(let e=0;e<u;e++){f=Math.imul(f^f>>>15,2246822519)+2654435769>>>0;let t=e/u;this.particles.add({x:s+a*t+((f&3)-1.5)*.6*l,y:c+o*t+((f>>>2&3)-1.5)*.6*l,vx:-a*.03,vy:-o*.03-.15,life:(12+(f>>>4&15))*(.7+l*.3),size:Math.round((2+(f>>>8&1))*l),color:0,kind:N.Flame}),!(f>>>9&3)&&d>.4&&this.particles.add({x:s+a*t,y:c+o*t,vx:-a*.12+((f>>>12&15)-7.5)*.06,vy:-o*.12-.2,life:14+(f>>>16&15),size:1,color:f>>>20&1?16769136:16747040,kind:N.Spark})}(!(f>>>24&1)||l>1)&&this.particles.add({x:s-a*.5,y:c-o*.5,vx:this.wind*.06,vy:-.05,life:110+(f>>>25&63),size:Math.round((3+(f>>>26&3))*l),color:f>>>28&1?2761768:4866116,kind:N.Smoke})}for(let e of[...this.meteors.keys()])t.has(e)||this.meteors.delete(e)}meteorLive=new Set;starColor=new Map;applyTheme(){let e=Math.round(Math.max(0,this.stormK)*8)/8;this.themeStep=e*(this.stormKind===`sand`?1:-1),this.theme=o(a(this.baseTheme,this.weather),this.stormKind===`sand`?e:0,this.stormKind===`snow`?e:0),this.dirty=[0,0,this.mapWidth,this.mapHeight]}stepStorm(){let e=Pn(this.temperature),t=Math.max(0,this.stormK);e.kind!==this.stormKind&&t>0?this.stormK=Math.max(0,t-.01):(this.stormKind=e.kind,this.stormK=t<e.k?Math.min(e.k,t+.008):Math.max(e.k,t-.008),Math.round(this.stormK*8)/8*(this.stormKind===`sand`?1:-1)!==this.themeStep&&this.applyTheme())}stepFx(){this.stepStorm(),this.particles.step(Ar,this.wind),this.stepWrecks(),this.stepDeaths(),this.cloudX+=.012+this.wind*.004,zt(this.particles,this.theme,this.fxTick,this.wind,this.probe,this.fx.mult),this.fx.wind=this.wind,this.fx.tick(this.fxTick),this.water.tick(this.entities,this.fxTick),this.liquid.tick(this.fxTick,this.wind,this.particles),this.stepFlames(),this.feedFluid();let e=this.palette.shells;if(e){this.stepMeteors(e);for(let t of this.entities){if(t.kind!==`projectile`)continue;let n=e[t.weapon]?.shell,r=Math.imul(this.fxTick+1,2654435761)^Math.imul(t.id+1,40503);if(n===`mud`)(r>>>20)%3==0&&this.particles.add({x:t.x+(r>>>4&1)-.5,y:t.y+1.5,vx:0,vy:.1,life:14+(r>>>12&7),size:1,color:r>>>8&1?5917748:8022600,kind:N.Chunk});else if(n===`firework`)this.particles.add({x:t.x+(r>>>4&1)-.5,y:t.y+1.5,vx:((r>>>8&7)-3.5)*.06,vy:.25+(r>>>12&3)*.08,life:8+(r>>>16&7),size:1,color:r>>>20&1?16765024:16774864,kind:N.Spark}),(r>>>24)%5==0&&this.particles.add({x:t.x,y:t.y+2,vx:0,vy:0,life:30,size:2,color:9077904,kind:N.Smoke});else if(n===`star`){if(r>>>20&1){let e=this.starColor.get(t.id)??16764992;this.particles.add({x:t.x,y:t.y,vx:0,vy:.02,life:14+(r>>>12&7),size:1,color:(r>>>8)%3==0?16777215:e,kind:N.Glitter})}}else if(n===void 0||n===`spark`){let n=this.trails.find(e=>e.id===t.id),i=n&&!Number.isNaN(n.lx)?t.x-n.lx:0,a=n&&!Number.isNaN(n.ly)?t.y-n.ly:0,o=Math.hypot(i,a)>2?2:1;for(let n=0;n<o;n++){let o=Math.imul(r+n*97,2246822519)>>>0||1;this.particles.add({x:t.x+((o>>>4&3)-1.5)*.5,y:t.y+((o>>>8&3)-1.5)*.5,vx:-i*.12+((o>>>12&7)-3.5)*.05,vy:-a*.12+((o>>>16&7)-3.5)*.05,life:6+(o>>>20&7),size:1,color:(o>>>24)%3==0?16777215:e[t.weapon]?.trailColor??16756816,kind:N.Spark})}}else n===`fire`&&this.particles.add({x:t.x+(r>>>4&3)-1.5,y:t.y+(r>>>8&3)-1.5,vx:0,vy:-.2,life:10+(r>>>12&7),size:2+(r>>>16&1),color:0,kind:N.Flame})}}if(e){let t=Math.min(this.fx.heatAt(this.fxTick),L.length-1);for(let n of this.entities){if(n.kind!==`projectile`||e[n.weapon]?.shell!==`ricochet`)continue;let r=(Math.imul(this.fxTick+7,2654435761)^Math.imul(n.id+3,40503))>>>0,i=1+(t>>1);for(let e=0;e<i;e++)r=Math.imul(r^r>>>15,2246822519)+2654435769>>>0,this.particles.add({x:n.x+(r>>>4&3)-1.5,y:n.y+(r>>>8&3)-1.5,vx:((r>>>12&15)-7.5)*.04,vy:((r>>>16&15)-7.5)*.04,life:8+(r>>>20&7)+t*2,size:1,color:r&3?L[t]:16777215,kind:N.Spark})}}if(this.fxTick%9==0)for(let e of this.entities){if(e.kind!==`tank`||e.alive)continue;let t=(this.fxTick*31+e.player*17)%13;this.particles.add({x:e.x-3+t%6,y:this.tankY(e)-5,vx:0,vy:-.2,life:70,size:3+t%3,color:3814456,kind:N.Smoke})}this.fxTick++}updateTrails(e){for(let e of this.trails)e.live=!1;let t=this.palette.shells;for(let n of e.entities){if(n.kind!==`projectile`||this.fx.lances.owns(n.x,n.y))continue;let r=t?.[n.weapon];if(r?.trail===!1)continue;let i=this.trails.find(e=>e.id===n.id);if(!i){this.trails=this.trails.filter(t=>t.turn===e.turn);let t=r?.trailColor??-1;i={id:n.id,turn:e.turn,lx:NaN,ly:NaN,cells:[],color:t,live:!0},this.trails.push(i)}i.live=!0,!Number.isNaN(i.lx)&&Math.abs(i.lx-n.x)<=e.width/2?(this.graze(i,n.id,n.x,n.y,e.tick),Kr(i.cells,i.lx,i.ly,n.x,n.y)):Kr(i.cells,n.x,n.y,n.x,n.y),i.lx=n.x,i.ly=n.y}}graze(e,t,n,r,i){let a=n-e.lx,o=r-e.ly,c=Math.hypot(a,o);if(c<.5)return;let l=Math.floor(n),u=Math.floor(r),d=this.probe;if(d.solid(l,u))return;let f=0,p=0,m=0;for(let e=-2;e<=2;e++)for(let t=-2;t<=2;t++)t===0&&e===0||!d.solid(l+t,u+e)||(f-=t,p-=e,m++);if(m===0)return;let h=Math.hypot(f,p);if(h<1e-6||(f/=h,p/=h,-(a*f+o*p)/c>.75))return;let g=e.color<0?this.theme.trail:e.color,_=this.palette.materials[this.groundCellNear(l,u)]??8018490,v=(Math.imul(i+13,2654435761)^Math.imul(t+5,40503))>>>0,y=Math.min(6,2+m/4)*this.fx.mult;for(let e=0;e<y;e++){v=Math.imul(v^v>>>15,2246822519)+2654435769>>>0;let e=.5+(v>>>4&15)*.06,t=.15+(v>>>8&15)*.03,i=((v>>>12&15)-7.5)*.05,s=v>>>16&7;this.particles.add({x:n-f*.5,y:r-p*.5,vx:f*e+a/c*t*c-p*i,vy:p*e+o/c*t*c+f*i,life:6+(v>>>20&7),size:1,color:s<2?16777215:s<5?16767072:g,kind:N.Spark})}v>>>24&1&&this.particles.add({x:n-f,y:r-p,vx:f*.6+a/c*.3,vy:p*.6-.4,life:14+(v>>>26&7),size:1,color:s(_,.8+(v>>>28&3)*.1),kind:N.Chunk})}groundCellNear(e,t){let n=this.mapWidth;for(let r=1;r<=2;r++)for(let i=-r;i<=r;i++)for(let a=-r;a<=r;a++){let r=e+a,o=t+i;if(r<0||o<0||r>=n||o>=this.mapHeight)continue;let s=this.terrain[o*n+r];if(s!==0)return s}return 0}shownZone(e){let t=Math.min(1,Math.max(0,(e-this.zoneGrewAt)/Vr)),n=t*t*(3-2*t);return this.zoneFrom+(this.deathZone-this.zoneFrom)*n}render(e,t=0){let n=this.gl;this.fx.held=t;let r=this.camera,i=r.vw,a=r.vh,o=r.scale,s=r.ox,c=r.oy,l=[i,a],u=[s,c],d=this.theme,f=Math.max(e,this.lastTick),p=this.quality!==`low`,m=0;if(p)for(let e of this.fx.ripples){if(m>=8)break;let t=(f-e.start)/e.dur;t<0||t>1||(this.rippleBuf[m*4]=s+e.x*o,this.rippleBuf[m*4+1]=c+e.y*o,this.rippleBuf[m*4+2]=e.maxR*Math.sqrt(t)*o,this.rippleBuf[m*4+3]=e.strength*(1-t),this.rippleW[m]=e.column?-e.width*o:e.width*o*(.7+.6*t),m++)}let[h,g]=this.shakeOn?this.fx.shake(f):[0,0],_=Math.round(h)*o,v=Math.round(g)*o,y=this.fx,b=an(f,d.flicker),x=y.sky,S=Math.max(y.skyFlash,b),C=p?Math.round(y.split)*o:0,w=d.scanlines,T=m>0||_!==0||v!==0||S>0||C>0||w>0;this.shadeTerrain(),this.paintScenery((i/2-s)/o,(a/2-c)/o),this.fluid.update(this.terrainTex),n.bindFramebuffer(n.FRAMEBUFFER,T?this.sceneFbo:null),n.viewport(0,0,i,a),n.disable(n.BLEND),n.bindVertexArray(this.emptyVao),n.useProgram(this.bgProg),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,this.colorTex),n.uniform1i(this.uBg.u_color,0),n.uniform2f(this.uBg.u_view,i,a),n.uniform2f(this.uBg.u_origin,s,c),n.uniform1f(this.uBg.u_scale,o),n.uniform2f(this.uBg.u_map,this.mapWidth,this.mapHeight),n.uniform3fv(this.uBg.u_top,A(d.skyTop)),n.uniform3fv(this.uBg.u_bottom,A(d.skyBottom)),n.uniform3fv(this.uBg.u_letterbox,A(d.letterbox)),n.uniform3f(this.uBg.u_flash,x[0]+b*.55,x[1]+b*.6,x[2]+b*.75),n.uniform1f(this.uBg.u_white,y.whiteout(f)*(this.shakeOn?1:.4)),n.uniform1f(this.uBg.u_vignette,this.quality===`low`?0:d.vignette),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,this.terrainTex),n.activeTexture(n.TEXTURE2),n.bindTexture(n.TEXTURE_2D,this.coatTex),n.activeTexture(n.TEXTURE3),n.bindTexture(n.TEXTURE_2D,this.lookTex),n.activeTexture(n.TEXTURE4),n.bindTexture(n.TEXTURE_2D,this.paletteTex),n.activeTexture(n.TEXTURE5),n.bindTexture(n.TEXTURE_2D,this.sceneryTex),n.activeTexture(n.TEXTURE6),n.bindTexture(n.TEXTURE_2D,this.grassTex),n.activeTexture(n.TEXTURE7),n.bindTexture(n.TEXTURE_2D,this.burnTex),n.activeTexture(n.TEXTURE8),n.bindTexture(n.TEXTURE_2D,this.heatTex),n.activeTexture(n.TEXTURE0),n.uniform1i(this.uBg.u_heat,8),n.uniform1f(this.uBg.u_heatOn,+!!this.heatOn),this.lights.clear(),this.fx.collectLights(this.lights,f),n.uniform1i(this.uBg.u_lightCount,this.lights.count),n.uniform4fv(this.uBg.u_lights,this.lights.pos),n.uniform3fv(this.uBg.u_lightCol,this.lights.col),n.uniform1i(this.uBg.u_grassMask,6),n.uniform1i(this.uBg.u_burn,7),n.uniform1f(this.uBg.u_burnOn,+(this.lastBurn>=0&&f-this.lastBurn<Or)),n.uniform1i(this.uBg.u_terrain,1),n.uniform1i(this.uBg.u_coat,2),n.uniform1i(this.uBg.u_look,3),n.uniform1i(this.uBg.u_palette,4),n.uniform1f(this.uBg.u_time,f);let E=this.lastBurn>=0&&f-this.lastBurn<420;n.uniform1f(this.uBg.u_haze,p&&(this.anyHot||E)?1:0),n.uniform1f(this.uBg.u_anim,+!!this.anyCycle),n.uniform1f(this.uBg.u_stars,d.ambient.kind===`stars`?Math.min(.05,d.ambient.density/6e3):0),n.uniform3fv(this.uBg.u_starColor,A(d.ambient.color)),n.uniform1i(this.uBg.u_scenery,5),n.uniform4f(this.uBg.u_grass,...A(d.grass<0?0:d.grass),d.grass<0?0:1),n.drawArrays(n.TRIANGLES,0,3);let D=this.fx.mult;Bt(this.normal,this.additive,this.zones,f,this.probe,D),this.drawTrails(),this.fx.drawFunnels(this.normal,this.additive,f),this.fx.drawPosts(this.normal,f),this.drawDebris(),this.fx.drawChunks(this.normal),this.drawMines(f),this.drawTanks(f),this.fx.drawGoo(this.normal,f),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),this.normal.flush(l,u,o),n.blendFunc(n.ONE,n.ONE),this.additive.flush(l,u,o),n.disable(n.BLEND),this.fluid.draw(this.terrainTex,l,u,o),this.particles.draw(this.terrainTex,this.mapWidth,this.mapHeight,l,u,o),this.liquid.draw(this.normal,this.additive,f),this.water.draw(this.normal,f),this.fx.drawMushrooms(this.normal,this.additive,f),this.fx.drawVortices(this.normal,this.additive,f),this.fx.drawMagnets(this.normal,this.additive,f),this.drawProjectiles(),this.fx.drawGlows(this.additive,f),this.fx.drawBolts(this.additive,f),this.fx.lances.draw(this.additive,f),this.fx.ions.draw(this.additive,f),this.fx.drawCrystals(this.additive,f),Rt(this.normal,this.additive,d,f,this.wind,this.probe,D),Ln(this.normal,this.stormKind,this.stormK,f,this.wind,this.probe,D),yn(this.normal,this.shownZone(f),f,{width:this.mapWidth,height:this.mapHeight,x0:-s/o,x1:(i-s)/o,y0:-c/o,y1:(a-c)/o},Math.max(0,1-(f-this.zoneGrewAt)/Vr)),p||this.fx.drawRippleRings(this.additive,f),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),this.normal.flush(l,u,o),n.blendFunc(n.ONE,n.ONE),this.additive.flush(l,u,o),n.disable(n.BLEND),T&&(n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,i,a),n.bindVertexArray(this.emptyVao),n.useProgram(this.postProg),n.bindTexture(n.TEXTURE_2D,this.sceneTex),n.uniform1i(this.uPost.u_scene,0),n.uniform2f(this.uPost.u_view,i,a),n.uniform2f(this.uPost.u_shake,_,v),n.uniform2f(this.uPost.u_origin,s,c),n.uniform1f(this.uPost.u_scale,o),n.uniform1i(this.uPost.u_rippleCount,m),n.uniform4fv(this.uPost.u_ripple,this.rippleBuf),n.uniform1fv(this.uPost.u_rippleW,this.rippleW),n.uniform3f(this.uPost.u_tint,x[0]*.36,x[1]*.36,x[2]*.36),n.uniform1f(this.uPost.u_split,C),n.uniform1f(this.uPost.u_scan,w),n.uniform1f(this.uPost.u_wob,f*.35),n.drawArrays(n.TRIANGLES,0,3)),n.bindVertexArray(null)}paintScenery(e,t){let n=this.theme,r=this.mapWidth,i=this.mapHeight,a=e-r/2,o=t-i/2,s=`${n.skyTop},${n.skyBottom},${n.clouds.cover},${n.clouds.light},${n.clouds.shadow},${n.ranges.join(`/`)},${this.horizon},${Math.floor(this.cloudX/2)},${Math.floor(this.fxTick/10)}`;for(let e of[.9,.85,.75,.55,.35])s+=`,${Math.floor(a*e/2)},${Math.floor(o*e/2)}`;if(s===this.sceneryKey)return;this.sceneryKey=s;let c=this.gl;c.bindFramebuffer(c.FRAMEBUFFER,this.sceneryFbo),c.viewport(0,0,this.sceneryW,this.sceneryH),c.disable(c.BLEND),c.bindVertexArray(this.emptyVao),c.useProgram(this.sceneryProg);let l=this.uScn;c.uniform2f(l.u_size,this.sceneryW,this.sceneryH),c.uniform2f(l.u_map,r,i),c.uniform3fv(l.u_top,A(n.skyTop)),c.uniform3fv(l.u_bottom,A(n.skyBottom)),c.uniform2f(l.u_cloud,n.clouds.cover,this.cloudX),c.uniform1f(l.u_boil,Math.floor(this.fxTick/10)),c.uniform3fv(l.u_cloudLight,A(n.clouds.light)),c.uniform3fv(l.u_cloudShadow,A(n.clouds.shadow));let u=n.ranges.length;for(let e=0;e<u;e++)this.rangeBuf.set(A(n.ranges[e]),e*3);c.uniform3fv(l.u_ranges,this.rangeBuf),c.uniform1i(l.u_rangeCount,u),c.uniform1f(l.u_horizon,this.horizon<0?i*.6:this.horizon),c.uniform2f(l.u_cam,e,t),c.drawArrays(c.TRIANGLES,0,3)}shadeTerrain(){let e=this.dirty;if(e[0]>=e[2]||e[1]>=e[3])return;let t=this.gl,n=this.mapWidth,r=this.mapHeight;t.bindFramebuffer(t.FRAMEBUFFER,this.colorFbo),t.viewport(0,0,n,r),t.enable(t.SCISSOR_TEST),t.scissor(e[0],r-e[3],e[2]-e[0],e[3]-e[1]),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),t.bindVertexArray(this.emptyVao),t.useProgram(this.terrainProg),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.paletteTex),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.uniform1i(this.uTer.u_terrain,0),t.uniform1i(this.uTer.u_palette,1),t.uniform1i(this.uTer.u_coat,2),t.uniform2f(this.uTer.u_view,n,r),t.uniform2f(this.uTer.u_origin,0,0),t.uniform1f(this.uTer.u_scale,1),t.uniform2f(this.uTer.u_map,n,r),t.uniform1f(this.uTer.u_grain,this.theme.grain),t.uniform3fv(this.uTer.u_light,A(this.theme.light)),t.uniform1f(this.uTer.u_wet,this.theme.wet),t.uniform1f(this.uTer.u_snow,this.theme.snow);let i=this.theme.grass;t.uniform4f(this.uTer.u_grass,...A(i<0?0:i),i<0?0:1),t.uniform3fv(this.uTer.u_ground,A(this.theme.ground)),t.uniform1f(this.uTer.u_flowers,this.theme.flowers),t.activeTexture(t.TEXTURE3),t.bindTexture(t.TEXTURE_2D,this.lookTex),t.uniform1i(this.uTer.u_look,3),t.activeTexture(t.TEXTURE4),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.uniform1i(this.uTer.u_grassMask,4),t.drawArrays(t.TRIANGLES,0,3),t.disable(t.SCISSOR_TEST),t.activeTexture(t.TEXTURE0),e[0]=1,e[2]=0}drawTrails(){let e=this.normal;for(let t of this.trails){let n=t.color<0?this.theme.trail:t.color,r=c(n,16777215,.6),i=s(n,.7),a=t.cells,o=a.length>>1;for(let s=0;s<o;s++){let c=a[s*2],l=a[s*2+1],u=o-1-s;t.live?u<Lr?e.push(c+.5,l+.5,1,1,r,.95):u<Rr?e.push(c+.5,l+.5,1,1,n,.8):u<zr?e.push(c+.5,l+.5,1,1,i,.6):c+l&1||e.push(c+.5,l+.5,1,1,i,.5):c+l&1||e.push(c+.5,l+.5,1,1,i,.45)}}}drawDebris(){let e=this.debris,t=this.palette.materials;for(let n=0;n<e.count;n++){let r=Math.floor(e.x[n]/Er),i=Math.floor(e.y[n]/Er),a=Math.imul(e.vx[n]^e.material[n]<<20,2654435761)>>>27,o=s(t[e.material[n]]??8018490,Br[a&3]);a>=30?this.normal.push(r+1,i+1,2,2,o,1):this.normal.push(r+.5,i+.5,1,1,o,1)}}drawMines(e){let t=this.normal,n=this.additive;for(let r of this.entities){if(r.kind!==`mine`)continue;let i=r.x+.5,a=r.y+.5;t.push(i,a,7,1,1708582,1),t.push(i,a-1,5,1,276e4,1),t.push(i,a-2,3,1,3811928,1),t.push(i-2,a-1,1,1,6968480,1),t.push(i-1,a-2,1,1,9073864,1);let o=Math.floor(e/12+r.id)%4==0?1:.6;n.push(i,a-1,3,1,8405247,.5*o),t.push(i,a-1,1,1,0,1);for(let t=0;t<2;t++){let o=e*.12+r.id*1.7+t*Math.PI,s=Math.round(Math.cos(o)*5),c=Math.round(Math.sin(o)*2)-2;this.probe.solid(r.x+s,r.y+c)||n.push(i+s,a+c,1,1,t===0?13676799:8014079,.9)}if(!r.armed)continue;(e+r.id*7)%40<5&&(n.push(i,a-3,1,1,16736464,1),n.push(i,a-3,3,3,16728256,.35,M.Pixel));let s=r.radius,c=Math.max(16,Math.round(s*1.6)),l=Math.floor(e/6)%2;for(let e=l;e<c;e+=2){let t=e/c*Math.PI*2,i=Math.round(r.x+Math.cos(t)*s),a=Math.round(r.y-2+Math.sin(t)*s);this.probe.solid(i,a)||n.push(i+.5,a+.5,1,1,9459967,.45)}}}tankLight(e,t){let n=Math.floor(e),r=Math.floor(t),i=_(this.lights,n,r,this.lightTmp);if(this.heatOn&&n>=0&&r>=0&&n<this.mapWidth&&r<this.mapHeight){let e=g(v(this.heat[r*this.mapWidth+n])*f,n,r);i[0]+=d[0]*e,i[1]+=d[1]*e,i[2]+=d[2]*e}return i}drawTanks(e){let t=this.normal,n=this.palette.tanks;for(let n of this.wrecks)n&&wr(t,n,e);for(let r of this.entities){if(r.kind!==`tank`)continue;let a=r.x,o=this.tankY(r),s=i(r.player),c=r.tank&&n?.[r.tank]||Mr,l=c.sprite,u=l[0]?.length??0,d=l.length,f=a-(u>>1),p=o-d,m=this.tankLight(a,o-(d>>1));if(!r.alive){let n=this.wrecks[r.player];n?Cr(t,n,a,o,e):(t.rect(f+1,o-3,u-2,3,b(2761766,m)),t.rect(a-4,o-5,7,2,b(1906971,m)));continue}let h=this.tankTilt(f,o,u),g=e=>Math.round(h.slope*(e-h.pivot)),_=c.barrel,v=r.angle*Math.PI/180,y=Math.cos(v),x=Math.sin(v),S=a+_.x,C=o-_.y+g(_.x+(u>>1)),w=_.width>>1;for(let e=1;e<=_.length;e++){let n=Math.round(S+y*e),r=Math.round(C-x*e);t.rect(n-w,r-w,_.width,_.width,b(e===_.length?11051672:14209736,m))}let T=r.shield>0;for(let e=0;e<d;e++){let n=l[e];for(let r=0;r<u;r++){let i=n.charCodeAt(r);i!==46&&t.rect(f+r,p+e+g(r),1,1,b(Ir(i,s,T),m))}}T&&this.drawShield(r,a,o,u,d,e),this.coverTank(a,o,u,d),r.chute&&this.drawChute(r.player,a,p,e);let E=e-(this.batteryAt[r.player]??-1e9);E<Fr&&this.drawCharge(a,p,E),r.chill>0&&this.frostTank(a,o,e),r.glue>0&&this.glueTank(a,o,u,p,e,r.chill>0),(r.rust??0)>0&&this.rustTank(a,o,u,d,p,g,e,+(r.chill>0)+ +(r.glue>0));let D=p;this.drawDigit(a-13,D-7,r.player+1);let ee=Math.max(0,Math.min(1,r.health/Math.max(1,r.maxHealth)));if(t.rect(a-8,D-5,16,1.6,0,.55),t.rect(a-8,D-5,16*ee,1.6,ee>.5?5952346:ee>.25?15777856:14696512),r.maxShield>0){let e=Math.max(0,Math.min(1,r.shield/r.maxShield));t.rect(a-8,D-7,16,1,0,.55),e>0&&t.rect(a-8,D-7,Math.max(1,Math.round(16*e)),1,jr)}if(r.active){let n=Math.sin(e*.12)*1.2;t.push(a+.5,D-10+n,3.2,3.2,s,1,M.Rect,Math.PI/4),t.push(a+.5,D-10+n,1.4,1.4,16777215,.9,M.Rect,Math.PI/4)}}}drawShield(e,t,n,r,i,a){let o=this.normal,s=(r>>1)+2,c=i+2,l=Math.max(this.shieldHitAt[e.player]??-1e9,this.shieldUpAt[e.player]??-1e9),u=a-l<18?1-(a-l)/18:0,d=a-(this.shieldUpAt[e.player]??-1e9);if(d>=0&&d<24){let e=n-Math.floor((i+4)*d/24),a=(r>>1)+2;for(let n=t-a;n<=t+a;n++)o.rect(n,e,1,1,n&1?jr:15268863,.9)}let f=e.shield/Math.max(1,e.maxShield),p=Math.min(1,.3+.4*f+.6*u),m=Math.floor(a/8);for(let e=n-c-1;e<n;e++){let r=(e+.5-n)/c;for(let n=t-s-1;n<=t+s;n++){let i=(n+.5-t)/s,a=i*i+r*r;a<.78||a>1.06||n+e+m&1&&u===0||o.rect(n,e,1,1,u>0?15268863:jr,p)}}}drawChute(e,t,n,r){let a=this.normal,o=i(e),s=Math.round(Math.sin(r*.08)),c=t+s,l=n-9-Nr.length-6;for(let e=0;e<Nr.length;e++){let t=Nr[e],n=c-(t.length>>1);for(let r=0;r<t.length;r++){let i=t[r];i!==`.`&&a.rect(n+r,l+e,1,1,i===`w`?15921126:i===`d`?0:o,i===`d`?.35:1)}}let u=l+Nr.length;for(let[e,t]of Pr){let r=n-u;for(let n=0;n<=r;n++){let i=Math.round(c+e+(t-e-s)*n/Math.max(1,r));a.rect(i,u+n,1,1,13617336,.85)}}}drawCharge(e,t,n){let r=this.normal,i=1-n/Fr;for(let a=0;a<3;a++){let o=n-a*8;if(o<0)continue;let s=e-6+a*6,c=t-2-Math.floor(o/3);r.rect(s,c-1,1,3,8188028,i),r.rect(s-1,c,3,1,8188028,i)}}frostTank(e,t,n){let r=this.normal;r.rect(e-7,t-6,14,3,14085370,.55),r.rect(e-7,t-6,14,1,16777215,.8),r.push(e+.5,t-7,7,5,15136511,.45,M.Disc);for(let n=0;n<Ur.length;n+=2)r.rect(e+Ur[n],t-3,1,Ur[n+1],15136511,.95);let i=Math.floor(n/9),a=e-7+(i*5+e)%14,o=t-6-i*3%3;r.rect(a,o,1,1,16777215);let s=e+10,c=t-16;r.rect(s-1,c-1,7,7,0,.6),r.rect(s+2,c,1,5,12575994),r.rect(s,c+2,5,1,12575994),r.rect(s,c,1,1,12575994),r.rect(s+4,c,1,1,12575994),r.rect(s,c+4,1,1,12575994),r.rect(s+4,c+4,1,1,12575994),r.rect(s+2,c+2,1,1,16777215)}rustTank(e,t,n,r,i,a,o,s){let c=this.normal,l=e-(n>>1);for(let e=0;e<r;e++)for(let t=0;t<n;t++){let n=(t*7+e*13+t*e%5)%9;n>3||c.rect(l+t,i+e+a(t),1,1,R[n&3],n===0?.95:.75)}let u=o%48;if(u<12){let t=(Math.floor(o/48)*5+e)%n;c.rect(l+t,i+r-1+a(t)+(u>>1),1,1,R[1])}let d=e+10+s*8,f=i-7;c.rect(d-1,f-1,7,7,0,.6),c.rect(d,f,5,5,R[1]),c.rect(d,f,5,1,R[3]),c.rect(d+1,f+2,1,1,R[0]),c.rect(d+3,f+1,1,1,R[0]),c.rect(d+2,f+3,2,1,R[0])}glueTank(e,t,n,r,i,a){let o=this.normal,s=n>>1;o.rect(e-s-3,t-1,n+6,1,F[2]);for(let n=-s-2;n<s+3;n+=5)o.rect(e+n,t-1,1,1,F[0]);let c=i>>4&1;for(let r=0;r<n;r++)(r+c)%3!=0&&o.rect(e-s+r,t-2,1,1,F[1]);o.rect(e-3,r+4,2,1,F[1]),o.rect(e+2,r+5,1,1,F[0]),o.rect(e-s-1,t-4,1,3,F[1]),o.rect(e+s,t-4,1,3,F[1]);for(let n=0;n<2;n++){let r=1+((i>>3)+n*2)%3,a=n===0?-s-2:s+1;o.rect(e+a,t-3,1,r,F[2])}let l=e+(a?18:10),u=r-7;o.rect(l-1,u-1,7,8,0,.6),o.rect(l+2,u,1,1,F[1]),o.rect(l+1,u+1,3,2,F[1]),o.rect(l,u+3,5,2,F[2]),o.rect(l+1,u+5,3,1,F[3]),o.rect(l+1,u+3,1,1,F[0])}tankTilt(e,t,n){let r=e=>{let n=Math.max(0,Math.min(this.mapWidth-1,e)),r=Math.min(this.mapHeight,t+12);for(let e=Math.max(0,t-6);e<r;e++)if(this.terrain[e*this.mapWidth+n]!==0)return e;return r},i=r(e),a=r(e+n-1);return i===a||n<2?{slope:0,pivot:0}:{slope:Math.max(-.4,Math.min(.4,(a-i)/(n-1))),pivot:a>i?0:n-1}}drawDigit(e,t,n){let r=Tr[n];if(!r)return;let i=this.normal;i.rect(e-1,t-1,5,7,0,.6);for(let n=0;n<5;n++){let a=r[n];for(let r=0;r<3;r++)a&4>>r&&i.rect(e+r,t+n,1,1,16777215)}}coverTank(e,t,n,r){let i=this.normal,a=this.mapWidth,o=e-(n>>1);for(let e=Math.max(0,t-r);e<Math.min(this.mapHeight,t);e++)for(let t=Math.max(0,o);t<Math.min(a,o+n);t++){let n=this.terrain[e*a+t];if(n===0)continue;let r=this.palette.materials[n]??8018490;i.rect(t,e,1,1,t+e&1?s(r,.94):r)}}drawProjectiles(){let e=this.additive,t=this.palette.shells;for(let n of this.entities){if(n.kind!==`projectile`||this.fx.lances.owns(n.x,n.y))continue;let r=t?.[n.weapon];if(r?.shell===`ricochet`){this.drawRicochetBall(n.x,n.y,n.id);continue}if(r?.shell===`meteor`){this.drawMeteor(n.id,n.x,n.y,r.size??1);continue}if(r?.shell===`fire`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5;e.push(t,r,7,7,16738836,.55,M.Pixel),this.normal.push(t,r,3,3,16747040,1),e.push(t,r,1,1,16773280,1);continue}if(r?.shell===`glue`){let e=Math.floor(n.x)+.5,t=Math.floor(n.y)+.5,r=this.fxTick>>2&1;this.normal.push(e,t,4-r,3+r,F[2],1),this.normal.push(e,t+1,2,1,F[3],1),this.normal.push(e-.5,t-1,1,1,F[0],1);continue}if(r?.shell===`firework`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5;e.push(t,r+1,1,2,16752688,1),e.push(t,r,1,1,16777215,1);continue}if(r?.shell===`star`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5,i=this.starColor.get(n.id)??16764992;this.fxTick+n.id&3||(e.push(t,r,3,1,i,.8),e.push(t,r,1,3,i,.8)),e.push(t,r,1,1,this.fxTick+n.id&7?i:16777215,1);continue}if(t?.[n.weapon]?.shell===`mud`){let e=Math.floor(n.x)+.5,t=Math.floor(n.y)+.5;this.normal.push(e,t,3,3,5917748,1),this.normal.push(e,t+1,1,1,3813408,1),this.normal.push(e-.5,t-1,1,1,12365446,1);continue}let i=Math.floor(n.x)+.5,a=Math.floor(n.y)+.5,o=this.fxTick+n.id&3,s=o===0?1:o===2?-1:0,c=o===1?1:o===3?-1:0;e.push(n.x,n.y,6,6,r?.trailColor??16751168,.6,M.Pixel),this.normal.push(i,a,2,2,r?.trailColor??16751168,1),e.push(i+s,a+c,1,1,16769184,.9),e.push(i,a,1,1,16777215,1)}}drawRicochetBall(e,t,n){let r=this.additive,i=Math.min(this.fx.heatAt(this.fxTick),L.length-1),a=L[i],o=L[Math.min(i+2,L.length-1)],s=Math.floor(e)+.5,c=Math.floor(t)+.5,l=this.fxTick>>1&1,u=4+i;r.push(s,c,u*2+6+l*2,u*2+6+l*2,a,.3,M.Pixel),r.push(s,c,u+2,u+2,a,.8,M.Pixel),r.push(s,c,u,u,o,1,M.Pixel),r.push(s,c,Math.max(1,u-2),Math.max(1,u-2),16777215,1,M.Pixel);let d=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n+1,40503))>>>0,f=2+i,p=(u>>1)+2+(i>>1);for(let e=0;e<f;e++){d=Math.imul(d^d>>>15,2246822519)+2654435769>>>0;let e=(d>>>4)%(2*p+1)-p,t=(d>>>12)%(2*p+1)-p;r.push(s+e,c+t,1,1,d&1?a:16777215,.9)}}drawMeteor(e,t,n,r){let i=this.meteors.get(e);if(!i||i.dy<=0)return;let a=this.additive,o=Math.hypot(i.dx,i.dy)||1,s=i.dx/o,c=i.dy/o,l=Math.round(14*r),u=[16774864,16765024,16747040,14699024,10496016];for(let e=l;e>=1;e--){let i=e/l,o=Math.floor(t-s*e*1.4)+.5,d=Math.floor(n-c*e*1.4)+.5,f=Math.max(1,Math.round(3*r*(1-i*.75)));a.push(o,d,f,f,u[Math.min(4,Math.floor(i*5))],1-i*.55,M.Pixel)}let d=Math.floor(t)+.5,f=Math.floor(n)+.5,p=Math.round(4+3*r);a.push(d,f,p*2,p*2,16738836,.35,M.Pixel),a.push(d,f,p,p,16751152,.7,M.Pixel),this.normal.push(d,f,Math.round(2+2*r),Math.round(2+2*r),16767120,1),a.push(d,f,Math.round(1+r),Math.round(1+r),16777215,1)}unmount(){this.unsubscribe?.(),this.unsubscribe=void 0;let e=this.gl;this.normal.dispose(),this.additive.dispose(),e.deleteTexture(this.terrainTex),e.deleteTexture(this.coatTex),e.deleteTexture(this.heatTex),e.deleteTexture(this.paletteTex),e.deleteTexture(this.lookTex),e.deleteTexture(this.sceneTex),e.deleteTexture(this.colorTex),e.deleteFramebuffer(this.colorFbo),e.deleteProgram(this.bgProg),e.deleteFramebuffer(this.sceneFbo),e.deleteProgram(this.terrainProg),e.deleteProgram(this.postProg),e.deleteVertexArray(this.emptyVao),this.particles.dispose(),this.fluid.dispose(),this.fx.clear(),this.water.clear(),this.liquid.clear()}},Ur=[-6,2,-3,1,0,3,3,1,5,2];function Wr(e,t,n){let r=0;for(let i=0;i<t;i++){let a=0;for(;a<n&&e[a*t+i]===0;)a++;r+=a}return t>0?r/t:n}function Gr(e,t,n,r){r.fill(0);for(let i=0;i<n;i++){let a=i*t;for(let o=0;o<t;o++)e[a+o]===0||i>0&&e[a-t+o]!==0||(r[a+o]=1,i>0&&(r[a-t+o]=1),i+1<n&&(r[a+t+o]=1))}}function Kr(e,t,n,r,i){let a=Math.max(1,Math.ceil(Math.max(Math.abs(r-t),Math.abs(i-n))));for(let o=0;o<=a;o++){let s=o/a,c=Math.floor(t+(r-t)*s),l=Math.floor(n+(i-n)*s),u=e.length;u>=2&&e[u-2]===c&&e[u-1]===l||e.push(c,l)}}export{Hr as PixelRenderer};
//# sourceMappingURL=pixel-Cmt2l2p2.js.map