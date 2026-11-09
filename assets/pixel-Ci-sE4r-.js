import{d as e,f as t,l as n,m as r,p as i,s as a,u as o}from"./main-KfrrdP9J.js";import{a as s,o as c}from"./MatchView-B2DSLtex.js";import{d as l,f as u}from"./jsx-runtime-BoS4LSug.js";var d=[1,.42,.1],f=.5,p=class{pos=new Float32Array(32);col=new Float32Array(24);count=0;clear(){this.count=0}add(e,t,n,r,i){if(r<=.01||n<1)return;let a=this.count;if(a>=8){let e=0;for(let t=1;t<8;t++)this.weight(t)<this.weight(e)&&(e=t);if(this.weight(e)>=r*n)return;a=e}else this.count++;this.pos[a*4]=e,this.pos[a*4+1]=t,this.pos[a*4+2]=n,this.pos[a*4+3]=r,this.col[a*3]=(i>>16&255)/255,this.col[a*3+1]=(i>>8&255)/255,this.col[a*3+2]=(i&255)/255}weight(e){return this.pos[e*4+2]*this.pos[e*4+3]}},m=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];function h(e,t){return(m[(t&3)*4+(e&3)]+.5)/16}function g(e,t,n){if(e<=0)return 0;let r=Math.floor(e*4+h(t,n)-.5)/4;return Math.min(1.5,Math.max(0,r))}function _(e,t,n,r){r[0]=0,r[1]=0,r[2]=0;let i=t+.5,a=n+.5;for(let o=0;o<e.count;o++){let s=e.pos[o*4+2],c=e.pos[o*4]-i,l=e.pos[o*4+1]-a,u=Math.hypot(c,l);if(u>=s)continue;let d=1-u/s,f=g(d*(.4+.6*d)*e.pos[o*4+3],t,n);r[0]+=e.col[o*3]*f,r[1]+=e.col[o*3+1]*f,r[2]+=e.col[o*3+2]*f}return r}function v(e){if(e===0||e>10)return 0;let t=1-(e-1)/10;return t*t}function y(e,t){let n=Math.min(.7,t);return Math.min(255,Math.round(e*(1+n*1.1)+n*30))}function b(e,t){return t[0]<=0&&t[1]<=0&&t[2]<=0?e:y(e>>16&255,t[0])<<16|y(e>>8&255,t[1])<<8|y(e&255,t[2])}function x(e,t,n,r,i,a){a.fill(255);let o=r,s=i,c=-1,l=-1;for(let i=0;i<e.length;i++){if(!(n[e[i]]&6)&&!(n[t[i]]&6))continue;a[i]=0;let u=i%r,d=(i-u)/r;u<o&&(o=u),u>c&&(c=u),d<s&&(s=d),d>l&&(l=d)}if(c<0)return!1;o=Math.max(0,o-10),s=Math.max(0,s-10),c=Math.min(r-1,c+10),l=Math.min(i-1,l+10);for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t;a[n]=a[n]===0?0:250}for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t,i=a[n];i!==0&&(t>o&&(i=Math.min(i,a[n-1]+3)),e>s&&(i=Math.min(i,a[n-r]+3),t>o&&(i=Math.min(i,a[n-r-1]+4)),t<c&&(i=Math.min(i,a[n-r+1]+4))),a[n]=Math.min(i,250))}for(let e=l;e>=s;e--)for(let t=c;t>=o;t--){let n=e*r+t,i=a[n];i!==0&&(t<c&&(i=Math.min(i,a[n+1]+3)),e<l&&(i=Math.min(i,a[n+r]+3),t<c&&(i=Math.min(i,a[n+r+1]+4)),t>o&&(i=Math.min(i,a[n+r-1]+4))),a[n]=Math.min(i,250))}for(let e=s;e<=l;e++)for(let t=o;t<=c;t++){let n=e*r+t,i=a[n];a[n]=i===0?0:i>33?255:Math.max(1,Math.round(i/3))}return!0}var S=`
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
}`,O=`#version 300 es
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
}`,k=`#version 300 es
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
}`,ee=`#version 300 es
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
}`;function A(e,t,n){let r=e.createProgram();for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(!t)throw Error(`createShader failed`);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw Error(`shader compile failed: ${e.getShaderInfoLog(t)??``}\n${a}`);e.attachShader(r,t),e.deleteShader(t)}if(e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw Error(`program link failed: ${e.getProgramInfoLog(r)??``}`);return r}function j(e,t,n){let r={};for(let i of n)r[i]=e.getUniformLocation(t,i);return r}function M(e,t=e.NEAREST){let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),n}function N(e){return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}var P=class{s;constructor(e){this.s=e>>>0||1}next(){let e=this.s=this.s+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,t){return e+(t-e)*this.next()}},te=10,F={Rect:0,Glow:1,Disc:2,Ring:3,Pixel:4,Solid:5,Stipple:6},ne=class{gl;data;n=0;prog;vao;buf;u;gpuBytes;constructor(e,t=4096){this.gl=e,this.data=new Float32Array(t*te),this.prog=A(e,O,k),this.u=j(e,this.prog,[`u_view`,`u_origin`,`u_scale`]),this.vao=e.createVertexArray(),this.buf=e.createBuffer(),e.bindVertexArray(this.vao),e.bindBuffer(e.ARRAY_BUFFER,this.buf),e.bufferData(e.ARRAY_BUFFER,this.data.byteLength,e.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength;for(let[t,n,r]of[[0,2,0],[1,2,2],[2,1,4],[3,4,5],[4,1,9]])e.enableVertexAttribArray(t),e.vertexAttribPointer(t,n,e.FLOAT,!1,40,r*4),e.vertexAttribDivisor(t,1);e.bindVertexArray(null)}get count(){return this.n}push(e,t,n,r,i,a=1,o=F.Rect,s=0){if((this.n+1)*te>this.data.length){let e=new Float32Array(this.data.length*2);e.set(this.data),this.data=e}let c=this.data,l=this.n*te;c[l]=e,c[l+1]=t,c[l+2]=n,c[l+3]=r,c[l+4]=s,c[l+5]=(i>>16&255)/255,c[l+6]=(i>>8&255)/255,c[l+7]=(i&255)/255,c[l+8]=a,c[l+9]=o,this.n++}rect(e,t,n,r,i,a=1){this.push(e+n/2,t+r/2,n,r,i,a)}line(e,t,n,r,i,a,o=1){let s=n-e,c=r-t,l=Math.hypot(s,c);l<1e-4||this.push((e+n)/2,(t+r)/2,l,i,a,o,F.Rect,Math.atan2(c,s))}flush(e,t,n){if(this.n===0)return;let r=this.gl;r.useProgram(this.prog),r.uniform2f(this.u.u_view,e[0],e[1]),r.uniform2f(this.u.u_origin,t[0],t[1]),r.uniform1f(this.u.u_scale,n),r.bindVertexArray(this.vao),r.bindBuffer(r.ARRAY_BUFFER,this.buf),this.data.byteLength>this.gpuBytes&&(r.bufferData(r.ARRAY_BUFFER,this.data.byteLength,r.DYNAMIC_DRAW),this.gpuBytes=this.data.byteLength),r.bufferSubData(r.ARRAY_BUFFER,0,this.data,0,this.n*te),r.drawArraysInstanced(r.TRIANGLES,0,6,this.n),r.bindVertexArray(null),this.n=0}dispose(){this.gl.deleteBuffer(this.buf),this.gl.deleteVertexArray(this.vao),this.gl.deleteProgram(this.prog)}},I={Spark:0,Chunk:1,Smoke:2,Dust:3,Flame:4,Snow:5,Streak:6,Glitter:7,Plume:8,Cloud:9,Ember:10,Ash:11,Rain:12,Flake:13,Plasma:14},re=[[4,16765500,16777215],[6,16765500,16774848],[7,16052456,16777215],[8,14690364,16769136],[8,14690364,16777215],[7,10491944,16756800]],ie=7,ae=3,oe=9080992,se=4869982,ce=13159640,le=3817034,ue=46,de=14;function fe(e,t,n,r){return{x:e,y:t,start:n,windup:r}}function pe(e,t){let n=re.length+ie,r=t-e.start;if(r<0)return;let i=r-e.windup;if(i>60)return;let a;if(i<0){let t=Math.min(1,r/Math.max(1,e.windup-2));a=Math.round(n*t)+ +(i===-1||i===-2)}else a=i<=ue?n:Math.round(n*(1-(i-ue)/de));let o=i>=0&&i<3?3:+(i>=3&&i<6),s=i>=0&&i<8||i>=8&&i<38&&!(i>>2&3);return{rise:a,lift:o,lit:s}}function me(e,t,n){let r=pe(e,Math.floor(n));if(!r)return Math.floor(n)-e.start<0;let{rise:i,lift:a,lit:o}=r,s=Math.round(e.x),c=Math.round(e.y),l=ie+a,u=re.length+l,d=c-i-a;for(let e=0;e<u;e++){let n=d+e;if(n>=c)break;if(e<re.length){let[r,i,a]=re[e];t.rect(s-r,n,r*2+1,1,o?a:i),e>=1&&e<=3&&t.rect(s-r+2,n,2,1,16777215,o?1:.85)}else t.rect(s-ae,n,7,1,oe),t.rect(s-ae,n,1,1,se),t.rect(s+ae,n,1,1,se),t.rect(s-1,n,1,1,o?16777215:ce)}return i>0&&t.rect(s-ae-2,c-1,11,1,le),!0}var he=[393733,1312526,2167571,5968142,2825496,3090983,10559500,3612953,4336157,4669247,4993568,5650723,6382352,15293704,6438951,7096363,7753262,8490251,8345137,9068600,9989186,11173456,16303113,12357726,14662795,16247495],ge=[6,13,22],_e=[{anchor:72,rle:`109./78.AC29./78.IRC28./79.MRAI.I2C22./66.2B6.3A2.2BM2ACMA22./66.AJA5.CRQ2C2R3MCMCAB20./66.C2FJ4.BIQTUE6M3RAMA17./66.BC2FJC3.LSBEACH3MKCER3MA16./66.AB3EKBC2BPO3BKPHIOLSPIMSTI15./66.BCECIKA2MRHPHBEI2LC2LOP2QIESB14./53.2A10.3BHE2CA2MPBCHO2Q2POCABCPQSI2KI13./53.A2JB8.B3D2CERMKP2OP2QSQOPKH3WQ2SLIOC12./53.AF2JBA2.ABJAXB2DBC3MOQPHPQPHTQ2P2CWY2WKQTPA12./53.AC3FJB.ABFB2A2NB2MRSQ7PQPOLSQB3WABCPB12./54.B4FC.AC2EIHBD3MRL3PEK2POPOLI2QSBDCBIHPQAC10./54.2C3ED2AC2EKB2CMLMKO3PKL2PL2BCL3P2Q3OLHITA10./54.3CEHGWBI2E2CBKLKLI3Q3KSUQSL5AST2QSQSCOPB9./52.2A2FCEIDWDCDC2BK2LK2S2PH2OHTVUQ2PAXYZABQPQOPSAPB9./52.BI2FCE2ICBHACB2K2LTSTIPI2LELUS3PSBYZAZBY2LO3PB9./53.B2DBCFBAILACBIKELSPSLH3LOKTQVS2POBIACZYAYC2PIA9./43.4A7.2G2BEBKI2EC2M2LK2OPQI2OXOHU3VUOLSUQ2AZBZB2YA10./43.ACJFAC5.ANDBDBKE2C2M2KMHLP2QHLSXLKLHTUO3L2P2QCUZ2AYA10./43.A2C3FJACB2AD3WB3CAKHPL2SO2PLSKT2LUVQB3CB2KL2P3O2SA11./44.AC4FCG2AKDBCWB3CILHPSQPQP2O2QHIHVXVUOQSOHB2ACAO2P2C11./44.A2CF2EHG2A3DCDN2BLPOIOEOH2QI2SOT2CVX3VS2OPCA2.2CB2A12./44.B3C2EDNAB4DCNBCOPK2QEPHPQKQS2ULVHX2V2U2OA21./44.A3CFHDGA3DE2CB2IQOPQIKHO2QI2PUVP2XQV3U2S22./45.A3BFIDWADH2ECAI5LOHQS2QTELPKV2XVXH2TSB22./44.B2F2BEIDACDI3EAORCHOLQOLS2QBQIPKHVXV3XTA23./44.2EFKBEFNAHE2C2E6RKEQ2SQLP2SHPCIVT3XVA23./44.C2FIH2ENAEBCB10RMQ2SIQSVQOVXVU2VXVA23./35.3A7.2B2D2CWAE2C3RMRI2RM3RMP2QO2QVKV3X2UVOA23./35.AEF2JABCB.4A4WGBMR2M2R2M4RMPO2QSLOTKUVX2V2HIA23./35.BCE3FJA2BA3FBCDNW2MLK3R2M2RMRCPOLSTHKPSHU2V3X2U23./36.2CE2F3EBA2E3DHDAMH2RMRI4M2KT2SO3SLO2KTU4VT2A22./36.3C2FE2FDB2E2DH2B2MIRK4MR3MIQ2SO2S3QOKHI4UTPAB21./36.AC2E2CELGDHE2H2CB2MH2MKOK2MRM2QOH2PLSIQ2SKO2XIXTIKAHB20./37.A3CBIHGWB2H2EAKIHOILOI2PEMP2QPL2PHQ2SUOLU5XIVXBHA19./37.IBF2CEIGNA2D2ECOPQOLKLI3PEQ3ST2QI3SVXEV6XVXVBL19./37.A2EH2CEDNBHECBC4QCQISQ3PQ2S2OLOHQSQSVQSV8XBHA18./37.C2EDGBEDN2HECA4SHPQSQHI2OPKHOQH2IPO2POUE4K4XVBCA18./37.C3B2NWNW2HEB4SHP4QKSTO2S2QSECOQ2IQSI2V3XLQ2XPLBL18./36.2B.3BCN2WCBEOP2QIH2PKOK2S2TK2POKEBO2TSQPO7XI2L2XAB17./27.5A3.ABC.AHFI3BNDB2OK2QL2PUPQPQUSI2KLIELOSTCOKU12X2A17./27.A2F3J3AFKDA2EIDGDADAOKS2QLS3QP2Q2PO3HBIKOQTIOKV12XOA17./28.CE5FEADGC3EHDHEAOPS3QIOSOP2QPKLO2ABCHIO2POIKV13XA17./28.ACE4FE2C2G2HE2HECB3Q2OC2BCBCO2PKOI2CEC2ELOKIUPLV2XV9XB17./29.4CF2E2FGWAHEH2EAIP2QLH4TSTXBA2IHA3E2LKCKPQTL3UV6XV2XA17./30.4C4FINWACH2EAK2SOP2Q2SULQTUQCIBCEHKOPQHP3QSHTU2VUV4XTCA17./30.A4CB3FGWA2DECAOQS6QOIPQSQSA2CHE2LOQE2PQ2SHQOKXLYUKUVTCAB16./31.2C3E3FDNHI2HCAL2SIP3Q2STEP2QEUB2H3LQPQO2PTIUT7XQEVXABC15./31.B4CB2F2DWIHCEPOISLHQIQ2ST4LOS2TAEK2LSP2H2OTU9XU2XAHPI14./31.A5FB3DW2HCQPQKSOP2QTIHLT3STOPQHIB2LKIL2HEU13XVAOSTI12./31.BF2E3HC2DWGCAIO2LH3PQS3I3S2Q2TQSPLABAL2OLIU13XVALOTUC11./31.B3E3DABADB2NA3IEOP2QST2OP2Q3PIPSTUQTCABTVPTU13XA2OPSQAC9./32.3A2GDBEFKLO3A3IKO3LTSKOKPOPH3Q2SOQST2BVULT2XU10XC2LOPHKUB8./35.B3NC2EH3DCB2HOI2K3LKHLK2H2O3QTKQSP2QAV2ILXTU9X2IOLIO2SQP7./34.CLHCGA2HEHD3CA2HOQ2I2LKICI2PS2Q5STIOPZAUV2XVTPKUV3XTQ2BOIOP2QI2Q6./26.5A3.B2KDAB4HE4CAE2HICHIKLI2KLO5SQSTULA2ZA7XKIUVXKTCBEHEKLPIH2B5./26.A2F2J2A2BA2IDNA3H5CEB2HEBIEILOHI2H2STIOPQSCZBY2ZA2XS5XQLKV2UAEHEILHIUV2C4./27.B7FBE2DGW3D4CA2EC2ABHEC5HIO2PQUCPCBYZBYZA9XYI3XAE2HC2EOBUABA3./28.A2C3FC2A2DG2W3D2CAKI4EC4AEHIBHIKOPSCBCXY2ZXZA14XU3EACIOY2ZAOA2./29.5CE3FD2GWGD3C3LIEK7EHE2AHEOPLBCBVY2ZBZA14XVA2EC2BXY2ZAOA2./30.B3CA5FDADHECA2LOI2LH2KLH6ECACIYZ3AXYZAB15XUAEHBIBA2YZA2BA./30.B3ACB3FEHAHICEA3L3KC3LOH2E2KH2ECAY2Z3AYZAU16XAHFCB.C2YZAC2A./31.A3FAC3ECWN2HEO3LK2LK5L2EK2LK2ECY2ZAPCYZAU16XABF2A2.AYZA2YA./31.2F2ED2CECA2WNCAKHICKLOP2OIH2MCE2L3OKHYZCSQ2YA2VS14XAH2XA2.AYZAXZAC/31.B2ADGCEA3BCNB9LERMIR2MS2EKOL2K2YBSQYAUXVSTU7XYU2XVI.2XA2.AZA2XZAC/34.ANW2AHLIHEBO2LOK2LKM2RM3RH3SPEI2KYABSV2AU4XCU7XSVHB2.IXA2.Z2A2XZAC/32.2AFBWC3D3HAOIS3LK5RM3RIP3QE2IACKOQUQV5XKSU4XTUQKA3.2C2.AIABXZAC/29.5AF2DB3D2HB2L3O2L3M5R2MRB3QTHCA2K2LKTV3XU4XHV2XPSKUA6.AXYABYZA./29.4FAIDG4DEBAIK4O5MRH2RMK2MP2QHS3HIH2I2U9XL2VC2XUA6.2AC2YZB2./29.3C2FEDGNDHECAILS3OL2MHCMC2H2MKOPOPQHQTBEKO2HU11XIKU2X2U9.BZC3./29.B3CEHIDWDHEBEK2SOKHQL2QICKPLHLQ2PQPB4QELP4U11XV3XVUA8.AB4./30.B4E2HWD2CBLKQUKB5QEM2POLHSPTKHKO3QSAOUVTV2XV8XY2XVUBCB13./31.B3C2B2N2BPOIPL2I5QEM2PHPQHKLCSTUL3QAK2V2U14XVUA2H13./31.B2CDNGCDNA2PIOLAIK4PCEQI3QSEHS2QSPL2QOCL2UT2U12XVUA2LA12./31.2ABCBKLHBS2QH2IL2K3PCI2E4QSUHP3Q2TQ2SBPTU3T9XU2XVBK2OBA11./31.A3BIE2CP3QHEIL2IPO3S2I4Q2SU5QTCLQUA2IOPT7XVT2XVUBILOPB11./27.3AJA3B2ECA2PQPI2HA2KHI2QSUI5QSTHS2QPTKSQTAHCUXLTUV5XQ2VUBHILHKC11./27.AC3FDNCHEA2P2Q2P2IAKLEP4QI2S4QH2IQOTELTSOAH2TUXTO4U2XS2VSBKPHSPTA10./27.A4CEDCHBAP3QPOICEILE4QPUP3S2QC2SQ2STLP2Q2ATUTVXIO3UVQTVOCHKPTKQPB10./28.A3EKN3AC2P2Q2KCAKLSEP3QPUHT2SICHPQ3SQT3QAL5T3X2UQLCSOAHKOH2OPA10./29.EFHDWGAPIP2QOHL2EAKOC5QHPSHE2QSH5SQI2QAL4TU4XIKX2UBEKOHSTOPQA9./6.3B19.A3EDGBQPK2PIO2KHEAKLPK3QSIQSO4QSH3QSTLHQ2A2UT2U4XIX2UTCIOK3SL2PC9./5.BS2AB18.ACED2CQ2PQEKQ3KHBA2KS2K2SC3SL5QTK3QUIKQAOU2T2U2XU2TS2TBCIH4QKLPB9./3.C3O2PA14.2A3.A2CB3Q3PEQL2K2H3IL2IQK9QSOH3SKTSEAO4T3U4TS2AEIOP3QSHKB9./2.AI2PO2A15.B2F2A2CBK5QPCKL2K2EAH2IHICLS8QSTKILCQSTPAL5T2U4TKC2IHS3QSU2TB9./.AC2PLBA16.3F2D3CS4Q2HI3KL2EB3IQSOQ2S3QI3QUE2SC4SQACKT2U3TLSTACHILI4QSHS2TB8./.AQPKQA15.CB2EHCWHI2S2QICUI3K2I4E2I3SL2S2QPOHIHKUOP4S2QAPTHTU2T2LIO2EHILHP3QHIQSTA8./.APQOQA15.2A2EDGBP3LQHKPOH2KLK4EACILQSI4QPQOIT2PTPQTSTSBAQSVPILILPCAE3HL2I3SHP2QSA8./BL2OLCAB10.BFJBACEDWCMOKLQ2KS2LH3LIH3EAC3LQK6QHSQ3PUBT3LCOQ2S2UK2TQBEHIK2IHIK2SIQ3SA8./BLKHSTQA2B3.BA2.B3FBN3CMRMKLP2HQLKLI2KI5EAHK2LKSCKTHSICS4QSBTI2LB2S2TOP2SAC3HKLKHEHIQSHK3TA8./BLOIOQLPCAB.AHJ2AEHE3NCQ4MHOPHO5LEHECIEB2KHC2KLKEL3S2E4QSUESLIAOST2SP2OC3EHIK3ISPIHSKHIOB9./A2K2HKLOTE3AHLBAI2HNHCS5MEQLP2L2K2L2ECKHCOPLICI4KLSPQHIL3PQKSPKEBI3SQ2PAC3EHLK2IO3QEOUO2CA9./AHLKSL2PSTIB4A3B3RHSQMKMESELOL5K2E3IB2TQ2K2I2KLKQOHTEK2IKBC2LKA2KIP2QEB6E2ICKLSOLCLKQ2LT9./A3H2QKIPK2O2P2O2MR3MOPOIKPSPEL7KHKHIBQ4S2IHI2KCH2IPSE2ICPULIKIK2LK3A3B4E2HCK2LKLC4IHC9./BHIH2OH2QPK3QIP2K3MH2TSH2SO2LIKL2KIEHELIHA3SQPTL4KHEH2IKPH2P2HEIH2ICBC2.7EH2IEI3KIC2IHBA10./.CIL2IOPSEO2KLT2Q2LQEKQTKOTL2KLILIKECL2KLKBQ3SP3S4KEBEIH4IK2ECBAF2B3.A7E2K2LE2LI2E2C2B11./.2CHKCHL2IQS2T4QETUHLPH2L4KE2H2EL2KICEBOLQHP3Q4KE2CE3H2IBE3AB6.7EL4KLI2H2ECEA12./2.IEIEC3KQTKH2Q2POHLQ2LHL5K2EHELI2KIBEA3LH2S2QPI2KI2ECH2EBCEBA9.H4EI7KLILKI2HB12./2.A2HILIKL3KIKLSQIKL2KEIC4KEHP2KE4KHEALHSI4SL4KH3EBECEHB10.2H2EH4KIS3KI2L2IB13./4.2HKPOE3IH2LK4LK3IC4EHO3KEI2KI2EAI2SLQ2SILPI2KI3EH3IHA10.B3EHK5LKIK3HIC14./5.CH3IK3CI3KHE2K3C2EI3K2I2KC2HI3EA3SQSEIK2QSL2K2ELIH2KA11.AC5E3LOLKOQIHB15./5.B3HI2KOEB6CECLPO7I2KH5ECATS3QOHI2S3LHIHKHIKB13.A2EKHEKLKPTHO2IB16./6.B3H2ILEHLOIKE5KLO6IK3H4ECTQSO3PQH2I2HLCLK2HIA14.CE2HEI3KSPQ2TQA16./7.BC2I2HEK4ICI5K2E3I2E4HC3EAQPQ2T3Q4LKIK2I2H17.A4H2LQTPTOQIBA15./10.AB9E4KH2EC5E3H4EASQ2STOKQH6ACIH18.A2HIL2OSLK2HICEL2C2A11./12.ABA6EH12EC3E2ABQ3SL2IBIK2Q2OBHLCB17.A3HLHILKS2QKBCO2P2LP2A9./15.4A2EH8E5A2CB2.BQ3SOEICTKQPKETLE2OBAC13.ABEHE2H2KP3SHQ2CIBOQTLH2BA6./20.B9A9.CO2QPQL2Q2TQSL2SQTC2LPBA13.B3HIHIKLKTSQHQTV2A2L3AB2Z6./39.BOPOPLPQ2BZQIOPSYZVAPAYZA12.B6HECL3OIPBY2ZACX2ZAY2ZC4./39.AKLP3OLY2ZAE2LAY3ZHQY2ZA11.B7HE3KHKLA2Y2ZCXY2ZAXYZ4./39.2K2LC2L2Y3ZA2KX2Y2ZEAXY2ZB10.B4E6H2IEIA2XY2ZCXYZAVYZA3./39.A2IKCEKXY3ZA2IB2Y2ZAEX2YZB11.8ABH2F2EABKXZAFAXZAHXZA3./39.A4HCEAY2ZAHIHEA2YZAEBAXZB20.9AK4ACABAI4./39.3A2B4AC4B5AZ7A43.`},{anchor:67,rle:`114./79.U2AI31./77.ICECQTI30./76.BP4QST30./71.AQ3A4PIZKH30./70.BP3OEP2OIVZXZC29./69.A2QOLCSPOI2Z4B29./64.AXUACQOD3BQ2PB2Z2HAC29./64.UEMCPOC3W3P2Z3DA31./64.ARLPOC3WO2PCAX3DZ31./62.2ABALCB3WT2P2BC4DA31./57.C3ABCHQLC2E2CS2POCZC3DZB31./57.ASMT4P3KOS2Q2P2A4DBUC31./58.A2O4BE2LQO2Q2CX6DB32./59.CB2QKOL2QLOPCH6DGA33./59.CDBHPHOKQPOKAQADB2DCGA33./60.CLHEPOPSQLCGNA5DGA33./59.AMLEPO2POBA2GNAC4DGA33./52.2AB3.B2MLCQLPB2CUHGN2A3CDGA33./52.AC2JA.3MCSQILIS2TUCGAD3GDGA33./44.AC7.BFECA2MI2QSQCHTU3TAT2D3GDG33./44.AJ2B5.B3EAM2HLQSKHLTUQ3TA3D3GD2A2.I2A26./44.AEF2JA3.B3EB2MOQST2LCL2XSQPQAY2ADGDAZA.2ZB26./44.AE2F3JA2BCEA2MRTS2T2OLI2UVU2PQCZB2ZBDZBAZAB26./44.A2EC2FJB2A2NAL2MLQSH2L2PCKUTSK2PSLCQD2ZB2YA27./45.B2C3FA2ICASL2MPIOIHP2TOIKI2CL2OP3Q2SU2TAC26./45.3C3EA3EALO2M2S2KHPUVL2VU2E2AKLO2P3S2TAC26./45.B2CGEC2H2EB2OKQSQT2HLOUIVXVQ2PQ2ABK2AO2POA27./45.AH2DN2DHEAHKI2LSQKL2PHKI5VOQ3PCB.AB2A28./45.2I2DNWDEBAC2MKOQOKP2STPC2VX3VU2QPB34./29.2AI12.2AXNDCA2CBA3MHPSTKQSTXIVXSKX2V2UPC35./29.B4J3A2.AJFI.BFAD2NWBCBPRMRLHKQI3QPHV4XV2UTPA35./29.B5F2J3AEKB2AE2JGAGNBO3PSLQPISK2PSIV6XLIAC35./30.BC7FA2F2GB2EDG2DGAIPKLHP2QSOQOIOIU6X3VA35./30.A3C6F2EFNAEHDG2FCH2KLOH3QPE2PSLOKX2V4X2UA35./31.4CBJ3FACEGNIH2DFEC2KLOES2QSQCPQXPI3XI3VYU2B35./31.B4C7FDNAIH2ECKHE2CK2QSPSLPS2XLV4XLV2TA36./32.E4CB5FIN2DHCBA2C4RK3QOTKTQV2TV5XO2XB35./32.A2FAEDB2EFHDW2GDBA9RQPQ2TLQ2OKTU6XVB35./32.A4EDNDHEHDWD2B3RM8ROQ2SOIOKLHLVH2V2XVA35./32.AC2E2HDGCECDRBI3R3MR3M3RKO2QH2QHIUVXPXILU2HA34./32.2ABDG2DNWDWIAC4R3MCMR2MKRQHOQ2PTVHT6XUH2XA33./36.3N4WBECMIKMR6MLMLQTH2QKTULU8XV2XB32./35.B2A2BDNWB2C2MKREHK3MS2T4S2QPOUKSV10XVBE30./35.B3JFDCNDBOLK2MKHLMR2SQX2Q2SP2QPHUHLOEOIXUL2XVCECB29./26.4AC2BCBA2EHI2DAWBOLIMHOQPKM6QOQC2QS3O2XO4XKLVI2XCQ29./26.AF2AJ3FDABF2H2D2ALILHM3QPKI2Q2S3QOCQPQ2PK9XYI3X2A28./26.AC6FDNBE2HIHBAO2PHLOLQ3PKQ2S3QLCT2P2QV15X2A27./27.3C3FEHGABE2HEA3QSBECOIK4I2LSK2LEOLP2QU15XC2A26./28.B4CGDHNA3FAT2SPISQPSVQ2S4QSTKEIK2OLHCU15X2A26./29.BC4BHNB2FB4SI2SPS2T7SP2KAIKLPICPTU2XU8X3VAI26./30.ABHICHNAEBAQ2KILSQPO3QS2QI3K2IE4IOQUL2TX5U4XYXVALB25./30.AEH2D3B2AOKOSHKTSLP5QS4IEBH2ISOP2QSISTO2IHIQ2U2XOKAIA25./30.ACHD2NBOABP3Q2O2LP7QICE2B2EIPOH4PKU2V7XV2LVUEA25./18.3A9.2BG2N3APQBHQPL2Q2SOK3Q3KEA2ECHLOPHP2QKSUXU9XI3XA25./17.A2ZA10.AOBA3SQST2E2I5QEPQIK2LAB2E3LTQ2LQTKT13XV2XA25./16.A2ZY10.3ABLPQSQ3LHPH4SQHEIKL2KA2EHL3OQHKLSIT17XA24./16.AY2ZI5.C2A2FAEPO3P3S2KQHI3SOIQIQIHAC3E5LI2EHUV17XA24./16.A3YXA4.CEFE2B2S2TUH3SKTQSLKOPITPIKICB2EKLIK2LI3P2UV16X2VABA21./13.LZA.C3YSCB2.2BC2B2SQ3SCLOQSQSUQSQI2OLEHCBI4KCEIKOPQP2XH2U2XV9X4VAO2PB19./12.B2ZA.CIXE2LK2AI3AHIKQ3SKH9QK2LICEAHE4KLSTL2Q2S2XUIUOLX2HV6XL3VALPQA10.ABA6./11.B2ZXA2.CE2KELQTIA3QSI2QSOIO7QPQ2I2H2ACHKI2KP2QSH3SV2X2I4XULOVUT3XY2VHALPQ2T9.A2Z6./11.A2ZXA3.BKHIO2QHEPQ2ST2KOSUQS5QTKQIH2ACEH2LHE3Q2PSIQOUXTU5XU3XV2IUVTOCTAL2QSTC7.B2YZA5./11.A2ZXAB2.AB2HLQPOCIQ2SLQT2SQK5QSOTQKA2C2E2LPQH3Q2PQCQSPKIV12XYIOH2X2AOP2ST2A2.A2BP2YZA5./11.B2ZXAECAB2IH2KLKEI2L2S2T4SKO3SPKQ2LAC3EKLTE2P5QTSQ2SK15XI3XUC2OPQPQS2AQS2P2YC.AZA2./11.AYZ2YQCI3A2EHKHEIP2QSPT4SQIOKIQIL2KA3EHILKCK6QL3SQK19XTAKPLQL3QO3SOPB2.AZAI./12.3YEKCB2ZA2H4CKP4SK5SLOLOPIKI2A4EH2OCH5QSTS2QLK20XUB3OP3QP3Q2A3.AYZA./12.BFOICB2ZAE3HE2LOPK3SPQSPILP2IK2IECBEHECIKPSUES4QSC3HUK20XVALKPIL2SPL2PHA2.2BYZA./13.BLIB2ZUA2E2H2BKTQOK3L2IHL2KIHI2H2ABILKEHOPSO3I3QCQPQ2XSU18X2VAIKLQSKL3KECHA2BXYZA./14.2A3ZS2AEHCZAI2TOE4KIHO3I2EABABEL2K2LOPSIEPTH2I2S2U3XST3XS15XAI3KSOIABCB3IABTVYA./15.A3ZUAKIA2ZAUTOKH3I2EK3ICBAWGAEHICLPUIKIC3QSTI2QPU3X3T2VQ15XA2HELIKELPHCIHAYZAEA2./16.3ZYAK2AZYATPL2AEBEB3A2BD4A2HIH2KLSIHI7Q3PSV2XOKO2LK10XY3XVA3EIHIH2LPB2HEAZ2AC2./16.Y2ZY2KAYZYXAKE5AC3EHD2W2HBIHIHKL3KIP6QPHPOPTVQIU3XYLKV8XU2XQA3EHECIL3OBH2BXZA3./16.A2YXBEAYZ2XA2C2.CE3C2EHBW2HC3IHC3KI2KEI4Q2PQ2P2SOKUV4XQ2XIVU5XVUXLA5EC2I2KH4BYZB3./17.3AB.AY3XA4.B6ECBAHCB2ICIEIECHB3C2KLQLPQS4QKU5XS3XOP2U3XSUKV7AC3HEOHE2YZB3./23.2B3A4.2CBEG2BENAC2A4IK2HE3POESCHOPQOQIKQOIU11XOIV2XOU2XB6.BA2EILH3YZA3./35.BG2N2WGDBH3IEHM2RMRH4QCKL2KI3HIHT13XLTLI2X2VC8.A2OB2YXA4./32.A3BDA3BGD3IEIM2R3MRO3QPTCIK2IOPQSLV15XE3XUTB10.2B2AY5./28.2AJAC2EDCIKIECB3I3MRMRMRL6QHQCIO2PTXI2U19XUA20./28.B4F2EDNDH2ECHIH5MEK2LP5QTEQSCHPSTXV3U18XV2A19./29.4C2EDHDH2CBIHE2MEMRL2OT2P3QTU4QBLQS2VP2U18XUAIA18./29.B6CADECACIC2MK2MR2OPHK4QTC4QS2KT2VITUV17XTAIA18./30.ACE2DE2BECAKEBSKSC2MPOISTKQSH2IL2Q2SBLOTVIHTUV10XS4XUA2KLA17./31.CEGDBNBCAHIAQ3SH2OLIPQ2VIT2SU2H3Q2CKPKIUVTO10XT3XUTAHLQC17./31.CHG4N2AHA2P3QH2PSQ2P2QH2S2QUH3QLA3H2U3XIU8XO2XVUTAKLPTB16./31.2BCG2B2A2ICK4PHLP5QPHS4QSO3SBCHEUTV3XLVU2V4X2UXUHAHKLQSL16./31.A.BHEC2B2ILCQPHSK2H6QHS2Q2SUI2SQKAHP3T3XVXL2U3XK3ULTAIKLQ2PA15./30.AB2C3EA2IALEOL2S2QC4QSTLH3SKOL2OQTBHPUT2UVP3X2UTUVPTKT2UBILQLHLB15./27.C3FCDB2ECAKIAKLHO4QI4QSH2QPHOKPKS2LHABQU3TV5XUSUTLXYXVUB2LIEH2O15./27.2C2ECDW2CBLKFAOKH5QI3S2QCI2Q2S2QTI2SOAEL4TU7X2H3XVUBILO2QHIOA14./27.A2CECDNCACLIBOPOI5QHIT2ITUK6QSL2SO2BP5U11XVUTBIKO3QHOA14./27.AC2EHBNALCLIA2KSH5Q2T2HSQSUB5QPHQSOBIK5U7XV2XV3UCIKOP2QIOPA13./28.3CDGWCOHPHAKLQIQSQTK2SI4QTS3Q2SU2IQ2LIH6UV5XT2XU2TEHLK3QSUHPA13./27.ACE2HBA2PHBHA2KOIPQPQSQP4Q3SHQ3SHTEL2KIPIL5U3TUS5T2CHISQL2STLKA13./27.A2CE2CTQOHCHAIKOTKL5QO4QSTIHTSKSQT2EAITU2T7U5TS2BEKLP4SOL2A13./27.BABECK2QIHKEAIKOKHL5QLS2QPQIO3IH2QSIKAK2TVTL6U5TIAHIK5SKQSTB13./24.3BIB3CHPQ3KHAI2KLTK2S2QSKS3QHOQ2SH4S2KCH2TS2TS4TUSUTU2BH2KL2QS2Q3SQU13./23.B3FEBABKBLI3KHAIHOPTK3S2QSK2QIOQ3SHQ2SQEAE4T2SVXK2TOT2UOA2EHLISQOQUQ2SQB13./23.A4C2DOLH2K4IBCH2LSPS4QSKHTSTULPSC2QSOCAH7TXVHL2VUTOA3EILK3QC2Q2SA13./23.A3CGD3OPH5IHAIOKQSESK2SUHO3SQUOSEQ2SKB2K8TXLXT3UCE3HEI2K2QCIP2QB13./4.B2A15.BAC2DNSKLPICHLI2HEA2HKPQIL2QTOCSQS3QHSEP2LIEKP7TSOS2T2S4EKIH2EI2OKCIPOA13./3.B2QA15.2AHDCSPIOSKILI2H2E2B3KPEKT2UEHSQS3Q2TKOLKIEI9TS2T2SC2HEH2IH2S2LISQCLIA13./2.BOLPC11.CAB.A2CBQSQPQLOL2H2ECIKI2LKLHKTOL2HPQS3QHOKUKHA2HI7TO3TSBE2HKI2HK2SPELO2PCA14./.AHOQA12.B2F2BCBT2SQ4LE2HEA2IKI2L2KEKOCOSTH3LPBH2K2IACL2TL5THP2SAC3E2IHI4LOEI2KSIA14./.ALILA11.BEFEWGBQSTOKP3KI2HB2P3I4K2ELEO2LEILKEOT3KBAKOP2TUKST4CBC8E5LC2K2IC15./.ALKIPA9.AB2EDGC2OP2IOKH2KIEHBSQCLIC2KH3EKL2KLOEQKSP3IBK5PTEC3T2C2B3EC2EHKH2LKECEH2IC15./AOQSLOBC5.ACBAI2CDTH2O2KQPE3KHEA2Q2S2QI2HCKECI3KL2OHEIHIHA2E5PQ2STPAB2EB2E3HKLKI3KCEBH2B16./ALPHOSB3AC.2BDC2ACR2MKLH2POKL2E2HEA2QP3SLH3KEBE3IK2IBCHCAC2ELPQ3P2QSBA7E2HK4L2I2KHC2A17./AK2H2QSQS3ABACBCPQL2MKHOPOK2ICK2H2CIEQ3SPH4KHC5HC3HB3EO6PQB2.A6EHKE3K2LOHKLO2IA17./B2L3PHOPTO3SPKST2LQSEIQL4K2E2HETSC2QSQHI5KHBCE2CE2HIBH2EOKPKAKA4.C6E2KE4K2LK2LO2K18./B2I2POHQPBS2Q2L3SI2P3HO2L2K4EAOQTC3QIEPL4K2HEB2E2H2IAH3EHK2AB5.A5E3KEH3KLH2OL2IB18./A2HIPLIP2QCL2QOLELQOILOLKO2LK4EAOQ2SKQL2IQL5K3HLE3IHAF2HBCB8.A4E5KE3KLEO2HIC19./.2HIKEISKI2SOSHL3PI5KI2H2EL2H2AQ2SI2SHL2OKI2KIKL2KIOLI4AC11.A5E3KLKE2KHI2HEB20./.A2IH2IKH4SKE2LI2KE4KIH2EOKIECO3QO3SIKP2IEI3KL2OLKHA15.A3EHKHEL4KIC3HB21./.BEILE2KHIK5I5KE2I2CL2K3IHA2QSL4SI2LKE3KCIOL3KB17.2E2HKEH5KL2HIA22./2.AHIL3CE4IBIKIHKECECH3LHIHEC2SQHI4S3KIH3L4K2IC18.BE2H2EC5KLQIHA22./3.EH2EIOCHBCH6EL2CLK2LKB2HCA2SQSK2QKLK2IK3LKH2IHBA20.B5EHK3LKPQOA22./4.B3EIOE3OPEKLO2KIHI3KI3EAP3STSL2OI2CHK2CIKIE2C22.AC4EH2LOLP2HLIA21./6.2E3HE2OHIL3K2I2C2KIH3EAQ2SQOLHCBELOL3BABHB24.A2E2OPK2LP2K2HEH2O4A2B14./7.ABF2H4E6IEHIH5EAPSQIBHPSTPT2ABKOK2AB24.E3HLK3L2KPST2QEHLOP2QPA13./8.CB2A3ECE4H3E7CA2POCUHIQSPL2TQLOHO2SB22.A2E4H4KPQ3SP3QBO2P4A11./11.5A2E3H4EB5ASQPTCBCTBIPQTBCEKQS2AUA21.3HIKHE4KO3SLOPBAXBOAYZAZY10./16.10A3.A2OKOAY2ZHLOPAY2ZCKPCYZ2A20.B4HKL2EHI4OLH2O2Y2ZKA2YZHZA9./29.AKHKLAY3ZQOPAY3ZAKVY3ZA19.A2E3H3E2HIO3LE2LB2Y2ZAX2YZBYA8./29.KIHKA2Y3ZAIH3Y2ZAEBXY2ZA19.A2E3H4E2F4HE2LB3YZA3XY2ZB8./29.IHCIA2Y2ZYE2HU2Y2ZA2CX2YZA20.10ABH2FH2EFABEYZA2FHYAZB8./29.AH2EFAY2ZA3EFB2YZAC2EAXZA32.B9AL4AI2A9./29.ABA2B2AZ9AC5AB2A59.`},{anchor:78,rle:`128./76.2A50./76.2FC49./76.AFJI48./75.BEFJA48./75.AE3FC47./56.AB17.A2C3F47./56.AFJ16.3C3F2B45./56.E2FJB13.A3CJ2FBJA5.BF37./56.A2F2JA12.A3EJ4FA5.BFA36./56.B5FJ9.A2J4EFB2FJ5.CFJC35./56.AEC4FJC.BAB3.AF2JEB2FBEFA5.EFJA35./57.A2C4FB.B2J3.B4FBEJFIGN2.3AE2FJA34./57.A2C5FC2FJB3.AHEACEFJKDNB.AFAC3FA34./57.A2CE4FAEFJB3.ADHB2E2FIGWC.A2FC4F34./57.A2CEJ3FCEFD2A2.BGIC2FEFDGWN.BKFEA3F34./57.A4CE3F2EDAJCBDNDH2F2ED2WACDI2EAF2J5.2A27./56.AJ2FB2FDIFE2HCHJ2BNWD2HE2DWHBAGD2EAIDGAC2.BEJ27./56.BI2FCBCN2H3I2DIPLNWG3D2WDIHJGDCHEIDNAIA.AFJ27./56.CH3F2CDCH2IB2DHFJD2WG3N2D2IKBWBHEHDAIA2B2EA27./46.2A8.B3H2ECNDI2HB2DHEFJG4WB2D2HDIAWABNGAIOIHE2FC26./45.A2JA8.C2G4ENDHGADH3EFODWNH3D2HDHCAW2B2D2ICH2EFA26./45.A2F2JB2.BCB2ABG3EHWDGDHDHEF2E2D2NFEF2EHEHD2BC2HC2HAHE2HA26./45.B2C4FBAE2AFBCN3D2WD2IDHEI2E2DNG5E3CDCBH2ECEIDG3B2A25./46.2C4FCAEACF2JW2N2WDHOKDHC2HEH2D2AB6ABD2B2AB2C2ADBHABC24./46.3C4FEIAHEHIA4WCI4H2C2EHBC7AS2TQMR2A2ME3A2EBE2BO3I19./46.B3E3FHIAC2EH2GADNAH4E2CECBQ2P3QSTQ2SI6MRKMLRA5B2RBT19./46.A4C2EHDAB3HGD2HDC4ECABQS2QEHP2Q3SLH2LMLMKISMK2M2R2MA3MIC19./47.BCECJIGDN4HD3HANCECBQ3PTIM5RS2QSLKMLQSTQH8MCM2R2MAXB16./47.A2EC2FIWND3HEC2EHGNATSQ2PKE8RM2PI2MKO2SQLPMRIMKMICBT3MABTA15./46.A2F2C2FKGW2D2H3E2C2A2Q2STLMRM4RMRMRMQ3PS2QOPLQPMR2M2HC3A2MRCRA15./46.B4FEFILAH2DH4EAI3PQS2MRMI2M7RM3S2K2LEKOQSLMPIHBACTB2MKMA15./37.2A7.2CE2FCHIABFID3CEB2SP3OH4ME2R2M5RMO4Q2SQPQLPQPLPOCKHCE2MKRA15./37.B2JA6.CH2DBEHBF3E2CBAH3SQIACHKMCR2M4RMRMRE3QOQS2QPIHPOLKPQOIKO4MRCI13./37.ACEFJ2A2.2AB2N2CBDH4EAISIPSCBCTQI2LB4M2RI2M2RHQSQKQI3PECIP2S2QPOIOMOMCMRB13./37.AB2EFEF5AG2WD2WAE3CTQPOPH3QSTOPI2MHEMRIM3RMKQSKQKS2IHQSQO6QPKPOK3MB13./38.2CF3EG2AH2KD4WBH2E2QHPSASP3QKI2KI3Q3MI4MKEQHL2QPIOPSQSKQ2SQSTHEPQK3MA12./38.A2C2FEGNA2HI4DNW2BKPQHABOTQOPO2SPQPK3PELKTIHKPCPEO2SQKOPQUIK4STILC3QC2MB12./38.AC2EC2IG4E2D2H3DOLPLKBOPI2STQTPK2SQ2LI2PTOMPOIQIHVOPEHKHOLHQIPQPQS2LCTSTE2M12./39.A3C2IDA3E2D2ECBSQ2PLELHQ4STIK3QSTPQPQ3SOQOP2HU2OCE2CTVELTSELO2SBWHLQHEA12./39.AF2C2HDB3HD3EAQS3OATS2QSQ3STS3QPSKPQSQ2SPOITULQSVUIXO2VIS2TOHL2QO2WOSTKLA11./39.AF3EH2B3H2ECAL3OHBP2T3SLKO2P3QPTSI2S2OHLOH4TCUV3XOXTEPUTPABQ2S2WDQTHIA11./39.BC2DEF2BIH2ECAOK2OH2TSQ2PTSOSTHBK2Q2SOLK2LPOKHI2THTIUVXKVUQTBTS2PO2BPQK2WB2PEA11./33.2A3.ABC2NDC2A3ECBQSHQAPQSPISTLPTVLTSEKSL2SL2I2KIEBLSTIVXKTXVHTOTSOT2PQCYQPQ2BC2BHB11./33.AEF2ACIA2NG2WEC2EAS2QLQBIOPQKQSTOQSTPTOBL2IOKBIK2BCKLOTEV2XK2ULTHIOIPLOQCZA2O2POHKA12./33.AC3FEFDAD3W2CEBCQ2SHLKALILBPQS3QSUSTUEHIHI2ABEHKHLOX2V2XUI2TPI2BCBL2OP2ZA2LIKIOQA11./34.3CF2EDABGC2NBAP3SQO2IHEILHILTP3SVISTB2HIAE3HLOPH3XUX2VLOKBC3ECAP3OAYI2OT2KPA11./34.A3CEDGAIDLCDCBO2S2QKP2HA2IK3HI3SQOPSQBAEHE3HKOEU4XQ3VQTPA3EHA.APO2LZ2OPSKQPA10./35.ACB2CDA2IHECAQK3SK2OHIBILS2I2SKIQPULPTAEHIHI2OQEIT6XPVUSHAEH2IA2.IPQPVEO2QTBLA10./35.ABKCEGN2HECAQOIH2SIPKI2HAKOHLQSQI3PO3SECK2ELOPOTV6XIHVTB3E2IA3.AP2OABAP2OE11./35.BC3EHBHECBAQK2S2QHLKIEHEKOUIPQSPKQSTPSUAE2HKLOPI2T9XVB3HIBA3.2ALKZAY2AL12./36.AB2HDBHE2CO2K3QPI2HCHICELOKOP2QK3QSQST4H2LHKTH7X2VBC3EIK2B3.ILK2OYZA13./35.3A2NWDIEC7QR2MEQOI2CHKL2H2OPOQ3S2QCHIHIS2TUXVT4X3VE2C2EIK2L5.BOQ2A14./32.3AEHCAD2NCAH2P4QM2RMI3OIC3I3H3ILQUP3QAHSBU2XU2XHT2XT2US2E3IEKLOB5.2A16./32.A3FHDNDHGBAOP2QPQM3RMR2M2PHBACHPCIOPEP3S2Q2AUBU6XUSU3CBHI5KPQA23./32.AB2EHDN2I2APOPLHMRMKMRMRM3Q2H2ACEHIL2O6SPQHEV7XHT2UA3E3LHK2QS23./33.BC2EDCHBALBIPHTMK2MEMQ2L4QHKE3AIKIKSQ2SQSKTSCU10XUC3EIKQPLSTQA22./33.A2CGDAECOQ2KHSQLK2MR2PSC3QSQLIHA3BHK2S3QSUOSTA2V7XUTB2E3KQSLHLOA22./33.A3CWABEPQO2IO2QPEMKPHPHL3QLO2ICEFEAIOPQHPQSTHO2ASV4XUVUAE2H2KL3QIOKS2B20./33.A2BCDWBL2PKAS3QSPLOKI2SLICIUH2PIB2CAHK2QTKPQUBKZAVUS3X2V2AE2H3KPQC2LHSQSAXA17./29.AJCBAIACBC2LQKEKEP3QKOHIP2QTHKQPL2QPEBCEBOSTQBOQBAY2ZVXU2VUIHACEHK3IP2QPISTCQSOB17./29.A2FJCBE2CIPKQH2AIPQPSTHL4QPU3QS2QPKACE2CQS2ABKYZA2ZA2XHKX2V2B3ECHIKOTLE2SPOPSA17./29.C2E2IAECP2QLUICAP2I3QTI5QHQ4S2QIEA2HEB2Y2A2Y2ZYZC2XY2XVUA.BC2EIHE3I2PSQTUQUA16./29.ABEHD3B2QS2KEAPSL4QTE4QTHI2STE2SKHA2ICEY2ZABY2Z2Y6XUTAB.BCHI2L2I2HQ4S2OA16./29.A3C2NBQ2SHLKHA2OEP3QUHS3QPEPOIHLSQ2LC2HQCY2ZTAX2Z2A6XTA2EA.AIKIKL2TQP4SOPA16./29.3EGBPO3QLH2EAKSH5QSK3QIEP2SQSE2SIA2HK2A2ZSAX2ZAV6XTAHIH.BIKLKLQ2SHQ2SPH2PB15./5.3A16.AB3.BCEAB2QH2QPI2HBOTHL3QSOTIKS2TPS3QUPSLAEHECBZATAXZ2V6XUAB2IKC.EKL2I2Q2SHKOSQ2PCA14./3.BAPQB16.3FABABECQPOQSQILIHB2LSCPQE2TS4QTI2S2QI2QLAHI2HZA2UAYAUV3XU2VUC2HKIB.IKLIKLQ2SIQ3S2PQB14./2.AOLOAC16.3FEDAB4QHOLEO2IEAIKPHEH3QSL3QSU4SKHOEA2HPEAT2U2AIP3VT2UKACHIH2IBDHIE2L3QPQ3SV3SA13./.AB2L2A16.A2EFDNB2S3QO3I2K2EAHIKCHS3Q2S2Q2SQS2QSH2KIA2H3STUVC2XP2U2CVXUAHIKOLKA.CH2I2KQIP2Q2SL2STB13./.AOPSA12.BA2.AB3CGNHQPQSPQCQO2K2EA2IH2T2S2QS5QPCPSIPI2KB2I3ST4VXVHKOXVUBC2ILQIKA.2B2HKOLOK2Q3SLIQT13./.EOLOLAB9.2CFC.ABHCWBLKQSIHPO2Q3K3EAHQST5QIOS2QLQ2HSQUOPEHE2S2T4VXVTVX2UB2EKPLHPIA3.5HIOTK4S2PQB12./ALPKOQ2BA8.CEFICDBCAMRSLPHP2SH3KI4EICPLPI2P2QSIHIUTUEO2QSIB2E2PS3T3U2T3UTBCIKLSPOHQK4.CHI2HPKIKQ3SQSTB11./AKHLI2P2A2B.BFA.B3ENWNBS2P2THIP2SLKI2K3ECABHKLQEPHKOTC4STHL2POLBHQSUQ2T3STS2T2S2BHKLQ2SOP2SA5.CBHIOHILQ2SQPQB11./A2IP2OP2C2AB2HEBC2EBCBC2PQPOPOKOQ2LKIKH2E2BKCHKLKI2K2TQC5SLKQPOACEQSUT2OSQSPSTSICECE2L2PCLOSIA6.2BEHIQTPQ2S2PTB10./A3IPLOLSTUAB2AC2BKBMTO3PQ2OPHP3L2K3CA2OLKHIK2LHT2QHC2Q3STLPSKAEHP2QS2UEQECKTAC2E2HK2LOHLOPS9.AEIKSP6STC9./A2HPS2T2SQO2QTH3P2MRKOQPLHSPIKL4K2ECBQT2L3K3LHQPHLB2Q2SUHP2LI2E4P3QSOSTIAB3HOKHIHIPH3O10.AHILQST4SKTU8./.BIKLQEPSOLQ2PI2PE2MLKPHKLSQOH5K3E2ASKP2S4KIEHESQHLOSLEKQKICEO6P2QPO2A3E2HILOPOI2Q2EB11.2AI3SIPQ2SOSPA6./.A3KIOPQP3SHSQPIKL2OPQKTP2LKH2IKIH2EBQ2SQ2S4KECILKPU2IKIHQIECHKTL3P2O2PB3A2E2HE2K2IH2ILKIB12.BO2SPBIP3Q2BCBC4./.IC2IH2LPO3SIPKO2PB2OPH3L2KLH2I2EKHB2TE4SIKLEH2C3KLSEHEIKHA2E2OQL2P3ABCEHCE2B3E3KC3HIHC12.BO2S2I2HLOLQUE2IB3./2.A2HCHL3KTOC2QKPOL3KI6KHC2E2IEAPOL2S2Q2I2K2E3I2K2IEH2ICE2HILIA2B4.9EI2KLHB3HA13.AL2SKBEH2K2OTUC2O3./2.AE2IKIHIKIKE4LK2L4K3IEH2EOLIHCB2SHS2Q2L4KEBCEHIAEH2EBCAF2B2A6.B8EI2KLH2ECBA14.AKLOE2ABCI2OIBA2OA2./4.2IHKPH3IEKLKLE2LKIE3CEC2HOLO2HA4S2LHQSOL2KC2ECBCH2E4A12.6EKI2K3I4EA16.A2LOA4BLCY2ZAKA2./5.CE2HEL3EI2EKH4E2C2EQI2KHL2HEUQ2SK2SIQPTI3K2E6HA15.C4EKLI5K2EAC17.BOHBC.BA2C2Y2ZAKOA./5.IBE2HKOQH4C4E3LI5KEIHEBP3QP2SI2PIL2K2H2I4HA16.B4E5KIKIECA18.B2ZIC2.KU.BXY2ZAZA./7.BHF4IE3KE5KLI5K4EA2QSE3QHIPOI2HEILKHEHA18.5E3K2LO2QC19.A3ZA2.UA.BXY2ZAYA./8.2BEHEH2IK5I3KHEHKH4EHA3S2OP2QILK2LHE2HC2A20.A2EHI2KL2QE2CA20.B2YZ2.AI2.BY2ZXYZA/10.3AF6H3IK4EH5EA2TSTL2HE2C2BC2B4A21.A3EOK2LPICHLPQASABA16.I2ZC5.AYZVXYZA/13.2A3E2H7E2C6EP2QKACEQHQSTABHKICAC20.A2E2H2KLKTPOAT2PL2POC16.3A5.B2YCXYZA/15.B3A2B7EC2AB2AK2QB2ECIKOPOISUILK2OAC18.A2EHEH3KSTITPQ2ALPLBCAB22.2YA.XYZA/20.C8A3.BHP2SBO2SLOIKOP2BVHPO2AB18.4HIH4KPLTOK2ZEB2ZA2YZ21.ZA2.AXZB/32.BHOSO2QCYV2CLPA3ZA2S3ZA17.5H3EKO2IKA2YZ2B2YZHYZA24.AYB./31.A2IOCOPCY2ZBALA2Y3ZABY3ZA16.8E2I2HKAXY2ZAU2YBCXZB22.BYZ2./31.AI2KCLIBY3ZALIX2Y2Z2AX2Y2ZB15.A4EAF2AI3HAP2YZ2AXYBCAZB22.AZ3./31.B2HIC2IBY2ZYAIH3Y2Z2A2XY2ZA16.5B3CB7AZ2ABAB2IYA22.AC3./31.A2EH3EAY2Z2A3EA2YZABEBA2ZA69./32.3AB3ABCZ5ABAJC8A69.`},{anchor:62,rle:`99./39.ZA5.3A50./37.A2ZA3.A3ZA50./36.BY2Z3.C2ZYC51./36.CYZB2.CX2YC52./36.XYZA2.4YI3.2B47./36.XYZB.I3YC2.C3Z24.5A18./35.2A2Y2AB2Y3CZ2YZ25.2A2YZA17./34.BABABKAPSCKAZ3YI27.ICYZA16./34.YQH2LHBO2LIA3YB23.2AB3.B2YAB2Z13./34.YXC2LHC2LKCEKYXA23.AZ2YZ.AX2YAZYA12./34.YVBL2K2B2KCQS2TC25.B2Y2A2KL2AYZA11./34.BX2B2IH2IKLOLKP26.AILIA2KO2AXZA11./35.2AIKIL2KLSOPKA20.2B2A2.BC2H2ABE2BEHA11./35.2AHIHL2KQSO2QSA19.A3ZAC.BHI2CE2HA2OA11./36.A2EH2KIPQS2QSA20.B3Y2AH6IHCH2A11./36.A3H2OHO4QSA21.B2YO2BCB2IB2COQA12./36.AHIHLOIK4QSA21.AEOKI2OPCELSTPQAC11./37.BIH3KIPS2QSA22.ACHK3OLBLOSPQAC11./37.B2HE2IKIP3QA24.B2I3KC2KOQPA12./38.A2I2H2IP2Q2SB24.C3KIHI2KPQA12./38.AI2KOHL2QU2QA25.AB2EK2HI2STC11./37.A2HILPKQ6S25.B3HKLKQS2TJA10./37.AH2IKIK3S2QPSB24.C3KILK2Q2SUA10./37.A4I2KS3QPLPA24.B5KIHQTQTU10./37.A2IL3K5QIOQB20.BCIAHCB2KIOKTS2T10./37.B2KOK2IO3QSKQSA11.JA4.AC.I2A2RCME2K2SO2PTA9./37.AKLHKPIHQH2LTOUVB10.C2FB2.BSTUA2RMCEABIKTOPLQA9./37.AH2IP2QKILP2UOPTA.2C7.CE2FC2BMC2T3MR2MR2IRIP2SA9./36.AH2IHO2QKL4SLOSA.BFJA5.C2ELD2BQHB2SB3MKM2RMIOPQB9./36.A3IHOLOLK4S2OQS2A2FJA2.2A3CICBMHCBAOIO2SLRMR2MA3QA8./36.AIKIHPOQ2P5SHLQ3AEFJA.2ADEC2B2M2HLBIKPIQOBOH3MHQSB8./36.A2IPCP2QPK3SQSILQB.B3FBJ2ADBC3MKOLOLPLO2HPQSQI2MHBOB8./36.A2IO2KP2SIP3QSLPQA2BCEGBI2AN2B2MROKHP2S2TIHB2AQS2LOP2A8./37.CIKCIK2QEIP2QSKOK2A2EHDA2HK2BMKM2OPQLPQIKEPBWBCPTVEP2A8./37.B3IHI3KIKP2SOLCI2AHDBAH2CBR3M2P2HOQPQ2T2P3WQO2PHOA8./38.B2HEH3KS2T2KQOLCSBCDBIE2CKMRKO3SP3Q3HPQO3WCICAQA8./38.AHECLQOK2Q3SCIKLSUSCACE2CI2MP2S2KISQL2CHQ2SPOWBABSBA8./39.AEHO2QSHL3STITULQSBD3CKHMKQ2SPLHQSQPEBAQP2QP2OTILQA7./39.AC3K2QEHLS2TPQUOSPTCBC2IKLPKPOPOESTVSPBAZAO3PLTCPS2A6./39.2B2I3KBIKO2LO2STOPSAB3KOQOH2KLOKTUVQSAB2ZABH2P2Q2APA6./39.2BA3HICBHK2LPQP3QTQAKLML2QPSLOPTCTVSQS2AZAZ2A6PB6./39.AF3A2HE2H2KEO2PS2Q2S2ALEL3QPKQPSCBVUPOHG2ABCBA2P3OB6./38.CF2E4B2H4KOP2S3QTCR2BLQSLIO2SUIVHA3OQPZBAB2Z4A7./38.AEHDA4HE4KHPS2OQSUEMRC3QI2THKTI2VECBOQPQPDB2Z2AZ8./39.2BGDAH3E3KLKLQ2LQLBK2MREQSL2STUCT2VULTCBOLOPYZAHZI8./41.2NA3EIC2KLPHOH2QSQM4RQOHKQXVIQ3VQTQK2ALPSLTUB9./29.2A6.2A2.BCA2EH2EIKPS2TE2SQS2M3RL2OHOUIV2XUVUT2OA2ECAOPBA9./28.AC2JA2B2.AHI.AHBE4HKOPO2STKLQORM3RCKOPO2IV3XL2VTBA2EA.2A11./28.BC5FCBAEHBA2EAHIL2IL2OLPSILSOR2M3RCLPXVCU4XSEHB2HFA14./29.BC6FAEHNA4E3LI3O2LQIOSTHMHM2RCLP2TL2U2V2X2VBHIB15./30.3C5FBDGB2EBEH2LCHIL2OHIO2SIKMRMRTOPQHV2X2T2XV2BEA16./30.B3CFEF2ELG2AEFEHEHKHCICKEILQ3SH2ML2Q2LKU2V2XOUVA2EA16./31.5C3FIDA2E2C2EHI4EOUHKLPQSLELEQSOSOI2V3XIBAEA17./31.B4CAEF2IA3EA2EH2EHK4LIKLPQOIPLP2QCLOI2V2XYVACA17./32.CBCBC3FI2A2EHB2H2EH2K3LO2IPI2PEPQSTLIV2X2VUXVKB18./32.A3FCB2F2IN2CHAC3EHEH2LKOIQTO2QOCSTUXKV4XOVIOVC17./31.B4FH2BCHIDWADBAC4EC2KI4K2LOPSQS3TV6XH2XC17./31.2AFH2DNICECDWGD2EBA5HKI4K2L2QHP2STOKPO2XV3X2VC16./32.A2B2GD2NBGWC2DECA2E3HEHIL2K2EP2QSHLPI3XL2POVX2VBCI15./35.G2N5WC2DECA3EBH2E2HEHIOQSQSC2Q2V2XT2XYIUVQVXA15./35.2BCDCB2W3D2EA5E2A2EHIH2P2QU3Q10XH3XA15./26.A2J3A2.AB2JCADG2W2DECAH6E2K2LIQPQSH2QP15X15./26.ACF3JFCABH2JL3DW2DHEAIK3EHEK2LHIHPOH3IOV13XVC14./26.ABC5FAB3H2I2DW2DHEA2I2EILEKLKOPEC2HPQKETU9XV2XVA14./27.ACE2F3ED2HDH2IDGDGHEAIKH2IK2ILO2Q2SIP2QTUITVXV10XA14./28.B2C3F2ECED3H2DNDHCAHLC3KOIKL4QEP3QUHS3U7XYXVA14./29.4CB3EBH2E2H2DN2CAH2EKLQSLE3Q2PTO3PSQ2O2L2K3U2XTUSA14./29.B3CA3CAH3EH2D2NBA2ILHK2POCP4QIL2QPKTSV4XLXKUVSKV15./30.2ABFBCAB2I3HBHCGBIK3IE2LK2H4QEIPQLPT9XE2H2XB14./30.AF2E2CBLKDI2BCIFCA4IQ4ILH2QSTIOHIHUV10XH3XB14./30.2ECEN2ECI2DBCH2FB3IKLOSEIK2TLEILQPSHIU13X2VX14./30.2ABD2NC2BGWGDH2EA2IH2LQS2H3ST2H3Q2VKU15XVA13./33.D2N5WGDHECAIHEOPQSL4QSCI3Q2XVUV2XTV11XA13./33.CBWG2NWN2DHEB2EIKOPSC6QBP2Q2X2VLO2VS12XA13./25.2ACB2.3CFJAB2GW2DH2BHK2I2OICP5QV3QSXUOLXLKLU11XA13./25.F3J2AFCA3FIBDW2D2BK2L2CH2KEK3Q2SQL2PVU2I5XKI6XY2XVA13./25.BEC3F2CA2EFIDGDNC2BLKIHCELPQI5SQLO2POT5XV3XIVU2XOUOUB13./26.B3CECEHC3H2DE2G2A2KHIPHIPQIKSQSQTKO2PI6XS4XK2LVQKXUA13./26.2B2CBC2HGBHE2D3CBKLCLQSQIO3ICQ2SKIEOHS13XYIKVXUA13./27.B3CE2INB2EHE2CB2L2O2QSQKL4QKQICO2TEU14XKQ3XPB12./28.ABCEHEDBHB3CALOIH2OQOLKI5QIE2QTUVU20XA12./29.CE2GBANHC2ECAOPOIKO5L2Q3ST2QSTVXUV19XB12./29.2CDGD2NDC2EBHPTI2K2I2KCHQ4SQLPQV2X2UV18XA12./30.ABN3WB3CI2L2KICIHPCP2EH3QOHLPSU2XTU18XA12./29.3AC3WNC2BL5K2R2MIKQSLCLE2PKPQSXUHL2VS15XA12./26.2A2JBOGCABDNAL4KM3RM2RKP2QPE2HOSISTSLUVXKLV13XQAC11./26.A2E3FGAHIH2AI2KIRMR2M2RMP4QUHCI2KLP2QV4XT2U7XV2XVSAHA10./27.B2C2EDB2HEBA2I3MIMRKLH6QTESC3I2HUV6XKUV5XVXVO2AIKB9./27.AC2EHIACEBCK2I2MHKRH3SO5QUCSQE2ISEU8XIS2V3X2UOUAIKOS9./28.B2E2DA2CB3KO2K4M2SIH2P2QUIS2QEKPTHUV9XHTVXQK2XUTILPQA8./28.ABHBCWCB3IASQPTH2MLCOSHPSLKC3QSCLUIUV10XUKUKV2XTCBI3Q8./30.DAG2NA2KBLQ3SHMQ3P2QHT2STI3QBCLV2UV11XI4XVBOQSLPA7./28.3AB2CA2LBEP2SK2HLS4QVH3SQVHQSABOVLU3XU11X2VUAL2QI2PC6./25.BJBFBAB2CAKIB3OPLSO6Q2TP3QSPQVTA3LUVXU12XVUAEO2PLOKA6./25.A3FEG3BCLIB3I3QSP4QSTUH2S2QU3SQA2K3UV8XV3XVTAHO2P2STC6./25.A2CECBABCOLA2LCI4QI4QUSI2HS2QH4QA2HCLSV7XV3XVTUBHIPLQ2SUA5./3.CA21.B3CN2APOIA2LOH2Q2ST4SQHLPQL2SHK2QPACOUVOU6XVXT2XUSACLOQIQ2SQE5./2.APS21.B2EBWGQPOIBIQIK3QSTO2Q2HIQSQ3STI2QPOLTUV2XT3UV2XQT2UP2CI2LPTK2SOT5./.BOQL21.B3CNP2QEHAC2Q2S2QCQTI2HQUIQ4STKOPOLA3TUTXOT3UTO2THKB2IOP2QSISHC5./.POQA17.2A2.BC2EBQSL2HIKOQH2SLPSTH4QTO4STOLQOALS4T2XLS2UTLKTHBEI2K3QU2SHA5./A2OLA16.A2FCAD2CBO2P2KABIKSQCLH3QH5QVQ3STEHKHAO5T3XKUS2VXU2AHKLS4QTEL2A4./A2LPSA15.A2EC2D2BEOPOIEHBI2K2HT4SUP4QTH2S2IQTILBO4TV2XUVPX3V2EHK2LS4QOH2SA4./AKQSO2B14.A3EWDEQH2QOIOHC3HLH5SUK3QSKS2HOSQSUIAK9T3U2TCEK2LK4QTH3SA4./AKHO2PBAB8.BI2.AECBNAEPLELI2LHA2HISI2Q3STH2QPBKQTH4SUIBI12TSACEH2LKH2PSLQSQSA4./A2KOSQH3A2.BA2.B2FC2BCDNDI2OLHCOKLHA2H2OL5QSCEHPT2PSH3QSCA2H12TAC2EC3KIOSTH4SA4./AI2H2SO2BAD2B2C2B2EBG3B2Q2L2PH2LI3HAL2OQHO2Q2STE2TSVLOTP3QKAKQT3U3TQTUHBC2EKLHL2IPSTE2STOA4./A2HQPKHQ2S2BHL2B2DGWD2BPQSIQSQO2KI3EAI2KPIPI3SI3S2QOKQP2QPAIST2UIU2TEHI2A4EIKLKEL2OIEH2KOA4./.HKPHIKQTSO2TBDABOBCOLOSPTPQS3LHECABHE2KOSH2TUTC5QOHULTOPCLQST3UIHCQAB3EHIHLKISTHCKST2HB5./.IH2KPQOPLT3SBUAM2RLKQPHOP2IL2I2ECAI2H4LE2TPE2IQ2SQSKUK2LBCPQSTUTQSTQPB4E2IHKLO2SKCIOPILB5./.CH2IPQ2KHLOSOP2SRIOIQHIKTH4K3EB2KIK2LKLCLSIOHKPSOLIHT2KBCLOP2S3P2Q2A6EIE2K2LOLEKLKLKB5./2.AEHILKH2QIP2ESQIPQHELOSE4KH2CA2SOSKI3KC2IHOQK2OBAE2OKIBCO4P2OP3BA2B2EAC2EIK4LEIKIKLA5./3.BHK2HK3Q2K2QLQSQHOQSQKI2KIECB2QP2ST3KIE2H2LOPCIPCPLIBCE2KO3PO2A2.H5EA3EC4LE2CIEB7./3.BEILEHO2LIOPQEQSPCOL2KIH2K2EAH2PC3S2LI3E6IKIB2H2CE2OLOIOBA3.B7EHK2E3L3ECBA8./4.2EL2HKLHI3KHLOKI2L2KI3E2HBOLIK2QS2K2L2EH2I2HIC2H2EB2E2OL2AB5.A6EI3KLIL3I4E8./5.ECHLHCEH3KH3KI2L2KCECE2HB2KQE3QIK2LK5H2EC2ECBCEHIPA8.B5EI4KLKLH2K2HEC8./6.AC2ESCEIKLE3KIEC3ECHO2EL3SL2QEH4K2HEB2A2EHI2AEC2B10.A4EI7KH3K2HA9./7.AB2HIECLEHI2HEHKHPE2LHEAQ4SIKOPL4K5H3IB16.B4EKI3KCKLO2I2HA10./9.C2HEIK2OIHPIL3IELK2HAPOSQSOS2PS3KI2E2H3KA18.A3EH4K2I2OHIHC11./10.B2FE3I2HKE4IE2HIHBQ2SOLK2SI2LKICICIK2IA19.I3E8KIHIB12./11.2B2E2H3EI2H2K2E2HATSQOPLI2QPIHIE2KEIKBA20.AB3EI2K3LHQ2OA12./13.ABA4E4H5EA3SO2SQI3KI3KIHCB22.A4EK3LPQS3CA12./17.3AC2H5EAP2SQL2ICH6A2IC24.AHEHPLKLOESQPKLKT3B3A5./21.4A2FEAS2LAKOPLQ2PEHIPECB23.A4HIHKLK2SQLCHBOP2QOLOB4./25.2CBSQ2CEHE2PL2KLHIO2KQA22.BH4I3KTSTKOTUBEOPQ2AK2A3./27.APS2POLTHLIPQSPKC2O3A21.2HFH4I2KOTLQTB2ZBOBYZB2ZU2./26.AK2LOAXZYSH2QAZYAIOAYZ2A19.A5H3EKLPEHOA2Y2ZBA2YZAY2Z./26.A2KPAX3ZAHKAX3ZABXY2ZA19.A9E3ILOBX2Y2ZA2Y2ZA2YA/26.A2KOB2Y2ZYHKAXY3ZCX2Y2ZA19.A3E3A3E4IATSU2YAPVYZ2AYA/26.I2HLB2Y2ZA2HBXY3ZABY2XZA20.7BAB9AT4AZACBA/26.F3E2AY2ZAE2HF2Y2ZA2EBYZA48./26.AB5AB2A3BABAC8A48.`}],ve=0,ye=1,be=2,xe=3,Se=4,Ce=5,we=6,Te=7,Ee={RISE:ve,IDLE:ye,GRAB:be,RECOVER:xe,TOSS:Se,RIP:Ce,SINK:we,TOPPLE:Te},De=0,Oe=1,ke=2,Ae=3,je=[8001544,10559500,15293704,16303113,16773280],Me=null;function Ne(){return Me||(Me=_e.map(e=>{let t=e.rle.split(`/`).map(e=>{let t=[],n=0;for(let r of e){if(r>=`0`&&r<=`9`){n=n*10+(r.charCodeAt(0)-48);continue}let e=r===`.`?-1:r<=`Z`?r.charCodeAt(0)-65:r.charCodeAt(0)-97+26;for(let r=0;r<Math.max(1,n);r++)t.push(e);n=0}return t}),n=t.length,r=Math.max(...t.map(e=>e.length)),i=new Int8Array(r*n).fill(-1);for(let e=0;e<n;e++){let n=t[e];for(let t=0;t<n.length;t++)i[e*r+t]=n[t]}return{w:r,h:n,anchor:e.anchor,px:i}}),Me)}function Pe(e){let t=e.t;switch(e.state){case ve:return t>e.rise*.8?Ae:Oe;case ye:return t<40&&e.age<e.rise+50?Oe:De;case be:return t<=e.reach?ke:Ae;case Se:return t<8?ke:Ae;case xe:return t<7?ke:De;case Ce:return t>>2&1?ke:Ae;case we:case Te:return Oe;default:return De}}function Fe(e,t){let n=he.slice(),r=(e>>2)%4;for(let e=0;e<ge.length;e++){let i=ge[e];n[i]=je[Math.min(je.length-1,Math.max(0,e+(r===3?-1:+(r===1))+ +!!t))]}return n}function Ie(e){if(e.state===ve){let t=Math.trunc(e.rise/3);return Math.max(0,Math.min(1,(e.t-t)/Math.max(1,e.rise-t)))}return e.state===we?Math.max(0,1-e.t/Math.max(1,e.sink)):1}function Le(e,t){let n=e.face>=0?1:-1,r=Math.round(e.y),i=Math.round(e.x),a=Math.PI/2;for(let o=6;o<=90;o+=3){let s=o*Math.PI/180,c=Math.sin(s),l=Math.cos(s),u=!1;for(let a=Math.round(e.h*.75);a<=e.h&&!u;a+=4)t.material(i+Math.round(n*a*c),Math.round(r-a*l))!==0&&(u=!0);if(u){a=Math.max(.2,s-.05);break}}let o=Math.max(1,e.topple),s=e.t,c=Math.round(o*.2),l=t=>[i+Math.round(n*e.h*.7*Math.sin(t)),Math.round(r-e.h*.7*Math.cos(t))];if(s<c){let e=-.09*Math.sin(s/c*Math.PI),[t,n]=l(e);return{angle:e,landed:!1,since:0,tipX:t,tipY:n}}let u=Math.max(1,Math.round(o*.5)),d=s-c;if(d<u){let e=a*(d/u)**2,[t,n]=l(e);return{angle:e,landed:!1,since:0,tipX:t,tipY:n}}let f=d-u,p=Math.max(0,.12*Math.sin(f/8*Math.PI)*(f<8?1:.35)),[m,h]=l(a);return{angle:a-p,landed:!0,since:f,tipX:m,tipY:h}}var L=300,Re=new Int8Array(L*L);function ze(e,t,n,r,i){let a=e.face>=0?1:-1,o=Math.round(e.y),s=Math.round(e.x),{angle:c,landed:l,since:u}=Le(e,i),d=a*c,f=-Math.tan(d/2),p=Math.sin(d);Re.fill(-1);let m=l&&u<3?1:0;for(let e=0;e<t.h;e++){let n=e-(t.h-1);for(let r=0;r<t.w;r++){let i=t.px[e*t.w+r];if(i<0)continue;let o=a*(r-t.anchor)+Math.round(f*n),s=n+Math.round(p*o),c=o+Math.round(f*s)+150,l=s+150;c<0||l<0||c>=L||l>=L||(Re[l*L+c]=i)}}for(let e=0;e<L;e++){let t=o+e-150+m,a=e*L,c=-1,l=0;for(let e=0;e<=L;e++){let u=e<L?Re[a+e]:-1;u>=0&&t>o&&i.material(s+e-150,t)!==0&&(u=-1),u===c&&e<L||(c>=0&&r.rect(s+l-150,t,e-l,1,n[c]),c=u,l=e)}}}function Be(e,t,n,r,i){let a=Ne()[Pe(e)],o=e.face>=0?1:-1,s=Math.round(e.y),c=Ie(e);if(c<=0)return;let l=Math.round((1-c)*(a.h+6)/2)*2,u=(e.state===ve||e.state===we||e.state===Ce)&&(r>>1&1)==1?o:0,d=Math.round(e.x)+u,f=s-a.h+l,p=Math.round(a.h*.55),m=+(e.state===ye&&(e.age>>5&1)==1)-(e.state===xe&&e.t<3||e.state===be&&e.t>e.reach&&e.t<=e.reach+3),h=Fe(r,e.state===be||e.state===Se||e.state===Ce||Pe(e)===Oe),g=e.state===ve||e.state===we;if(e.state===Te)ze(e,a,h,t,i);else{for(let e=0;e<a.h;e++){let n=e<p?-m:0,r=f+e+n;if(r>=s)break;let c=e===p&&m>0?m+1:1;for(let n=0;n<c;n++){let c=r-n;if(c>=s)continue;let l=-1,u=0;for(let n=0;n<=a.w;n++){let r=n<a.w?a.px[e*a.w+n]:-1;if(r>=0&&(g||c>=s-8)&&i.material(d+o*(n-a.anchor),c)!==0&&(r=-1),!(r===l&&n<a.w)){if(l>=0){let e=d+o*(u-a.anchor),r=d+o*(n-1-a.anchor);t.rect(Math.min(e,r),c,Math.abs(r-e)+1,1,h[l])}l=r,u=n}}}}if(e.held>0){let i=Math.round(e.hx),a=Math.round(e.hy)+l,o=r>>2&1?je[4]:je[3];t.rect(i-2,a-2,5,5,je[2]),t.rect(i-1,a-1,3,3,o),n.rect(i-4,a-4,9,9,je[1],.3)}}}var Ve=.42,He=.72,Ue=.55,We=.8,Ge=24,Ke=6,qe=class{probe;onThud;cap;n=0;x;y;vx;vy;w;h;color;age;rest;gone;ground;constructor(e,t,n){this.probe=t,this.onThud=n,this.cap=e,this.x=new Float32Array(e),this.y=new Float32Array(e),this.vx=new Float32Array(e),this.vy=new Float32Array(e),this.w=new Uint8Array(e),this.h=new Uint8Array(e),this.color=new Uint32Array(e),this.age=new Uint16Array(e),this.rest=new Uint16Array(e),this.gone=new Uint8Array(e),this.ground=new Uint8Array(e)}add(e){let t=Math.max(1,Math.min(4,Math.round(e.w))),n=Math.max(1,Math.min(4,Math.round(e.h))),r=Math.floor(e.x-t/2),i=Math.floor(e.y-n/2),a=i;for(;a>i-8&&this.hit(r,a,t,n);)a--;if(this.hit(r,a,t,n))return;let o=this.n;if(o>=this.cap){let e=0,t=1/0;for(let n=0;n<this.n;n++){let r=this.ground[n]?this.rest[n]-this.gone[n]:1e6;r<t&&(t=r,e=n)}o=e}else this.n++;this.x[o]=r,this.y[o]=a,this.vx[o]=e.vx,this.vy[o]=e.vy,this.w[o]=t,this.h[o]=n,this.color[o]=e.color,this.age[o]=0,this.rest[o]=Math.max(1,Math.min(65535,Math.round(e.rest))),this.gone[o]=0,this.ground[o]=0}hit(e,t,n,r){let i=Math.floor(e),a=Math.floor(t);for(let e=0;e<r;e++)for(let t=0;t<n;t++)if(this.probe.solid(i+t,a+e))return!0;return!1}step(e,t){let n=0;for(let r=0;r<this.n;r++){let i=this.x[r],a=this.y[r],o=this.vx[r],s=this.vy[r],c=this.w[r],l=this.h[r],u=this.rest[r],d=this.gone[r],f=this.ground[r],p=this.age[r]+1;if(f&&this.hit(i,a+1,c,l)){if(o!==0){let e=i+o;this.hit(e,a,c,l)?this.hit(e,a-1,c,l)?o=-o*.3:(i=e,--a):i=e,o*=We,Math.abs(o)<.05&&(o=0,i=Math.floor(i))}else if(u>0)u--;else if(++d>=Ge)continue}else{if(f=0,s=Math.min(Ke,s+e),o*=.995,c!==l&&!(p&7)&&!this.hit(i,a,l,c)){let e=c;c=l,l=e}let t=Math.max(1,Math.ceil(Math.max(Math.abs(o),Math.abs(s)))),n=o/t,r=s/t;for(let e=0;e<t;e++){if(!this.hit(i+n,a,c,l))i+=n;else{o=-o*.45;break}if(!this.hit(i,a+r,c,l))a+=r;else{if(r>0){for(a=Math.floor(a+r);this.hit(i,a,c,l);)a--;let e=s;if(e>1.2&&this.onThud&&this.onThud(i+c/2,a+l,e),e<Ue){if(s=0,f=1,l>c&&!this.hit(i,a+l-c,l,c)){let e=l;l=c,c=e,a+=e-l}}else s=-e*Ve,o*=He}else s=0;break}}}a>t+8||(this.x[n]=i,this.y[n]=a,this.vx[n]=o,this.vy[n]=s,this.w[n]=c,this.h[n]=l,this.color[n]=this.color[r],this.age[n]=Math.min(65535,p),this.rest[n]=u,this.gone[n]=d,this.ground[n]=f,n++)}this.n=n}draw(e){for(let n=0;n<this.n;n++){let r=this.w[n],i=this.h[n],a=Math.floor(this.x[n]),o=Math.floor(this.y[n]),s=this.color[n],c=this.gone[n];if(c>0){let n=Math.floor(c*(i+1)/Ge);if(n>=i){for(let n=c&1;n<r;n+=2)e.push(a+n+.5,o+i-.5,1,1,t(s,.8),1);continue}o+=n,i-=n}let l=a+r/2;e.push(l,o+i/2,r,i,s,1),i>=2?(e.push(l,o+.5,r,1,t(s,1.22),1),e.push(l,o+i-.5,r,1,t(s,.68),1)):e.push(a+.5,o+.5,1,1,t(s,1.22),1)}}clear(){this.n=0}},Je=3,Ye=34,Xe=18,Ze=[[1.15,3807376,.35],[1,2907391,.6],[.75,5812479,.8],[.5,11593983,.9],[.28,16777215,1]],Qe=class{particles;charges=[];beams=[];constructor(e){this.particles=e}get active(){return this.charges.length>0||this.beams.length>0}charge(e,t){this.charges.push({x:e.x,y:e.y,start:e.tick,dur:e.params.ticks??70,rng:t})}fire(e,t,n){this.charges=this.charges.filter(t=>Math.abs(t.x-e.x)>2),this.beams.push({x:Math.round(e.x),y:Math.round(n),hw:Math.max(10,Math.round(e.radius*.13)),start:e.tick,rng:t})}tick(e,t){let n=this.particles;this.charges=this.charges.filter(r=>{let i=e-r.start;if(i>r.dur+2)return!1;let a=Math.min(1,i/r.dur),o=Math.round((1+5*a)*t);for(let e=0;e<o;e++){let e=r.rng.next()<.5?-1:1,t=r.rng.range(14,60)*(1-.6*a);n.add({x:r.x+.5+e*t,y:r.rng.range(0,r.y),vx:-e*t/9,vy:0,life:9,size:1,color:r.rng.next()<.35?16777215:6340863,kind:I.Spark})}return!0});let r=0;return this.beams=this.beams.filter(i=>{let a=e-i.start;if(a>55)return!1;if(a>37)return!0;r=Math.max(r,3);let o=i.rng,s=Math.round(10*t)+2;for(let e=0;e<s;e++){let t=e%2==0?-1:1;n.add({x:i.x+.5+t*o.range(i.hw*.6,i.hw*1.3),y:i.y-o.range(1,6),vx:t*o.range(.8,4),vy:-o.range(.6,4.2),life:o.range(16,40),size:o.next()<.25?2:1,color:o.next()<.4?16777215:o.next()<.6?10148095:4881663,kind:I.Spark})}for(let e=0;e<2;e++){let e=o.next()<.5?-1:1;n.add({x:i.x+.5+e*(i.hw+1),y:o.range(0,i.y),vx:e*o.range(.2,.8),vy:-o.range(.2,1.2),life:o.range(8,16),size:1,color:13693183,kind:I.Spark})}return!0}),r}draw(e,t){for(let n of this.charges)this.drawCharge(e,n,t);for(let n of this.beams)this.drawBeam(e,n,t)}drawCharge(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,r/t.dur),a=t.x+.5;if(Math.floor(r/(i<.5?8:i<.85?4:2))%2==0&&(e.push(a,t.y-1.5,3,1,4245759,1),e.push(a,t.y-1.5,1,3,4245759,1),e.push(a,t.y-1.5,1,1,16777215,1)),i>.85){let n=1+2*Math.round((i-.85)*20);e.push(a,t.y/2,n+4,t.y,2907391,.35),e.push(a,t.y/2,n,t.y,13693183,.9)}else if(r%6!=5){let n=r*3%11;for(let r=n-6;r<t.y;r+=11){let n=Math.max(0,r),o=Math.min(t.y,r+6);o<=n||e.push(a,(n+o)/2,1,o-n,5290239,.4+.5*i)}}let o=i>.85?16777215:6342911,s=t.y-1.5;for(let t of[44,22]){let n=Math.round(t-(t-6)*i),r=t>30?6:4;for(let t of[-1,1])for(let i of[-1,1]){let c=a+t*n,l=s+i*n;e.push(c-t*(r-1)/2,l,r,1,o,.9),e.push(c,l-i*(r-1)/2,1,r,o,.9)}}}drawBeam(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,(r+1)/Je);if(r>37&&(i=1-(r-Je-Ye)/Xe),i<=0)return;let a=$e(n*31+t.x),o=a&3?(a&3)==3?2:0:-1,s=Math.max(.5,t.hw*i+o),c=t.x+.5,l=t.y/2;for(let[n,r,i]of Ze){let a=Math.round(s*n);a<0||e.push(c,l,a*2+1,t.y,r,i)}let u=Math.round(s*1.15)*2+3;for(let n=r*9%22;n<t.y;n+=22)e.push(c,Math.floor(n)+1,u,2,14742783,.6*i);for(let r=0;r<24;r++){let i=$e(n*97+r*13+t.x*7),a=i%Math.max(1,t.y),o=i>>12&1?1:-1,l=Math.round(s*1.15)+1+(i>>13&3);e.push(c+o*l,a+.5,1,1,i>>10&1?16777215:8442111,.9)}if(r<=37){let n=r<29?1:(37-r)/8,i=Math.round((t.hw*4+(a>>4&7))*n);e.push(c,t.y-1,i*2+1,2,5812479,.7*n),e.push(c,t.y-1,Math.round(i*.55)*2+1,3,13693183,.85*n),e.push(c,t.y-1,Math.round(t.hw*1.4)*2+1,6,16777215,n)}}clear(){this.charges=[],this.beams=[]}};function $e(e){let t=Math.imul(e^1540483477,2654435761);return t^=t>>>15,t>>>0&65535}var et=9,tt=14,nt=12,rt=[[2,11540480,.35],[0,16730640,.6],[-2,16751144,.8],[-4,16769136,.9],[-5,16777215,1]],it=class{particles;charges=[];beams=[];constructor(e){this.particles=e}get active(){return this.charges.length>0||this.beams.length>0}charge(e,t){this.charges.push({x:e.x,y:e.y,start:e.tick,dur:e.params.ticks??60,rng:t})}fire(e,t){this.charges=this.charges.filter(t=>t.x!==e.x),this.beams.push({x:e.x,end:e.y,surface:e.params.surface??e.y,start:e.tick,head:0,done:-1,rng:t})}track(e,t){for(let n of this.beams){if(n.done>=0||t<=n.start)continue;let r=!1;for(let t of e)if(t.kind===`projectile`&&Math.floor(t.x)===n.x&&!(t.y<n.head-1)){n.head=t.y,r=!0;break}r||(n.done=t)}}owns(e,t){for(let n of this.beams)if(n.done<0&&Math.floor(e)===n.x&&t>=n.head-1)return!0;return!1}tick(e,t){let n=this.particles;this.charges=this.charges.filter(r=>{let i=e-r.start;if(i>r.dur+2)return!1;let a=Math.min(1,i/r.dur),o=Math.round((1+3*a)*t);for(let e=0;e<o;e++){let e=r.rng.next()<.5?-1:1,t=r.rng.range(10,34)*(1-.5*a),i=r.rng.range(0,r.y);n.add({x:r.x+.5+e*t,y:i,vx:-e*t/10,vy:0,life:10,size:1,color:r.rng.next()<.3?16777215:16728128,kind:I.Spark})}return!0});let r=0;return this.beams=this.beams.filter(i=>{let a=e-i.start,o=i.done>=0?e-i.done:0;if(o>26)return!1;let s=i.rng;if(i.done<0||o<tt){if(r=Math.max(r,i.done<0?2:1.2),i.head>=i.surface-1){let e=Math.round(6*t)+1;for(let t=0;t<e;t++){let e=t%2==0?-1:1;n.add({x:i.x+.5+e*s.range(7,11),y:i.surface-1,vx:e*s.range(.4,2.2),vy:-s.range(1.2,3.6),life:s.range(18,40),size:s.next()<.3?1.5:1,color:s.next()<.35?16773280:s.next()<.6?16752688:16734744,kind:I.Spark})}a%3==0&&n.add({x:i.x+.5+s.range(-9,et),y:i.surface-2,vx:s.range(-.3,.3),vy:-s.range(.3,.8),life:s.range(50,90),size:s.range(4,8),color:s.next()<.5?3813428:5918288,kind:I.Smoke})}if(i.done<0&&i.head>0){let e=Math.round(4*t)+1;for(let t=0;t<e;t++)n.add({x:i.x+.5+s.range(-9,et),y:i.head,vx:s.range(-1.2,1.2),vy:-s.range(.5,2.5),life:s.range(8,18),size:1,color:s.next()<.5?16777215:16765024,kind:I.Spark})}}else a%4==0&&n.add({x:i.x+.5+s.range(-3,3),y:i.surface-1,vx:s.range(-.15,.15),vy:-s.range(.3,.6),life:s.range(60,110),size:s.range(3,6),color:6972006,kind:I.Smoke});return!0}),r}draw(e,t){for(let n of this.charges)this.drawCharge(e,n,t);for(let n of this.beams)this.drawBeam(e,n,t)}drawCharge(e,t,n){let r=n-t.start;if(r<0)return;let i=Math.min(1,r/t.dur),a=t.x+.5;if(Math.floor(r/(i<.5?8:i<.85?4:2))%2==0&&(e.push(a,t.y-1.5,3,1,16724016,1),e.push(a,t.y-1.5,1,3,16724016,1),e.push(a,t.y-1.5,1,1,16777215,1)),i>.85)e.push(a,t.y/2,3,t.y,16722448,.35),e.push(a,t.y/2,1,t.y,16769232,.9);else if(r%6!=5){let n=r*3%11;for(let r=n-6;r<t.y;r+=11){let n=Math.max(0,r),o=Math.min(t.y,r+6);o<=n||e.push(a,(n+o)/2,1,o-n,16724016,.4+.5*i)}}let o=Math.round(26-18*i),s=i>.85?16777215:16728128,c=t.y-1.5;for(let t of[-1,1])for(let n of[-1,1]){let r=a+t*o,i=c+n*o;e.push(r-t*3/2,i,4,1,s,.9),e.push(r,i-n*3/2,1,4,s,.9)}}drawBeam(e,t,n){let r=n-t.start;if(r<0)return;let i=t.done>=0?Math.max(0,n-t.done):0,a=et*Math.min(1,(r+1)/3);if(i>tt&&(a=et*(1-(i-tt)/nt)),a<=0)return;let o=at(n*31+t.x);a=Math.max(.5,Math.round(a+(o&3?+((o&3)==3):-1)));let s=Math.max(1,Math.round(t.head)),c=t.x+.5,l=s/2,u=a/et;for(let[t,n,r]of rt){let i=Math.round(a+t*u);i<0||e.push(c,l,i*2+1,s,n,r)}for(let t=r*7%18;t<s;t+=18)e.push(c,Math.floor(t)+1,Math.round(a)*2+3,2,16777215,.55);for(let r=0;r<10;r++){let i=at(n*97+r*13+t.x*7),o=i%s,l=i>>12&1?1:-1;e.push(c+l*(Math.round(a)+2+(i>>13&1)),o+.5,1,1,16765056,.9)}if(t.done<0||i<tt){let n=t.done<0?1:1-i/tt;if(e.push(c,s,27,5,16742944,.7*n),e.push(c,s,19,3,16777215,n),s>=t.surface-1){let r=Math.round((45+(o>>4&3))*n);e.push(c,t.surface-1,r*2+1,1,16760928,.75*n),e.push(c,t.surface-1,Math.round(r*.5)*2+1,2,16777215,.85*n)}}}clear(){this.charges=[],this.beams=[]}};function at(e){let t=Math.imul(e^1540483477,2654435761);return t^=t>>>15,t>>>0&65535}var ot=4870232,st=9081500,ct=2501168,lt=14168122,ut=14212324,dt=[12580095,8378608,4892888],ft=16728128,pt=5904922,mt=3,ht=42;function gt(e,t,n,r,i=1){e.push(Math.round(t)+.5,Math.round(n)+.5,1,1,r,i,F.Rect)}function _t(e,t,n,r,i,a){e.push(t+r/2,n+i/2,r,i,a,1,F.Rect)}function vt(e,t){let n=Math.imul(e^2654435769,2246822507)^Math.imul(t+1663821227,3266489909);return n^=n>>>15,n=Math.imul(n,739982445),(n^n>>>13)>>>0}function yt(e,t,n,r){let i=e.age+Math.max(0,r-e.last),a=i-e.arm,o=a>=0&&a<e.life&&e.strength>0,s=Math.round(e.x),c=Math.round(e.y);if(o){let r=e.strength;for(let i=0;i<mt;i++){let o=((a+i*ht/mt)%ht+ht)%ht,l=1-o/ht,u=6+(e.r-6)*l*l,d=Math.max(16,Math.round(u*1.6)),f=dt[l>.66?2:+(l>.33)],p=Math.min(1,r*(.6+.4*(1-l))),m=i*.7+(a-o)*.013;for(let e=0;e<d;e++){if(vt(e,i+Math.floor((a-o)/ht)*7)%4==0)continue;let r=m+e/d*Math.PI*2,h=c-2+Math.sin(r)*u*.75;h>c-2||(gt(t,s+Math.cos(r)*u,h,f,p),l<.4&&gt(n,s+Math.cos(r)*u,h-1,f,.5*p))}}for(let n=-1;n<=1;n+=2)for(let i=0;i<6;i++){let o=e.r-8,l=8+((i*o/6-a*(1.2+r))%o+o)%o,u=Math.round(Math.sin(l/e.r*Math.PI)*e.r*.22),d=s+n*l,f=c-3-u,p=dt[l<e.r*.33?0:1];gt(t,d,f,p,r),gt(t,d+n,f,p,.6*r)}}let l=s-4,u=c-4;_t(t,l,u,9,4,ot),_t(t,l,u,9,1,st),_t(t,l,u+4-1,9,1,ct),_t(t,l-1,u+1,2,3,lt),_t(t,l+9-1,u+1,2,3,ut);let d=Math.floor(i/((o?6:16)/2))%2==0;_t(t,s-1,u-2,3,2,ct),gt(t,s,u-2,d?ft:pt),d&&gt(n,s,u-3,ft,.6)}var bt=[16775388,16769136,16756784,15757344,13124632,9057312,6175280,4864572,3813430],xt=44,St=22,Ct=40,wt=16;function Tt(e,t,n,r,i,a=0){let o=new P(i),s=new Float32Array(488);for(let e=0;e<s.length;e++)s[e]=o.next();return{x:e,y:t,r:n,start:r,fuse:a,life:a+240,top:Math.max(n*.55+6,0),p:s}}var Et=e=>1-(1-e)*(1-e);function Dt(e){return bt[Math.max(0,Math.min(bt.length-1,Math.floor(e)))]}function Ot(e,t,n,r,i,a){if(r<1||a<=.02)return;e.push(t,n,r,r,Dt(i+1.4),a,F.Solid);let o=r*.7;e.push(t-r*.11,n-r*.14,o,o,Dt(i),a,F.Solid)}function kt(e,t,n,r,i=!0){return Mt(e,r,n,i?(e,n,r,i,a)=>Ot(t,e,n,r,i,a):null)}var At=new WeakMap;function jt(e,t,n,r){let i=At.get(e)??new Float32Array(244).fill(NaN),a=new Float32Array(244),o=new P(e.start*7919+t*104729>>>0),s=0;Mt(e,t,null,(e,t,c,l,u)=>{let d=s++;if(a[d*2]=e,a[d*2+1]=t,c<1||u<=.02)return;let f=i[d*2],p=i[d*2+1],m=Number.isFinite(f)&&Math.abs(e-f)<3&&Math.abs(t-p)<3,h=m?e-f:0,g=m?t-p:0,_=Math.max(1,Math.min(10,Math.round(c*c*.01*r*u))),v=c/2;for(let r=0;r<_;r++){let r=o.next()*6.283185,i=Math.sqrt(o.next()),a=Math.cos(r)*i,s=Math.sin(r)*i;n.add({x:e+a*v,y:t+s*v,vx:h+(o.next()-.5)*.06,vy:g+(o.next()-.5)*.06,life:26+o.next()*20,size:1,color:Dt(l+(s-a*.4>.1?1.4:0)),kind:I.Cloud|128})}}),At.set(e,a)}function Mt(e,t,n,r){let i=t-e.start;if(i<0)return!0;if(i>e.life)return!1;let{x:a,y:o,r:s,p:c,life:l,fuse:u}=e,d=Et(Math.min(1,i/(l*.9))),f=o-Math.min(s*2.4,o-e.top)*(.1+.9*d),p=s*(.3+.8*Et(Math.min(1,i/l))),m=p*.42,h=Math.min(1,i/(l*.75)),g=i-u,_=g>=0&&g<50?(1-g/50)*3:0,v=.2+h*6.4-_,y=i<l-70?1:(l-i)/70,b=i*.02,x=i*.035,S=o+s*.45,C=f+m*.6,w=Math.max(0,S-C);for(let e=0;e<Ct;e++){let t=(66+e)*4,n=(c[t]+i*.012)%1,o=1-.45*Math.sin(Math.PI*Math.min(1,n*1.15)),u=s*.26*o*(.8+.4*c[t+1]),d=a+(c[t+3]-.5)*u*1.2+b*n,f=S-n*w,p=Math.max(3,u*1.7*(.85+.3*c[t+1])),m=v-.8+(1-n)*.9+c[t+2]*.8,h=y*(i<l-110?1:(l-30-i)/80);r?.(d,f,p,m,Math.min(1,Math.max(0,h))*.95)}for(let e=0;e<wt;e++){let t=(106+e)*4,n=e%2==0?-1:1,l=s*(.3+1.3*Et(Math.min(1,i/140)))*(.4+.6*c[t]),u=s*(.16+.14*c[t+1])*(.6+.6*d);r?.(a+n*l,o-u*.35-c[t+3]*s*.12,u,4.6+h*2.2+c[t+2],y*.85)}for(let e=0;e<xt;e++){let t=e*4,n=e%2==0?-1:1,i=c[t]*Math.PI*2+x*n,o=p*(.45+.3*c[t+3]),s=m*.85,l=Math.cos(i),u=Math.sin(i),d=a+b+n*(o+l*s),h=f-u*s,g=m*(.85+.55*c[t+1]),_=v+u*1.1+c[t+2]*.9-.4;r?.(d,h,g,_,y)}for(let e=0;e<St;e++){let t=(xt+e)*4,n=c[t]*2-1,i=a+b+n*p*.6,o=f+m*.3-m*(.2+1*(1-n*n))*c[t+3],s=m*(1+.5*c[t+1]);r?.(i,o,s,v+c[t+2]*.9-.6,y)}let T=_>0?g:i;if(n&&T<120){let e=1-T/120,t=p*.9;n.push(a+b,f+m*.2,t,t*.7,16747056,.55*e*e,F.Pixel),n.push(a,S-w*.4,s*.3,w*.7,16736288,.35*e*e,F.Pixel)}return!0}var Nt=[10131104,8025732,6183528,4670287,3420475],Pt=64;function Ft(e,t){let n=new P(e),r=new Float32Array(256);for(let e=0;e<r.length;e++)r[e]=n.next();return{x:0,y:0,h:100,base:4,top:30,lean:0,wobble:0,age:0,strength:0,down:0,last:t,born:t,dust:9073752,p:r}}function It(e,t){let n=Math.max(0,Math.min(1,t/e.h)),r=e.base+(e.top-e.base)*n*n;return Math.max(1,r*Math.max(e.strength,1/3))}function Lt(e,t,n=e.age){let r=Math.max(0,Math.min(1,t/e.h)),i=(n*25+Math.min(e.h,Math.max(0,t))*25)/10;return e.x+e.lean*r+Math.sin(i*Math.PI/180)*e.wobble*r}function Rt(e,n,r,i){let a=e.age+Math.max(0,i-e.last),o=e.h,s=e.y-o,c=e.p,l=Math.min(1,(i-e.born)/18),u=l*Math.max(0,Math.min(1,1-(i-e.last-1)/10));if(u<=0)return;let d=e.top*3.2+40,f=14+e.top*.35,p=s-f*.4,m=a*.03;for(let t=0;t<Pt;t++){let r=t*4,i=c[r]*Math.PI*2+m*(.6+.8*c[r+3]),a=.15+.85*c[r+1],o=e.x+e.lean+Math.cos(i)*d*a,s=p+Math.sin(i)*f*.45*a+(1-a)*f*.5-c[r+2]*f*.5,h=(10+14*c[r+2])*(1.2-.45*a)*(.5+.5*l),g=Math.min(Nt.length-1,Math.max(0,Math.floor(2.4-Math.sin(i)*1.4-c[r+2]*1.6+(1-a)*1.2)));n.push(Math.round(o),Math.round(s),h,h*.75,Nt[g],.95*u,F.Solid)}let h=o*e.down,g=t(e.dust,1.05),_=a*.32;for(let r=0;r<=o;r++){if(o-r>h)continue;let i=e.y-r,s=It(e,r),c=Lt(e,r,a),l=r/o,d=l<.22?g:7236216,f=Math.round(c-s),p=Math.round(c+s),m=p-f+1;n.push(f+m/2,i+.5,m,1,d,(.5+.2*(1-l))*u),n.push(f+.5,i+.5,1,1,t(d,.7),.75*u),n.push(p+.5,i+.5,1,1,t(d,.7),.75*u);for(let e=0;e<3;e++){let a=_+e*2.0944-r*.11,o=Math.round(c+Math.cos(a)*s),l=Math.sin(a)>0,f=1+Math.round(Math.abs(Math.sin(a))*Math.min(4,s*.35));l?n.push(o+.5,i+.5,f,1,t(d,1.3),.9*u):n.push(o+.5,i+.5,f,1,t(d,.6),.6*u)}}if(e.down>=1&&e.strength>.05)for(let n=0;n<6;n++){let i=_*1.3+n*1.047,a=It(e,0)*2.2+3;r.push(Math.round(e.x+Math.cos(i)*a)+.5,e.y-1-Math.round(Math.abs(Math.sin(i))*3)+.5,2,1,t(e.dust,1.4),.35*e.strength*u)}}var zt=[.62,.8,1,1.18,1.32],Bt=[3824895,4885759,6966527,10116351,4241663],Vt=1.8,Ht=[16728128,4259696,5934335,16764992,16734950,4255999,16752688],Ut=26,Wt=400,Gt=[16777215,15136511,12575994,9227247,6203612],R=[16776170,15918772,14206853,11046732],Kt=[3814454,6972002,3419178],qt=[4865834,7233606,9404250,12365446],Jt=[13682872,11577496,9208948],Yt=8;function Xt(e){let t=e>>>16&255,n=e>>>8&255,r=e&255,i=Math.max(t,n,r);return i<=152&&i-Math.min(t,n,r)<=36}var Zt=10;function Qt(e,t,n){if(e<0||t<=0)return 0;if(e<=8)return t;let r=1-(e-8)/n;return r<=0?0:t*r*r*(3-2*r)}function $t(e){return{peak:Math.min(1,.45+e/130),fade:Math.round(60+e*3)}}var en=[.45,1,.7,.95,0,.85,.4,0,.9,.3,.6,0,.5],z=[[16760944,.5,.32,.18],[16769200,.42,.36,.28],[16747056,.62,.24,.06],[11066623,.2,.36,.62],[13162751,.42,.46,.72],[13676672,.34,.27,.16],[12120128,.22,.5,.1]],tn=192,nn=18,rn=.12,an={low:{cap:3e4,mult:.35},medium:{cap:1e5,mult:.7},high:{cap:3e5,mult:1}};function on(e){let t=(e>>16&255)*.5+127.5,n=(e>>8&255)*.5+75,r=(e&255)*.5+30;return Math.round(t)<<16|Math.round(n)<<8|Math.round(r)}var sn=class{sink;fluid;probe;ripples=[];glows=[];fronts=[];bolts=[];jets=[];crystals=[];mushrooms=[];vortices=[];funnels=[];strands=[];splats=[];fireworks=[];posts=[];magnets=[];kaijus=[];columns=[];shakeAmp=0;shakeStart=0;shakeDur=14;held=0;sky=[0,0,0];skyFlash=0;whiteStart=0;whitePeak=0;whiteFade=1;split=0;mult=1;wind=0;lances;ions;ricochetHeat=0;ricochetLast=-1e3;chunks;particles;smoke=[];constructor(e,t,n){this.sink=e,this.fluid=t,this.probe=n,this.particles={add:e=>this.addParticle(e)},this.lances=new it(e),this.ions=new Qe(e),this.chunks=new qe(tn,{solid:(e,t)=>n.material(e,t)!==0},(e,t,n)=>this.thud(e,t,n))}addParticle(e){if(e.kind!==I.Smoke||!Xt(e.color)){this.sink.add(e);return}let t=this.smoke;for(let n=0;n<t.length;n++){let r=t[n];if(Math.abs(r.x/r.n-e.x)<=24&&Math.abs(r.y/r.n-e.y)<=24){r.n++,r.x+=e.x,r.y+=e.y,r.vx+=e.vx,r.vy+=e.vy,r.size+=e.size;return}}t.length<Yt&&t.push({n:1,x:e.x,y:e.y,vx:e.vx,vy:e.vy,size:e.size})}flushSmoke(){let e=this.smoke;for(let t=0;t<e.length;t++){let n=e[t],r=n.n,i=n.size/r,a=Math.max(4,i*1.2+Math.sqrt(r)*2),o=Math.min(1.6,.12*i*Math.sqrt(r));this.fluid.splat(n.x/r,n.y/r,a,n.vx/r*1.5,n.vy/r*1.5,o,0)}e.length=0}thud(e,n,r){if(this.mult<.5)return;let i=t(this.dustColor(e,n+1),1.15),a=r>2.5?2:1;for(let t=0;t<a;t++){let a=t===0?-1:1;this.particles.add({x:e+a,y:n-1,vx:a*.25,vy:-.12,life:18+Math.round(r*4),size:2+Math.min(2,r*.5),color:i,kind:I.Dust})}}rngFor(e,t){return new P((Math.imul(e.tick+1,2654435761)^Math.imul(e.x+7,40503)^Math.imul(e.y+3,9973))+t)}handle(e){switch(e.type){case`burst`:this.burst(e,e.params.count??24);break;case`flash`:{let t=z[e.params.dt??0]??z[0],n=e.params.strength??1;if(n<=0)break;this.glows.push({x:e.x,y:e.y,r:e.radius*2.2,start:e.tick,dur:14,color:t[0],strength:n}),this.tintSky(t,.008*e.radius*n),this.kick(s(e.radius,n),e.tick),this.smokeColumn(e,e.params.dt??0),e.radius>=60&&(this.glows.push({x:e.x,y:e.y,r:e.radius*1.2,start:e.tick,dur:26,color:16774880,strength:1.4}),this.split=Math.max(this.split,Math.min(4,e.radius/30)));break}case`nukeBlast`:this.nuke(e);break;case`mirvSplit`:this.mirvSplit(e);break;case`fireball`:this.fireball(e,e.params.strength??1);break;case`meteorCall`:this.meteorCall(e);break;case`fireworkLaunch`:this.fireworkLaunch(e);break;case`fireworkBurst`:this.fireworkBurst(e);break;case`fireworkStar`:this.fireworkStar(e);break;case`geyser`:this.geyser(e,e.params.strength??1);break;case`ricochet`:this.ricochet(e);break;case`ricochetBurst`:this.ricochetBurst(e,e.params.strength??1);break;case`dirtBurst`:this.dirtBurst(e);break;case`shake`:this.kick((e.params.strength??1)*3,e.tick);break;case`ripple`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:45,maxR:e.radius*2,width:16,strength:e.params.strength??1});break;case`shockwave`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??20),rng:this.rngFor(e,11),portal:!0}),e.radius>=60&&this.tintSky([0,.32,.22,.7],Math.min(.35,e.radius/600));break;case`shockFling`:{let t=this.rngFor(e,13),n=e.params.dir??1,r=Math.round(22*this.mult)+4;for(let i=0;i<r;i++)this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y+t.range(-2,3),vx:n*t.range(.6,3.2),vy:-t.range(.4,2.6),life:t.range(12,30),size:1,color:t.next()<.5?16760928:16747056,kind:I.Spark});for(let r=0;r<4;r++)this.particles.add({x:e.x-n*t.range(0,e.radius),y:e.y+t.range(-2,2),vx:n*t.range(.2,.6),vy:-t.range(0,.3),life:t.range(14,24),size:4,color:Bt[Math.floor(t.next()*Bt.length)],kind:I.Plasma});break}case`shockFly`:{let t=this.rngFor(e,19);t.next()<.7*this.mult&&this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y+t.range(-2,2),vx:t.range(-.6,.6),vy:t.range(-.6,.4),life:t.range(8,18),size:1,color:16756816,kind:I.Spark}),t.next()<.35*this.mult&&this.particles.add({x:e.x,y:e.y,vx:0,vy:-.1,life:t.range(20,36),size:3,color:4867144,kind:I.Smoke});break}case`shockSlam`:{let n=this.rngFor(e,17),r=this.dustColor(e.x,e.y+e.radius),i=Math.round(10*this.mult)+2;for(let a=0;a<i;a++)this.particles.add({x:e.x+n.range(-e.radius,e.radius),y:e.y+n.range(-3,3),vx:n.range(-1,1),vy:-n.range(.3,1.4),life:n.range(20,40),size:n.range(2,4),color:t(r,1.1),kind:I.Dust});break}case`muzzle`:{let t=this.rngFor(e,3),n=(e.params.angle??90)*Math.PI/180,r=Math.round(10*this.mult)+2;for(let i=0;i<r;i++){let r=t.range(.6,2.2),i=t.range(-.35,.35);this.particles.add({x:e.x,y:e.y,vx:Math.cos(n+i)*r,vy:-Math.sin(n+i)*r,life:t.range(6,14),size:t.range(.5,1),color:16756800,kind:I.Spark})}for(let r=0;r<3;r++)this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*.4+t.range(-.1,.1),vy:-Math.sin(n)*.4,life:t.range(25,40),size:t.range(2,3.5),color:9076880,kind:I.Smoke});this.glows.push({x:e.x,y:e.y,r:6,start:e.tick,dur:5,color:16765056,strength:1});break}case`land`:{let t=this.rngFor(e,5),n=Math.round(Math.min(20,4+(e.params.distance??0))*this.mult)+2;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+n*t.range(4,9),y:e.y-1,vx:n*t.range(.2,.9),vy:-t.range(0,.25),life:t.range(20,40),size:t.range(2,4),color:this.dustColor(e.x,e.y),kind:I.Dust})}break}case`gust`:{let t=this.rngFor(e,13),n=e.params.dir??1,r=Math.max(.2,(e.params.strength??500)/1e3),i=this.probe.width,a=this.probe.height,o=Math.round((10+26*r)*this.mult)+2;for(let e=0;e<o;e++){let e=t.range(0,i),o=this.surfaceNear(Math.floor(e),a*.5,a*.5),s=o>0?o-4:a*.7;this.particles.add({x:e,y:t.range(a*.04,Math.max(a*.06,s)),vx:n*t.range(1.6,3.2)*(.6+r),vy:0,life:t.range(30,60),size:Math.round(t.range(6,18)),color:15660287,kind:I.Streak})}let s=Math.round(8*r*this.mult);for(let e=0;e<s;e++){let e=Math.floor(t.range(0,i)),r=this.surfaceNear(e,a*.5,a*.5);r<0||this.particles.add({x:e,y:r-1,vx:n*t.range(.5,1.4),vy:-t.range(.05,.3),life:t.range(25,45),size:t.range(2,4),color:this.dustColor(e,r+1),kind:I.Dust})}break}case`creak`:case`collapse`:{let t=this.rngFor(e,9),n=e.type===`collapse`,r=Math.round((n?36:10)*this.mult)+2;for(let i=0;i<r;i++){let r=e.x+t.range(-e.radius,e.radius),i=e.y+t.range(-e.radius,e.radius)*.6;this.particles.add({x:r,y:i,vx:t.range(-.35,.35),vy:-t.range(.05,n?.5:.25),life:t.range(25,n?70:40),size:t.range(2,n?5:3),color:this.dustColor(Math.round(r),Math.round(i)),kind:I.Dust})}n&&this.kick(3,e.tick);break}case`bolt`:this.bolt(e);break;case`lanceCharge`:this.lances.charge(e,this.rngFor(e,43)),this.tintSky([0,.5,.06,.04],.12);break;case`lance`:this.lanceFire(e);break;case`pressureWave`:this.pressureWave(e,e.params.strength??1);break;case`ionCharge`:this.ions.charge(e,this.rngFor(e,151)),this.ionColumnWaves(e),this.tintSky([0,.15,.3,.7],.15);break;case`ionBlast`:this.ionBlast(e,e.params.strength??1);break;case`ionPulse`:this.ionPulse(e,e.params.strength??1);break;case`vortex`:this.vortices.push({x:e.x,y:e.y,r:Math.max(10,e.radius),start:e.tick,dur:Math.max(8,e.params.ticks??40),rng:this.rngFor(e,61)});break;case`swallow`:this.swallow(e);break;case`mineTrip`:this.mineTrip(e);break;case`eruption`:this.eruption(e,e.params.strength??1);break;case`volcanoGrow`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:50,maxR:e.radius*1.6,width:10,strength:.6}),this.fronts.push({x:e.x,y:e.y,maxR:e.radius*1.2,start:e.tick,dur:Math.max(10,e.params.ticks??40),rng:this.rngFor(e,131)}),this.kick(3,e.tick);break;case`volcanoErupt`:this.eruption(e,.9);break;case`arcs`:this.arcs(e,e.params.strength??1);break;case`frostBlast`:this.frostBlast(e);break;case`glueSplat`:this.glueSplat(e);break;case`glued`:this.glued(e);break;case`unglued`:this.unglued(e);break;case`frostFront`:this.fronts.push({x:e.x,y:e.y,maxR:e.radius,start:e.tick,dur:Math.max(4,e.params.ticks??30),rng:this.rngFor(e,43),cold:!0});break;case`frosted`:{let t=this.rngFor(e,47),n=Math.round(24*this.mult)+4;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-9,9),y:e.y+t.range(-5,4),vx:t.range(-.3,.3),vy:-t.range(.1,.8),life:t.range(14,30),size:1,color:Gt[Math.floor(t.next()*3)],kind:I.Spark});this.puff(e,14216954,10);break}case`iceGrow`:{let t=this.rngFor(e,71),n=Math.max(1,Math.round(3*this.mult));for(let r=0;r<n;r++)this.particles.add({x:Math.round(e.x+t.range(-e.radius,e.radius)),y:e.y-1,vx:t.range(-.6,.6),vy:-t.range(.3,1.2),life:t.range(10,22),size:1,color:Gt[Math.floor(t.next()*4)],kind:I.Spark});t.next()<.35*this.mult&&this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y,vx:t.range(-.2,.2),vy:-t.range(.02,.1),life:t.range(40,80),size:t.range(3,6),color:t.next()<.5?15004412:12771058,kind:I.Dust});break}case`iceWall`:this.kick(1.5,e.tick);break;case`quake`:{let t=e.params.strength??1;this.kick(t*2.5,e.tick);let n=this.rngFor(e,13),r=Math.round(Math.min(40,e.radius/4+6)*this.mult)+2;for(let t=0;t<r;t++){let t=Math.round(e.x+n.range(-e.radius,e.radius)*.5),r=this.surfaceNear(t,e.y,40);r<0||this.particles.add({x:t,y:r-1,vx:n.range(-.3,.3),vy:-n.range(.1,.6),life:n.range(25,50),size:n.range(2,4),color:this.dustColor(t,r+1),kind:I.Dust})}break}case`tsunamiRise`:this.kick(5,e.tick);break;case`tsunami`:{let t=e.params.dir??1,n=this.rngFor(e,17);this.kick(Math.min(3,e.radius/12),e.tick);let r=Math.round(Math.min(14,3+e.radius/4)*this.mult)+1;for(let i=0;i<r;i++){let r=Math.round(e.x-t*n.range(0,6)),i=this.surfaceNear(r,e.y,30);i<0||this.particles.add({x:r,y:i-1,vx:t*n.range(.6,1.8),vy:-n.range(.2,.9),life:n.range(16,34),size:n.range(1,3),color:this.dustColor(r,i+1),kind:I.Dust})}break}case`tsunamiCrash`:{let t=e.params.dir??1,n=this.rngFor(e,19);this.kick(9,e.tick);let r=Math.round(Math.min(60,12+e.radius)*this.mult)+2;for(let i=0;i<r;i++){let r=Math.round(e.x+t*n.range(-e.radius,e.radius*1.5)),i=this.surfaceNear(r,e.y,60);i<0||this.particles.add({x:r,y:i-Math.round(n.range(1,6)),vx:t*n.range(.2,1.4),vy:-n.range(.1,.7),life:n.range(30,60),size:n.range(2,4),color:this.dustColor(r,i+1),kind:I.Dust})}break}case`rift`:this.rift(e);break;case`sinkhole`:this.sinkhole(e);break;case`sinkholeDust`:this.sinkholeDust(e);break;case`resonate`:this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*1.4,width:10,strength:.8}),this.glows.push({x:e.x,y:e.y,r:e.radius,start:e.tick,dur:18,color:11563263,strength:1}),this.tintSky([0,.36,.18,.6],.25);break;case`zone`:this.puff(e,ln[e.params.look??0]??10139706,30);break;case`gasBurst`:this.gasBurst(e);break;case`reflect`:this.reflect(e);break;case`pocketBurst`:this.pocketBurst(e);break;case`zoneHurt`:this.puff(e,12120128,8);break;case`rusted`:case`rustHurt`:this.rustFlakes(e,e.type===`rusted`?14:8);break;case`rustWobble`:this.rustFlakes(e,4);break;case`burn`:{let t=this.rngFor(e,17),n=Math.round(14*this.mult)+3;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-e.radius,e.radius),y:e.y+t.range(0,3),vx:t.range(-.2,.2),vy:-t.range(.4,1.1),life:t.range(10,24),size:1,color:t.next()<.4?16769136:16738842,kind:I.Spark});break}case`implode`:{let t=this.rngFor(e,19),n=Math.round(40*this.mult)+4,r=Math.max(8,e.params.ticks??20);for(let i=0;i<n;i++){let n=t.range(0,Math.PI*2),i=e.radius*t.range(.7,1.1);this.particles.add({x:e.x+Math.cos(n)*i,y:e.y+Math.sin(n)*i,vx:-Math.cos(n)*i/r,vy:-Math.sin(n)*i/r,life:r,size:1,color:t.next()<.5?13676799:8413376,kind:I.Spark})}this.tintSky([0,.2,.1,.4],.2);break}case`mudGeyser`:this.mudGeyser(e);break;case`mudSplat`:this.mudSplat(e,e.params.count??12);break;case`tornado`:this.tornado(e);break;case`magnet`:this.magnet(e);break;case`kaiju`:this.kaiju(e);break;case`kaijuQuake`:{let t=e.params.k??0;this.kick(1+Math.min(3,t/8),e.tick);let n=this.rngFor(e,101);for(let t=0;t<3;t++)this.dirtPop({...e,x:e.x+n.range(-e.radius,e.radius)},4);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:e.radius*1.4,width:6,strength:.35});break}case`kaijuBurst`:this.dirtPop(e,70),this.dirtPop({...e,x:e.x-e.radius},25),this.dirtPop({...e,x:e.x+e.radius},25),this.kick(6,e.tick),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:110,width:14,strength:1}),this.tintSky([0,.3,.15,.05],.25);break;case`kaijuRise`:this.dirtPop(e,30),this.kick(3,e.tick),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:40,maxR:70,width:12,strength:.6});break;case`kaijuRoar`:this.kick(5,e.tick),this.ripples.push({x:e.x,y:e.y+8,start:e.tick,dur:36,maxR:120,width:14,strength:.9}),this.tintSky([0,.35,.12,.05],.3);break;case`kaijuGrab`:case`kaijuRip`:case`kaijuSink`:this.dirtPop(e,18);break;case`kaijuThrow`:case`kaijuToss`:this.dirtPop(e,10),this.kick(2,e.tick);break;case`kaijuFly`:e.tick&1||this.dirtPop(e,1);break;case`kaijuBounce`:this.dirtPop(e,14),this.kick(2,e.tick);break;case`kaijuSlam`:this.dirtPop(e,34),this.kick(5,e.tick),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:24,maxR:40,width:8,strength:.8});break;case`kaijuTopple`:this.dirtPop(e,40),this.kick(4,e.tick),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:90,width:12,strength:.8});break;case`kaijuBlast`:this.kaijuBlast(e);break;case`kaijuCatch`:this.catchSparks(e),this.kick(2,e.tick);break;case`magnetOn`:this.kick(2,e.tick),this.tintSky([0,.05,.2,.3],.15);break;case`magnetClank`:{let t=this.rngFor(e,67),n=Math.round(18*this.mult)+3;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-3,3),y:e.y+t.range(-2,2),vx:t.range(-1.6,1.6),vy:-t.range(.3,1.8),life:t.range(8,20),size:1,color:t.next()<.5?16777215:8378608,kind:I.Spark});this.kick(3,e.tick);break}case`touchdown`:this.kick(3,e.tick),this.fronts.push({x:e.x,y:e.y,maxR:46,start:e.tick,dur:24,rng:this.rngFor(e,43)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:60,width:10,strength:.7});break;case`tornadoGrab`:case`tornadoThrow`:{let n=this.rngFor(e,47),r=Math.round(14*this.mult)+2,i=this.dustColor(e.x,e.y+2);for(let a=0;a<r;a++)this.particles.add({x:e.x+n.range(-8,8),y:e.y-n.range(0,6),vx:n.range(-1.2,1.2),vy:-n.range(.2,1.4),life:n.range(20,40),size:1,color:t(i,n.range(.7,1.2)),kind:I.Chunk});e.type===`tornadoGrab`&&this.kick(2,e.tick);break}case`bumper`:this.posts.push(fe(e.x,e.y+1,e.tick,e.params.windup??10)),this.dirtPop(e,10);break;case`bumpKick`:this.bumpKick(e);break;case`bumpLaunch`:this.dirtPop(e,14),this.stars(e,12,1.6);break;case`bumpFly`:this.stars(e,2,.4);break;case`bumpBounce`:this.stars(e,14,1.4),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:18,width:5,strength:.5}),this.kick(2,e.tick);break;case`tornadoEnd`:{let t=this.rngFor(e,53),n=Math.round(40*this.mult)+4;for(let r=0;r<n;r++){let n=t.range(0,Math.PI*2),r=t.range(.3,1.4);this.particles.add({x:e.x+Math.cos(n)*e.radius*.5,y:e.y+Math.sin(n)*e.radius*1.2,vx:Math.cos(n)*r,vy:Math.sin(n)*r*.6,life:t.range(40,80),size:t.range(3,7),color:t.next()<.5?6183528:8025732,kind:I.Smoke})}this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*3,width:12,strength:.8});break}case`tankDeath`:this.burst(e,70),this.glows.push({x:e.x,y:e.y,r:40,start:e.tick,dur:20,color:16748608,strength:1.2}),this.tintSky(z[2],.5),this.kick(7,e.tick)}}nuke(e){let n=e.radius,r=e.params.strength??1,i=$t(n*r),a=this.whiteout(e.tick);this.whiteStart=e.tick,this.whitePeak=Math.max(i.peak,a),this.whiteFade=Math.max(i.fade,a>0?this.whiteFade:1),this.mushrooms.push(Tt(e.x,e.y,n,e.tick,this.rngFor(e,31).next()*4294967296)),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:70,maxR:n*7,width:26,strength:1.5*r}),this.ripples.push({x:e.x,y:e.y,start:e.tick+6,dur:60,maxR:n*4.5,width:12,strength:.9*r}),this.fronts.push({x:e.x,y:e.y,maxR:n*4,start:e.tick,dur:46,rng:this.rngFor(e,37)}),this.kick(4+n/12,e.tick);let o=this.rngFor(e,41),s=this.dustColor(e.x,e.y+n*.5),c=Math.round((120+n*2)*this.mult),l=3+n/20;for(let r=0;r<c;r++){let i=o.range(-.15,1.15)*Math.PI,a=o.range(.35,1)*l,c=r%2==0;this.particles.add({x:e.x+Math.cos(i)*n*.3,y:e.y-Math.sin(i)*n*.3,vx:Math.cos(i)*a,vy:-Math.sin(i)*a,life:o.range(50,100),size:c?1:o.range(1.5,2.5),color:c?o.next()<.4?16773280:16742938:t(s,o.range(.7,1.2)),kind:c?I.Spark:I.Chunk})}}mirvSplit(e){let t=this.rngFor(e,43);this.glows.push({x:e.x,y:e.y,r:12,start:e.tick,dur:8,color:14217471,strength:1.4}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:22,maxR:46,width:8,strength:.9});let n=Math.round(48*this.mult)+8;for(let r=0;r<n;r++){let i=r/n*Math.PI*2+t.range(-.06,.06),a=t.range(1.6,3.2);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*a,vy:Math.sin(i)*a,life:t.range(12,22),size:1,color:r%3==0?16777215:t.next()<.5?10148095:16769136,kind:I.Spark})}for(let n=0;n<6;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y+t.range(-2,2),vx:t.range(-.15,.15),vy:-t.range(0,.1),life:t.range(50,80),size:t.range(3,5),color:t.next()<.5?9076880:6971504,kind:I.Smoke});this.tintSky(z[4],.15),this.kick(2,e.tick)}fireworkLaunch(e){let t=this.rngFor(e,61);this.glows.push({x:e.x,y:e.y,r:5,start:e.tick,dur:6,color:16773312,strength:1});let n=Math.round(20*this.mult)+6;for(let r=0;r<n;r++){let i=r/n*Math.PI*2+t.range(-.1,.1),a=t.range(.8,1.6);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*a,vy:Math.sin(i)*a,life:t.range(10,18),size:1,color:r%3==0?16777215:16765024,kind:I.Spark})}for(let n=0;n<4;n++)this.particles.add({x:e.x+t.range(-2,2),y:e.y+t.range(-2,2),vx:t.range(-.1,.1),vy:-t.range(0,.08),life:t.range(40,70),size:t.range(2,4),color:9077904,kind:I.Smoke})}fireworkBurst(e){let t=this.rngFor(e,67),n=Ht[Math.floor(t.next()*Ht.length)],r=Ht[Math.floor(t.next()*Ht.length)];r===n&&(r=16777215),this.fireworks.push({x:e.x,y:e.y,start:e.tick,main:n,inner:r,rng:t}),this.glows.push({x:e.x,y:e.y,r:6,start:e.tick,dur:5,color:n,strength:1.2});let i=Math.round(56*this.mult)+12,a=t.range(0,Math.PI*2);for(let r=0;r<i;r++){let o=a+r/i*Math.PI*2,s=1.2*Math.sqrt(1-t.next()*t.next());this.particles.add({x:e.x,y:e.y,vx:Math.cos(o)*s,vy:Math.sin(o)*s,life:t.range(48,70),size:1,color:n,kind:I.Glitter})}let o=Math.round(20*this.mult)+6;for(let n=0;n<o;n++){let i=a+n/o*Math.PI*2+.1,s=t.range(.42,.55);this.particles.add({x:e.x,y:e.y,vx:Math.cos(i)*s,vy:Math.sin(i)*s,life:t.range(34,46),size:1,color:r,kind:I.Glitter})}let s=n>>16&255,c=n>>8&255,l=n&255;this.tintSky([n,s/255,c/255,l/255],.03)}fireworkStar(e){let t=this.rngFor(e,71),n=this.fireworkColor(e.x,e.tick,!1),r=n<0?16764992:n,i=Math.round(8*this.mult)+3;for(let n=0;n<i;n++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-1,vx:t.range(-.7,.7),vy:-t.range(.4,1.2),life:t.range(10,20),size:1,color:n%3==0?16777215:r,kind:I.Spark});this.glows.push({x:e.x,y:e.y-1,r:3,start:e.tick,dur:4,color:r,strength:.8})}fireworkColor(e,t,n){let r=-1,i=1/0;for(let a=0;a<this.fireworks.length;a++){let o=this.fireworks[a];if(o.start>t)continue;let s=(t-o.start)*(n?4:.3)+Math.abs(o.x-e);s<i&&(i=s,r=a)}return r<0?-1:this.fireworks[r].main}fireworkInner(e){for(let t=this.fireworks.length-1;t>=0;t--){let n=this.fireworks[t];if(n.main===e)return n.inner}return 16777215}fireworkTick(e){this.fireworks=this.fireworks.filter(t=>e-t.start<=Wt);for(let t of this.fireworks){let n=e-t.start;if(n<Ut||n>34)continue;let r=Math.max(1,Math.round(3*this.mult)),i=17+(n-Ut);for(let e=0;e<r;e++){let e=t.rng.range(0,Math.PI*2),r=i*Math.sqrt(t.rng.next());this.particles.add({x:t.x+Math.cos(e)*r,y:t.y+Math.sin(e)*r+(n-Ut)*.4,vx:0,vy:.05,life:t.rng.range(4,9),size:1,color:16777215,kind:I.Spark})}}}geyser(e,n){let r=this.rngFor(e,47),i=Math.max(6,e.radius),a=this.dustColor(e.x,e.y+i*.4),o=(2.2+i/10)*n,s=Math.round((30+i*1.5)*n*this.mult)+4;for(let n=0;n<s;n++){let n=r.range(-1,1);this.particles.add({x:e.x+n*i*.35,y:e.y-r.range(0,i*.3),vx:n*r.range(.1,.7),vy:-r.range(.45,1)*o,life:r.range(45,80),size:r.next()<.3?2:1,color:t(a,r.range(.65,1.15)),kind:I.Chunk})}let c=Math.round((6+i/3)*n*Math.max(.5,this.mult));for(let o=0;o<c;o++)this.particles.add({x:e.x+r.range(-i,i)*.3,y:e.y-r.range(0,i*1.2),vx:r.range(-.2,.2),vy:-r.range(.2,.9)*n,life:r.range(40,75),size:r.range(i*.2,i*.4),color:t(a,r.range(.9,1.2)),kind:I.Dust})}fireball(e,t){let n=this.rngFor(e,53),r=Math.max(6,e.radius)*t*1.5,i=Math.round((14+r*1.5)*Math.max(.5,this.mult));for(let a=0;a<i;a++){let i=n.next();this.particles.add({x:e.x+n.range(-r,r)*.6,y:e.y-n.range(0,r*.8),vx:n.range(-.35,.35),vy:-n.range(.4,1.2)*(.8+t*.2),life:n.range(30,56)*(i<.5?1:.8),size:n.range(r*.35,r*.7),color:0,kind:I.Flame})}let a=Math.round((10+r)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.4,y:e.y-n.range(r*.4,r*1.4),vx:n.range(-.2,.2),vy:-n.range(.3,.8),life:n.range(100,160),size:n.range(r*.5,r*.9),color:n.next()<.5?2367010:3813428,kind:I.Smoke});let o=Math.round((20+r*1.5)*this.mult);for(let r=0;r<o;r++){let r=n.range(.15,.85)*Math.PI,i=n.range(.8,2.6)*(.7+t*.3);this.particles.add({x:e.x,y:e.y-2,vx:Math.cos(r)*i,vy:-Math.sin(r)*i,life:n.range(20,45),size:1,color:n.next()<.4?16769136:16738836,kind:I.Spark})}this.tintSky(z[2],.25*t)}pressureWave(e,n){let r=Math.max(20,e.radius);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:60,maxR:r*3.2*n,width:22,strength:1.4*n}),this.ripples.push({x:e.x,y:e.y,start:e.tick+5,dur:50,maxR:r*2,width:10,strength:.8*n}),this.fronts.push({x:e.x,y:e.y,maxR:r*1.3,start:e.tick,dur:30,rng:this.rngFor(e,67)}),this.kick(3+r/25*n,e.tick),this.tintSky([0,.55,.6,.75],.25*n);let i=this.rngFor(e,71),a=this.dustColor(e.x,e.y+4),o=Math.round((60+r)*n*this.mult);for(let n=0;n<o;n++){let o=n%2==0?-1:1,s=i.range(.05,.45)*Math.PI,c=i.range(1.5,4.5)*(.6+r/150);this.particles.add({x:e.x+o*i.range(2,r*.2),y:e.y-i.range(0,4),vx:o*Math.cos(s)*c,vy:-Math.sin(s)*c,life:i.range(40,80),size:i.next()<.3?2:1,color:t(a,i.range(.7,1.2)),kind:I.Chunk})}}eruption(e,t){let n=this.rngFor(e,73),r=Math.max(10,e.radius),i=Math.round((40+r)*t*this.mult);for(let a=0;a<i;a++){let i=n.range(.3,.7)*Math.PI,o=n.range(2,5.5)*t,s=a%3==0;this.particles.add({x:e.x+n.range(-r,r)*.25,y:e.y-2,vx:Math.cos(i)*o,vy:-Math.sin(i)*o,life:n.range(40,75),size:s?2:1,color:s?n.next()<.5?16734751:14172172:n.next()<.4?16769136:16747040,kind:s?I.Chunk:I.Spark})}let a=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<a;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(0,r*.4),vx:n.range(-.3,.3),vy:-n.range(.6,1.6),life:n.range(24,44),size:n.range(3,7),color:0,kind:I.Flame});let o=Math.round((10+r/2)*Math.max(.5,this.mult));for(let t=0;t<o;t++)this.particles.add({x:e.x+n.range(-r,r)*.3,y:e.y-n.range(r*.3,r*1.6),vx:n.range(-.2,.2),vy:-n.range(.3,.9),life:n.range(110,170),size:n.range(r*.3,r*.6),color:n.next()<.5?2761252:4208186,kind:I.Smoke});this.tintSky(z[2],.35*t),this.kick(4*t,e.tick)}drawVortices(e,t,n){for(let r of this.vortices){let i=(n-r.start)/r.dur;if(i<0||i>1)continue;if(r.snap){let n=Math.min(1,i*6),a=2*Math.max(1,Math.round(r.r*.55*n*(1-i)*(1-i)))+1;t.push(r.x+.5,r.y+.5,a+6,a+6,6299856,.5*(1-i),F.Pixel),e.push(r.x+.5,r.y+.5,a+2,a+2,13148415,1,F.Pixel),e.push(r.x+.5,r.y+.5,a,a,328458,1,F.Pixel);continue}let a=3+Math.round(i*i*r.r*.18);t.push(r.x,r.y,a*2+6,a*2+6,8405247,.35+.3*i,F.Pixel),e.push(r.x,r.y,a*2+2,a*2+2,13676799,.9,F.Pixel),e.push(r.x,r.y,a*2,a*2,459788,1,F.Pixel)}}mineTrip(e){let t=this.rngFor(e,71);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:18,maxR:e.radius*2,width:6,strength:.5}),this.glows.push({x:e.x,y:e.y,r:Math.max(6,e.radius*.5),start:e.tick,dur:10,color:10510591,strength:.9});let n=Math.round(16*this.mult)+6;for(let r=0;r<n;r++){let i=r/n*Math.PI*2,a=t.range(1.2,2.2);this.particles.add({x:e.x,y:e.y-1,vx:Math.cos(i)*a,vy:Math.sin(i)*a*.7,life:t.range(8,14),size:1,color:t.next()<.4?16777215:11563263,kind:I.Spark})}this.tintSky([0,.36,.08,.6],.35)}swallow(e){let t=this.rngFor(e,73),n=Math.max(8,e.radius),r=Math.max(8,e.params.ticks??22);this.vortices.push({x:e.x,y:e.y,r:n,start:e.tick,dur:r,rng:t,snap:!0});let i=Math.round(70*this.mult)+20;for(let r=0;r<i;r++){let r=t.range(0,Math.PI*2),i=n*t.range(.6,1.5),a=t.range(6,14),o=Math.round(e.x+Math.cos(r)*i),s=Math.round(e.y+Math.sin(r)*i*.8),c=this.probe.material(o,s);this.particles.add({x:o,y:s,vx:(e.x-o)/a,vy:(e.y-s)/a,life:a,size:1,color:c!==0&&t.next()<.6?this.probe.color(c):t.next()<.5?14205183:7356640,kind:I.Spark})}this.ripples.push({x:e.x,y:e.y,start:e.tick+Math.round(r*.7),dur:26,maxR:n*2.6,width:9,strength:1.1}),this.tintSky([0,.3,.05,.55],.5),this.split=Math.max(this.split,1)}meteorCall(e){let t=this.rngFor(e,59);this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:30,maxR:40,width:8,strength:.6});let n=Math.round(40*this.mult)+10;for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-2,vx:t.range(-.25,.25),vy:-t.range(2.5,6),life:t.range(25,50),size:t.next()<.3?2:1,color:t.next()<.3?16769136:16726560,kind:I.Spark});for(let n=0;n<8;n++)this.particles.add({x:e.x+t.range(-3,3),y:e.y-t.range(2,14),vx:t.range(-.1,.1),vy:-t.range(.1,.4),life:t.range(60,100),size:t.range(3,6),color:9054756,kind:I.Smoke});this.tintSky(z[2],.45)}frostBlast(e){let t=e.radius,n=e.params.strength??1,r=z[3];this.glows.push({x:e.x,y:e.y,r:t*.8,start:e.tick,dur:16,color:r[0],strength:1.1*n}),this.glows.push({x:e.x,y:e.y,r:t*.35,start:e.tick,dur:20,color:16055295,strength:1.3*n}),this.tintSky(r,.7*n),this.split=Math.max(this.split,1.5*n),this.ripples.push({x:e.x,y:e.y,start:e.tick+4,dur:40,maxR:t*1.6,width:10,strength:.8*n}),this.kick(3+t/25,e.tick);let i=this.rngFor(e,53),a=[];for(let n=0;n<11;n++){let r=(-.12+1.24*(n+i.range(.15,.85))/11)*Math.PI,o=t*i.range(.45,.95),s=e.x,c=e.y;for(let t=1;t<=4;t++){let n=o*t/4,l=o/14*(t<4),u=Math.round(e.x+Math.cos(r)*n+i.range(-l,l)),d=Math.round(e.y-Math.sin(r)*n+i.range(-l,l));un(s,c,u,d,a),s=u,c=d}}this.crystals.push({cells:Int32Array.from(a),x:e.x,y:e.y,len:t,start:e.tick,dur:28});let o=Math.round((90+t)*this.mult),s=1.6+t/28;for(let t=0;t<o;t++){let n=i.range(.04,.96)*Math.PI,r=i.range(.3,1)*s,a=t%3==0;this.particles.add({x:e.x+i.range(-3,3),y:e.y+i.range(-3,2),vx:Math.cos(n)*r*1.15,vy:-Math.sin(n)*r,life:i.range(30,70),size:a?1:i.range(1,2.4),color:Gt[Math.floor(i.next()*(a?2:Gt.length))],kind:a?I.Spark:I.Chunk})}let c=Math.round((10+t/4)*Math.max(.5,this.mult));for(let n=0;n<c;n++)this.particles.add({x:e.x+i.range(-t,t)*.35,y:e.y+i.range(-t,t)*.15,vx:i.range(-.6,.6),vy:-i.range(.02,.3),life:i.range(70,130),size:i.range(t*.15,t*.3),color:n%2==0?14479359:11852018,kind:I.Smoke});let l=Math.round((60+t*1.2)*this.mult);for(let n=0;n<l;n++)this.particles.add({x:e.x+i.range(-1.3,1.3)*t,y:e.y-i.range(.2,1.8)*t,vx:i.range(-.1,.1),vy:i.range(0,.15),life:i.range(140,260),size:1,color:i.next()<.7?16777215:14085370,kind:I.Snow})}sinkhole(e){let n=this.rngFor(e,53),r=Math.max(8,e.radius),i=Math.max(8,e.params.depth??40);this.kick(8,e.tick),this.ripples.push({x:e.x,y:e.y+i*.5,start:e.tick,dur:26,maxR:r*1.8,width:10,strength:.9});for(let i=-1;i<=1;i+=2){let a=Math.round(e.x+i*r),o=this.surfaceNear(a,e.y,60);if(o<0)continue;let s=this.dustColor(a,o+2),c=Math.round(22*this.mult)+3;for(let e=0;e<c;e++)this.particles.add({x:a+n.range(-3,3),y:o-n.range(0,3),vx:i*n.range(-.1,.5),vy:-n.range(.6,2.2),life:n.range(24,50),size:n.range(2,5),color:t(s,n.range(.85,1.2)),kind:I.Dust})}let a=Math.round(36*this.mult)+4;for(let i=0;i<a;i++){let i=n.next()<.5?-1:1,a=Math.round(e.x+i*r*n.range(.7,1.05)),o=this.surfaceNear(a,e.y,60);o<0||this.particles.add({x:a,y:o-1,vx:-i*n.range(.1,.9),vy:n.range(-.8,.2),life:n.range(30,60),size:n.range(1,2),color:t(this.dustColor(a,o+2),n.range(.7,1.05)),kind:I.Chunk})}}sinkholeDust(e){let n=this.rngFor(e,59),r=Math.max(8,e.radius),i=(e.params.plume??0)>0,a=Math.round((i?70:10)*this.mult)+2;for(let o=0;o<a;o++){let a=Math.round(e.x+n.range(-r,r)*(i?.8:1)),o=this.surfaceNear(a,e.y,i?120:30);o<0||this.particles.add({x:a,y:o-n.range(1,i?10:2),vx:n.range(-.3,.3),vy:-n.range(.1,i?1.3:.5),life:n.range(i?40:18,i?90:36),size:n.range(i?3:1,i?6:3),color:t(this.dustColor(a,o+1),n.range(.85,1.15)),kind:I.Dust})}}rift(e){let n=this.rngFor(e,43),r=Math.max(8,e.radius),i=Math.max(1,e.params.width??3),a=(e.params.hot??0)>0;this.kick(a?9:6,e.tick),this.ripples.push({x:e.x,y:e.y+r*.4,start:e.tick,dur:30,maxR:r*1.6,width:10,strength:a?1.1:.8}),this.fronts.push({x:e.x,y:e.y,maxR:r*.9,start:e.tick,dur:18,rng:this.rngFor(e,47)}),this.tintSky(z[5],a?.3:.18);let o=this.dustColor(e.x,e.y+4),s=Math.round((26+r/2)*this.mult)+4;for(let a=0;a<s;a++)this.particles.add({x:e.x+n.range(-i,i),y:e.y-n.range(0,4),vx:n.range(-.25,.25),vy:-n.range(.6,2.6)*(.6+r/120),life:n.range(30,70),size:n.range(2.5,6),color:t(o,n.range(.85,1.25)),kind:I.Dust});let c=Math.round((30+r/2)*this.mult)+4;for(let r=0;r<c;r++){let r=n.next()<.5?-1:1;this.particles.add({x:e.x+n.range(-i,i)*.5,y:e.y-1,vx:r*n.range(.1,1.4),vy:-n.range(1.2,3.8),life:n.range(40,80),size:n.range(1,2),color:t(o,n.range(.7,1.1)),kind:I.Chunk})}if(!a)return;let l=Math.round(40*this.mult)+6;for(let t=0;t<l;t++)this.particles.add({x:e.x+n.range(-i,i)*.5,y:e.y+n.range(0,3),vx:n.range(-.8,.8),vy:-n.range(1.5,4.2),life:n.range(24,60),size:1,color:n.next()<.35?16769136:n.next()<.6?16742938:15220762,kind:I.Spark});this.glows.push({x:e.x,y:e.y,r:6+i,start:e.tick,dur:12,color:16742948,strength:1})}mudGeyser(e){let t=e.params.height??120,n=Math.max(20,e.params.ticks??90);this.jets.push({x:e.x,y:e.y,height:t,start:e.tick,dur:n,rng:this.rngFor(e,101)}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:40,maxR:t*.9,width:14,strength:.9}),this.fronts.push({x:e.x,y:e.y,maxR:t*.55,start:e.tick,dur:30,rng:this.rngFor(e,103)}),this.kick(5,e.tick),this.tintSky([0,.34,.27,.16],.45);let r=this.rngFor(e,107),i=Math.sqrt(.24*t),a=Math.round(140*this.mult)+6;for(let t=0;t<a;t++){let t=r.range(.45,1.08)*i;this.particles.add({x:e.x+r.range(-5,5),y:e.y-r.range(0,3),vx:r.range(-.7,.7),vy:-t,life:2*t/.12+r.range(0,4),size:r.next()<.5?2:1,color:qt[Math.floor(r.next()*4)],kind:I.Chunk})}}feedJets(e){this.jets=this.jets.filter(t=>{let n=e-t.start;if(n>t.dur)return!1;if(n<0)return!0;let r=n/t.dur,i=r<.45?1:Math.max(.15,1-(r-.45)/.55),a=r>.6&&t.rng.next()<.35?.3:1,o=Math.sqrt(.24*t.height)*Math.sqrt(i)*a,s=t.rng,c=Math.round(32*i*this.mult)+1;for(let e=0;e<c;e++){let n=e%4==0,r=o*s.range(n?.5:.82,1.02);this.particles.add({x:t.x+s.range(-4.5,4.5),y:t.y-s.range(0,2),vx:n?s.range(-.7,.7):s.range(-.24,.24),vy:-r,life:2*r/.12+s.range(0,4),size:n?1:s.next()<.6?2:3,color:qt[s.next()<.12?3:Math.floor(s.next()*3)],kind:I.Chunk})}let l=t.height*i*a,u=Math.round(1.5*i*this.mult)+ +(n%3==0);for(let e=0;e<u;e++){let e=.55+.45*s.next();this.particles.add({x:t.x+s.range(-4,4)*(.5+e),y:t.y-e*l,vx:s.range(-.3,.3),vy:-s.range(.2,.9),life:s.range(50,100),size:s.range(3,6),color:Jt[Math.floor(s.next()*3)],kind:I.Smoke})}if(n%3==0)for(let e of[-1,1])this.particles.add({x:t.x+e*s.range(2,5),y:t.y-1,vx:e*s.range(.4,1.4),vy:-s.range(.6,1.6),life:40,size:1,color:qt[1+Math.floor(s.next()*2)],kind:I.Chunk});return!0})}mudSplat(e,t){let n=this.rngFor(e,109),r=Math.round(t*this.mult)+3;for(let t=0;t<r;t++){let r=t%2==0?-1:1;this.particles.add({x:e.x+r*n.range(0,2),y:e.y-1,vx:r*n.range(.3,1.3),vy:-n.range(.5,1.8),life:n.range(25,45),size:1,color:qt[Math.floor(n.next()*4)],kind:I.Chunk})}for(let t=0;t<2;t++)this.particles.add({x:e.x+n.range(-2,2),y:e.y-2,vx:n.range(-.2,.2),vy:-n.range(.2,.5),life:n.range(30,50),size:n.range(2,4),color:Jt[1],kind:I.Smoke})}glueSplat(e){let t=this.rngFor(e,131),n=e.params.strength??1,r=this.surfaceNear(Math.round(e.x),Math.round(e.y),24);this.splats.push({x:e.x,y:r>=0?r:e.y,r:10*n,start:e.tick,dur:90});let i=Math.round(9*this.mult*n)+5;for(let r=0;r<i;r++){let a=Math.PI*(.08+.84*((r+t.next())/i)),o=t.range(1.1,2.6)*Math.sqrt(n);this.strands.push({ax:e.x+t.range(-3,3),ay:e.y-t.range(1,5),hx:e.x,hy:e.y-2,vx:Math.cos(a)*o,vy:-Math.sin(a)*o,start:e.tick,life:Math.round(t.range(24,60)),stuck:!1})}let a=Math.round(46*this.mult*n)+6;for(let n=0;n<a;n++){let r=n%2==0?-1:1;this.particles.add({x:e.x+r*t.range(0,4),y:e.y-t.range(1,4),vx:r*t.range(.2,1.8),vy:-t.range(.6,2.6),life:t.range(30,60),size:t.next()<.3?2:1,color:R[Math.floor(t.next()*4)],kind:I.Chunk})}this.kick(2,e.tick)}glued(e){let t=this.rngFor(e,137),n=Math.max(4,e.radius);for(let r=0;r<4;r++){let i=r<2?-1:1;this.strands.push({ax:e.x+i*t.range(2,n),ay:e.y-t.range(3,7),hx:e.x+i*n,hy:e.y-4,vx:i*t.range(.3,.9),vy:t.range(0,.4),start:e.tick,life:Math.round(t.range(40,70)),stuck:!1})}let r=Math.round(18*this.mult)+4;for(let i=0;i<r;i++)this.particles.add({x:e.x+t.range(-n,n),y:e.y-t.range(2,9),vx:t.range(-.6,.6),vy:-t.range(.2,1.2),life:t.range(16,30),size:1,color:R[Math.floor(t.next()*3)],kind:I.Chunk})}unglued(e){let t=this.rngFor(e,139),n=Math.max(4,e.radius);for(let r=0;r<6;r++){let r=e.x+t.range(-n-2,n+2);this.strands.push({ax:r,ay:e.y,hx:r,hy:e.y-3,vx:t.range(-.2,.2),vy:-t.range(.4,.9),start:e.tick,life:Math.round(t.range(8,16)),stuck:!0})}}tickStrands(e){if(this.strands.length===0)return;let t=[];for(let n of this.strands){let r=e-n.start;if(r>n.life){let e=(n.ax+n.hx)/2,t=(n.ay+n.hy)/2;for(let r=0;r<2;r++)this.particles.add({x:r===0?e:n.hx,y:r===0?t:n.hy,vx:(r===0?-.2:.2)+n.vx*.1,vy:.2,life:26,size:1,color:R[2],kind:I.Chunk})}else{if(n.stuck)n.vy<0&&(n.hx+=n.vx,n.hy+=n.vy);else if(r>=0){n.vy+=.1;let e=n.hx+n.vx,t=n.hy+n.vy,r=this.probe,i=Math.floor(e),a=Math.floor(t);i<0||i>=r.width||a>=r.height||a>=0&&r.material(i,a)!==0?(n.stuck=!0,n.vy=0):(n.hx=e,n.hy=t)}t.push(n)}}this.strands=t,this.splats=this.splats.filter(t=>e-t.start<=t.dur)}tornado(e){let t=e.params,n;for(let t of this.funnels)if(e.tick-t.last<=3&&Math.abs(t.x-e.x)<=12){n=t;break}n||(n=Ft(this.rngFor(e,59).next()*4294967296,e.tick),this.funnels.push(n)),n.x=e.x,n.y=e.y,n.h=e.radius,n.base=t.base??4,n.top=t.top??30,n.lean=t.lean??0,n.wobble=t.wobble??0,n.age=t.age??0,n.strength=(t.strength??0)/100,n.down=(t.down??100)/100,n.last=e.tick,e.tick&7||(n.dust=this.dustColor(e.x,e.y+2))}magnet(e){let t=e.params,n;for(let t of this.magnets)if(e.tick-t.last<=3&&t.x===e.x&&t.y===e.y){n=t;break}n||(n={x:e.x,y:e.y,r:e.radius,age:0,arm:0,life:0,strength:0,last:e.tick},this.magnets.push(n)),n.r=e.radius,n.age=t.age??0,n.arm=t.arm??0,n.life=t.life??0,n.strength=(t.strength??0)/100,n.last=e.tick}kaiju(e){let n=e.params,r;for(let t of this.kaijus)if(e.tick-t.last<=4&&t.x===e.x){r=t;break}r||(r={x:e.x,y:e.y,h:e.radius,state:0,t:0,rise:1,sink:1,topple:40,reach:16,face:1,hx:e.x,hy:e.y,held:0,left:0,age:0,last:e.tick},this.kaijus.push(r)),r.y=e.y,r.h=e.radius,r.state=n.state??1,r.t=n.t??0,r.rise=n.rise??1,r.sink=n.sink??1,r.topple=n.topple??40,r.reach=n.reach??16,r.face=n.face??1,r.hx=n.hx??e.x,r.hy=n.hy??e.y,r.held=n.held??0,r.left=n.left??0,r.age=n.age??0,r.last=e.tick;let i=this.rngFor(e,89),a=Ie(r);if(r.state===Ee.RISE&&a>0&&a<1){this.dirtPop({...e,x:e.x+i.range(-30,30)},2);let n=this.dustColor(e.x,e.y+2),r=e.y-a*e.radius,o=Math.round(4*this.mult)+1;for(let s=0;s<o;s++)this.particles.add({x:e.x+i.range(-36,30),y:r+i.range(0,a*e.radius),vx:i.range(-.6,.6),vy:i.range(0,.8),life:i.range(14,30),size:1,color:t(n,i.range(.6,1.1)),kind:I.Chunk})}if(r.state===Ee.TOPPLE){let t=Le(r,this.probe);if(t.landed&&t.since===0){this.kick(7,e.tick);for(let n=0;n<=7;n++){let r=Math.round(e.x+(t.tipX-e.x)*n/7),i=Math.round(e.y+(t.tipY-e.y)*n/7);this.dirtPop({...e,x:r,y:i},10)}this.ripples.push({x:t.tipX,y:t.tipY,start:e.tick,dur:26,maxR:70,width:10,strength:.8})}}let o=r.left<=1?3:9;if(e.tick%o===0&&r.state!==Ee.SINK){let n=this.dustColor(e.x,e.y+2);this.particles.add({x:e.x+i.range(-12,12),y:e.y-i.range(10,e.radius*.8),vx:i.range(-.1,.1),vy:i.range(.2,.6),life:i.range(14,28),size:1,color:t(n,i.range(.5,.8)),kind:I.Chunk})}}kaijuBlast(e){this.kaijus=this.kaijus.filter(t=>Math.abs(t.x-e.x)>e.radius*2);let t=this.rngFor(e,131),n=(e.params.dir??1)>=0?1:-1,r=[7031340,9069112,10779206,5125152,6122282],i=Math.round(260*this.mult)+30;for(let a=0;a<i;a++){let i=t.range(-.2,1.1)*e.radius;this.particles.add({x:e.x-n*(e.radius*.45)+n*i,y:e.y-t.range(1,14),vx:t.range(-2,2),vy:t.range(-4.2,-.8),life:t.range(40,90),size:t.next()<.45?2:1,color:r[Math.floor(t.next()*r.length)%r.length],kind:I.Chunk})}let a=Math.round(40*this.mult)+6;for(let r=0;r<a;r++)this.particles.add({x:e.x-n*(e.radius*.45)+n*t.range(0,1)*e.radius,y:e.y-t.range(4,16),vx:t.range(-1.4,1.4),vy:t.range(-2.6,-.4),life:t.range(16,40),size:1,color:t.next()<.5?15293704:t.next()<.6?10559500:16303113,kind:I.Spark});for(let t=0;t<5;t++)this.dirtPop({...e,x:Math.round(e.x-n*(e.radius*.45)+t/4*n*e.radius)},30);this.kick(9,e.tick),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:36,maxR:e.radius*2.2,width:16,strength:1}),this.tintSky([0,.45,.2,.05],.35)}catchSparks(e){let t=this.rngFor(e,97),n=Math.round(16*this.mult)+2;for(let r=0;r<n;r++){let n=t.range(0,Math.PI*2),r=t.range(.4,1.8);this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*r,vy:Math.sin(n)*r-.3,life:t.range(8,20),size:1,color:t.next()<.5?16757820:16777215,kind:I.Spark})}}drawKaijus(e,t,n){for(let r of this.kaijus)Be(r,e,t,n,this.probe)}drawMagnets(e,t,n){for(let r of this.magnets)yt(r,e,t,n)}funnelDust(e,n){if(e.down<1||e.strength<=.05||n-e.last>2)return;let r=Math.max(1,Math.round(4*this.mult*e.strength)),i=new P((Math.imul(n+1,2654435761)^Math.imul(e.x+11,40503))>>>0),a=It(e,0)+3;for(let n=0;n<r;n++){let n=i.next()<.5?-1:1;this.particles.add({x:e.x+n*i.range(0,a),y:e.y-i.range(0,3),vx:n*i.range(.4,1.6),vy:-i.range(.1,.9),life:i.range(24,50),size:i.range(2.5,5.5),color:t(e.dust,i.range(.95,1.2)),kind:I.Dust})}if(i.next()<.7*this.mult){let n=i.range(0,e.h*.8),r=i.next()<.5?-1:1;this.particles.add({x:e.x+r*(It(e,n)+1),y:e.y-n,vx:r*i.range(.8,2.2),vy:-i.range(0,1),life:i.range(30,60),size:1,color:t(e.dust,i.range(.6,1.1)),kind:I.Chunk})}}bumpKick(e){this.ripples.push({x:e.x,y:e.y-8,start:e.tick,dur:22,maxR:e.radius*1.6,width:10,strength:.9}),this.kick(4,e.tick),this.stars({...e,y:e.y-12},30,2.2),this.tintSky([0,.45,.35,.1],.18)}stars(e,t,n){let r=this.rngFor(e,71),i=Math.round(t*this.mult)+1;for(let t=0;t<i;t++){let t=r.range(0,Math.PI*2),i=r.range(.3,1)*n,a=r.next();this.particles.add({x:e.x+r.range(-1.5,1.5),y:e.y+r.range(-1.5,1.5),vx:Math.cos(t)*i,vy:Math.sin(t)*i-.3,life:r.range(10,26),size:1,color:a<.4?16769136:a<.7?16777215:a<.85?16734860:7004415,kind:I.Spark})}}dirtPop(e,n){let r=this.rngFor(e,73),i=Math.round(n*this.mult)+1,a=this.dustColor(e.x,e.y+2);for(let n=0;n<i;n++)this.particles.add({x:e.x+r.range(-6,6),y:e.y-r.range(0,3),vx:r.range(-1.1,1.1),vy:-r.range(.5,1.8),life:r.range(18,34),size:1,color:t(a,r.range(.7,1.2)),kind:I.Chunk})}drawPosts(e,t){this.posts.length!==0&&(this.posts=this.posts.filter(n=>me(n,e,t)))}drawFunnels(e,t,n){for(let r of this.funnels)Rt(r,e,t,n)}lanceFire(e){this.lances.fire(e,this.rngFor(e,47));let t=e.params.surface??e.y;this.tintSky([0,.7,.5,.3],.9),this.ripples.push({x:e.x+.5,y:t,start:e.tick,dur:40,maxR:150,width:18,strength:1.1}),this.kick(5,e.tick)}drawMushrooms(e,t,n){this.mushrooms.length!==0&&(this.mushrooms=this.mushrooms.filter(r=>kt(r,e,t,n,!1)))}whiteout(e){return Qt(e-this.whiteStart,this.whitePeak,this.whiteFade)}tintSky(e,t){let n=Math.min(.5,t),r=this.sky;r[0]=Math.min(.5,r[0]+e[1]*n),r[1]=Math.min(.5,r[1]+e[2]*n),r[2]=Math.min(.5,r[2]+e[3]*n),this.skyFlash=Math.max(r[0],r[1],r[2])}puff(e,n,r){let i=this.rngFor(e,23),a=Math.round(r*this.mult)+2;for(let r=0;r<a;r++)this.particles.add({x:e.x+i.range(-e.radius,e.radius)*.7,y:e.y+i.range(-e.radius,e.radius)*.5,vx:i.range(-.25,.25),vy:-i.range(0,.25),life:i.range(30,60),size:i.range(3,6),color:t(n,i.range(.8,1.1)),kind:I.Dust})}rustFlakes(e,t){let n=this.rngFor(e,71),r=Math.round(t*this.mult)+2;for(let t=0;t<r;t++)this.particles.add({x:e.x+n.range(-e.radius,e.radius),y:e.y+n.range(-3,2),vx:n.range(-.35,.35),vy:-n.range(.1,.7),life:n.range(20,40),size:1,color:V[Math.floor(n.next()*4)],kind:I.Chunk})}bolt(e){let t=e.params.w??1;this.skyBolt(e.x,e.y,e.tick,this.rngFor(e,29),t,Math.round(20*Math.min(2,t)),e.params.top??0,e.params.storm===1),this.glows.push({x:e.x,y:e.y,r:Math.round(26*t),start:e.tick,dur:14,color:13162751,strength:1.4}),this.tintSky([0,.75,.8,1],.5)}skyBolt(e,t,n,r,i,a,o=0,s=!1){let c={x:Math.round(e),y:Math.max(1,Math.round(t))},l=[],u=(e,t,n,i)=>{let a=e,o=t;for(;o<n;){let e=Math.min(n-o,Math.round(r.range(3,9))),t=a+Math.round(r.range(-3,3)+i);un(a,o,t,o+e,l),a=t,o+=e}return a},d=Math.max(0,Math.min(c.y-1,Math.round(o)));if(u(c.x+Math.round(r.range(s?-8:-18,s?8:18)),d,c.y,0),l.length===0)return;let f=c.x-l[l.length-2];for(let e=0;e<l.length;e+=2){let t=(l[e+1]-d)/Math.max(1,c.y-d);l[e]=l[e]+Math.round(f*t)}let p=l.length,m=4+Math.floor(r.next()*3);for(let e=0;e<m;e++){let e=2*Math.floor(r.range(.1,.85)*(p/2)),t=l[e],n=l[e+1],i=u(t,n,n+Math.round(r.range(14,46)),r.next()<.5?-1.6:1.6);r.next()<.5&&u(i,l[l.length-1],l[l.length-1]+10,r.range(-2,2))}this.bolts.push({cells:Int32Array.from(l),main:p,start:n,dur:a,w:i,seed:r.next()*4294967296})}ionBlast(e,t){let n=e.radius,r=this.craterFloor(Math.round(e.x),e.y,n);this.ions.fire(e,this.rngFor(e,157),r);let i=$t(n*.6*t),a=this.whiteout(e.tick);this.whiteStart=e.tick,this.whitePeak=Math.max(i.peak,a),this.whiteFade=Math.max(i.fade,a>0?this.whiteFade:1),this.tintSky([0,.5,.7,1],.5),this.split=Math.max(this.split,4),this.kick(6+n/14,e.tick);for(let r=0;r<4;r++)this.ripples.push({x:e.x,y:e.y,start:e.tick+r*9,dur:80-r*8,maxR:n*(4.2-r*.7),width:28-r*4,strength:(1.6-r*.25)*t});this.fronts.push({x:e.x,y:e.y,maxR:n*2.2,start:e.tick,dur:50,rng:this.rngFor(e,163)});let o=this.rngFor(e,167),s=Math.round(30*t);for(let t=0;t<s;t++){let r=Math.round(110*(t/s)**1.6+o.range(0,4)),i=Math.round(e.x+o.range(-1.25,1.25)*n),a=this.surfaceNear(i,e.y,n*1.4),c=t<6?2.2:o.range(1.2,1.8);this.skyBolt(i,a<0?e.y:a,e.tick+r,o,c,Math.round(o.range(14,24))),t%3==0&&this.glows.push({x:i,y:a<0?e.y:a,r:18,start:e.tick+r,dur:10,color:11063551,strength:1.2})}for(let t=0;t<4;t++)this.arcs({...e,tick:e.tick+t*18,radius:n*.5,x:e.x+o.range(-.6,.6)*n},1.6);let c=Math.round((140+n)*this.mult),l=3+n/25;for(let t=0;t<c;t++){let i=o.range(-.1,1.1)*Math.PI,a=o.range(.3,1)*l;this.particles.add({x:e.x+Math.cos(i)*n*.2,y:r-Math.sin(i)*n*.2,vx:Math.cos(i)*a,vy:-Math.sin(i)*a,life:o.range(40,90),size:t%5==0?2:1,color:t%3==0?16777215:t%3==1?9490687:4877567,kind:I.Spark})}}ionColumnWaves(e){let t=e.params.ticks??70;for(let n=0;n<5;n++){let r=(n+1)/5;this.ripples.push({x:e.x+.5,y:e.y,start:e.tick+Math.round((t-14)*(n/5)),dur:26,maxR:18+34*r,width:8+6*r,strength:.7+.7*r,column:!0})}}ionPulse(e,t){let n=e.radius;this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:60,maxR:n*2.4,width:22,strength:1.2*t}),this.fronts.push({x:e.x,y:e.y,maxR:n*1.1,start:e.tick,dur:36,rng:this.rngFor(e,173)}),this.kick(4+n/60,e.tick),this.tintSky([0,.4,.6,1],.3),this.arcs({...e,radius:n*.35},1.4);let r=this.rngFor(e,179);for(let t=0;t<3;t++){let i=Math.round(e.x+r.range(-.5,.5)*n),a=this.surfaceNear(i,e.y,n);this.skyBolt(i,a<0?e.y:a,e.tick+t*4,r,1.6,18)}}arcs(e,t){let n=this.rngFor(e,59),r=Math.max(12,e.radius)*2.5*t,i=4+Math.round(2*t);for(let t=0;t<i;t++){let i=t%2==0?-1:1,a=r*n.range(.5,1),o=[],s=Math.round(e.x),c=this.surfaceNear(s,e.y,30);c<0&&(c=Math.round(e.y));for(let e=0;e<a;){let t=Math.round(n.range(2,5)),r=s+i*t,a=this.surfaceNear(r,c,12),l=(a<0?c:a)-Math.round(n.range(0,3));un(s,c,r,l,o),s=r,c=l+Math.round(n.range(0,2)),e+=t,n.next()<.25&&this.particles.add({x:s,y:c-1,vx:i*n.range(.2,1),vy:-n.range(.5,1.6),life:n.range(10,22),size:1,color:n.next()<.5?16777215:10148095,kind:I.Spark})}if(o.length===0)continue;let l=Math.round(n.range(0,6));this.bolts.push({cells:Int32Array.from(o),main:o.length,start:e.tick+l,dur:Math.round(n.range(10,18)),seed:n.next()*4294967296})}}heatAt(e){return e-this.ricochetLast>cn?0:this.ricochetHeat}reflect(e){let t=this.rngFor(e,71);this.glows.push({x:e.x,y:e.y,r:5,start:e.tick,dur:5,color:15128319,strength:1.1});let n=(e.params.vx??0)/256,r=(e.params.vy??0)/256,i=Math.max(.01,Math.hypot(n,r)),a=Math.round(12*this.mult)+3;for(let o=0;o<a;o++){let a=t.range(.6,2.2);this.particles.add({x:e.x+.5,y:e.y+.5,vx:n/i*a+t.range(-.6,.6),vy:r/i*a+t.range(-.6,.6),life:t.range(6,16),size:1,color:t.next()<.5?16777215:12821236,kind:I.Spark})}}pocketBurst(e){let t=this.rngFor(e,73),n=Math.max(4,e.radius),r=Math.round((24+n*2)*this.mult)+6;for(let i=0;i<r;i++)this.particles.add({x:e.x+Math.round(t.range(-n,n)),y:e.y+Math.round(t.range(-n/2,n/2)),vx:t.range(-.5,.5),vy:-t.range(.6,2.2),life:t.range(14,34),size:t.next()<.3?3:2,color:16747040,kind:I.Flame});let i=Math.round(10*this.mult)+2;for(let r=0;r<i;r++)this.particles.add({x:e.x+t.range(-n,n),y:e.y-t.range(0,n),vx:t.range(-.2,.2),vy:-t.range(.2,.6),life:t.range(40,80),size:t.range(4,8),color:2761248,kind:I.Smoke})}ricochet(e){let t=this.heatAt(e.tick)+1;this.ricochetHeat=t,this.ricochetLast=e.tick;let n=this.rngFor(e,61),r=Math.min(t,B.length-1),i=B[r],a=B[Math.min(r+1,B.length-1)];this.glows.push({x:e.x,y:e.y,r:8+t*2.5,start:e.tick,dur:7,color:i,strength:1.2}),this.ripples.push({x:e.x,y:e.y,start:e.tick,dur:14,maxR:12+t*4,width:5,strength:.5+t*.1});let o=Math.round((20+t*12)*this.mult)+4;for(let r=0;r<o;r++){let o=Math.PI+n.range(.1,Math.PI-.1),s=n.range(.8,2+t*.35);this.particles.add({x:e.x,y:e.y-1,vx:Math.cos(o)*s,vy:Math.sin(o)*s,life:n.range(10,18+t*3),size:1,color:r%4==0?16777215:n.next()<.5?i:a,kind:I.Spark})}t>=3&&this.arcs({...e,radius:4+t},.35),this.kick(.6+t*.25,e.tick)}ricochetBurst(e,t){let n=Math.max(1,this.heatAt(e.tick));this.ricochetHeat=0,this.ricochetLast=-1e3;let r=this.rngFor(e,67),i=Math.max(8,e.radius);this.glows.push({x:e.x,y:e.y,r:i*1.7,start:e.tick,dur:22,color:8405247,strength:1.1*t}),this.glows.push({x:e.x,y:e.y,r:i*1.15,start:e.tick,dur:16,color:16736464,strength:1.3*t}),this.glows.push({x:e.x,y:e.y,r:i*.6,start:e.tick,dur:12,color:16777215,strength:1.6*t}),this.glows.push({x:e.x,y:e.y,r:i*.9,start:e.tick+3,dur:14,color:7397631,strength:.9*t});let a=Math.round((90+n*12)*t*this.mult)+10;for(let t=0;t<a;t++){let n=t/a*Math.PI*2+r.range(-.08,.08),o=r.range(1.2,2.2+i/10),s=r.next();this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*o,vy:Math.sin(n)*o-.6,life:r.range(14,30),size:1,color:s<.3?16777215:s<.55?16740560:s<.8?11567359:7397631,kind:I.Spark})}let o=Math.round(24*t*this.mult)+4;for(let t=0;t<o;t++)this.particles.add({x:e.x+r.range(-i*.6,i*.6),y:e.y+r.range(-i*.6,i*.3),vx:r.range(-.25,.25),vy:-r.range(.6,1.4),life:r.range(40,70),size:1,color:r.next()<.5?16752880:10547455,kind:I.Spark});this.arcs({...e,radius:i*.7},.8*t),this.tintSky([0,.55,.3,.9],.35*t),this.split=Math.max(this.split,1.5*t)}dustColor(e,t){let n=this.probe;for(let r=0;r<12;r+=2)for(let[i,a]of[[0,r],[r,0],[-r,0],[0,-r],[r,r],[-r,r]]){let r=n.material(Math.round(e+i),Math.round(t+a));if(r!==0)return n.color(r)}return 8018490}dirtBurst(e){let n=this.rngFor(e,13),r=this.dustColor(e.x,e.y+4),i=(e.params.low??20)*Math.PI/180,a=(e.params.high??70)*Math.PI/180,o=e.params.speed??4,s=e.params.lift??0,c=Math.round(160*this.mult)+8;for(let l=0;l<c;l++){let c=n.next()<.5?-1:1,l=n.range(i,a),u=n.range(.45,1)*o;this.particles.add({x:e.x+c*n.range(0,6),y:e.y-s+n.range(-3,3),vx:c*Math.cos(l)*u,vy:-Math.sin(l)*u,life:n.range(30,70),size:n.next()<.25?3:2,color:t(r,zt[Math.floor(n.next()*zt.length)]),kind:I.Chunk})}let l=Math.round(48*this.mult)+4;for(let i=0;i<l;i++){let a=i%2==0?-1:1;this.particles.add({x:e.x+a*n.range(2,10),y:e.y-n.range(0,4),vx:a*n.range(1,3.2),vy:-n.range(0,.3),life:n.range(40,80),size:n.range(3,6),color:t(r,n.next()<.5?.85:1.05),kind:I.Dust})}let u=Math.round(14*Math.max(.5,this.mult));for(let i=0;i<u;i++)this.particles.add({x:e.x+n.range(-12,12),y:e.y-n.range(0,14),vx:n.range(-.3,.3),vy:-n.range(.1,.5),life:n.range(70,120),size:n.range(5,9),color:t(r,.7),kind:I.Smoke});this.kick(5,e.tick)}burst(e,n){let r=this.rngFor(e,1),i=Math.max(4,e.radius);this.fluid.splat(e.x,e.y,i*1.5,.3+i*.05,0,1+i/30,.5+i/60,0,!0);let a=Math.round(n*1.4*this.mult),o=.8+i/14;for(let t=0;t<a;t++){let t=r.range(Math.PI*.05,Math.PI*.95),n=r.range(.3,1)*o;this.particles.add({x:e.x+r.range(-2,2),y:e.y+r.range(-2,2),vx:Math.cos(t)*n*1.2,vy:-Math.sin(t)*n,life:r.range(14,36),size:r.range(.5,1.1),color:r.next()<.3?16773280:16742938,kind:I.Spark})}let s=this.dustColor(e.x,e.y+i*.5),c=Math.round(n*this.mult);for(let n=0;n<c;n++){let n=r.range(Math.PI*.1,Math.PI*.9),a=r.range(.4,1)*o*1.1;this.particles.add({x:e.x+Math.cos(n)*i*.6,y:e.y-Math.sin(n)*i*.4,vx:Math.cos(n)*a,vy:-Math.sin(n)*a,life:r.range(30,60),size:1,color:t(s,r.range(.75,1.15)),kind:I.Chunk})}n>0&&e.radius>=nn&&this.throwChunks(e,r);let l=Math.round((24+i*1.2)*Math.max(.5,this.mult)),u=.9+i/10;for(let t=0;t<l;t++){let n=(t+r.next()*.6)/l*Math.PI*2,i=u*r.range(.85,1.1);this.particles.add({x:e.x,y:e.y,vx:Math.cos(n)*i,vy:Math.sin(n)*i,life:r.range(8,16),size:1,color:r.next()<.5?16777215:16765056,kind:I.Spark})}let d=Math.round((10+i)*Math.max(.5,this.mult));for(let t=0;t<d;t++){let t=r.next()*Math.PI*2,n=Math.sqrt(r.next())*i*.7;this.particles.add({x:e.x+Math.cos(t)*n,y:e.y+Math.sin(t)*n,vx:Math.cos(t)*.3,vy:Math.sin(t)*.3,life:r.range(5,11),size:1,color:r.next()<.6?16777215:16773280,kind:I.Glitter})}this.groundDust(e,r,i);let f=Math.round((3+i/5)*Math.max(.5,this.mult));for(let t=0;t<f;t++)this.particles.add({x:e.x+r.range(-i,i)*.5,y:e.y+r.range(-i,i)*.3,vx:r.range(-.25,.25),vy:-r.range(.05,.4),life:r.range(50,90),size:r.range(i*.25,i*.5),color:r.next()<.5?4866120:6970978,kind:I.Smoke})}smokeColumn(e,n){if(e.radius<18||n>2)return;let r=Math.round(420+e.radius*10);for(let t of this.columns)if(!(Math.abs(t.x-e.x)>Math.max(t.r,e.radius)||e.tick-t.start>t.dur*.5)){t.r=Math.min(120,Math.max(t.r,e.radius)+4),t.dur=Math.max(t.dur,e.tick-t.start+r),n===2&&(t.color=Kt[2]);return}this.columns.length>=Zt&&this.columns.shift();let i=this.craterFloor(Math.round(e.x),e.y,e.radius),a=n===2?Kt[2]:n===1?t(this.dustColor(e.x,e.y+4),.45):Kt[1];this.columns.push({x:e.x,y:i,r:e.radius,start:e.tick,dur:r,color:a,rng:this.rngFor(e,53)})}groundDust(e,n,r){let i=this.probe,a=Math.round(r*2.2),o=Math.round(a*.5*Math.max(.5,this.mult));for(let s=-1;s<=1;s+=2)for(let c=0;c<o;c++){let o=r*.8+n.next()*(a-r*.8),c=Math.round(e.x+s*o);if(c<0||c>=i.width)continue;let l=-1,u=Math.max(0,Math.round(e.y-r)),d=Math.min(i.height-1,Math.round(e.y+r*1.5));for(let e=u;e<=d;e++)if(i.material(c,e)!==0){l=e;break}if(l<0)continue;let f=o/a;this.particles.add({x:c,y:l-.5,vx:s*(.5+n.next()*.8)*(1-f*.5),vy:-n.range(.1,.5)*(1-f*.6),life:n.range(14,30)*(1.2-f*.5),size:1,color:t(this.dustColor(c,l),n.range(.9,1.3)),kind:I.Chunk})}}craterFloor(e,t,n){let r=this.probe;if(e<0||e>=r.width)return t;let i=Math.min(r.height-1,Math.round(t+n*1.3)+4);for(let n=Math.max(0,Math.round(t));n<=i;n++)if(r.material(e,n)!==0)return n-1;return t}tickColumns(e){for(let t=this.columns.length-1;t>=0;t--){let n=this.columns[t],r=(e-n.start)/n.dur;if(r>=1){this.columns.splice(t,1);continue}if(r<0)continue;let i=n.r/24,a=(1-r)*(1-r),o=n.r*(.18+.12*(1-r)),s=n.x+n.rng.range(-o,o),c=.5*(1+(1-r)*.8)*Math.min(1.8,.75+i*.25);this.fluid.splat(s,n.y-2,Math.max(4,o*.6+i*2),0,-c,(.3+i*.25)*a,.25*a*a)}}throwChunks(e,n){let r=e.radius,i=Math.round(Math.min(64,6+(r-nn)*.7)*Math.max(.6,this.mult)),a=+(r>=50),o=1.3+Math.min(2.4,r/32);for(let s=0;s<i;s++){let i=n.range(Math.PI*.12,Math.PI*.88),s=Math.cos(i),c=Math.sin(i),l=this.dustColor(e.x+s*(r+1),e.y+c*(r*.6+1)),u=n.range(.55,1)*o,d=2+Math.floor(n.next()*(2+a)),f=Math.max(1,d-Math.floor(n.next()*2));this.particles.add({x:e.x+s*r*.55,y:e.y-c*r*.35,vx:s*u*1.15+n.range(-.2,.2),vy:-c*u-n.range(.4,1),size:Math.max(d,f),life:n.range(150,260)+60,color:t(l,zt[Math.floor(n.next()*zt.length)]*.8),kind:I.Chunk})}}drawChunks(e){this.chunks.draw(e)}tick(e){this.chunks.step(rn,this.probe.height),this.groundLife(e);for(let t of this.mushrooms){e>=t.start&&e<=t.start+t.life&&jt(t,e,this.particles,this.mult);let n=e-t.start-t.fuse;if(n>=0&&n<90){let e=1-n/90;this.fluid.splat(t.x,t.y-t.r*.3,t.r*.9,0,-2.5*e,1.2*e,1.5*e)}}this.feedJets(e),this.tickColumns(e),this.tickStrands(e),this.fireworkTick(e),this.fronts=this.fronts.filter(n=>{let r=(e-n.start)/n.dur;if(r>(n.portal?Vt:1))return!1;let i=n.maxR*(r<=1?r:1+(r-1)*(1-(r-1)/1.6)*.5);if(n.portal&&this.portalRingTick(n,i,r),r>1)return!0;if(n.cold)return this.frostFrontTick(n,i),!0;for(let e of[-1,1]){let r=Math.round(n.x+e*i),a=this.surfaceNear(r,n.y,n.maxR);if(a<0)continue;let o=Math.max(1,Math.round(3*this.mult)),s=this.dustColor(r,a+1);for(let i=0;i<o;i++)this.particles.add({x:r+n.rng.range(-1.5,1.5),y:a-n.rng.range(0,2),vx:e*n.rng.range(.3,1.2),vy:-n.rng.range(.1,.7),life:n.rng.range(24,48),size:n.rng.range(2.5,5),color:t(s,1.15),kind:I.Dust});n.rng.next()<.6*this.mult&&this.particles.add({x:r,y:a-1,vx:e*n.rng.range(.4,1.4),vy:-n.rng.range(.8,2),life:40,size:1,color:s,kind:I.Chunk})}return!0}),this.vortices=this.vortices.filter(t=>{let n=(e-t.start)/t.dur;if(n>1)return!1;if(n<0)return!0;let r=Math.max(1,Math.round((3+n*6)*this.mult));for(let e=0;e<r;e++){let e=t.rng.range(0,Math.PI*2),n=t.r*t.rng.range(.5,1.1),r=t.rng.range(14,24),i=n/r;this.particles.add({x:t.x+Math.cos(e)*n,y:t.y+Math.sin(e)*n*.8,vx:-Math.cos(e)*i*.9-Math.sin(e)*i*.8,vy:(-Math.sin(e)*i*.9+Math.cos(e)*i*.8)*.8,life:r,size:1,color:t.rng.next()<.35?16777215:t.rng.next()<.5?11563263:6308032,kind:I.Spark})}return e===t.start&&this.tintSky([0,.2,.08,.45],.3),!0});for(let t of this.funnels)this.funnelDust(t,e);this.funnels=this.funnels.filter(t=>e-t.last<=12),this.magnets=this.magnets.filter(t=>e-t.last<=2),this.kaijus=this.kaijus.filter(t=>e-t.last<=4),this.ripples=this.ripples.filter(t=>e-t.start<=t.dur),this.glows=this.glows.filter(t=>e-t.start<=t.dur);for(let t of this.bolts)this.boltBits(t,e);if(this.bolts=this.bolts.filter(t=>e-t.start<=t.dur),this.ions.active){let t=this.ions.tick(e,this.mult);t>0&&(this.shakeLeft(e)<t*.6&&this.kick(t,e),this.tintSky([0,.3,.5,.9],.08))}if(this.lances.active){let t=this.lances.tick(e,this.mult);t>0&&(this.shakeLeft(e)<t*.6&&this.kick(t,e),this.tintSky([0,.7,.45,.2],.06))}this.crystals=this.crystals.filter(t=>e-t.start<=t.dur);let n=this.sky;n[0]*=.86,n[1]*=.86,n[2]*=.86,this.skyFlash=Math.max(n[0],n[1],n[2]),this.skyFlash<.002&&(this.skyFlash=0,n[0]=n[1]=n[2]=0),this.split=this.split>.3?this.split*.9:0;for(let t of this.funnels){if(e-t.last>2)continue;let r=.16*Math.min(1,(e-t.born)/30);n[0]=Math.min(n[0],-r),n[1]=Math.min(n[1],-r*.95),n[2]=Math.min(n[2],-r*.8)}this.flushSmoke()}frostFrontTick(e,t){for(let n of[-1,1])for(let r=0;r<2;r++){let i=Math.round(e.x+n*(t-r*2)),a=this.surfaceNear(i,e.y,e.maxR);if(a<0)continue;let o=Math.max(1,Math.round(3*this.mult));for(let t=0;t<o;t++)this.particles.add({x:i+e.rng.range(-1.5,1.5),y:a-e.rng.range(0,1.5),vx:n*e.rng.range(.05,.6),vy:-e.rng.range(.4,1.6),life:e.rng.range(10,26),size:1,color:Gt[Math.floor(e.rng.next()*3)],kind:I.Spark});e.rng.next()<.5*this.mult&&this.particles.add({x:i,y:a-1,vx:n*e.rng.range(.1,.5),vy:-e.rng.range(.03,.12),life:e.rng.range(60,110),size:e.rng.range(4,8),color:e.rng.next()<.5?15004412:12771058,kind:I.Dust})}let n=Math.round(e.x-t),r=Math.round(e.x+t);for(let i of[n,r]){let n=this.surfaceNear(i,e.y,e.maxR);n>=0&&this.glows.push({x:i,y:n,r:3,start:Math.floor(e.start+t/e.maxR*e.dur),dur:6,color:12575994,strength:.9})}}portalRingTick(e,t,n){if(t<3)return;let r=this.probe,i=e.rng,a=Math.max(4,Math.min(22,e.maxR*.14)),o=n<=1?1:Math.max(0,(Vt-n)/.8),s=e.x*.37+e.y*.11+e.start+(e.rng.next()*.1+n*6),c=e=>Math.sin(e*3+s)*.5+Math.sin(e*7-s*1.3)*.3+Math.sin(e*13+s*.7)*.2,l=(e,t)=>e>=0&&t>=0&&e<r.width&&t<r.height&&r.material(e,t)===0,u=2*Math.PI*t,d=e.maxR/e.dur*(n<=1?1:.5),f=Math.round(Math.min(Math.round(240*this.mult)+6,u/3)*o);for(let n=0;n<f;n++){let n=i.range(0,Math.PI*2),r=Math.cos(n),o=Math.sin(n),s=c(n),u=t*(1+s*.07)-i.next()*i.next()*a*(1.2+s*.6);if(u<1)continue;let f=Math.round(e.x+r*u),p=Math.round(e.y+o*u);if(!l(f,p))continue;let m=d*i.range(.55,.95)+Math.max(0,s)*.25,h=i.range(-.3,.3)+s*.35;this.particles.add({x:f,y:p,vx:r*m-o*h,vy:o*m+r*h,life:i.range(22,42),size:Math.round(i.range(3,6+Math.max(0,s)*3)),color:Bt[Math.floor(i.next()*Bt.length)],kind:I.Plasma})}let p=Math.min(Math.round(40*this.mult)+2,Math.round(u/14));for(let n=0;n<p;n++){let n=i.range(0,Math.PI*2),r=t-i.next()*a*1.6,o=Math.round(e.x+Math.cos(n)*r),s=Math.round(e.y+Math.sin(n)*r);r<1||!l(o,s)||this.particles.add({x:o,y:s,vx:Math.cos(n)*d*i.range(.5,.9),vy:Math.sin(n)*d*i.range(.5,.9),life:i.range(10,26),size:1,color:i.next()<.5?6342911:10124543,kind:I.Glitter})}let m=Math.min(Math.round(8*this.mult)+1,Math.round(u/60)+1);for(let n=0;n<m;n++){let n=i.range(0,Math.PI*2),r=t-i.next()*a,o=Math.round(i.range(6,16)),s=(i.next()<.5?-1:1)/Math.max(4,r);for(let t=0;t<o;t++){n+=s,r+=i.range(-1.2,1.2);let t=Math.round(e.x+Math.cos(n)*r),a=Math.round(e.y+Math.sin(n)*r);if(r<1||!l(t,a))break;this.particles.add({x:t,y:a,vx:0,vy:0,life:i.range(4,9),size:1,color:6347007,kind:I.Plasma})}}}surfaceNear(e,t,n){let r=this.probe;if(e<0||e>=r.width)return-1;let i=Math.max(1,Math.round(t-n)),a=Math.min(r.height-1,Math.round(t+n));for(let t=i;t<=a;t++)if(r.material(e,t)!==0&&r.material(e,t-1)===0)return t;return-1}cookOff(e,t,n,r,i){let a={type:`cookOff`,tick:i,x:e,y:t,radius:n,params:{}};this.burst(a,r?26:12),this.glows.push({x:e,y:t,r:n*2.2,start:i,dur:r?16:10,color:16752704,strength:r?1.1:.8}),r&&(this.ripples.push({x:e,y:t,start:i,dur:18,maxR:26,width:6,strength:.5}),this.tintSky(z[2],.15)),this.kick(r?4:2,i)}shakeLeft(e){let t=e+this.held-this.shakeStart;return this.shakeAmp<=0||t>this.shakeDur||t<0?0:this.shakeAmp*(1-t/this.shakeDur)**2}kick(e,t){e<=0||e<this.shakeLeft(t)||(this.shakeAmp=e,this.shakeStart=t+this.held,this.shakeDur=c(e))}shake(e){let t=this.shakeLeft(e);if(t<=0)return[0,0];let n=e+this.held-this.shakeStart;return[Math.sin(n*2.1)*t,Math.sin(n*2.9+1.6)*t*.6]}gasBurst(e){let t=this.rngFor(e,23),n=Math.round((e.params.count??18)*this.mult)+4;for(let r=0;r<n;r++){let n=r%2==0?-1:1;this.particles.add({x:e.x+t.range(-2,2),y:e.y-t.range(0,3),vx:n*t.range(.4,1.6),vy:-t.range(.05,.5),life:t.range(40,80),size:t.range(4,8),color:t.next()<.5?8369438:11066416,kind:I.Dust})}for(let r=0;r<n;r++)this.particles.add({x:e.x+t.range(-1,1),y:e.y-1,vx:t.range(-.7,.7),vy:-t.range(1.2,2.8),life:t.range(20,40),size:1,color:t.next()<.3?15794064:11066416,kind:I.Chunk});this.fluid.splat(e.x,e.y-2,8,0,-.6,0,0,.5),this.tintSky([0,.12,.3,.02],.35)}collectLights(e,t){for(let n of this.glows){let r=n.dur*4+16,i=(t-n.start)/r;if(i<0||i>1)continue;let a=Math.floor(i*6)/6,o=(i<.1?1.4:1.1*(1-a))*Math.min(1.4,n.strength);e.add(n.x,n.y,Math.max(12,n.r*2.2),o,on(n.color))}}drawGlows(e,t){for(let n of this.glows){let r=Math.max(0,(t-n.start)/n.dur);if(r>1)continue;let i=(1-r)*(1-r)*n.strength,a=n.r*(.55+.45*r);e.push(n.x,n.y,a*2,a*2,n.color,.75*i,F.Pixel),e.push(n.x,n.y,a*.8,a*.8,16774880,.9*i,F.Pixel)}}groundLife(e){let n=this.probe,r=n.width,i=n.height,a=this.wind,o=Math.min(1,Math.abs(a)*150),s=a<0?-1:1,c=r/160*(.6+o*1.6)*Math.max(.3,this.mult),l=Math.floor(c),u=new P(Math.imul(e+1,2246822519)^1540483477);u.next()<c-l&&l++;for(let e=0;e<l;e++){let e=Math.floor(u.next()*r),c=this.surfaceNear(e,i*.5,i*.5);if(c<0)continue;let l=n.material(e,c);if(n.grass?.(e,c)&&l!==52&&l!==19){if(u.next()>.25+o*.6)continue;let t=u.next()<.6;this.particles.add({x:e+.5,y:c-1,vx:s*u.range(.1,.5)*(.4+o)+u.range(-.1,.1),vy:-u.range(.08,.3),life:Math.round(u.range(40,110)),size:1,color:t?15788176:14209184,kind:I.Ash})}else if(l===1||l===2||l===6||l===43||l===23){if(u.next()>o*.8-.1)continue;this.particles.add({x:e+.5,y:c-1,vx:s*u.range(.4,1.4)*o,vy:-u.range(.1,.45),life:Math.round(u.range(16,40)),size:1,color:t(n.color(l),u.range(1,1.35)),kind:I.Chunk})}else if(l===52||l===41){if(u.next()>.15+o*.8)continue;this.particles.add({x:e+.5,y:c-1,vx:s*u.range(.6,1.8)*(.3+o),vy:-u.range(.05,.3),life:Math.round(u.range(20,50)),size:1,color:16777215,kind:I.Flake})}else if(l===5||l===63||l===73){if(u.next()>.5)continue;this.particles.add({x:e+.5,y:c-1,vx:u.range(-.3,.3)+a*40,vy:-u.range(.3,1.1),life:Math.round(u.range(16,44)),size:1,color:u.next()<.5?16756800:16736288,kind:I.Ember})}else if(l===19){if(u.next()>.3)continue;this.particles.add({x:e+.5,y:c-1,vx:a*30,vy:-u.range(.04,.12),life:Math.round(u.range(20,40)),size:1,color:12110040,kind:I.Ash})}}}boltBits(e,t){let n=t-e.start;if(e.w===void 0||n!==1&&n!==e.dur)return;let r=e.cells,i=e.main;if(i<4)return;let a=new P(e.seed+n),o=e.w??1,s=r[i-2],c=r[i-1],l=r[1],u=Math.max(1,c-l);if(n===1){let e=Math.max(2,Math.round(6/o));for(let t=0;t<i;t+=2*e){if((r[t+1]-l)/u<.45||a.next()>.7)continue;let e=a.next()<.5?-1:1;this.particles.add({x:r[t]+.5,y:r[t+1]+.5,vx:e*a.range(.6,2.2),vy:a.range(-1.2,.6),life:Math.round(a.range(8,18)),size:1,color:a.next()<.5?16777215:13162751,kind:I.Spark})}let t=Math.max(.3,this.mult),n=Math.round(14*o*t);for(let e=0;e<n;e++){let e=a.range(-2.4,-.7),t=a.range(1,3.5)*o;this.particles.add({x:s+a.range(-2,2),y:c-1,vx:Math.cos(e)*t,vy:Math.sin(e)*t,life:Math.round(a.range(18,40)),size:1,color:a.next()<.4?16769184:9071176,kind:a.next()<.55?I.Ember:I.Chunk})}let d=Math.round(3*o);for(let e=0;e<d;e++){let t=e%2==0?-1:1;this.particles.add({x:s+t*a.range(1,5),y:c-2,vx:t*a.range(.3,1),vy:a.range(-.6,-.1),life:Math.round(a.range(20,36)),size:4+Math.round(a.range(0,3)*o),color:10128040,kind:I.Dust})}}else for(let e=0;e<i;e+=4)a.next()>.6||this.particles.add({x:r[e]+.5,y:r[e+1]+.5,vx:a.range(-.4,.4),vy:a.range(-.3,.3),life:Math.round(a.range(10,26)),size:1,color:a.next()<.3?13689087:7377120,kind:I.Glitter})}drawBolts(e,t){for(let n of this.bolts){let r=t-n.start;if(r<0||r>n.dur)continue;let i;if(r<en.length)i=en[r];else{let e=Math.max(0,1-(r-en.length+1)/Math.max(1,n.dur-en.length+1));i=(Math.imul(r+1,374761393)^(n.seed|0))>>>0&3?Math.round(e*.6*4)/4:0}if(i<=0)continue;let a=n.cells,o=n.w??1,s=Math.max(1,Math.round(o)*2-1),c=r===0?n.main*.7:1/0;for(let t=0;t<a.length;t+=2){let l=t>=n.main;if(t>=c)break;if(l&&r>1&&((Math.imul((t>>4)+1,2246822519)^Math.imul(r+1,3266489917)^(n.seed|0))>>>0>>>8&255)/255>(r<en.length?.75:.35))continue;let u=a[t]+.5,d=a[t+1]+.5;l?(e.push(u,d,Math.round(3*o),o>1.5?2:1,4219072,.4*i),e.push(u,d,Math.round(o),1,11585791,.75*i)):(e.push(u,d,Math.round(7*o),o>1.5?2:1,3166400,.45*i),e.push(u,d,Math.round(3*o),1,13689087,.9*i),e.push(u,d,s,1,16777215,i))}}}drawCrystals(e,t){for(let n of this.crystals){let r=t-n.start;if(r<0||r>n.dur)continue;let i=n.cells,a=i.length,o=n.len*Math.min(1,(r+1)/5),s=r<12?1:1-(r-12)/(n.dur-12),c=n.len*Math.max(0,s);for(let t=0;t<a;t+=2){let r=i[t]-n.x,a=i[t+1]-n.y,l=Math.sqrt(r*r+a*a);if(l>o||l>c+2)continue;let u=(i[t]*73856093^i[t+1]*19349663)>>>0;if(s<1&&(u>>>8&255)/255>s+.3)continue;let d=i[t]+.5,f=i[t+1]+.5;e.push(d,f,3,3,6203612,.45*s),e.push(d,f,1,1,u&7?14086399:16777215,s)}}}drawGoo(e,t){for(let n of this.splats){let r=t-n.start;if(r<0||r>n.dur)continue;let i=r/n.dur,a=Math.min(1,(r+1)/4),o=r<24?r>>2&1?.86:1.18:1,s=Math.max(1,Math.round(n.r*.75*a*o*(1-.8*i))),c=n.r*a*(1+.6*i)*(o>1?.92:1.08);for(let t=0;t<s;t++){let r=t/s,a=Math.round(c*Math.sqrt(1-r*r));if(a<=0)continue;let o=Math.floor(n.y)-1-t;if(i>.75&&((Math.imul(o+3,2654435761)^Math.imul(n.start+1,40503))>>>24)/255<(i-.75)*4*(.4+r))continue;let l=r>.7?R[0]:r>.35?R[1]:t===0?R[3]:R[2];e.rect(Math.floor(n.x)-a,o,a*2+1,1,l)}s>3&&e.rect(Math.floor(n.x)-(s>>1),Math.floor(n.y)-s,1,1,16777215)}for(let n of this.strands){let r=t-n.start;if(r<0)continue;let i=n.hx-n.ax,a=n.hy-n.ay,o=Math.ceil(Math.max(Math.abs(i),Math.abs(a))),s=Math.min(6,r*.25)*Math.min(1,o/12),c=r>n.life*.7;for(let t=0;t<=o;t++){let r=o===0?0:t/o;if(c&&r>.4&&r<.6&&!(t&1))continue;let l=Math.floor(n.ax+i*r),u=Math.floor(n.ay+a*r+s*4*r*(1-r));e.rect(l,u,1,1,t%6==2?R[1]:R[2])}e.rect(Math.floor(n.hx)-1,Math.floor(n.hy)-1,2,2,R[1]),e.rect(Math.floor(n.hx)-1,Math.floor(n.hy)-1,1,1,R[0])}}drawRippleRings(e,t){for(let n of this.ripples){let r=(t-n.start)/n.dur;if(r<0||r>1||n.column)continue;let i=n.maxR*Math.sqrt(r);e.push(n.x,n.y,i*2.35,i*2.35,11587839,.35*(1-r)*n.strength,F.Ring)}}clear(){this.ripples=[],this.glows=[],this.fronts=[],this.bolts=[],this.jets=[],this.crystals=[],this.mushrooms=[],this.lances.clear(),this.ions.clear(),this.chunks.clear(),this.vortices=[],this.funnels=[],this.strands=[],this.splats=[],this.posts=[],this.magnets=[],this.kaijus=[],this.columns.length=0,this.shakeAmp=0,this.shakeDur=14,this.skyFlash=0,this.sky[0]=this.sky[1]=this.sky[2]=0,this.split=0}},cn=240,B=[5302527,7385343,10125567,13660415,16738504,16756976,16777215],ln=[10139706,12120128,11563263,9225253,3813164,3949136],V=[5909012,9325086,12084266,14191172];function un(e,t,n,r,i){let a=Math.abs(n-e),o=-Math.abs(r-t),s=e<n?1:-1,c=t<r?1:-1,l=a+o,u=e,d=t;for(;u!==n||d!==r;){let e=2*l;e>=o&&(l+=o,u+=s),e<=a&&(l+=a,d+=c),i.push(u,d)}}function H(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var U=(e,t)=>(e%t+t)%t;function dn(e,t,n,r,i,a,o){let s=n.ambient;if(s.kind===`none`||s.kind===`stars`||s.density<=0||s.kind===`rain`||s.kind===`snow`)return;let c=a.width,l=a.height,u=Math.round(s.density*c*o/1e3),d=Math.max(-1.5,Math.min(1.5,i*120));for(let n=0;n<u;n++){let i=H(n,1),o=H(n,2),u=H(n,3);if(s.kind===`embers`){let e=.3+u*.5,f=l+10,p=l-Math.floor(U(r*e+o*f,f)),m=Math.round(Math.sin(r*.05+i*30)*3+(l-p)*d*.4),h=Math.floor(U(i*c+m,c));if(p<0||p>=l||a.solid(h,p))continue;let g=H(n,Math.floor(r/6))>.5;t.push(h+.5,p+.5,1,1,g?16765040:s.color,Math.min(1,p/(l*.4)))}else{let t=Math.floor(U(i*c+r*(.08+u*.1)*(d>=0?1:-1),c)),n=Math.floor(o*l*.85+Math.sin(r*.02+i*50)*4);if(n<0||a.solid(t,n))continue;e.push(t+.5,n+.5,1,1,s.color,.3+u*.3)}}}function fn(e,t,n,r,i,a){let o=t.ambient;if(o.kind!==`rain`&&o.kind!==`snow`||o.density<=0)return;let s=i.width,c=i.height,l=o.kind===`rain`,u=l?4.8:.65,d=o.density*s*a/1e3*(l?14:15)/(c/u),f=Math.floor(d);H(n,977)<d-f&&f++;let p=Math.max(-1.5,Math.min(1.5,r*120)),m=Math.abs(p)*c*.4+10;for(let t=0;t<f;t++){let r=H(n*131+t,1),i=H(n*131+t,2),a=H(n*131+t,3),u=-m*+(p>0)+r*(s+m);l?e.add({x:u,y:-2-i*6,vx:p*.9,vy:4+a*2,life:c/4+60,size:1,color:o.color,kind:I.Rain}):e.add({x:u,y:-2-i*6,vx:p*.3+(a-.5)*.3,vy:.45+a*.4,life:c/.55+120+i*200,size:a>.7?2:1,color:o.color,kind:I.Flake})}}function pn(e,t,n,r,i,a){for(let o=0;o<n.length;o++){let s=n[o];if(s.puffs&&s.puffs.length>0){An(e,s,r,i,a);continue}let c=Math.max(4,s.radius),l=Math.min(1,.45+s.turns*.2),u=s.x*131+s.y*7;if(s.look===`gas`||s.look===`acid`){let t=s.look===`gas`?ln[0]:ln[1],n=Math.round(Math.min(40,c*c/60+6)*Math.max(.5,a));for(let i=0;i<n;i++){let n=H(i,u)*Math.PI*2+r*.008*(H(i,u+1)-.5),a=Math.sqrt(H(i,u+2))*c*.85,o=Math.round(s.x+Math.cos(n)*a+Math.sin(r*.02+i)*2),d=Math.round(s.y+Math.sin(n)*a*.6-2),f=5+H(i,u+3)*7;e.push(o,d,f,f,t,(s.look===`gas`?.3:.2)*l,F.Pixel)}if(s.look===`acid`){let t=Math.round(Math.min(30,c/2+4)*Math.max(.5,a));for(let n=0;n<t;n++){let t=Math.round(s.x+(H(n,u+4)-.5)*c*1.6),a=c*1.4,o=Math.round(s.y-c*.4+U(r*1.2+H(n,u+5)*a,a));i.solid(t,o)||e.push(t+.5,o,1,2,14221152,.85*l)}}}else if(s.look===`volcano`)gn(e,t,s,r,i,a,l,u);else if(s.look===`storm`)xn(e,t,s,r,i,a,l,u);else{for(let e=0;e<2;e++){let n=U(r/50+e/2,1),a=Math.max(2,c*n),o=Math.max(12,Math.round(a*5)),u=(1-n)*.8*l,d=NaN,f=NaN;for(let e=0;e<o;e++){let n=e/o*Math.PI*2,r=Math.round(s.x+Math.cos(n)*a),c=Math.round(s.y+Math.sin(n)*a);(r!==d||c!==f)&&(d=r,f=c,i.solid(r,c)||t.push(r+.5,c+.5,1,1,ln[2],u))}}let e=U(r,25)<4?1:.5;t.push(s.x+.5,s.y+.5,6,6,ln[2],.5*e*l,F.Pixel)}}}var mn=[3813428,5524046,7234664,9076868],hn=[16742948,16754744,16769136];function gn(e,t,n,r,i,a,o,s){let c=0;for(;c<i.height&&!i.solid(n.x,c);)c++;if(c>=i.height)return;let l=Math.round(40*Math.max(.5,a)*o);for(let t=0;t<l;t++){let i=U(r/150+H(t,s),1),a=i*(60+H(t,s+1)*40),l=i*i*26*(H(t,s+9)<.5?1:.6),u=Math.round(n.x+(H(t,s+2)-.5)*(4+i*22)+l),d=Math.round(c-3-a),f=2*Math.round(1+i*3+H(t,s+3)*1.5),p=Math.min(3,Math.floor(i*4+H(t,s+4)*.8)),m=(i<.08?i/.08:1-(i-.08)/.92)*.85*o;e.push(u,d,f,f,mn[p],m,F.Pixel)}let u=Math.round(8*Math.max(.5,a)*o);for(let e=0;e<u;e++){let a=U(r/60+H(e,s+5),1),l=Math.round(n.x+(H(e,s+6)-.5)*8+(H(e,s+7)-.5)*a*20),u=Math.round(c-2-a*(20+H(e,s+8)*30));i.solid(l,u)||t.push(l+.5,u+.5,1,1,hn[e%3],(1-a)*.9*o)}}var _n=[9081508,6186100,4409430,2895929],vn=10135748,yn=14213375,bn=90;function xn(e,t,n,r,i,a,o,s){let c=Math.max(8,n.radius),l=Math.round(c+18),u=n.y,d=c>150,f=d?Math.max(6,Math.round(l*2/72)):3,p=l*2/f,m=p*1.7,h=d?26:15,g=Math.floor(r/7),_=H(g,s+11)<.14,v=Math.floor(H(g,s+12)*f),y=0;for(let a=0;a<f;a++){let c=n.x-l+p*(a+.5)+(H(a,s+30)-.5)*p*.4,d=bn*(.55+.45*H(a,s+31)),f=Math.min(1,(n.age??bn)/d),g=1-(1-f)*(1-f)*(1-f);y+=g;let b=c<n.x?n.x-l-m:n.x+l+m;Sn(e,t,Math.round(b+(c-b)*g+Math.sin(r*.01+a*1.7)*2),u+Math.round((H(a,s+32)-.5)*6),m,h*(.75+.25*o)*(.8+.4*H(a,s+33)),a*97+s,r,i,_&&a===v)}let b=y/f,x=Math.round(c*1.6*Math.max(.4,a)*o*b);for(let t=0;t<x;t++){let a=H(t,s+20),l=H(t,s+21),d=4+H(t,s+22)*2,f=i.height-u+10,p=Math.floor(U(r*d+l*f,f)),m=u+2+p,h=Math.round(n.x+(a-.5)*c*2+p*.25);m>=i.height||h<0||h>=i.width||i.solid(h,m)||(i.solid(h,m+1)?(e.push(h-.5,m+.5,1,1,vn,.7*o),e.push(h+1.5,m-.5,1,1,vn,.5*o)):e.push(h+.5,m-2,1,4,vn,.55*o))}}function Sn(e,t,n,r,i,a,o,s,c,l){let u=[],d=[],f=[];for(let e=0;e<4;e++){let t=a*(.6+.45*H(e,o+1))*(e===1||e===2?1.15:.8);u.push((e/3-.5)*(i-a*1.4)+(H(e,o+2)-.5)*a*.4),d.push(-t*.55+Math.sin(s*.015+e+o)*.8),f.push(t)}let p=Math.floor(n-i/2),m=Math.ceil(n+i/2);for(let i=p;i<=m;i++){if(i<0||i>=c.width)continue;let a=i-n,s=1/0;for(let e=0;e<4;e++){let t=a-u[e],n=f[e];t*t>=n*n||(s=Math.min(s,r+d[e]-Math.sqrt(n*n-t*t)))}if(s===1/0)continue;let p=Math.round(s),m=r+Math.round(1.5+Math.sin(i*.4+o)*1.2),h=Math.max(1,m-p);for(let n=p;n<=m;n++){if(n<0||n>=c.height)continue;let r=n===p||n===m;if(r&&!(i+n&1))continue;let a=(n-p)/h,o=a<.22?0:a<.5?1:a<.8?2:3;e.push(i+.5,n+.5,1,1,_n[o],r?.75:1),l&&a>.3&&i*3+n&3&&t.push(i+.5,n+.5,1,1,yn,.4)}}}var Cn=4880908,wn=9226266,Tn=12119084,En=15400826,Dn=10936356,W=new Float32Array(4096);function On(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=kn(r,i,n),u=kn(r+1,i,n),d=kn(r,i+1,n),f=l+(u-l)*s;return f+(d+(kn(r+1,i+1,n)-d)*s-f)*c}function kn(e,t,n){return H((e&1023)+((t&1023)<<10),n)}function An(e,t,n,r,i){let a=t.puffs,o=a.length>>1,s=Math.max(3,t.puffRadius??10),c=t.age??1e3,l=Math.min(1,.3+c/50),u=t.turns<=1?.8:1,d=1/0,f=1/0,p=-1/0,m=-1/0;for(let e=0;e<o;e++)d=Math.min(d,a[2*e]),p=Math.max(p,a[2*e]),f=Math.min(f,a[2*e+1]),m=Math.max(m,a[2*e+1]);let h=Math.ceil(s*1.5)+3,g=Math.max(0,d-h),_=Math.max(0,f-h-4),v=Math.min(r.width,p+h),y=Math.min(r.height,m+h),b=v-g,x=y-_;if(b<=0||x<=0)return;W.length<b*x&&(W=new Float32Array(b*x*2)),W.fill(0,0,b*x);for(let e=0;e<o;e++){let t=e*2.399,r=s*l*(.82+.22*Math.sin(n*.045+t)),i=a[2*e]+.5+Math.sin(n*.031+t*1.3)*1.6,o=a[2*e+1]+.5-r*.35+Math.cos(n*.037+t)*1.1,c=r*1.2,d=1/(c*c),f=Math.max(g,Math.floor(i-c)),p=Math.min(v-1,Math.ceil(i+c)),m=Math.max(_,Math.floor(o-c)),h=Math.min(y-1,Math.ceil(o+c));for(let e=m;e<=h;e++){let t=(e+.5-o)*1.25,n=(e-_)*b-g;for(let e=f;e<=p;e++){let r=e+.5-i,a=1-(r*r+t*t)*d;a>0&&(W[n+e]=W[n+e]+a*u)}}}let S=n*.05;for(let t=_;t<y;t++){let n=(t-_)*b-g,i=-1,a=0,o=0;for(let s=g;s<=v;s++){let c=0,l=0;if(s<v){let e=W[n+s];if(e>.12&&!r.solid(s,t)){let r=e*(.6+.8*(On((s-S)/7,(t+S*.6)/5,41)*.7+On(s/3,(t+S)/3,42)*.3)),i=t-2>=_?W[n-2*b+s]:0;r>1.7?(c=Cn,l=.72):r>.9?(c=i<.45?En:wn,l=i<.45?.78:.62):r>.45?(c=i<.25?En:Tn,l=.5):r>.2&&!(s+t&1)?(c=Dn,l=.45):r>.3&&((s^t)&3)==1&&(c=Dn,l=.35)}}c===a&&l===o&&i>=0||(i>=0&&a!==0&&e.rect(i,t,s-i,1,a,o),i=s,a=c,o=l)}}let C=Math.round(o*1.5*Math.max(.4,i));for(let t=0;t<C;t++){let i=t%o,c=s*l,d=90+H(t,61)*80,f=U(n+H(t,62)*d,d)/d,p=a[2*i]+(H(t,63)-.5)*c*1.6,m=a[2*i+1]-c*.9,h=6+Math.floor(H(t,64)*10);for(let i=0;i<h;i++){let a=Math.floor(m-f*c*1.2-i),o=Math.floor(p+Math.sin(n*.04+i*.45+t)*(1+i*.25));if(!((o+a&1)==1&&i>2)){if(a<0||r.solid(o,a))break;e.push(o+.5,a+.5,1,1,i<3?Tn:Dn,(1-f)*(1-i/h)*.6*u)}}}let w=Math.round(o*2*Math.max(.4,i));for(let t=0;t<w;t++){let i=t%o,c=s*l,d=c*1.4,f=U(n*(.18+H(t,977)*.2)+H(t,978)*d,d),p=Math.floor(a[2*i]+(H(t,979)-.5)*c*1.4),m=Math.floor(a[2*i+1]+1-f);p<g||p>=v||m<_||m>=y||W[(m-_)*b+(p-g)]<.5||r.solid(p,m)||e.push(p+.5,m+.5,1,1,f>d*.85?16777152:En,.9*u)}}function jn(e,t){if(t<=0)return 0;let n=Math.floor(e/30);if(H(n,91)>=30/t)return 0;let r=e-n*30;return r<2?.32:r>=3&&r<5?.18:0}var Mn=[461320,725004,1054482,1515545,2042401],Nn=[2766123,3424303,4016694],Pn=8188576,Fn=3115602;function G(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+11,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var In=(e,t)=>(e%t+t)%t,Ln=260,Rn=70,zn=40,K=9,Bn=2,Vn=.03,Hn=26,Un=[2502954,3029809,3622458],Wn=e=>e*977;function Gn(e,t,n,r,i){for(let a=0;a<2;a++){let o=a===0,s=Math.floor(o?r.x0:r.width-r.x1)-2;if(s>=t+8)continue;let c=e=>o?e:r.width-e,l=Math.floor(r.y0)-6,u=Math.ceil(r.y1-r.y0)+12,d=t-3;if(d>s){let t=Math.round(Math.min(c(s),c(d))),n=Math.round(Math.max(c(s),c(d)));e.rect(t,l,Math.max(1,n-t),u,Mn[0],.4)}let f=n*Vn,p=Math.floor(f/K),m=f-p*K,h=Math.floor((r.y0-m)/K)-2,g=Math.ceil((r.y1-m)/K)+2,_=Math.floor((t-4)/K),v=Math.max(Math.floor(s/K)-1,_-60);for(let r=v;r<=_;r++)for(let i=h;i<=g;i++){let o=(r+4096)*8192+(i-p+4096);for(let s=0;s<Bn;s++){let l=o*Bn+s,u=G(l,51+Wn(a)),d=G(l,52+Wn(a)),f=G(l,53+Wn(a)),p=u*6.283,h=2+f*4,g=r*K+u*K+Math.sin(n*.012+p)*h;if(g>t-2)continue;let _=i*K+m+d*K+Math.cos(n*.01+p)*h*.8,v=.5+.5*Math.sin(n*.006+d*6.283),y=Math.round(11+f*12+v*5),b=G(l,54+a)<.16,x=b?Un[Math.floor(d*Un.length)]:Mn[Math.floor(f*3)];e.push(Math.round(c(g)),Math.round(_),y,y,x,b?.55:.6+.25*v,F.Pixel)}}for(let i=v;i<=_;i+=1)for(let o=Math.floor(r.y0/Hn)-1;o<=Math.ceil(r.y1/Hn);o++){let r=(i+4096)*8192+(o+4096),s=In(n/(180+G(r,61)*240)+G(r,62+a),1),l=i*K+G(r,63)*K;if(l>t-3)continue;let u=o*Hn+G(r,64)*Hn-s*18,d=Math.sin(s*Math.PI);d<.25||e.push(Math.round(c(l)),Math.round(u),1,1,s>.5?Fn:Pn,.7*d)}let y=Math.ceil(u/100*Ln),b=a*7919;for(let r=0;r<y;r++){let i=G(r,1+b),a=G(r,2+b),o=G(r,3+b),d=G(r,4+b),f=G(r,5+b),p=In(n/(160+o*220)+d,1),m=i*i*zn,h=m<10?Math.sin((p+f)*Math.PI*2)*(10-m)*.45:0,g=t-m+h+1;if(g<s-6)continue;let _=.035+o*.05,v=l+In(a*u+n*_,u),y=Math.round(6+o*10+p*6),x=Math.sin(p*Math.PI)*(m<6?.55:.8);if(x<.06)continue;let S=Mn[Math.min(Mn.length-1,Math.floor(f*Mn.length*(1-m/zn)+.6))];e.push(Math.round(c(g)),Math.round(v),y,y,S,x,m<12?F.Stipple:F.Pixel)}let x=Math.ceil(u/100*Rn);for(let r=0;r<x;r++){let a=In(n/(120+G(r,11+b)*160)+G(r,12+b),1),o=l+G(r,13+b)*u,s=t+1+a*(6+G(r,14+b)*14),d=o+Math.sin(a*5+r)*2-a*4,f=Math.round(2+G(r,15+b)*3),p=(1-a)*.45,m=Nn[r%Nn.length];i>0&&r%3==0&&(m=Fn),e.push(Math.round(c(s)),Math.round(In(d-l,u)+l),f,f,m,p,F.Stipple)}let S=Math.floor(n/6);if(G(S,30+a)>.82){let n=t-(14+G(S,31+a)*Math.max(10,t-s-14));if(n>s){let t=c(n),r=l+G(S,32+a)*u*.7,i=6+Math.floor(G(S,33+a)*8);for(let n=0;n<i;n++){let i=t+(G(S*31+n,34+a)-.5)*8,o=r+3+G(S*31+n,35+a)*6;e.line(Math.round(t),Math.round(r),Math.round(i),Math.round(o),3,Fn,.35),e.line(Math.round(t),Math.round(r),Math.round(i),Math.round(o),1,Pn,.95),t=i,r=o}}}if(i>.05){let r=Math.round(c(t+1));for(let t=l;t<l+u;t+=6)G(Math.floor(t/6),40+a+Math.floor(n/8))<.5||e.push(r,t,5,5,Fn,.3*i,F.Pixel)}}}var Kn={low:{div:4,iters:8},medium:{div:2,iters:12},high:{div:1,iters:16}},qn=24,Jn=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // one triangle over the whole target
  vec2 p = vec2((gl_VertexID & 1) << 2, (gl_VertexID & 2) << 1);
  v_uv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}`,Yn=`#version 300 es
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
`,Xn=Yn+`uniform sampler2D u_vel;
uniform sampler2D u_dye;
uniform int u_n;
uniform vec4 u_sA[${qn}]; // x, y (fluid cells), r (negative = radial), gas
uniform vec4 u_sB[${qn}]; // vx, vy (or strength), smoke, heat
layout(location = 0) out vec4 oVel;
layout(location = 1) out vec4 oDye;
void main() {
  vec2 p = v_uv * u_size;
  vec2 v = texture(u_vel, v_uv).xy;
  vec4 d = texture(u_dye, v_uv);
  for (int i = 0; i < ${qn}; i++) {
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
}`,Zn=Yn+`uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec4 u_keep;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 v = texture(u_vel, v_uv).xy;
  vec2 from = v_uv - v / u_size;
  o = texture(u_src, from) * u_keep;
}`,Qn=Yn+`uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  float L = texture(u_vel, v_uv - vec2(t.x, 0.0)).y;
  float R = texture(u_vel, v_uv + vec2(t.x, 0.0)).y;
  float T = texture(u_vel, v_uv - vec2(0.0, t.y)).x;
  float B = texture(u_vel, v_uv + vec2(0.0, t.y)).x;
  o = vec4(0.5 * ((R - L) - (B - T)), 0.0, 0.0, 1.0);
}`,$n=Yn+`uniform sampler2D u_vel;
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
}`,er=Yn+`uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float L = solidAt(f - ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv - vec2(0.0, t.y)).y;
  float B = solidAt(f + ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv + vec2(0.0, t.y)).y;
  o = vec4(0.5 * (R - L + B - T), 0.0, 0.0, 1.0);
}`,tr=Yn+`uniform sampler2D u_pressure;
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
}`,nr=Yn+`uniform sampler2D u_pressure;
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
}`,rr=`#version 300 es
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
}`,ir=class{ok;div;iters;w;h;gl;mapW;mapH;vel;dye;pressure;div1;curl;pair;cur=0;progs={};uni={};vao;pending=[];tick=0;sA=new Float32Array(96);sB=new Float32Array(96);live=!1;constructor(e,t,n,r,i){if(this.gl=e,this.mapW=t,this.mapH=n,this.div=r,this.iters=i,this.w=Math.max(1,Math.ceil(t/r)),this.h=Math.max(1,Math.ceil(n/r)),this.ok=e.getExtension(`EXT_color_buffer_float`)!==null,!this.ok)return;let a=()=>{let t=M(e,e.LINEAR);e.texImage2D(e.TEXTURE_2D,0,e.RGBA16F,this.w,this.h,0,e.RGBA,e.HALF_FLOAT,null);let n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),{tex:t,fbo:n}};this.vel=[a(),a()],this.dye=[a(),a()],this.pressure=[a(),a()],this.div1=a(),this.curl=a();let o=t=>{let n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.vel[t].tex,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,this.dye[t].tex,0),e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),n};this.pair=[o(0),o(1)];let s=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;if(e.bindFramebuffer(e.FRAMEBUFFER,null),!s){this.ok=!1,this.dispose();return}let c=(t,n,r)=>{let i=A(e,Jn,n);this.progs[t]=i;let a={};for(let t of[`u_size`,`u_terrain`,`u_map`,`u_div`,...r])a[t]=e.getUniformLocation(i,t);this.uni[t]=a};c(`splat`,Xn,[`u_vel`,`u_dye`,`u_n`,`u_sA`,`u_sB`]),c(`advect`,Zn,[`u_vel`,`u_src`,`u_keep`]),c(`curl`,Qn,[`u_vel`]),c(`force`,$n,[`u_vel`,`u_curl`,`u_dye`,`u_eps`,`u_wind`,`u_jit`]),c(`div`,er,[`u_vel`]),c(`pressure`,tr,[`u_pressure`,`u_divergence`]),c(`gradient`,nr,[`u_pressure`,`u_vel`]);let l=A(e,Jn,rr);this.progs.draw=l;let u={};for(let t of[`u_dye`,`u_terrain`,`u_map`,`u_fsize`,`u_div`,`u_view`,`u_origin`,`u_scale`,`u_tick`])u[t]=e.getUniformLocation(l,t);this.uni.draw=u,this.vao=e.createVertexArray()}splat(e,t,n,r,i,a,o,s=0,c=!1){if(!this.ok)return;this.ensureStep();let l=this.pending[this.pending.length-1].splats;if(l.length>=qn)return;let u=this.div;l.push({a:[e/u,t/u,Math.max(1,n)/u*(c?-1:1),s],b:[r/u,i/u,a,o]}),this.live=!0}step(e){this.ok&&this.pending.push({wind:e,splats:[]})}ensureStep(){this.pending.length===0&&this.pending.push({wind:0,splats:[]})}clear(){if(!this.ok)return;this.pending=[],this.live=!1;let e=this.gl;e.clearColor(0,0,0,0);for(let t of[...this.vel,...this.dye,...this.pressure,this.div1,this.curl])e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.clear(e.COLOR_BUFFER_BIT);e.bindFramebuffer(e.FRAMEBUFFER,null)}update(e){if(!this.ok)return;let t=this.pending;if(this.pending=[],!this.live){this.tick+=t.length;return}let n=this.gl;n.disable(n.BLEND),n.viewport(0,0,this.w,this.h),n.bindVertexArray(this.vao),n.activeTexture(n.TEXTURE9),n.bindTexture(n.TEXTURE_2D,e);for(let e of t)this.runStep(e),this.tick++;n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindVertexArray(null),n.activeTexture(n.TEXTURE0)}use(e){let t=this.gl,n=this.uni[e];return t.useProgram(this.progs[e]),t.uniform2f(n.u_size,this.w,this.h),t.uniform1i(n.u_terrain,9),t.uniform2i(n.u_map,this.mapW,this.mapH),t.uniform1i(n.u_div,this.div),n}bind(e,t,n){let r=this.gl;r.activeTexture(r.TEXTURE0+e),r.bindTexture(r.TEXTURE_2D,t),r.uniform1i(n,e)}target(e){let t=this.gl;t.bindFramebuffer(t.FRAMEBUFFER,e),t.drawArrays(t.TRIANGLES,0,3)}runStep(e){let t=this.gl,n=this.vel,r=this.dye,i=this.pressure,a=this.cur,o=a^1;if(e.splats.length>0){let i=this.use(`splat`),s=e.splats.length;for(let t=0;t<s;t++)this.sA.set(e.splats[t].a,t*4),this.sB.set(e.splats[t].b,t*4);t.uniform1i(i.u_n,s),t.uniform4fv(i.u_sA,this.sA),t.uniform4fv(i.u_sB,this.sB),this.bind(0,n[a].tex,i.u_vel),this.bind(1,r[a].tex,i.u_dye),this.target(this.pair[o]),a=o,o=a^1}{let e=this.use(`curl`);this.bind(0,n[a].tex,e.u_vel),this.target(this.curl.fbo)}{let i=this.use(`force`);t.uniform1f(i.u_eps,.5),t.uniform1f(i.u_wind,e.wind*1.5/this.div),t.uniform2f(i.u_jit,this.tick%977*.37,this.tick%613*.53),this.bind(0,n[a].tex,i.u_vel),this.bind(1,this.curl.tex,i.u_curl),this.bind(2,r[a].tex,i.u_dye),this.target(n[o].fbo)}{let e=this.use(`div`);this.bind(0,n[o].tex,e.u_vel),this.target(this.div1.fbo)}{let e=this.use(`pressure`);this.bind(1,this.div1.tex,e.u_divergence);let t=0;for(let n=0;n<this.iters;n++)this.bind(0,i[t].tex,e.u_pressure),this.target(i[t^1].fbo),t^=1;let r=this.use(`gradient`);this.bind(0,i[t].tex,r.u_pressure),this.bind(1,n[o].tex,r.u_vel),this.target(n[a].fbo)}{let e=this.use(`advect`);this.bind(0,n[a].tex,e.u_vel),this.bind(1,n[a].tex,e.u_src),t.uniform4f(e.u_keep,.992,.992,1,1),this.target(n[o].fbo),this.bind(1,r[a].tex,e.u_src),t.uniform4f(e.u_keep,.997,.96,.998,1),this.target(r[o].fbo)}this.cur=o}draw(e,t,n,r){if(!this.ok||!this.live)return;let i=this.gl,a=this.uni.draw;i.useProgram(this.progs.draw),i.bindVertexArray(this.vao),this.bind(0,this.dye[this.cur].tex,a.u_dye),i.activeTexture(i.TEXTURE9),i.bindTexture(i.TEXTURE_2D,e),i.uniform1i(a.u_terrain,9),i.uniform2i(a.u_map,this.mapW,this.mapH),i.uniform2f(a.u_fsize,this.w,this.h),i.uniform1i(a.u_div,this.div),i.uniform2f(a.u_view,t[0],t[1]),i.uniform2f(a.u_origin,n[0],n[1]),i.uniform1f(a.u_scale,r),i.uniform1f(a.u_tick,this.tick),i.enable(i.BLEND),i.blendFunc(i.ONE,i.ONE_MINUS_SRC_ALPHA),i.drawArrays(i.TRIANGLES,0,3),i.disable(i.BLEND),i.bindVertexArray(null),i.activeTexture(i.TEXTURE0)}dispose(){let e=this.gl;for(let t of[...this.vel??[],...this.dye??[],...this.pressure??[]])e.deleteTexture(t.tex),e.deleteFramebuffer(t.fbo);for(let t of[this.div1,this.curl])t&&(e.deleteTexture(t.tex),e.deleteFramebuffer(t.fbo));for(let t of this.pair??[])e.deleteFramebuffer(t);for(let t of Object.values(this.progs))e.deleteProgram(t);this.vel=this.dye=this.pressure=this.pair=void 0,this.progs={}}},ar=-3,or=33;function sr(e){if(e<=ar){let t=l(ar);return{kind:`snow`,k:Math.min(1,(l(e)-t)/(1e3-t)+.25)}}if(e>=or){let t=u(or);return{kind:`sand`,k:Math.min(1,(u(e)-t)/(1e3-t)+.25)}}return{kind:`snow`,k:0}}var cr={snow:{haze:15660287,sheet:16777215,grain:[16777215,15791871,14214904],streak:16777215},sand:{haze:12617802,sheet:13146716,grain:[14728320,13146202,11041344,9067056],streak:14200944}};function q(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+11,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),((n^n>>>15)>>>0)/4294967296}var lr=(e,t)=>(e%t+t)%t,J=new Int16Array;function ur(e,t,n,r,i,a,o){if(n<=.01)return;let s=cr[t],c=a.width,l=a.height,u=i<0?-1:1,d=Math.min(1.5,Math.abs(i)*120),f=(t===`snow`?1.6:2.2)+d*1.6,p=t===`sand`,m=c>>1;J.length<m&&(J=new Int16Array(m));for(let e=0;e<m;e++){let t=e<<1,n=0;for(;n<l&&!a.solid(t,n)&&!a.solid(t+1,n);)n++;J[e]=n}let h=p?.22:.2,g=p?.5:.45;for(let t=0;t<4;t++){let r=Math.floor(l*t/4),i=Math.floor(l*(t+1)/4),a=n*h*(1+t*g),o=-1;for(let t=0;t<=m;t++){let n=t<m?Math.min(i,J[t]):r;if(o>=0&&(t===m||n!==Math.min(i,J[o]))){let n=Math.min(i,J[o]);n>r&&e.rect(o<<1,r,t-o<<1,n-r,s.haze,a),o=-1}o<0&&t<m&&(o=t)}}for(let t=0;t<m;t++){let r=t<<1,i=J[t];for(;i<l;){for(;i<l&&(a.solid(r,i)||a.solid(r+1,i));)i++;let t=i;for(;i<l&&!a.solid(r,i)&&!a.solid(r+1,i);)i++;if(i>=l)break;if(i>t){let a=Math.min(3,Math.floor((t+i>>1)*4/l));e.rect(r,t,2,i-t,s.haze,n*h*(1+a*g))}}}let _=Math.round(3+n*5);for(let t=0;t<_;t++){let i=Math.round(80+q(t,1)*140),a=Math.round(8+q(t,2)*(p?26:18)),o=c+i*2,d=Math.floor(lr(q(t,3)*o+r*f*.55*u,o))-i,m=p?.3:.08,h=Math.floor(l*(m+q(t,4)*(.75-m))+Math.sin(r*.01+t)*3),g=n*(p?.2:.26);for(let t=0;t<3;t++){let n=Math.round(i*(1-t*.28)),r=Math.max(2,Math.round(a*(1-t*.3))),o=d+(i-n>>1),l=h-(r>>1);for(let t=Math.max(0,o&-2);t<Math.min(c,o+n);t+=2){let n=Math.min(l+r,J[t>>1]);n>l&&e.rect(t,l,2,n-l,s.sheet,g)}}}let v=Math.round(n*(p?1100:1400)*(c/1e3)*Math.max(.4,o));for(let t=0;t<v;t++){let i=q(t,5),o=q(t,6),m=q(t,7),h=f*(.6+m*.8),g=c+40,_=Math.floor(lr(i*g+r*h*u,g))-20,v=p?.25+.75*Math.sqrt(o):o,y=p?Math.sin(r*.09+i*50)*1.5:Math.sin(r*.06+i*40)*3,b=p?0:lr(r*(.2+m*.3),l*.2),x=Math.floor(lr(v*l+y+b,l));if(!(_<0||_>=c||a.solid(_,x))){if(m>(p?.6:.72)){let t=Math.round(3+o*(p?6:5)+d*2),r=u>0?_-t:_+1;e.rect(r,x,t,1,s.streak,(p?.7:.75)*Math.min(1,n+.3))}else{let n=s.grain[t%s.grain.length],r=p?o>.7?2:1:o>.9?3:o>.3?2:1;e.rect(_,x,r,r,n,.95)}}}let y=Math.round(n*30*(c/1e3)*Math.max(.5,o));for(let t=0;t<y;t++){let i=q(t,8),a=f*(.9+q(t,9)*.6),o=Math.floor(lr(i*c+r*a*u,c)),d=J[o>>1];if(d>=l||d<2)continue;let p=Math.round(4+q(t,10)*8),m=u>0?o-p:o+1;e.rect(m,d-1,p,1,s.streak,.6*n),e.rect(m+(p>>2),d-2,p>>1,1,s.streak,.35*n)}}var Y=1200,dr=48,fr=.6,pr=120,mr=6,hr=260,gr=.16,_r=15923455;function vr(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),(n^n>>>15)>>>0}function yr(e,t){if(t<=0)return{pos:0,hits:99};let n=Math.floor(e/t),r=e-n*t;return{pos:n&1?t-r:r,hits:n}}var br=class{width;height;colors;liquid=new Uint8Array(256);terrain;dx=new Float32Array(Y);dy=new Float32Array(Y);dvx=new Float32Array(Y);dvy=new Float32Array(Y);dage=new Uint16Array(Y);dlife=new Uint16Array(Y);dcolor=new Uint32Array(Y);nDrops=0;waves=[];shells=new Map;tanks=[];lastCue=-100;cues=[];budgetTick=-1;budget=0;mult=1;listener;constructor(e,t,n,r){this.width=e,this.height=t,this.colors=r;for(let e of n)e>0&&e<256&&(this.liquid[e]=1);this.terrain=new Uint8Array(e*t)}get enabled(){for(let e=1;e<256;e++)if(this.liquid[e])return!0;return!1}setTerrain(e){this.terrain=e}cell(e,t){return e<0||t<0||e>=this.width||t>=this.height?0:this.terrain[t*this.width+e]}isLiquid(e,t){return this.liquid[this.cell(Math.floor(e),Math.floor(t))]===1}depth(e,t,n){let r=0;for(;r<n&&this.liquid[this.cell(e,t+r)]===1;)r++;return r}surface(e,t){let n=t;for(;n>0&&this.liquid[this.cell(e,n-1)]===1;)n--;return n}open(e,t){return this.liquid[this.cell(e,t)]===1&&this.cell(e,t-1)===0}surfaceNear(e,t){if(this.open(e,t))return t;for(let n=1;n<=2;n++){if(this.open(e,t+n))return t+n;if(this.open(e,t-n))return t-n}return-1}reach(e,t,n){let r=0,i=t;for(;r<hr;){let a=e+n*(r+1),o=this.surfaceNear(a,i);if(o<0||Math.abs(o-t)>2)break;i=o,r++}return r}colorAt(e,t){return this.colors[this.cell(e,t)]??3832008}addDrop(e,t,n,r,i,a){let o=this.nDrops;o>=Y?o=vr(Math.floor(e*7+t),Math.floor(n*100))%Y:this.nDrops++,this.dx[o]=e,this.dy[o]=t,this.dvx[o]=n,this.dvy[o]=r,this.dage[o]=0,this.dlife[o]=i,this.dcolor[o]=a}addWave(e,t,n,r){if(this.waves.length>=dr){let e=0;for(let t=1;t<this.waves.length;t++)this.waves[t].amp<this.waves[e].amp&&(e=t);if(this.waves[e].amp>n)return;this.waves.splice(e,1)}this.listener?.disturb(e,t,n);for(let i of this.waves)if(r-i.start<4&&Math.abs(i.x-e)<4&&Math.abs(i.y-t)<3){i.amp=Math.min(3.5,Math.max(i.amp,n)+Math.min(i.amp,n)*.3);return}this.waves.push({x:e,y:t,start:r,amp:n,left:this.reach(e,t,-1),right:this.reach(e,t,1),color:this.colorAt(e,t)})}splash(e,n,r,i,a,o){let s=this.depth(e,n,6),c=Math.max(.2,Math.min(4,r*(.35+.65*Math.min(1,s/5))));if(this.budgetTick!==a&&(this.budgetTick=a,this.budget=0),this.budget++,this.budget>3){this.budget<12&&this.addWave(e,n,Math.min(1.2,.3+c*.3),a);return}let l=this.colorAt(e,n),u=t(l,1.35),d=t(l,1.7),f=Math.round((3+c*6)*this.mult);for(let t=0;t<f;t++){let r=vr(o+t,a),s=r&1?1:-1,f=(r>>>1&1023)/1023,p=(r>>>11&1023)/1023,m=.3+f*(.4+c*.35),h=.6+p*(.5+c*.5),g=(r>>>21)%5==0?_r:(r>>>21)%3==0?d:r>>>24&1?u:l;this.addDrop(e+s*(.5+f*1.5),n-1,s*m+i*.15,-h,40+(r>>>25&31),g)}if(c>=1.4){let t=Math.round((1+c*2.5)*this.mult);for(let r=0;r<t;r++){let t=vr(o+977+r,a),i=(t&1023)/1023;this.addDrop(e+(t>>>10)%3-1,n-1,((t>>>12&255)/255-.5)*.3,-(1.3+c*.6+i*c*.6),60,t>>>20&1?_r:d)}}this.addWave(e,n,Math.min(3.5,.5+c*.6),a),c>=.6&&a-this.lastCue>=4&&(this.lastCue=a,this.cues.push({type:`waterSplash`,tick:a,x:e,y:n,radius:0,params:{strength:Math.round(Math.min(3,c)*100)/100}}))}blast(e){if((e.params.strength??1)<=0||e.radius<6)return;let n=Math.round(e.radius*1.6+4),r=e.x,i=e.y,a=1/0,o=0,s=0,c=n>40?2:1;for(let l=r-n;l<=r+n;l+=c)if(!(l<0||l>=this.width))for(let c=Math.max(1,i-n);c<=Math.min(this.height-1,i+n);c++){if(!this.open(l,c))continue;let u=l-r,d=c-i,f=u*u+d*d;if(f>n*n)continue;let p=Math.sqrt(f);p<a&&(a=p,o=l,s=c);let m=1-p/n,h=vr(l*31+c,e.tick);if((h&255)/255<(.25+m*.6)*this.mult){let n=u===0?h&256?1:-1:Math.sign(u),r=this.colorAt(l,c),i=(h>>>9&1023)/1023;this.addDrop(l,c-1,n*(.3+m*2.2*i),-(.8+m*(2.4+e.radius*.03)*(.5+i*.5)),50+(h>>>19&31),(h>>>24)%4==0?_r:t(r,h>>>26&1?1.35:1))}}if(a<1/0){let t=1-a/n;this.splash(o,s,.5+t*(1+e.radius/14),0,e.tick,e.x*13+e.y)}}tick(e,t){for(let n of e)if(n.kind===`projectile`){let e=this.shells.get(n.id);if(!e){this.shells.set(n.id,{x:n.x,y:n.y,vx:0,vy:0,seen:t});continue}let r=n.x-e.x,i=n.y-e.y;Math.abs(r)<40&&Math.abs(i)<40&&(r!==0||i!==0)&&this.shellPath(e.x,e.y,r,i,t,n.id),e.x=n.x,e.y=n.y,e.vx=r,e.vy=i,e.seen=t}else n.kind===`tank`&&this.tankStep(n.player,n.x,n.y,n.alive,t);for(let[e,n]of this.shells){if(n.seen===t||(this.shells.delete(e),Math.abs(n.vx)>40||Math.abs(n.vy)>40))continue;let r=Math.round(n.x+n.vx),i=Math.round(n.y+n.vy);for(let[a,o]of[[0,0],[0,1],[0,2],[-1,1],[1,1]])if(this.isLiquid(r+a,i+o)||this.isLiquid(n.x+a,n.y+o)){let s=this.isLiquid(r+a,i+o)?r+a:Math.floor(n.x)+a,c=this.isLiquid(r+a,i+o)?i+o:Math.floor(n.y)+o,l=this.surface(s,c);this.splash(s,l,.3+Math.hypot(n.vx,n.vy)*.2,n.vx,t,e*71);break}}this.stepDrops(t),this.waves=this.waves.filter(e=>t-e.start<pr*Math.min(1.4,.6+e.amp*.3))}shellPath(e,t,n,r,i,a){let o=Math.max(1,Math.ceil(Math.max(Math.abs(n),Math.abs(r)))),s=this.isLiquid(e,t);for(let c=1;c<=o;c++){let l=Math.floor(e+n*c/o),u=Math.floor(t+r*c/o),d=this.isLiquid(l,u);if(d!==s){let e=Math.hypot(n,r);d?this.splash(l,this.surface(l,u),.3+e*.2,n,i,a*71):r<0&&this.isLiquid(l,u+1)&&this.splash(l,u+1,.3+e*.15,n,i,a*71+5);return}s=d}}tankStep(e,n,r,i,a){let o=-1;for(let e of[0,-4,4])if(this.isLiquid(n+e,r-1)){o=n+e;break}let s=o>=0,c=this.tanks[e];if(this.tanks[e]={x:n,y:r,wet:s},!c||!i)return;let l=r-c.y;if(s&&!c.wet&&Math.abs(n-c.x)<20&&l>=0&&l<40){let t=this.surface(o,r-1),i=.6+l*.5;this.splash(n-5,t,i*.7,-.5,a,e*131),this.splash(n+5,t,i*.7,.5,a,e*131+17)}else if(s&&n!==c.x&&a%3==0){let i=Math.sign(n-c.x),s=this.surface(o,r-1),l=vr(e*17+n,a),u=this.colorAt(o,s);for(let e=0;e<2;e++){let r=(l>>>e*8&255)/255;this.addDrop(n-i*6,s-1,-i*(.3+r*.6),-(.6+r*.8),30,e?_r:t(u,1.35))}a%12==0&&this.addWave(n+i*5,this.surfaceNear(n+i*5,s)<0?s:this.surfaceNear(n+i*5,s),.6,a)}}stepDrops(e){let t=0;for(let n=0;n<this.nDrops;n++){let r=this.dage[n]+1;if(r>=this.dlife[n])continue;let i=this.dvx[n]*.985,a=Math.min(this.dvy[n]+gr,5),o=this.dx[n]+i,s=this.dy[n]+a;if(!(o<0||o>=this.width||s>=this.height)){if(s>=0&&a>0){let t=this.cell(Math.floor(o),Math.floor(s));if(t!==0){if(this.liquid[t]===1&&!(n&7)){let t=Math.floor(o),n=this.surface(t,Math.floor(s));this.open(t,n)&&this.addWave(t,n,.3,e)}continue}}this.dx[t]=o,this.dy[t]=s,this.dvx[t]=i,this.dvy[t]=a,this.dage[t]=r,this.dlife[t]=this.dlife[n],this.dcolor[t]=this.dcolor[n],t++}}this.nDrops=t}drainCues(){if(this.cues.length===0)return xr;let e=this.cues;return this.cues=[],e}draw(e,t){for(let t=0;t<this.nDrops;t++){let n=Math.floor(this.dx[t])+.5,r=Math.floor(this.dy[t])+.5,i=this.dvy[t],a=this.dcolor[t];i>1.6||i<-1.6?e.push(n,r-Math.sign(i)*.5,1,2,a,1):e.push(n,r,1,1,a,1)}for(let n of this.waves)this.drawWave(e,n,t)}drawWave(e,n,r){let i=r-n.start;if(i<0)return;let a=1-i/(pr*Math.min(1.4,.6+n.amp*.3));if(a<=0)return;let o=t(n.color,1.4),s=t(n.color,.62),c=Math.round(n.amp*2);if(i<6+n.amp*6)for(let t=-c;t<=c;t++){let i=n.x+t,a=this.surfaceNear(i,n.y);if(a<0)continue;let o=vr(i,Math.floor(r/2));o&1&&e.push(i+.5,a+.5,1,1,_r,1),n.amp>1.2&&!(o>>>1&3)&&e.push(i+.5,a-.5,1,1,_r,1)}let l=n.amp>=1.6?3:n.amp>=.8?2:1;for(let r=0;r<l;r++){let c=i*fr-r*mr;if(!(c<1))for(let i=-1;i<=1;i+=2){let{pos:l,hits:u}=yr(c,i<0?n.left:n.right);if(u>3)continue;let d=n.amp*a*(1-r*.3)*(u===0?1:.5/u);if(d<.15)continue;let f=Math.round(n.x+i*l),p=this.surfaceNear(f,n.y);if(p<0)continue;let m=i*(u&1?-1:1);d>=.45&&e.push(f+.5,p-.5,1,1,d>=1.4?_r:o,1),d>=1.2&&this.cell(f-m,p-1)===0&&e.push(f-m+.5,p-.5,1,1,n.color,1),d>=2.2&&this.cell(f,p-2)===0&&e.push(f+.5,p-1.5,1,1,o,1),d>=2.2&&this.cell(f-m,p-1)===0&&e.push(f-m+.5,p-.5,1,1,o,1),e.push(f+.5,p+.5,1,1,d>=.5?o:t(n.color,1.2),1),d>=.5&&this.surfaceNear(f+m,p)===p&&e.push(f+m+.5,p+.5,1,1,t(n.color,1.2),1);for(let t=2;t<=(d>=1.2?3:2);t++){let n=f-m*t;this.surfaceNear(n,p)===p&&e.push(n+.5,p+.5,1,1,s,1)}}}}clear(){this.nDrops=0,this.waves=[],this.shells.clear(),this.tanks=[],this.cues=[]}},xr=[],Sr=[{c2:0,damp:0,decay:0,glint:0},{c2:.3,damp:.985,decay:.992,glint:.06},{c2:.08,damp:.93,decay:.985,glint:.04},{c2:.06,damp:.9,decay:.98,glint:.015}],Cr=4,wr=48,Tr=4;function Er(e,t){let n=Math.imul(e+1,2654435761)^Math.imul(t+7,2246822507);return n=Math.imul(n^n>>>15,739982445),n=Math.imul(n^n>>>12,695872825),(n^n>>>15)>>>0}var Dr=class{width;height;colors;kinds=new Uint8Array(256);terrain;sy;kind;mat;h;hn;v;bubbles=[];scanned=-1;any=!1;mult=1;constructor(e,t,n,r,i,a){this.width=e,this.height=t,this.colors=a;for(let e of n)e>0&&e<256&&(this.kinds[e]=1);for(let e of r)e>0&&e<256&&(this.kinds[e]=2);for(let e of i)e>0&&e<256&&(this.kinds[e]=3);this.terrain=new Uint8Array(e*t),this.sy=new Int16Array(e).fill(-1),this.kind=new Uint8Array(e),this.mat=new Uint8Array(e),this.h=new Float32Array(e),this.hn=new Float32Array(e),this.v=new Float32Array(e)}get enabled(){for(let e=1;e<256;e++)if(this.kinds[e])return!0;return!1}setTerrain(e){this.terrain=e,this.scanned=-1}cell(e,t){return e<0||t<0||e>=this.width||t>=this.height?0:this.terrain[t*this.width+e]}heightAt(e){return e>=0&&e<this.width?this.h[e]:0}surfaceAt(e){return e>=0&&e<this.width?this.sy[e]:-1}scan(){let e=this.width,t=this.height,n=this.terrain,r=this.kinds;this.any=!1;for(let i=0;i<e;i++){let a=-1,o=0;for(let s=0;s<t;s++){let t=n[s*e+i];if(o===0&&r[t]!==0){a=s;break}o=t}let s=this.sy[i];if(this.sy[i]=a,a<0){this.kind[i]=0,this.h[i]=0,this.v[i]=0;continue}let c=n[a*e+i];this.mat[i]=c,this.kind[i]=r[c],this.any=!0,(s<0||Math.abs(s-a)>3)&&(this.h[i]=0,this.v[i]=0)}}joined(e,t){if(t<0||t>=this.width)return!1;let n=this.sy[t];return n>=0&&this.kind[t]===this.kind[e]&&Math.abs(n-this.sy[e])<=2}disturb(e,t,n){let r=Math.round(e);if(r<0||r>=this.width)return;let i=this.sy[r];if(i<0||Math.abs(i-t)>4)return;let a=Math.min(Tr,n);this.h[r]=Math.max(-4,this.h[r]-a),this.v[r]=this.v[r]-a*.6;for(let e of[-1,1])this.joined(r,r+e)&&(this.v[r+e]=this.v[r+e]+a*.3)}blast(e,t,n){let r=Math.round(n*1.5+3),i=Math.max(0,Math.round(e-r)),a=Math.min(this.width-1,Math.round(e+r)),o=0,s=0;for(let c=i;c<=a;c++){let i=this.sy[c];if(i<0)continue;let a=c-e,l=i-t,u=Math.sqrt(a*a+l*l);if(u>r)continue;let d=1-u/r,f=(l<0?1:-1)*d*n*.05;this.v[c]=this.v[c]+f,o+=f,s++}if(s>1){let n=o/s;for(let o=i;o<=a;o++){let i=this.sy[o];if(i<0)continue;let a=o-e,s=i-t;a*a+s*s>r*r||(this.v[o]=this.v[o]-n)}}}tick(e,t,n){if((this.scanned<0||e-this.scanned>=Cr)&&(this.scan(),this.scanned=e),!this.any)return;let r=this.width,i=this.h,a=this.hn,o=this.v;for(let n=0;n<r;n++){let r=this.kind[n];if(r===0){a[n]=0;continue}let s=Sr[r],c=i[n],l=this.joined(n,n-1)?i[n-1]:c,u=this.joined(n,n+1)?i[n+1]:c,d=(o[n]+s.c2*(l+u-2*c))*s.damp;if(r===1&&t!==0){let r=Er(n-Math.round(e*t*60),5);r&31||(d+=t*24*(r>>>5&1?1:-1))}o[n]=d;let f=(c+d)*s.decay;f>Tr?f=Tr:f<-4&&(f=-4),a[n]=f}this.h=a,this.hn=i,this.stepBubbles(e,n)}stepBubbles(e,n){if(e%3==0&&this.bubbles.length<wr){let t=Er(e,11),n=t%this.width,r=this.kind[n];if(r===2||r===3){let i=r===2?.5:.2;(t>>>10&255)/255<i*Math.max(.3,this.mult)&&this.bubbles.push({x:n,start:e,kind:r,size:1+(t>>>20)%3})}}this.bubbles=this.bubbles.filter(r=>{if(e-r.start<(r.kind===2?14+r.size*4:24+r.size*6))return!0;let i=this.sy[r.x];if(i<0)return!1;this.disturb(r.x,i,.4+r.size*.3);let a=Math.round(r.size*(r.kind===2?2:1)*Math.max(.3,this.mult));for(let o=0;o<a;o++){let a=Er(r.x*7+o,e),s=(a&255)/255;r.kind===2?n.add({x:r.x+(a>>>8)%3-1,y:i-r.size-1,vx:(s-.5)*.8,vy:-(.6+(a>>>12&255)/255*1.2),life:24+(a>>>20&31),size:1,color:a>>>16&1?16769136:16742948,kind:I.Ember}):n.add({x:r.x+(a>>>8)%3-1,y:i-r.size-1,vx:(s-.5)*.6,vy:-(.3+(a>>>12&255)/255*.5),life:16+(a>>>20&15),size:1,color:t(this.colors[this.mat[r.x]]??6965802,1.2),kind:I.Chunk})}return!1})}draw(e,n,r){if(!this.any)return;let i=this.width,a=this.h;for(let o=0;o<i;o++){let i=this.kind[o];if(i===0)continue;let s=this.sy[o],c=this.colors[this.mat[o]]??3832008,l=t(c,1.35),u=t(c,.68),d=i===1?15923455:i===2?16773280:t(c,1.6),f=Math.round(a[o]),p=o+.5;if(f>0)for(let t=1;t<=f&&this.cell(o,s-t)===0;t++)e.push(p,s-t+.5,1,1,t===f?l:c,1);else if(f<0)for(let t=0;t<-f&&this.kinds[this.cell(o,s+t)]===i;t++)e.push(p,s+t+.5,1,1,u,1);let m=(this.joined(o,o-1)?a[o-1]:a[o])-(this.joined(o,o+1)?a[o+1]:a[o]);m>.5&&f<=0?e.push(p,s+.5,1,1,l,1):m<-.5&&f>=0&&e.push(p,s+.5,1,1,u,1);let h=Sr[i];if(i===1)(Er(o-(r>>1),3)&1023)/1023<h.glint*.5&&(n.push(p,s+.5,1,1,d,.55),this.joined(o,o+1)&&n.push(p+1,s+.5,1,1,d,.25));else if(i===2){let t=Er(o,r>>3);(t&1023)/1023<h.glint?n.push(p,s+.5,1,1,d,.5):(t>>>10&1023)/1023<h.glint&&e.push(p,s+.5,1,1,u,1)}else(Er(o-(r>>3),7)&1023)/1023<h.glint&&e.push(p,s+.5,1,1,t(c,1.25),1)}for(let i of this.bubbles){let a=this.sy[i.x];if(a<0)continue;let o=r-i.start,s=i.kind===2?14+i.size*4:24+i.size*6,c=Math.min(i.size,1+Math.floor(o/s*(i.size+1))),l=this.colors[this.mat[i.x]]??3832008,u=t(l,i.kind===2?1.5:1.25);for(let t=-c;t<=c;t++){if(!this.joined(i.x,i.x+t))continue;let n=c-Math.abs(t);for(let r=1;r<=n&&this.cell(i.x+t,a-r)===0;r++)e.push(i.x+t+.5,a-r+.5,1,1,r===n&&t<=0?u:l,1)}i.kind===2&&n.push(i.x+.5,a-c+.5,1,1,16773280,.6)}}clear(){this.h.fill(0),this.v.fill(0),this.bubbles=[],this.scanned=-1}},Or=16,kr=45,Ar=220,jr=4,Mr=class{mapW;mapH;vw=1;vh=1;dpr=1;cx=0;cy=0;s=1;fitted=!0;glide=null;vx=0;vy=0;constructor(e,t){this.mapW=e,this.mapH=t,this.cx=e/2,this.cy=t/2}get scale(){return this.s}get isFit(){return this.fitted}fitScale(){let e=Math.min(this.vw/this.mapW,this.vh/this.mapH);return e>=1&&this.dpr<2?Math.floor(e):e}setViewport(e,t,n){this.dpr=n,this.vw=Math.max(1,Math.round(e*n)),this.vh=Math.max(1,Math.round(t*n)),this.fitted?this.fit():this.clamp()}fit(){this.hold(),this.s=this.fitScale(),this.cx=this.mapW/2,this.cy=this.mapH/2,this.fitted=!0}get ox(){return Math.round(this.vw/2-this.cx*this.s)}get oy(){return Math.round(this.vh/2-this.cy*this.s)}zoomBy(e,t){let n=this.fitScale(),r;e>0?r=this.s<1?1:Math.floor(this.s)+e:(r=Math.ceil(this.s)+e,(r<1||r<n)&&(r=n)),this.zoomAround(Math.min(Or,r),t)}zoomTo(e,t,n=!0){let r=this.fitScale(),i=Math.max(r,Math.min(Or,e));n&&i>=1&&(i=Math.max(r,Math.round(i))),this.zoomAround(i,t)}glideBy(e,t){let n=this.glide?.to??this.s,r=this.fitScale(),i;e>0?i=n<1?1:Math.floor(n)+e:(i=Math.ceil(n)+e,(i<1||i<r)&&(i=r)),this.vx=this.vy=0,this.glide={to:Math.min(Or,i),at:t}}settle(e){if(this.dpr>=2||this.s<1||this.fitted)return;let t=Math.max(this.fitScale(),Math.round(this.s));t!==this.s&&(this.glide={to:t,at:e})}fling(e,t){let n=Math.hypot(e,t),r=n>jr?jr/n:1;this.vx=e*r,this.vy=t*r}hold(){this.vx=this.vy=0,this.glide=null}update(e){if(!(e<=0)){if(this.glide){let{to:t,at:n}=this.glide,r=1-Math.exp(-e/kr),i=Math.abs(t-this.s)<.01*t?t:this.s+(t-this.s)*r;i===t&&(this.glide=null),this.zoomAround(i,n)}if(this.vx!==0||this.vy!==0){this.pan(this.vx*e,this.vy*e);let t=Math.exp(-e/Ar);this.vx*=t,this.vy*=t,Math.hypot(this.vx,this.vy)<.02&&(this.vx=this.vy=0)}}}get moving(){return this.glide!==null||this.vx!==0||this.vy!==0}zoomAround(e,t){let n=t?t.x*this.dpr:this.vw/2,r=t?t.y*this.dpr:this.vh/2,i=(n-this.ox)/this.s,a=(r-this.oy)/this.s;this.s=e,this.cx=i-(n-this.vw/2)/e,this.cy=a-(r-this.vh/2)/e,this.fitted=e===this.fitScale(),this.fitted?this.fit():this.clamp()}pan(e,t){(e!==0||t!==0)&&(this.cx-=e*this.dpr/this.s,this.cy-=t*this.dpr/this.s,this.fitted=!1,this.clamp())}clamp(){this.cx=Math.max(0,Math.min(this.mapW,this.cx)),this.cy=Math.max(0,Math.min(this.mapH,this.cy))}unproject(e){return{x:(e.x*this.dpr-this.ox)/this.s,y:(e.y*this.dpr-this.oy)/this.s}}project(e){return{x:(this.ox+e.x*this.s)/this.dpr,y:(this.oy+e.y*this.s)/this.dpr}}},X=e=>({gravity:0,dragX:1,dragY:1,lift:0,liftFade:0,wind:0,windAge:0,maxFall:0,sway:0,swirl:0,spread:.4,collide:!1,bounce:0,friction:1,siblings:0,...e}),Nr=[X({gravity:.6,dragX:.97,dragY:.97,collide:!0,bounce:.45,friction:.75,siblings:3,swirl:.006}),X({gravity:1,dragX:.99,collide:!0,bounce:.3,friction:.55,siblings:2}),X({dragX:.94,dragY:.94,lift:.012,wind:4,collide:!0,friction:.9,swirl:.03}),X({dragX:.9,dragY:.9,lift:.004,swirl:.03}),X({dragX:.92,dragY:.95,lift:.02,wind:3,collide:!0,friction:.85,swirl:.05}),X({gravity:.04,dragX:.95,wind:3,maxFall:.32,sway:.012,collide:!0,friction:0,swirl:.01}),X({dragY:.9,wind:2}),X({gravity:.25,dragX:.93,dragY:.93,collide:!0,bounce:.3,friction:.8,siblings:1,swirl:.01}),X({dragX:.985,dragY:.985,lift:.0036,liftFade:1,wind:.25,windAge:1.1,collide:!0,friction:.9,swirl:.005}),X({dragX:.95,dragY:.95,swirl:.006,spread:.3}),X({gravity:.02,dragX:.97,dragY:.97,lift:.004,liftFade:1,wind:3,swirl:.012,collide:!0,bounce:.2,friction:.5}),X({gravity:.03,dragX:.95,maxFall:.12,wind:3.5,sway:.01,swirl:.008,collide:!0,friction:0}),X({gravity:1,dragX:.9,maxFall:5.5,wind:12,spread:0,collide:!0,bounce:.12,friction:0}),X({gravity:.08,dragX:.96,wind:7,maxFall:.85,sway:.03,collide:!0,friction:0,swirl:.02}),X({dragX:.975,dragY:.975,swirl:.11,sway:.035,spread:.6})],Z=Nr.length;function Pr(e,t){let n=n=>Math.min(255,Math.round((e>>n&255)*t));return n(16)<<16|n(8)<<8|n(0)}var Fr={[I.Smoke]:2.2,[I.Dust]:1.4,[I.Plume]:2.4,[I.Flame]:-.3,[I.Plasma]:1.6},Ir=240,Lr=`#version 300 es
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
}`,Rr=`#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`,zr=`#version 300 es
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
const vec3 PLASMA_DEEP = vec3(0.17, 0.07, 0.4);
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
    if (k == ${I.Plume}) {
      int band = min(4, int(t * 5.0));
      if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
      cover = band < 3 ? 1.0 : band == 3 ? 0.55 : 0.3;
      show = show && u_pass == 0;
    } else if (k == ${I.Flame}) {
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
    } else if (k == ${I.Chunk}) {
      show = show && u_pass == 0;
      cover = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
      // grains leave the blast glowing and cool to their own colour
      col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
    } else if (k == ${I.Plasma}) {
      // hot cyan-white, its own blue or violet, then deep violet as it thins out cell by cell
      col = ramp3(mix(col, vec3(0.75, 0.95, 1.0), 0.4), col, PLASMA_DEEP, stepT(t, th, 6.0));
      cover = t < 0.45 ? 1.0 : (1.0 - t) / 0.55;
      if (u_pass == 1) {
        // the young, hot cells also light up: one hard additive cell each
        show = show && t < 0.2;
        alpha = 0.35;
      }
    } else if (k == ${I.Cloud}) {
      show = show && u_pass == 0;
      cover = t < 0.6 ? 1.0 : (1.0 - t) / 0.4;
      // each mote cools on its way out of the fireball
      col = mix(col, SOOT, stepT(t, th, 5.0) * 0.65);
    } else {
      show = show && u_pass == 0;
      bool smoke = k == ${I.Smoke};
      cover = (smoke ? 1.1 : 0.9) * (1.0 - t) * min(1.0, t * 6.0 + 0.2);
      // smoke: ember-lit at the blast, its own grey, then pale as it thins; dust just pales
      float x = stepT(t, th, 6.0);
      col = smoke ? ramp3(mix(col, EMBER, 0.6), col, shade(col, 1.4), min(1.0, x * 1.4))
                  : mix(col, shade(col, 1.3), x);
    }
    show = show && th < cover;
  } else if (k == ${I.Ember}) {
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
  } else if (k == ${I.Rain}) {
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
  } else if (k == ${I.Ash}) {
    show = show && u_pass == 0 && th < (t < 0.75 ? 1.0 : (1.0 - t) / 0.25);
    col = mix(col, shade(col, 1.5), stepT(t, th, 4.0));
  } else if (k == ${I.Spark}) {
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
  } else if (k == ${I.Glitter}) {
    show = show && u_pass == 1;
    if (t > 0.55 && ((int(age) + int(rgb & 7u)) & 2) == 0) show = false;
    size = vec2(s);
    alpha = t < 0.55 ? 1.0 : 0.85;
    // a white flash, its colour, then deeper as it burns out
    col = ramp3(vec3(1.0), col, col * 0.5, stepT(t, th, 5.0));
  } else if (k == ${I.Snow} || k == ${I.Flake}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.8 ? 0.95 : (1.0 - t) / 0.2;
  } else if (k == ${I.Streak}) {
    show = show && u_pass == 0;
    float len = max(2.0, floor(s + 0.5));
    pos = vec2(floor(a_dyn.x) + len * 0.5, cell.y);
    size = vec2(len, 1.0);
    alpha = t < 0.2 ? 0.3 : t < 0.75 ? 0.62 : 0.3;
  } else if (k == ${I.Chunk}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
    col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
  } else if (k == ${I.Plasma}) {
    // a lone plasma cell (a filament): same ramp as its motes
    col = ramp3(mix(col, vec3(0.75, 0.95, 1.0), 0.4), col, PLASMA_DEEP, stepT(t, th, 6.0));
    show = show && th < (t < 0.5 ? 1.0 : (1.0 - t) / 0.5);
    if (u_pass == 1) {
      show = show && t < 0.4;
      alpha = 0.5;
    }
  } else if (k == ${I.Plume}) {
    show = show && u_pass == 0;
    int band = min(4, int(t * 5.0));
    size = vec2(floor(s * (1.0 + t * 2.4) + 0.5));
    if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
    bool solidBlob = band < 3 && age >= 6.0;
    shape = solidBlob ? 5 : 4;
    alpha = solidBlob ? 1.0 : (band == 3 ? 0.55 : band == 4 ? 0.3 : 0.6);
  } else if (k == ${I.Flame}) {
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
    bool smoke = k == ${I.Smoke};
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
}`;function Br(e,t,n){let r=e.createProgram();for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(!t)throw Error(`createShader failed`);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))throw Error(`shader compile failed: ${e.getShaderInfoLog(t)??``}`);e.attachShader(r,t),e.deleteShader(t)}if(e.transformFeedbackVaryings(r,[`v_dyn`],e.INTERLEAVED_ATTRIBS),e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw Error(`program link failed: ${e.getProgramInfoLog(r)??``}`);return r}var Q=16,$=16,Vr=class{density;cap;tick=0;passes=0;head=0;tail=0;count=0;death;lastDeath=0;pendStart=0;pendCount=0;dyn;statF;statU;gl;dynBuf;statBuf;updVao;drawVao;tf;updProg;drawProg;uUpd={};uDraw={};cur=0;constructor(e,t,n=1){this.density=n,this.gl=e,this.cap=t,this.dyn=new Float32Array(t*4),this.death=new Float32Array(t);let r=new ArrayBuffer(t*Q);this.statF=new Float32Array(r),this.statU=new Uint32Array(r),this.updProg=Br(e,Lr,Rr),this.drawProg=A(e,zr,k);for(let t of[`u_tick`,`u_gravity`,`u_wind`,`u_kA`,`u_kB`,`u_kC`,`u_kD`,`u_terrain`,`u_map`])this.uUpd[t]=e.getUniformLocation(this.updProg,t);for(let t of[`u_view`,`u_origin`,`u_scale`,`u_tick`,`u_pass`])this.uDraw[t]=e.getUniformLocation(this.drawProg,t);let i=new Float32Array(Z*4),a=new Float32Array(Z*4),o=new Float32Array(Z*4),s=new Float32Array(Z*4);Nr.forEach((e,t)=>{i.set([e.gravity,e.dragX,e.dragY,e.lift],t*4),a.set([e.liftFade,e.wind,e.windAge,e.maxFall],t*4),o.set([e.sway,+!!e.collide,e.bounce,e.friction],t*4),s.set([e.swirl,e.spread,0,0],t*4)}),e.useProgram(this.updProg),e.uniform4fv(this.uUpd.u_kA,i),e.uniform4fv(this.uUpd.u_kB,a),e.uniform4fv(this.uUpd.u_kC,o),e.uniform4fv(this.uUpd.u_kD,s);let c=(t,n)=>{let r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,t,n),r};this.dynBuf=[c(t*$,e.DYNAMIC_COPY),c(t*$,e.DYNAMIC_COPY)],this.statBuf=c(t*Q,e.DYNAMIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,null);let l=(t,n)=>{let r=e.createVertexArray();return e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,t),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,$,0),e.vertexAttribDivisor(0,n),e.bindBuffer(e.ARRAY_BUFFER,this.statBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,Q,0),e.vertexAttribDivisor(1,n),e.enableVertexAttribArray(2),e.vertexAttribIPointer(2,1,e.UNSIGNED_INT,Q,12),e.vertexAttribDivisor(2,n),e.bindVertexArray(null),e.bindBuffer(e.ARRAY_BUFFER,null),r};this.updVao=[l(this.dynBuf[0],0),l(this.dynBuf[1],0)],this.drawVao=l(this.dynBuf[0],1),this.tf=e.createTransformFeedback()}get n(){return this.count}add(e){if(Fr[e.kind]&&e.size>=2){this.motes(e);return}if(e.kind===I.Chunk&&e.size>=2){this.grains(e);return}this.put(e.x,e.y,e.vx,e.vy,e.life,e.size,e.kind,e.color);let t=Math.round((Nr[e.kind]?.siblings??0)*this.density);for(let n=0;n<t;n++){let t=this.rand()*.5+.75,n=this.rand()*.5+.75;this.put(e.x+this.rand()-.5,e.y+this.rand()-.5,e.vx*t+(this.rand()-.5)*.3,e.vy*n+(this.rand()-.5)*.3,e.life*(.55+this.rand()*.45),Math.max(1,e.size-1),e.kind,e.color)}}motes(e){let t=Fr[e.kind],n=e.size/2,r=Math.max(4,Math.min(64,Math.round(e.size*e.size*.7*Math.max(.3,this.density)))),i=n*t/Math.max(1,e.life);for(let t=0;t<r;t++){let t=this.rand()*6.283185,r=Math.sqrt(this.rand()),a=Math.cos(t)*r,o=Math.sin(t)*r;this.put(e.x+a*n,e.y+o*n,e.vx+a*i+(this.rand()-.5)*.04,e.vy+o*i+(this.rand()-.5)*.04,e.life*(.7+this.rand()*.3),1,e.kind|128,e.color);let s=this.rand();e.kind===I.Flame&&s<.1?this.put(e.x+a*n,e.y+o*n,e.vx*.6+(this.rand()-.5)*.5,e.vy*.6-.2-this.rand()*.3,80+this.rand()*90,1,I.Ember,16760896):(e.kind===I.Smoke||e.kind===I.Plume)&&s<.05&&this.put(e.x+a*n,e.y+o*n,e.vx*.5+(this.rand()-.5)*.2,e.vy*.5-this.rand()*.15,200+this.rand()*120,1,I.Ash,Pr(e.color,.62))}}grains(e){let t=Math.min(6,Math.round(e.size)),n=t/2;for(let r=0;r<t;r++)for(let i=0;i<t;i++){let t=this.rand(),a=t<.25?.82:t>.8?1.16:1;this.put(e.x-n+i+.5,e.y-n+r+.5,e.vx+(this.rand()-.5)*.14,e.vy+(this.rand()-.5)*.14,e.life*(.75+this.rand()*.25),1,I.Chunk|128,Pr(e.color,a))}}seed=2654435769;rand(){let e=this.seed=this.seed+1831565813>>>0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}put(e,t,n,r,i,a,o,s){let c=this.head;this.head=c+1===this.cap?0:c+1,this.count===this.cap?this.tail=this.head:this.count++,this.death[c]=this.tick+i;let l=c*4;this.dyn[l]=e,this.dyn[l+1]=t,this.dyn[l+2]=n,this.dyn[l+3]=r,this.statF[l]=this.tick,this.statF[l+1]=i,this.statF[l+2]=a,this.statU[l+3]=(o&255)<<24|s&16777215,this.tick+i>this.lastDeath&&(this.lastDeath=this.tick+i),this.pendCount===0&&(this.pendStart=c),this.pendCount<this.cap&&this.pendCount++}step(e,t){if(this.gravity=e,this.wind=t,this.tick++,this.tick>=this.lastDeath){this.clear();return}let n=this.death;for(;this.count>0&&n[this.tail]<=this.tick;)this.tail=this.tail+1===this.cap?0:this.tail+1,this.count--;this.passes++}gravity=0;wind=0;upload(){if(this.pendCount===0)return;let e=this.gl,t=(t,n)=>{e.bindBuffer(e.ARRAY_BUFFER,this.dynBuf[this.cur]),e.bufferSubData(e.ARRAY_BUFFER,t*$,this.dyn,t*4,n*4),e.bindBuffer(e.ARRAY_BUFFER,this.statBuf),e.bufferSubData(e.ARRAY_BUFFER,t*Q,this.statF,t*4,n*4)};if(this.pendCount>=this.cap)t(0,this.cap);else{let e=Math.min(this.pendCount,this.cap-this.pendStart);t(this.pendStart,e),e<this.pendCount&&t(0,this.pendCount-e)}e.bindBuffer(e.ARRAY_BUFFER,null),this.pendCount=0}update(e,t,n){let r=Math.min(this.passes,Ir);if(this.passes=0,r===0||this.count===0)return;let i=this.segments(),a=this.gl;a.useProgram(this.updProg),a.activeTexture(a.TEXTURE9),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(this.uUpd.u_terrain,9),a.uniform2i(this.uUpd.u_map,t,n),a.uniform1f(this.uUpd.u_gravity,this.gravity),a.uniform1f(this.uUpd.u_wind,this.wind),a.enable(a.RASTERIZER_DISCARD),a.bindTransformFeedback(a.TRANSFORM_FEEDBACK,this.tf);let o=this.tick-r+1;for(let e=0;e<r;e++){let t=this.cur,n=+(t===0);a.uniform1f(this.uUpd.u_tick,o+e),a.bindVertexArray(this.updVao[t]);for(let e=0;e<i.length;e+=2){let t=i[e],r=i[e+1];a.bindBufferRange(a.TRANSFORM_FEEDBACK_BUFFER,0,this.dynBuf[n],t*$,r*$),a.beginTransformFeedback(a.POINTS),a.drawArrays(a.POINTS,t,r),a.endTransformFeedback(),a.bindBufferBase(a.TRANSFORM_FEEDBACK_BUFFER,0,null)}this.cur=n}a.bindTransformFeedback(a.TRANSFORM_FEEDBACK,null),a.disable(a.RASTERIZER_DISCARD),a.bindVertexArray(null),a.activeTexture(a.TEXTURE0)}draw(e,t,n,r,i,a){if(this.upload(),this.update(e,t,n),this.count===0)return;let o=this.gl,s=this.segments();o.useProgram(this.drawProg),o.uniform2f(this.uDraw.u_view,r[0],r[1]),o.uniform2f(this.uDraw.u_origin,i[0],i[1]),o.uniform1f(this.uDraw.u_scale,a),o.uniform1f(this.uDraw.u_tick,this.tick),o.bindVertexArray(this.drawVao),o.enable(o.BLEND);for(let e=0;e<2;e++){e===0?o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA):o.blendFunc(o.ONE,o.ONE),o.uniform1i(this.uDraw.u_pass,e);for(let e=0;e<s.length;e+=2)this.pointDraw(this.dynBuf[this.cur],s[e]),o.drawArraysInstanced(o.TRIANGLES,0,6,s[e+1])}o.disable(o.BLEND),o.bindVertexArray(null),o.bindBuffer(o.ARRAY_BUFFER,null)}segments(){let e=this.tail+this.count;return e<=this.cap?[this.tail,this.count]:[this.tail,this.cap-this.tail,0,e-this.cap]}pointDraw(e,t){let n=this.gl;n.bindBuffer(n.ARRAY_BUFFER,e),n.vertexAttribPointer(0,4,n.FLOAT,!1,$,t*$),n.bindBuffer(n.ARRAY_BUFFER,this.statBuf),n.vertexAttribPointer(1,3,n.FLOAT,!1,Q,t*Q),n.vertexAttribIPointer(2,1,n.UNSIGNED_INT,Q,t*Q+12)}clear(){this.head=0,this.tail=0,this.count=0,this.passes=0,this.pendCount=0,this.lastDeath=this.tick}dispose(){let e=this.gl;e.deleteBuffer(this.dynBuf[0]),e.deleteBuffer(this.dynBuf[1]),e.deleteBuffer(this.statBuf);for(let t of[...this.updVao,this.drawVao])e.deleteVertexArray(t);e.deleteTransformFeedback(this.tf),e.deleteProgram(this.updProg),e.deleteProgram(this.drawProg)}},Hr=[34,72,118,168],Ur=150,Wr=.14,Gr=[1906971,2761766,3813428],Kr=[16773280,16752672,14699024,9054736];function qr(e){let t=e[0]?.length??0;for(let n=0;n<e.length;n++){let r=0,i=e[n];for(let e=0;e<i.length;e++)i.charCodeAt(e)!==46&&r++;if(r*4>=t*3)return n}return 0}function Jr(e,t,n,r,i,a,o){let s=e.sprite,c=s[0]?.length??0,l=s.length,u=qr(s),d=[],f=[];for(let e=0;e<l;e++){let n=s[e];for(let r=0;r<c;r++){let i=n.charCodeAt(r);if(i===46)continue;let a={dx:r-(c>>1),dy:e-l,rgb:t(i)};(e<u?f:d).push(a)}}let p=e.barrel,m=a*Math.PI/180,h=p.width>>1;for(let e=1;e<=p.length;e++){let t=Math.round(p.x+Math.cos(m)*e),n=Math.round(-p.y-Math.sin(m)*e);for(let r=0;r<p.width;r++)for(let i=0;i<p.width;i++)f.push({dx:t-h+r,dy:n-h+i,rgb:e===p.length?11051672:14209736})}let g=0,_=0,v=0;for(let e=0;e<u;e++){let t=s[e];for(let n=0;n<c;n++)t.charCodeAt(n)!==46&&(g+=n-(c>>1),_+=e-l,v++)}let y=v>0?Math.round(g/v):0,b=v>0?Math.round(_/v):-l,x=0;for(let e of f)x=Math.max(x,Math.abs(e.dx-y),Math.abs(e.dy-b));let S=2*x+1,C=new Int32Array(S*S).fill(-1);for(let e of f)C[(e.dy-b+x)*S+e.dx-y+x]=e.rgb;let w=Math.max(1,Math.min(3,Math.ceil(u/2))),T=new P(Math.imul(o+1,2654435761)^Math.imul(n+11,40503)^r),E=Math.cos(m)>=0?-1:1,D=T.next()<.25?-E:E;return{player:n,start:o,hull:d,w:c,h:l-u,turret:C,reach:x,tx:r+y,ty:i+b,vx:D*T.range(.5,1.3),vy:-T.range(3.2,4.2),spin:0,rate:D*T.range(.18,.32),foot:w,rest:!1,gone:!1,rng:T}}function Yr(e,t,n,r,i,a,o,s){let c=t-e.start;if(e.gone||Xr(e,c,i,a,s),c>=0&&c<420){let t=c/420,i=(1-t)*(1-t)*1.6*o+.15,s=Math.floor(i);e.rng.next()<i-s&&s++;for(let i=0;i<s;i++){let i=n+Math.round(e.rng.range(-.45,.45)*e.w);a.add({x:i+.5,y:r-e.h-e.rng.range(0,1.5),vx:e.rng.range(-.12,.12),vy:-e.rng.range(.25,.6),life:e.rng.range(16,32)*(1-t*.5),size:e.rng.range(1.5,3.2)*(1-t*.4),color:0,kind:I.Flame})}c%5==0&&a.add({x:n+e.rng.range(-3,3),y:r-e.h-4,vx:0,vy:-e.rng.range(.25,.45),life:e.rng.range(80,120),size:e.rng.range(4,6)*(1-t*.5),color:e.rng.next()<.5?1972764:3024938,kind:I.Smoke})}let l=Hr.indexOf(c);if(l<0)return;let u=l===Hr.length-1;return{x:n+Math.round(e.rng.range(-.35,.35)*e.w),y:r-e.h+1,radius:u?9:5+l,big:u}}function Xr(e,t,n,r,i){if(t<0)return;let a=(t,r)=>n(Math.round(t),Math.round(r)+e.foot+1);if(e.rest){if(!a(e.tx,e.ty))e.rest=!1;else return}e.vy=Math.min(e.vy+Wr,5);let o=Math.max(1,Math.ceil(Math.max(Math.abs(e.vx),Math.abs(e.vy))));for(let t=0;t<o;t++){let t=e.tx+e.vx/o;n(Math.round(t)+Math.sign(e.vx)*e.foot,Math.round(e.ty))?e.vx=-e.vx*.4:e.tx=t;let i=e.ty+e.vy/o;if(e.vy>0&&a(e.tx,i)){for(e.ty=Math.round(i);a(e.tx,e.ty-1)&&e.ty>0;)e.ty--;if(e.vy<1.2){e.rest=!0,e.vx=0,e.vy=0,e.spin=Math.round(e.spin/Math.PI)*Math.PI,e.rate=0;return}e.vy=-e.vy*.35,e.vx*=.6,e.rate*=.5;for(let t=0;t<4;t++)r.add({x:e.tx,y:e.ty+e.foot,vx:e.rng.range(-.8,.8),vy:-e.rng.range(.4,1.2),life:e.rng.range(10,22),size:1,color:e.rng.next()<.4?16773280:16742938,kind:I.Spark});break}e.vy<0&&n(Math.round(e.tx),Math.round(i)-e.foot)?e.vy=0:e.ty=i}e.spin+=e.rate,e.ty>i+16&&(e.gone=!0),t%2==0&&r.add({x:e.tx,y:e.ty,vx:0,vy:-.08,life:50,size:2+ +(t%4==0),color:3024938,kind:I.Smoke}),t<50&&r.add({x:e.tx+e.rng.range(-1,1),y:e.ty+e.rng.range(-1,1),vx:e.rng.range(-.4,.4),vy:e.rng.range(-.2,.4),life:e.rng.range(8,16),size:1,color:e.rng.next()<.5?16773280:16752672,kind:I.Spark})}function Zr(e,t,n){let r=Math.imul(e+1,73856093)^Math.imul(t+1,19349663)^Math.imul(n+1,83492791);return r^=r>>>13,r=Math.imul(r,1540483477),(r^r>>>15)>>>0}function Qr(e,n,r,i,a){let o=Math.max(0,a-n.start),s=o<420?1-o/420:0,c=o<840?1-o/840:0,l=Math.floor(a/4);for(let a of n.hull){let o=r+a.dx,u=i+a.dy,d=Zr(o,u,l),f=a.dy+n.h,p=Gr[(d>>>8)%3];f>=1&&f<=2&&!(d>>>12&7)&&(p=t(a.rgb,.35));let m=(d&255)/255;s>0&&f<=2&&m<.35*s?p=Kr[Math.min(3,Math.floor((1-s)*3+m*4))]:c>0&&m<.06*c&&(p=Kr[3]),e.rect(o,u,1,1,p)}}function $r(e,n,r){if(n.gone)return;let i=r-n.start;if(i<0)return;let a=Math.min(1,i/Ur),o=a<.34?.85:.5,s=Math.cos(n.spin),c=Math.sin(n.spin),l=Math.round(n.tx),u=Math.round(n.ty),d=Math.floor(r/4),f=n.reach,p=2*f+1,m=Math.ceil(f*1.42);for(let r=-m;r<=m;r++)for(let i=-m;i<=m;i++){let m=Math.round(i*s+r*c),h=Math.round(-i*c+r*s);if(m<-f||m>f||h<-f||h>f)continue;let g=n.turret[(h+f)*p+m+f];if(g<0)continue;let _=l+i,v=u+r,y=Zr(i,r,n.player),b=a<.67||!(y&7)?t(g,a<.67?o:.35):Gr[(y>>>8)%3];a<1&&(Zr(_,v,d)&255)<50*(1-a)&&(b=Kr[1+(d&1)]),e.rect(_,v,1,1,b)}}var ei={1:[2,6,2,2,7],2:[6,1,2,4,7],3:[6,1,2,1,6],4:[5,5,7,1,1],5:[7,4,6,1,6],6:[3,4,6,5,2],7:[7,1,2,2,2],8:[2,5,2,5,2],9:[2,5,3,1,6]},ti=65536,ni=[`u_size`,`u_map`,`u_top`,`u_bottom`,`u_cloud`,`u_boil`,`u_cloudLight`,`u_cloudShadow`,`u_ranges`,`u_rangeCount`,`u_horizon`,`u_cam`],ri=600,ii=2048,ai=.12,oi=8380671,si={sprite:[`......HHHH......`,`.....hhhhhh.....`,`....hhhhhhhh....`,`.HHHHHHHHHHHHHH.`,`.hhhhhhhhhhhhhh.`,`.dhhhhhhhhhhhhd.`,`tttttttttttttttt`,`twwttwwttwwttwwt`,`tttttttttttttttt`],barrel:{x:0,y:7,length:8,width:1}},ci=[`......ccwwwcc......`,`...cccwwcccwwccc...`,`.ccwwcccwwwcccwwcc.`,`cccwwcccwwwcccwwccc`,`cccwwcccwwwcccwwccc`,`d.d.d.d.d.d.d.d.d.d`],li=[[-9,-6],[-4,-2],[4,2],[9,6]],ui=45;function di(e,n,r){switch(e){case 72:return t(n,1.3);case 100:return t(n,.72);case 116:return 2827810;case 119:return 5591114;case 109:return 14209736;case 115:return r?oi:4872800;case 103:return 10473696;default:return n}}var fi=3,pi=40,mi=140,hi=[.62,.8,.96,1.12],gi=180,_i=class{mapWidth;mapHeight;camera;gl;canvas;unsubscribe;theme=a;baseTheme=a;weather=void 0;temperature=15;deathZone=0;zoneGrewAt=-1e9;zoneFrom=0;stormKind=`snow`;stormK=-1;themeStep=0;quality=`medium`;palette;shakeOn=!0;terrainTex;coatTex;grassTex;grassMask;grassRound=-1;burnTex;burn;lastBurn=-1;wreckY=[];wrecks=[];wreckV=[];colorTex;colorFbo;bgProg;sceneryProg;uScn;sceneryTex;sceneryFbo;sceneryW=0;sceneryH=0;sceneryKey=``;uBg;lookTex;lookFlags=new Uint8Array(256);anyCycle=!1;anyHot=!1;lights=new p;lightTmp=[0,0,0];heat=new Uint8Array;heatTex;heatOn=!1;flameCells=new Int32Array(ii);flameN=0;coating=new Uint8Array;dirty=[0,0,0,0];paletteTex;sceneTex;sceneFbo;sceneW=0;sceneH=0;terrainProg;postProg;emptyVao;uTer;uPost;normal;additive;particles;fluid;liquid;fx;water;onCues;terrain;entities=[];meteors=new Map;zones=[];probe;debris={count:0,x:new Int32Array,y:new Int32Array,vx:new Int32Array,material:new Uint8Array};wind=0;cloudX=0;horizon=-1;rangeBuf=new Float32Array(9);lastTick=0;fxTick=-1;trails=[];rippleBuf=new Float32Array(32);rippleW=new Float32Array(8);shieldHitAt=[];shieldUpAt=[];batteryAt=[];tumble=[];constructor(e,t){this.mapWidth=e,this.mapHeight=t,this.camera=new Mr(e,t),this.terrain=new Uint8Array(e*t),this.grassMask=new Uint8Array(e*t),this.burn=new Uint32Array(e*t),this.probe={width:e,height:t,solid:(n,r)=>n>=0&&r>=0&&n<e&&r<t&&this.terrain[r*e+n]!==0,liquid:(e,t)=>this.water.isLiquid(e,t)}}mount(e,t,n){this.canvas=e;let r=e.getContext(`webgl2`,{antialias:!1,alpha:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,preserveDrawingBuffer:n.preserveDrawingBuffer??!1,powerPreference:`high-performance`});if(!r)throw Error(`WebGL2 is not available`);this.gl=r,this.palette=n.palette,this.baseTheme=o(n.theme,n.palette.themes),this.theme=this.baseTheme,this.shakeOn=n.shake??!0,this.onCues=n.onCues,this.water=new br(this.mapWidth,this.mapHeight,n.palette.liquids??[],n.palette.materials),this.liquid=new Dr(this.mapWidth,this.mapHeight,n.palette.liquids??[],n.palette.hotLiquids??[],n.palette.heavyLiquids??[],n.palette.materials),this.water.listener=this.liquid,this.terrainProg=A(r,E,D),this.uTer=j(r,this.terrainProg,[`u_view`,`u_origin`,`u_scale`,`u_map`,`u_terrain`,`u_coat`,`u_palette`,`u_grain`,`u_light`,`u_wet`,`u_snow`,`u_look`,`u_grass`,`u_ground`,`u_flowers`,`u_grassMask`]),this.bgProg=A(r,C,w),this.uBg=j(r,this.bgProg,`u_color.u_view.u_origin.u_scale.u_map.u_top.u_bottom.u_letterbox.u_flash.u_white.u_vignette.u_terrain.u_coat.u_look.u_palette.u_time.u_haze.u_anim.u_stars.u_starColor.u_scenery.u_grass.u_grassMask.u_burn.u_burnOn.u_lightCount.u_lights.u_lightCol.u_heat.u_heatOn`.split(`.`)),this.sceneryProg=A(r,C,T),this.uScn=j(r,this.sceneryProg,ni),this.postProg=A(r,C,ee),this.uPost=j(r,this.postProg,[`u_scene`,`u_view`,`u_shake`,`u_rippleCount`,`u_ripple`,`u_rippleW`,`u_tint`,`u_origin`,`u_scale`,`u_split`,`u_scan`,`u_wob`]),this.emptyVao=r.createVertexArray(),r.pixelStorei(r.UNPACK_ALIGNMENT,1),this.terrainTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.R8UI,this.mapWidth,this.mapHeight,0,r.RED_INTEGER,r.UNSIGNED_BYTE,this.terrain),this.coatTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.R8UI,this.mapWidth,this.mapHeight,0,r.RED_INTEGER,r.UNSIGNED_BYTE,new Uint8Array(this.mapWidth*this.mapHeight)),this.grassTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.R8UI,this.mapWidth,this.mapHeight,0,r.RED_INTEGER,r.UNSIGNED_BYTE,this.grassMask),this.burnTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.R32UI,this.mapWidth,this.mapHeight,0,r.RED_INTEGER,r.UNSIGNED_INT,this.burn),this.heat=new Uint8Array(this.mapWidth*this.mapHeight).fill(255),this.heatTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.R8UI,this.mapWidth,this.mapHeight,0,r.RED_INTEGER,r.UNSIGNED_BYTE,this.heat),this.paletteTex=M(r),this.lookTex=M(r),this.uploadPalette(),this.colorTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,this.mapWidth,this.mapHeight,0,r.RGBA,r.UNSIGNED_BYTE,null),this.sceneryW=Math.ceil(this.mapWidth/2),this.sceneryH=Math.ceil(this.mapHeight/2),this.sceneryTex=M(r),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,this.sceneryW,this.sceneryH,0,r.RGBA,r.UNSIGNED_BYTE,null),this.sceneryFbo=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,this.sceneryFbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,this.sceneryTex,0),this.colorFbo=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,this.colorFbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,this.colorTex,0),r.bindFramebuffer(r.FRAMEBUFFER,null),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.sceneTex=M(r,r.LINEAR),this.sceneFbo=r.createFramebuffer(),this.normal=new ne(r),this.additive=new ne(r),this.setQuality(n.quality),this.unsubscribe=t.subscribe(e=>this.push(e)),this.resize(e.clientWidth||e.width,e.clientHeight||e.height,1)}uploadPalette(){let e=this.gl,t=new Uint8Array(1024);for(let e=0;e<256;e++){let n=this.palette.materials[e]??0;t[e*4]=n>>16&255,t[e*4+1]=n>>8&255,t[e*4+2]=n&255,t[e*4+3]=255}e.bindTexture(e.TEXTURE_2D,this.paletteTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,1,0,e.RGBA,e.UNSIGNED_BYTE,t);let n=new Uint8Array(9216);for(let e of this.palette.looks??[]){if(e.cell<=0||e.cell>255)continue;let t=Math.min(8,e.cycle.length);n[e.cell*4]=t>=2?t:0,this.lookFlags[e.cell]=(t>=2||e.glint?1:0)|(e.hot?2:0)|(e.flames?4:0),n[e.cell*4+1]=Math.max(1,Math.min(255,e.ticks)),n[e.cell*4+2]=e.hot?255:e.glint?96:0,n[e.cell*4+3]=e.topsoil?255:e.char?128:0;for(let r=0;r<t;r++){let t=((1+r)*256+e.cell)*4,i=e.cycle[r];n[t]=i>>16&255,n[t+1]=i>>8&255,n[t+2]=i&255,n[t+3]=255}}e.bindTexture(e.TEXTURE_2D,this.lookTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,256,9,0,e.RGBA,e.UNSIGNED_BYTE,n)}setQuality(e){this.quality=e;let t=an[e],n=this.particles,r=t.cap,i=Kn[e];n&&n.cap===r||(n?.dispose(),this.fluid?.dispose(),this.particles=new Vr(this.gl,r,t.mult),this.fluid=new ir(this.gl,this.mapWidth,this.mapHeight,i.div,i.iters),this.fx=new sn(this.particles,this.fluid,{width:this.mapWidth,height:this.mapHeight,material:(e,t)=>e<0||t<0||e>=this.mapWidth||t>=this.mapHeight?0:this.terrain[t*this.mapWidth+e],color:e=>this.palette.materials[e]??8018490,grass:(e,t)=>this.grassMask[t*this.mapWidth+e]!==0})),this.fx.mult=t.mult,this.water.mult=t.mult,this.liquid.mult=t.mult}setTheme(e){this.baseTheme=o(e,this.palette.themes),this.applyTheme()}resize(e,t,n){this.camera.setViewport(e,t,n);let r=this.camera.vw,i=this.camera.vh;if(this.canvas.width!==r&&(this.canvas.width=r),this.canvas.height!==i&&(this.canvas.height=i),r!==this.sceneW||i!==this.sceneH){let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.sceneTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,r,i,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,this.sceneFbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.sceneTex,0),e.bindFramebuffer(e.FRAMEBUFFER,null),this.sceneW=r,this.sceneH=i}}unproject(e){return this.camera.unproject(e)}project(e){return this.camera.project(e)}push(e){let t=this.gl;if(e.dirtyRects.length>0){t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.pixelStorei(t.UNPACK_ROW_LENGTH,e.width);for(let n of e.dirtyRects){if(n.w<=0||n.h<=0)continue;t.pixelStorei(t.UNPACK_SKIP_PIXELS,n.x),t.pixelStorei(t.UNPACK_SKIP_ROWS,n.y),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.terrain),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.texSubImage2D(t.TEXTURE_2D,0,n.x,n.y,n.w,n.h,t.RED_INTEGER,t.UNSIGNED_BYTE,e.coating),t.bindTexture(t.TEXTURE_2D,this.terrainTex);let r=this.dirty,i=r[0]>=r[2];r[0]=Math.max(0,Math.min(i?1/0:r[0],n.x-16)),r[1]=Math.max(0,Math.min(i?1/0:r[1],n.y-1)),r[2]=Math.min(this.mapWidth,Math.max(i?-1/0:r[2],n.x+n.w+16)),r[3]=Math.min(this.mapHeight,Math.max(i?-1/0:r[3],n.y+n.h+32))}t.pixelStorei(t.UNPACK_ROW_LENGTH,0),t.pixelStorei(t.UNPACK_SKIP_PIXELS,0),t.pixelStorei(t.UNPACK_SKIP_ROWS,0)}this.terrain=e.terrain,this.water.setTerrain(e.terrain),this.liquid.setTerrain(e.terrain),this.coating=e.coating;let n=Math.floor(e.turn/1e3);(this.grassRound<0||n!==this.grassRound&&e.dirtyRects.some(t=>t.x===0&&t.y===0&&t.w>=e.width&&t.h>=e.height))&&e.width===this.mapWidth&&e.height===this.mapHeight&&(this.grassRound=n,bi(e.terrain,e.width,e.height,this.grassMask),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.texSubImage2D(t.TEXTURE_2D,0,0,0,e.width,e.height,t.RED_INTEGER,t.UNSIGNED_BYTE,this.grassMask),this.dirty=[0,0,this.mapWidth,this.mapHeight],this.burn.fill(0),this.lastBurn=-1,this.uploadBurn(0,0,e.width,e.height),this.wreckY=[],this.wreckV=[],this.wrecks=[],this.clearRoundFx()),(e.tick%20==0||this.fxTick<0)&&this.scanLooks(),this.horizon<0&&(this.horizon=yi(e.terrain,e.width,e.height)),this.entities=e.entities,this.zones=[];for(let t of e.entities)t.kind===`zone`&&this.zones.push(t);this.witherGrass(),this.debris=e.debris,this.wind=e.wind,this.temperature=e.temperature??15;let r=e.deathZone??0;if(r>this.deathZone?(this.zoneFrom=this.shownZone(e.tick),this.zoneGrewAt=e.tick):r<this.deathZone&&(this.zoneFrom=r),this.deathZone=r,this.stormK<0){let e=sr(this.temperature);this.stormKind=e.kind,this.stormK=e.k,this.applyTheme()}for((e.weather?.id??``)!==(this.weather?.id??``)&&(this.weather=e.weather,this.applyTheme(),this.dirty=[0,0,this.mapWidth,this.mapHeight]),this.lastTick=e.tick,this.fxTick<0&&(this.fxTick=e.tick);this.fxTick<e.tick;)this.stepFx();for(let t of e.effectEvents)if(this.fx.handle(t),t.type===`flash`?(this.water.blast(t),this.liquid.blast(t.x,t.y,t.radius),(t.params.strength??1)>0&&this.scorch(t.x,t.y,t.radius,t.tick)):t.type===`geyser`?this.scorch(t.x,t.y,t.radius*1.8,t.tick):t.type===`tsunami`&&this.scour(t.x,t.params.dir??1,(t.params.len??0)+12),t.type===`tankDeath`&&this.startWreck(t.params.player??-1,t.tick),t.type===`shieldHit`)this.shieldHitAt[t.params.player??-1]=t.tick;else if(t.type===`shieldUp`)this.shieldUpAt[t.params.player??-1]=t.tick;else if(t.type===`battery`)this.batteryAt[t.params.player??-1]=t.tick;else if(t.type===`shockFling`){let e=t.params.player??-1,n=(t.params.dir??1)*(.22+(t.tick*7+e*13)%10*.012);this.tumble[e]={rate:n,at:t.tick,fly:t.tick,land:-1,rest:0}}else if(t.type===`shockFly`){let e=this.tumble[t.params.player??-1];e&&(e.fly=t.tick)}this.fx.lances.track(e.entities,e.tick),this.tagStars(),this.updateTrails(e);let i=this.water.drainCues();i.length>0&&this.onCues?.(i)}clearRoundFx(){this.trails=[],this.particles.clear(),this.fluid.clear(),this.fx.clear(),this.water.clear(),this.liquid.clear(),this.meteors.clear(),this.starColor=new Map,this.shieldHitAt=[],this.shieldUpAt=[],this.batteryAt=[],this.tumble=[]}tagStars(){let e=this.palette.shells;if(!e)return;let t=this.starColor,n=null;for(let r of this.entities){if(r.kind!==`projectile`||e[r.weapon]?.shell!==`star`)continue;n??=new Map;let i=t.get(r.id);if(i===void 0){let e=this.fx.fireworkColor(r.x,this.fxTick,!0);i=e<0?16764992:e}n.set(r.id,i)}this.starColor=n??(t.size>0?new Map:t)}witherGrass(){let e=this.grassMask,t=this.mapWidth,n=this.mapHeight,r=t,i=n,a=0,o=0;for(let s of this.zones){let c=s.puffs;if(!c||c.length===0||s.look!==`toxic`)continue;let l=Math.round((s.puffRadius??8)*Math.min(1,.3+(s.age??1e3)/50));for(let s=0;s<c.length;s+=2){let u=c[s],d=c[s+1],f=Math.max(0,d-l),p=Math.min(n-1,d+4);for(let n=Math.max(0,u-l);n<=Math.min(t-1,u+l);n++){let s=n-u;for(let c=f;c<=p;c++){let u=c*t+n;if(e[u]!==1)continue;let f=Math.max(0,d-c);s*s+f*f>l*l||(e[u]=2,n<r&&(r=n),n>a&&(a=n),c<i&&(i=c),c>o&&(o=c))}}}}if(r>a)return;let s=this.gl;s.bindTexture(s.TEXTURE_2D,this.grassTex),s.pixelStorei(s.UNPACK_ROW_LENGTH,t),s.pixelStorei(s.UNPACK_SKIP_PIXELS,r),s.pixelStorei(s.UNPACK_SKIP_ROWS,i),s.texSubImage2D(s.TEXTURE_2D,0,r,i,a-r+1,o-i+1,s.RED_INTEGER,s.UNSIGNED_BYTE,e),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0);let c=this.dirty,l=c[0]>=c[2];c[0]=Math.max(0,Math.min(l?1/0:c[0],r-1)),c[1]=Math.max(0,Math.min(l?1/0:c[1],i-1)),c[2]=Math.min(t,Math.max(l?-1/0:c[2],a+2)),c[3]=Math.min(n,Math.max(l?-1/0:c[3],o+34))}scour(e,t,n){let r=t>0?e-n:e-2,i=t>0?e+2:e+n,a=Math.max(0,Math.floor(r)),o=Math.min(this.mapWidth,Math.ceil(i)+1);if(a>=o)return;let s=this.mapWidth;for(let e=0;e<this.mapHeight;e++)this.grassMask.fill(0,e*s+a,e*s+o);let c=this.gl;c.bindTexture(c.TEXTURE_2D,this.grassTex),c.pixelStorei(c.UNPACK_ROW_LENGTH,s),c.pixelStorei(c.UNPACK_SKIP_PIXELS,a),c.pixelStorei(c.UNPACK_SKIP_ROWS,0),c.texSubImage2D(c.TEXTURE_2D,0,a,0,o-a,this.mapHeight,c.RED_INTEGER,c.UNSIGNED_BYTE,this.grassMask),c.pixelStorei(c.UNPACK_ROW_LENGTH,0),c.pixelStorei(c.UNPACK_SKIP_PIXELS,0);let l=this.dirty,u=l[0]>=l[2];l[0]=u?a:Math.min(l[0],a),l[1]=0,l[2]=u?o:Math.max(l[2],o),l[3]=this.mapHeight}scorch(e,t,n,r){let i=Math.ceil(n*1.15)+2,a=this.mapWidth,o=Math.max(0,Math.floor(e-i)),s=Math.max(0,Math.floor(t-i)),c=Math.min(a,Math.ceil(e+i)+1),l=Math.min(this.mapHeight,Math.ceil(t+i)+1);if(o>=c||s>=l)return;let u=i*i,d=r+1,f=this.burn;for(let n=s;n<l;n++){let r=n-t;for(let t=o;t<c;t++){let i=t-e;i*i+r*r<=u&&(f[n*a+t]=d)}}this.lastBurn=Math.max(this.lastBurn,r),this.uploadBurn(o,s,c-o,l-s)}uploadBurn(e,t,n,r){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.burnTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,this.mapWidth),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,t),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.texSubImage2D(i.TEXTURE_2D,0,e,t,n,r,i.RED_INTEGER,i.UNSIGNED_INT,this.burn),i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0)}restRow(e,t){let n=this.mapWidth,r=this.terrain;for(let i=Math.max(0,Math.floor(t));i<this.mapHeight;i++){let t=i*n;for(let a=Math.max(0,e-7);a<Math.min(n,e+7);a++)if(r[t+a]!==0)return i}return this.mapHeight+12}stepWrecks(){for(let e of this.entities){if(e.kind!==`tank`)continue;let t=e.player;if(e.alive){this.wreckY[t]=NaN;continue}let n=this.wreckY[t]??NaN;Number.isNaN(n)&&(n=e.y,this.wreckV[t]=0);let r=this.restRow(e.x,n);if(n<r){let e=Math.min((this.wreckV[t]??0)+.2,4);this.wreckV[t]=e,n=Math.min(n+e,r)}else this.wreckV[t]=0;this.wreckY[t]=n}}startWreck(t,n){for(let r of this.entities){if(r.kind!==`tank`||r.player!==t)continue;let i=r.tank&&this.palette.tanks?.[r.tank]||si,a=e(t);this.wrecks[t]=Jr(i,e=>di(e,a,!1),t,r.x,r.y,r.angle,n)}}stepDeaths(){let e=this.fxTick;for(let t of this.entities){if(t.kind!==`tank`||t.alive)continue;let n=this.wrecks[t.player];if(!n)continue;let r=Yr(n,e,t.x,this.tankY(t),(e,t)=>this.probe.solid(e,t),this.particles,this.fx.mult,this.mapHeight);r&&this.fx.cookOff(r.x,r.y,r.radius,r.big,e)}}tankY(e){if(e.alive)return e.y;let t=this.wreckY[e.player];return t===void 0||Number.isNaN(t)?e.y:Math.floor(t)}scanLooks(){let e=this.lookFlags,t=0,n=this.terrain;for(let r=0;r<n.length;r++)t|=e[n[r]];let r=this.coating;for(let n=0;n<r.length;n++)t|=e[r[n]];if(this.anyCycle=!!(t&1),this.anyHot=!!(t&2),this.scanHeat(!!(t&6)),this.flameN=0,!(t&4))return;let i=this.mapWidth;for(let t=i;t<n.length&&this.flameN<ii;t++)e[n[t]]&4&&n[t-i]===0&&(this.flameCells[this.flameN++]=t)}scanHeat(e){if(!e&&!this.heatOn)return;let t=this.mapWidth,n=this.mapHeight;if(this.heatOn=e&&x(this.terrain,this.coating,this.lookFlags,t,n,this.heat),!this.heatTex)return;let r=this.gl;r.bindTexture(r.TEXTURE_2D,this.heatTex),r.texSubImage2D(r.TEXTURE_2D,0,0,0,t,n,r.RED_INTEGER,r.UNSIGNED_BYTE,this.heat)}feedFluid(){let e=this.fluid;if(e.ok)for(let t of this.zones)(t.look===`gas`||t.look===`toxic`)&&e.splat(t.x,t.y,t.radius*.8,this.wind*20,0,0,0,.06);e.step(this.wind)}stepFlames(){let e=this.flameN;if(e===0)return;let t=this.mapWidth,n=this.terrain,r=this.lookFlags,i=an[this.quality].mult,a=Math.min(e,Math.round((4+e/6)*i)),o=Math.imul(this.fxTick+1,2654435761)>>>0,s=t,c=0,l=this.mapHeight,u=0,d=!1,f=.4+(Math.imul((this.fxTick>>5)+1,1597334677)>>>0)/4294967296*1.2,p=this.wind*50*f;for(let i=0;i<a;i++){o=Math.imul(o^o>>>15,2246822519)+2654435769>>>0;let i=this.flameCells[o%e];if(!(r[n[i]]&4)||n[i-t]!==0)continue;let a=i%t+.5,m=Math.floor(i/t),h=o>>>8&255,g=i%t,_=this.fxTick+1;for(let e=-1;e<=3;e++){let n=m+e;if(!(n<0||n>=this.mapHeight))for(let e=-1;e<=1;e++){let r=g+e;if(r<0||r>=t)continue;let i=n*t+r;this.burn[i]=_,this.grassMask[i]!==0&&(this.grassMask[i]=0,d=!0)}}g-1<s&&(s=g-1),g+2>c&&(c=g+2),m-1<l&&(l=Math.max(0,m-1)),m+4>u&&(u=m+4),this.particles.add({x:a,y:m-1,vx:((h&15)-7.5)*.02+p,vy:(-.3-(h>>4)*.04)*(.7+f*.4),life:8+(h&7)+(f>1.2?3:0),size:1+(h&1)+(h>>7&1),color:0,kind:I.Flame}),(h&3)==2&&this.fluid.splat(a,m-2,5,0,-.4,.22,.5),(h&3)==1&&(h>>2)%3<(f>1?2:1)&&this.particles.add({x:a+(h>>2&3)-1.5,y:m-3,vx:p*.6+(h>>4&3)*.1-.15,vy:-.5-(h>>6&3)*.2,life:30+(h&31),size:1,color:h&8?16740400:16765024,kind:I.Ember}),h&7||this.particles.add({x:a,y:m-2,vx:((h&15)-7.5)*.04,vy:-.9-(h>>5)*.05,life:18,size:1,color:16760896,kind:I.Spark}),h&15||this.particles.add({x:a,y:m-6,vx:this.wind*.08,vy:-.35,life:70,size:3+(h&3),color:2761768,kind:I.Smoke})}if(c>s){let e=Math.max(0,s),n=Math.min(t,c),r=Math.min(this.mapHeight,u);if(this.lastBurn=Math.max(this.lastBurn,this.fxTick),this.uploadBurn(e,l,n-e,r-l),d){let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.grassTex),i.pixelStorei(i.UNPACK_ROW_LENGTH,t),i.pixelStorei(i.UNPACK_SKIP_PIXELS,e),i.pixelStorei(i.UNPACK_SKIP_ROWS,l);let a=n-e,o=r-l;i.texSubImage2D(i.TEXTURE_2D,0,e,l,a,o,i.RED_INTEGER,i.UNSIGNED_BYTE,this.grassMask),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0);let s=this.dirty,c=s[0]>=s[2];s[0]=Math.max(0,Math.min(c?1/0:s[0],e-16)),s[1]=Math.max(0,Math.min(c?1/0:s[1],l-1)),s[2]=Math.min(t,Math.max(c?-1/0:s[2],n+16)),s[3]=Math.min(this.mapHeight,Math.max(c?-1/0:s[3],r+32))}}}stepMeteors(e){let t=this.meteorLive;t.clear();for(let n of this.entities){if(n.kind!==`projectile`)continue;let r=e[n.weapon];if(r?.shell!==`meteor`)continue;t.add(n.id);let i=this.meteors.get(n.id);if(!i){this.meteors.set(n.id,{x:n.x,y:n.y,dx:0,dy:0});continue}let a=n.x-i.x,o=n.y-i.y,s=i.x,c=i.y;if(i.x=n.x,i.y=n.y,o<=0||o>24||Math.abs(a)>24){i.dx=0,i.dy=0;continue}if(i.dx=a,i.dy=o,n.y<-8)continue;let l=r.size??1,u=Math.max(1,Math.ceil(Math.max(Math.abs(a),o)/1.5)),d=an[this.quality].mult,f=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n.id+1,40503))>>>0;for(let e=0;e<u;e++){f=Math.imul(f^f>>>15,2246822519)+2654435769>>>0;let t=e/u;this.particles.add({x:s+a*t+((f&3)-1.5)*.6*l,y:c+o*t+((f>>>2&3)-1.5)*.6*l,vx:-a*.03,vy:-o*.03-.15,life:(12+(f>>>4&15))*(.7+l*.3),size:Math.round((2+(f>>>8&1))*l),color:0,kind:I.Flame}),!(f>>>9&3)&&d>.4&&this.particles.add({x:s+a*t,y:c+o*t,vx:-a*.12+((f>>>12&15)-7.5)*.06,vy:-o*.12-.2,life:14+(f>>>16&15),size:1,color:f>>>20&1?16769136:16747040,kind:I.Spark})}(!(f>>>24&1)||l>1)&&this.particles.add({x:s-a*.5,y:c-o*.5,vx:this.wind*.06,vy:-.05,life:110+(f>>>25&63),size:Math.round((3+(f>>>26&3))*l),color:f>>>28&1?2761768:4866116,kind:I.Smoke})}for(let e of[...this.meteors.keys()])t.has(e)||this.meteors.delete(e)}meteorLive=new Set;starColor=new Map;applyTheme(){let e=Math.round(Math.max(0,this.stormK)*8)/8;this.themeStep=e*(this.stormKind===`sand`?1:-1),this.theme=i(r(this.baseTheme,this.weather),this.stormKind===`sand`?e:0,this.stormKind===`snow`?e:0),this.dirty=[0,0,this.mapWidth,this.mapHeight]}stepStorm(){let e=sr(this.temperature),t=Math.max(0,this.stormK);e.kind!==this.stormKind&&t>0?this.stormK=Math.max(0,t-.01):(this.stormKind=e.kind,this.stormK=t<e.k?Math.min(e.k,t+.008):Math.max(e.k,t-.008),Math.round(this.stormK*8)/8*(this.stormKind===`sand`?1:-1)!==this.themeStep&&this.applyTheme())}stepFx(){this.stepStorm(),this.particles.step(ai,this.wind),this.stepWrecks(),this.stepDeaths(),this.cloudX+=.012+this.wind*.004,fn(this.particles,this.theme,this.fxTick,this.wind,this.probe,this.fx.mult),this.fx.wind=this.wind,this.fx.tick(this.fxTick),this.water.tick(this.entities,this.fxTick),this.liquid.tick(this.fxTick,this.wind,this.particles),this.stepFlames(),this.feedFluid();let e=this.palette.shells;if(e){this.stepMeteors(e);for(let t of this.entities){if(t.kind!==`projectile`)continue;let n=e[t.weapon]?.shell,r=Math.imul(this.fxTick+1,2654435761)^Math.imul(t.id+1,40503);if(n===`mud`)(r>>>20)%3==0&&this.particles.add({x:t.x+(r>>>4&1)-.5,y:t.y+1.5,vx:0,vy:.1,life:14+(r>>>12&7),size:1,color:r>>>8&1?5917748:8022600,kind:I.Chunk});else if(n===`firework`)this.particles.add({x:t.x+(r>>>4&1)-.5,y:t.y+1.5,vx:((r>>>8&7)-3.5)*.06,vy:.25+(r>>>12&3)*.08,life:8+(r>>>16&7),size:1,color:r>>>20&1?16765024:16774864,kind:I.Spark}),(r>>>24)%5==0&&this.particles.add({x:t.x,y:t.y+2,vx:0,vy:0,life:30,size:2,color:9077904,kind:I.Smoke});else if(n===`star`){if(r>>>20&1){let e=this.starColor.get(t.id)??16764992;this.particles.add({x:t.x,y:t.y,vx:0,vy:.02,life:14+(r>>>12&7),size:1,color:(r>>>8)%3==0?16777215:e,kind:I.Glitter})}}else if(n===void 0||n===`spark`){let n=this.trails.find(e=>e.id===t.id),i=n&&!Number.isNaN(n.lx)?t.x-n.lx:0,a=n&&!Number.isNaN(n.ly)?t.y-n.ly:0,o=Math.hypot(i,a)>2?2:1;for(let n=0;n<o;n++){let o=Math.imul(r+n*97,2246822519)>>>0||1;this.particles.add({x:t.x+((o>>>4&3)-1.5)*.5,y:t.y+((o>>>8&3)-1.5)*.5,vx:-i*.12+((o>>>12&7)-3.5)*.05,vy:-a*.12+((o>>>16&7)-3.5)*.05,life:6+(o>>>20&7),size:1,color:(o>>>24)%3==0?16777215:e[t.weapon]?.trailColor??16756816,kind:I.Spark})}}else n===`fire`&&this.particles.add({x:t.x+(r>>>4&3)-1.5,y:t.y+(r>>>8&3)-1.5,vx:0,vy:-.2,life:10+(r>>>12&7),size:2+(r>>>16&1),color:0,kind:I.Flame})}}if(e){let t=Math.min(this.fx.heatAt(this.fxTick),B.length-1);for(let n of this.entities){if(n.kind!==`projectile`||e[n.weapon]?.shell!==`ricochet`)continue;let r=(Math.imul(this.fxTick+7,2654435761)^Math.imul(n.id+3,40503))>>>0,i=1+(t>>1);for(let e=0;e<i;e++)r=Math.imul(r^r>>>15,2246822519)+2654435769>>>0,this.particles.add({x:n.x+(r>>>4&3)-1.5,y:n.y+(r>>>8&3)-1.5,vx:((r>>>12&15)-7.5)*.04,vy:((r>>>16&15)-7.5)*.04,life:8+(r>>>20&7)+t*2,size:1,color:r&3?B[t]:16777215,kind:I.Spark})}}if(this.fxTick%9==0)for(let e of this.entities){if(e.kind!==`tank`||e.alive)continue;let t=(this.fxTick*31+e.player*17)%13;this.particles.add({x:e.x-3+t%6,y:this.tankY(e)-5,vx:0,vy:-.2,life:70,size:3+t%3,color:3814456,kind:I.Smoke})}this.fxTick++}updateTrails(e){for(let e of this.trails)e.live=!1;let t=this.palette.shells;for(let n of e.entities){if(n.kind!==`projectile`||this.fx.lances.owns(n.x,n.y))continue;let r=t?.[n.weapon];if(r?.trail===!1)continue;let i=this.trails.find(e=>e.id===n.id);if(!i){this.trails=this.trails.filter(t=>t.turn===e.turn);let t=r?.trailColor??-1;i={id:n.id,turn:e.turn,lx:NaN,ly:NaN,cells:[],color:t,live:!0},this.trails.push(i)}i.live=!0,!Number.isNaN(i.lx)&&Math.abs(i.lx-n.x)<=e.width/2?(this.graze(i,n.id,n.x,n.y,e.tick),xi(i.cells,i.lx,i.ly,n.x,n.y)):xi(i.cells,n.x,n.y,n.x,n.y),i.lx=n.x,i.ly=n.y}}graze(e,n,r,i,a){let o=r-e.lx,s=i-e.ly,c=Math.hypot(o,s);if(c<.5)return;let l=Math.floor(r),u=Math.floor(i),d=this.probe;if(d.solid(l,u))return;let f=0,p=0,m=0;for(let e=-2;e<=2;e++)for(let t=-2;t<=2;t++)t===0&&e===0||!d.solid(l+t,u+e)||(f-=t,p-=e,m++);if(m===0)return;let h=Math.hypot(f,p);if(h<1e-6||(f/=h,p/=h,-(o*f+s*p)/c>.75))return;let g=e.color<0?this.theme.trail:e.color,_=this.palette.materials[this.groundCellNear(l,u)]??8018490,v=(Math.imul(a+13,2654435761)^Math.imul(n+5,40503))>>>0,y=Math.min(6,2+m/4)*this.fx.mult;for(let e=0;e<y;e++){v=Math.imul(v^v>>>15,2246822519)+2654435769>>>0;let e=.5+(v>>>4&15)*.06,t=.15+(v>>>8&15)*.03,n=((v>>>12&15)-7.5)*.05,a=v>>>16&7;this.particles.add({x:r-f*.5,y:i-p*.5,vx:f*e+o/c*t*c-p*n,vy:p*e+s/c*t*c+f*n,life:6+(v>>>20&7),size:1,color:a<2?16777215:a<5?16767072:g,kind:I.Spark})}v>>>24&1&&this.particles.add({x:r-f,y:i-p,vx:f*.6+o/c*.3,vy:p*.6-.4,life:14+(v>>>26&7),size:1,color:t(_,.8+(v>>>28&3)*.1),kind:I.Chunk})}groundCellNear(e,t){let n=this.mapWidth;for(let r=1;r<=2;r++)for(let i=-r;i<=r;i++)for(let a=-r;a<=r;a++){let r=e+a,o=t+i;if(r<0||o<0||r>=n||o>=this.mapHeight)continue;let s=this.terrain[o*n+r];if(s!==0)return s}return 0}shownZone(e){let t=Math.min(1,Math.max(0,(e-this.zoneGrewAt)/gi)),n=t*t*(3-2*t);return this.zoneFrom+(this.deathZone-this.zoneFrom)*n}render(e,t=0){let n=this.gl;this.fx.held=t;let r=this.camera,i=r.vw,a=r.vh,o=r.scale,s=r.ox,c=r.oy,l=[i,a],u=[s,c],d=this.theme,f=Math.max(e,this.lastTick),p=this.quality!==`low`,m=0;if(p)for(let e of this.fx.ripples){if(m>=8)break;let t=(f-e.start)/e.dur;t<0||t>1||(this.rippleBuf[m*4]=s+e.x*o,this.rippleBuf[m*4+1]=c+e.y*o,this.rippleBuf[m*4+2]=e.maxR*Math.sqrt(t)*o,this.rippleBuf[m*4+3]=e.strength*(1-t),this.rippleW[m]=e.column?-e.width*o:e.width*o*(.7+.6*t),m++)}let[h,g]=this.shakeOn?this.fx.shake(f):[0,0],_=Math.round(h)*o,v=Math.round(g)*o,y=this.fx,b=jn(f,d.flicker),x=y.sky,S=Math.max(y.skyFlash,b),C=p?Math.round(y.split)*o:0,w=d.scanlines,T=m>0||_!==0||v!==0||S>0||C>0||w>0;this.shadeTerrain(),this.paintScenery((i/2-s)/o,(a/2-c)/o),this.fluid.update(this.terrainTex),n.bindFramebuffer(n.FRAMEBUFFER,T?this.sceneFbo:null),n.viewport(0,0,i,a),n.disable(n.BLEND),n.bindVertexArray(this.emptyVao),n.useProgram(this.bgProg),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,this.colorTex),n.uniform1i(this.uBg.u_color,0),n.uniform2f(this.uBg.u_view,i,a),n.uniform2f(this.uBg.u_origin,s,c),n.uniform1f(this.uBg.u_scale,o),n.uniform2f(this.uBg.u_map,this.mapWidth,this.mapHeight),n.uniform3fv(this.uBg.u_top,N(d.skyTop)),n.uniform3fv(this.uBg.u_bottom,N(d.skyBottom)),n.uniform3fv(this.uBg.u_letterbox,N(d.letterbox)),n.uniform3f(this.uBg.u_flash,x[0]+b*.55,x[1]+b*.6,x[2]+b*.75),n.uniform1f(this.uBg.u_white,y.whiteout(f)*(this.shakeOn?1:.4)),n.uniform1f(this.uBg.u_vignette,this.quality===`low`?0:d.vignette),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,this.terrainTex),n.activeTexture(n.TEXTURE2),n.bindTexture(n.TEXTURE_2D,this.coatTex),n.activeTexture(n.TEXTURE3),n.bindTexture(n.TEXTURE_2D,this.lookTex),n.activeTexture(n.TEXTURE4),n.bindTexture(n.TEXTURE_2D,this.paletteTex),n.activeTexture(n.TEXTURE5),n.bindTexture(n.TEXTURE_2D,this.sceneryTex),n.activeTexture(n.TEXTURE6),n.bindTexture(n.TEXTURE_2D,this.grassTex),n.activeTexture(n.TEXTURE7),n.bindTexture(n.TEXTURE_2D,this.burnTex),n.activeTexture(n.TEXTURE8),n.bindTexture(n.TEXTURE_2D,this.heatTex),n.activeTexture(n.TEXTURE0),n.uniform1i(this.uBg.u_heat,8),n.uniform1f(this.uBg.u_heatOn,+!!this.heatOn),this.lights.clear(),this.fx.collectLights(this.lights,f),n.uniform1i(this.uBg.u_lightCount,this.lights.count),n.uniform4fv(this.uBg.u_lights,this.lights.pos),n.uniform3fv(this.uBg.u_lightCol,this.lights.col),n.uniform1i(this.uBg.u_grassMask,6),n.uniform1i(this.uBg.u_burn,7),n.uniform1f(this.uBg.u_burnOn,+(this.lastBurn>=0&&f-this.lastBurn<ri)),n.uniform1i(this.uBg.u_terrain,1),n.uniform1i(this.uBg.u_coat,2),n.uniform1i(this.uBg.u_look,3),n.uniform1i(this.uBg.u_palette,4),n.uniform1f(this.uBg.u_time,f);let E=this.lastBurn>=0&&f-this.lastBurn<420;n.uniform1f(this.uBg.u_haze,p&&(this.anyHot||E)?1:0),n.uniform1f(this.uBg.u_anim,+!!this.anyCycle),n.uniform1f(this.uBg.u_stars,d.ambient.kind===`stars`?Math.min(.05,d.ambient.density/6e3):0),n.uniform3fv(this.uBg.u_starColor,N(d.ambient.color)),n.uniform1i(this.uBg.u_scenery,5),n.uniform4f(this.uBg.u_grass,...N(d.grass<0?0:d.grass),d.grass<0?0:1),n.drawArrays(n.TRIANGLES,0,3);let D=this.fx.mult;pn(this.normal,this.additive,this.zones,f,this.probe,D),this.drawTrails(),this.fx.drawFunnels(this.normal,this.additive,f),this.fx.drawPosts(this.normal,f),this.fx.drawKaijus(this.normal,this.additive,f),this.drawDebris(),this.fx.drawChunks(this.normal),this.drawMines(f),this.drawTanks(f),this.fx.drawGoo(this.normal,f),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),this.normal.flush(l,u,o),n.blendFunc(n.ONE,n.ONE),this.additive.flush(l,u,o),n.disable(n.BLEND),this.fluid.draw(this.terrainTex,l,u,o),this.particles.draw(this.terrainTex,this.mapWidth,this.mapHeight,l,u,o),this.liquid.draw(this.normal,this.additive,f),this.water.draw(this.normal,f),this.fx.drawMushrooms(this.normal,this.additive,f),this.fx.drawVortices(this.normal,this.additive,f),this.fx.drawMagnets(this.normal,this.additive,f),this.drawProjectiles(),this.fx.drawGlows(this.additive,f),this.fx.drawBolts(this.additive,f),this.fx.lances.draw(this.additive,f),this.fx.ions.draw(this.additive,f),this.fx.drawCrystals(this.additive,f),dn(this.normal,this.additive,d,f,this.wind,this.probe,D),ur(this.normal,this.stormKind,this.stormK,f,this.wind,this.probe,D),Gn(this.normal,this.shownZone(f),f,{width:this.mapWidth,height:this.mapHeight,x0:-s/o,x1:(i-s)/o,y0:-c/o,y1:(a-c)/o},Math.max(0,1-(f-this.zoneGrewAt)/gi)),p||this.fx.drawRippleRings(this.additive,f),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),this.normal.flush(l,u,o),n.blendFunc(n.ONE,n.ONE),this.additive.flush(l,u,o),n.disable(n.BLEND),T&&(n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,i,a),n.bindVertexArray(this.emptyVao),n.useProgram(this.postProg),n.bindTexture(n.TEXTURE_2D,this.sceneTex),n.uniform1i(this.uPost.u_scene,0),n.uniform2f(this.uPost.u_view,i,a),n.uniform2f(this.uPost.u_shake,_,v),n.uniform2f(this.uPost.u_origin,s,c),n.uniform1f(this.uPost.u_scale,o),n.uniform1i(this.uPost.u_rippleCount,m),n.uniform4fv(this.uPost.u_ripple,this.rippleBuf),n.uniform1fv(this.uPost.u_rippleW,this.rippleW),n.uniform3f(this.uPost.u_tint,x[0]*.36,x[1]*.36,x[2]*.36),n.uniform1f(this.uPost.u_split,C),n.uniform1f(this.uPost.u_scan,w),n.uniform1f(this.uPost.u_wob,f*.35),n.drawArrays(n.TRIANGLES,0,3)),n.bindVertexArray(null)}paintScenery(e,t){let n=this.theme,r=this.mapWidth,i=this.mapHeight,a=e-r/2,o=t-i/2,s=`${n.skyTop},${n.skyBottom},${n.clouds.cover},${n.clouds.light},${n.clouds.shadow},${n.ranges.join(`/`)},${this.horizon},${Math.floor(this.cloudX/2)},${Math.floor(this.fxTick/10)}`;for(let e of[.9,.85,.75,.55,.35])s+=`,${Math.floor(a*e/2)},${Math.floor(o*e/2)}`;if(s===this.sceneryKey)return;this.sceneryKey=s;let c=this.gl;c.bindFramebuffer(c.FRAMEBUFFER,this.sceneryFbo),c.viewport(0,0,this.sceneryW,this.sceneryH),c.disable(c.BLEND),c.bindVertexArray(this.emptyVao),c.useProgram(this.sceneryProg);let l=this.uScn;c.uniform2f(l.u_size,this.sceneryW,this.sceneryH),c.uniform2f(l.u_map,r,i),c.uniform3fv(l.u_top,N(n.skyTop)),c.uniform3fv(l.u_bottom,N(n.skyBottom)),c.uniform2f(l.u_cloud,n.clouds.cover,this.cloudX),c.uniform1f(l.u_boil,Math.floor(this.fxTick/10)),c.uniform3fv(l.u_cloudLight,N(n.clouds.light)),c.uniform3fv(l.u_cloudShadow,N(n.clouds.shadow));let u=n.ranges.length;for(let e=0;e<u;e++)this.rangeBuf.set(N(n.ranges[e]),e*3);c.uniform3fv(l.u_ranges,this.rangeBuf),c.uniform1i(l.u_rangeCount,u),c.uniform1f(l.u_horizon,this.horizon<0?i*.6:this.horizon),c.uniform2f(l.u_cam,e,t),c.drawArrays(c.TRIANGLES,0,3)}shadeTerrain(){let e=this.dirty;if(e[0]>=e[2]||e[1]>=e[3])return;let t=this.gl,n=this.mapWidth,r=this.mapHeight;t.bindFramebuffer(t.FRAMEBUFFER,this.colorFbo),t.viewport(0,0,n,r),t.enable(t.SCISSOR_TEST),t.scissor(e[0],r-e[3],e[2]-e[0],e[3]-e[1]),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),t.bindVertexArray(this.emptyVao),t.useProgram(this.terrainProg),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.terrainTex),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.paletteTex),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,this.coatTex),t.uniform1i(this.uTer.u_terrain,0),t.uniform1i(this.uTer.u_palette,1),t.uniform1i(this.uTer.u_coat,2),t.uniform2f(this.uTer.u_view,n,r),t.uniform2f(this.uTer.u_origin,0,0),t.uniform1f(this.uTer.u_scale,1),t.uniform2f(this.uTer.u_map,n,r),t.uniform1f(this.uTer.u_grain,this.theme.grain),t.uniform3fv(this.uTer.u_light,N(this.theme.light)),t.uniform1f(this.uTer.u_wet,this.theme.wet),t.uniform1f(this.uTer.u_snow,this.theme.snow);let i=this.theme.grass;t.uniform4f(this.uTer.u_grass,...N(i<0?0:i),i<0?0:1),t.uniform3fv(this.uTer.u_ground,N(this.theme.ground)),t.uniform1f(this.uTer.u_flowers,this.theme.flowers),t.activeTexture(t.TEXTURE3),t.bindTexture(t.TEXTURE_2D,this.lookTex),t.uniform1i(this.uTer.u_look,3),t.activeTexture(t.TEXTURE4),t.bindTexture(t.TEXTURE_2D,this.grassTex),t.uniform1i(this.uTer.u_grassMask,4),t.drawArrays(t.TRIANGLES,0,3),t.disable(t.SCISSOR_TEST),t.activeTexture(t.TEXTURE0),e[0]=1,e[2]=0}drawTrails(){let e=this.normal;for(let r of this.trails){let i=r.color<0?this.theme.trail:r.color,a=n(i,16777215,.6),o=t(i,.7),s=r.cells,c=s.length>>1;for(let t=0;t<c;t++){let n=s[t*2],l=s[t*2+1],u=c-1-t;r.live?u<fi?e.push(n+.5,l+.5,1,1,a,.95):u<pi?e.push(n+.5,l+.5,1,1,i,.8):u<mi?e.push(n+.5,l+.5,1,1,o,.6):n+l&1||e.push(n+.5,l+.5,1,1,o,.5):n+l&1||e.push(n+.5,l+.5,1,1,o,.45)}}}drawDebris(){let e=this.debris,n=this.palette.materials;for(let r=0;r<e.count;r++){let i=Math.floor(e.x[r]/ti),a=Math.floor(e.y[r]/ti),o=Math.imul(e.vx[r]^e.material[r]<<20,2654435761)>>>27,s=t(n[e.material[r]]??8018490,hi[o&3]);o>=30?this.normal.push(i+1,a+1,2,2,s,1):this.normal.push(i+.5,a+.5,1,1,s,1)}}drawMines(e){let t=this.normal,n=this.additive;for(let r of this.entities){if(r.kind!==`mine`)continue;let i=r.x+.5,a=r.y+.5;t.push(i,a,7,1,1708582,1),t.push(i,a-1,5,1,276e4,1),t.push(i,a-2,3,1,3811928,1),t.push(i-2,a-1,1,1,6968480,1),t.push(i-1,a-2,1,1,9073864,1);let o=Math.floor(e/12+r.id)%4==0?1:.6;n.push(i,a-1,3,1,8405247,.5*o),t.push(i,a-1,1,1,0,1);for(let t=0;t<2;t++){let o=e*.12+r.id*1.7+t*Math.PI,s=Math.round(Math.cos(o)*5),c=Math.round(Math.sin(o)*2)-2;this.probe.solid(r.x+s,r.y+c)||n.push(i+s,a+c,1,1,t===0?13676799:8014079,.9)}if(!r.armed)continue;(e+r.id*7)%40<5&&(n.push(i,a-3,1,1,16736464,1),n.push(i,a-3,3,3,16728256,.35,F.Pixel));let s=r.radius,c=Math.max(16,Math.round(s*1.6)),l=Math.floor(e/6)%2;for(let e=l;e<c;e+=2){let t=e/c*Math.PI*2,i=Math.round(r.x+Math.cos(t)*s),a=Math.round(r.y-2+Math.sin(t)*s);this.probe.solid(i,a)||n.push(i+.5,a+.5,1,1,9459967,.45)}}}tankLight(e,t){let n=Math.floor(e),r=Math.floor(t),i=_(this.lights,n,r,this.lightTmp);if(this.heatOn&&n>=0&&r>=0&&n<this.mapWidth&&r<this.mapHeight){let e=g(v(this.heat[r*this.mapWidth+n])*f,n,r);i[0]+=d[0]*e,i[1]+=d[1]*e,i[2]+=d[2]*e}return i}drawTanks(t){let n=this.normal,r=this.palette.tanks;for(let e of this.wrecks)e&&$r(n,e,t);for(let i of this.entities){if(i.kind!==`tank`)continue;let a=i.x,o=this.tankY(i),s=e(i.player),c=i.tank&&r?.[i.tank]||si,l=c.sprite,u=l[0]?.length??0,d=l.length,f=a-(u>>1),p=o-d,m=this.tankLight(a,o-(d>>1));if(!i.alive){let e=this.wrecks[i.player];e?Qr(n,e,a,o,t):(n.rect(f+1,o-3,u-2,3,b(2761766,m)),n.rect(a-4,o-5,7,2,b(1906971,m)));continue}let h=i.alive?this.tumbleAngle(i.player,t):0;if(h!==0){this.drawTumbling(i,c,a,o,h,m,s,t);continue}let g=this.tankTilt(f,o,u),_=e=>Math.round(g.slope*(e-g.pivot)),v=c.barrel,y=i.angle*Math.PI/180,x=Math.cos(y),S=Math.sin(y),C=a+v.x,w=o-v.y+_(v.x+(u>>1)),T=v.width>>1;for(let e=1;e<=v.length;e++){let t=Math.round(C+x*e),r=Math.round(w-S*e);n.rect(t-T,r-T,v.width,v.width,b(e===v.length?11051672:14209736,m))}let E=i.shield>0;for(let e=0;e<d;e++){let t=l[e];for(let r=0;r<u;r++){let i=t.charCodeAt(r);i!==46&&n.rect(f+r,p+e+_(r),1,1,b(di(i,s,E),m))}}E&&this.drawShield(i,a,o,u,d,t),this.coverTank(a,o,u,d),i.chute&&this.drawChute(i.player,a,p,t);let D=t-(this.batteryAt[i.player]??-1e9);D<ui&&this.drawCharge(a,p,D),i.chill>0&&this.frostTank(a,o,t),i.glue>0&&this.glueTank(a,o,u,p,t,i.chill>0),(i.rust??0)>0&&this.rustTank(a,o,u,d,p,_,t,+(i.chill>0)+ +(i.glue>0));let O=p;this.drawDigit(a-13,O-7,i.player+1);let k=Math.max(0,Math.min(1,i.health/Math.max(1,i.maxHealth)));if(n.rect(a-8,O-5,16,1.6,0,.55),n.rect(a-8,O-5,16*k,1.6,k>.5?5952346:k>.25?15777856:14696512),i.maxShield>0){let e=Math.max(0,Math.min(1,i.shield/i.maxShield));n.rect(a-8,O-7,16,1,0,.55),e>0&&n.rect(a-8,O-7,Math.max(1,Math.round(16*e)),1,oi)}if(i.active){let e=Math.sin(t*.12)*1.2;n.push(a+.5,O-10+e,3.2,3.2,s,1,F.Rect,Math.PI/4),n.push(a+.5,O-10+e,1.4,1.4,16777215,.9,F.Rect,Math.PI/4)}}}tumbleAngle(e,t){let n=this.tumble[e];if(!n)return 0;if(t<=n.fly+1)return n.rate*(t-n.at);if(n.land<0){n.land=t;let e=n.rate*(n.fly+1-n.at),r=Math.PI*2;n.rest=e-Math.round(e/r)*r}let r=(t-n.land)/8;return r>=1?(this.tumble[e]=null,0):n.rest*(1-Math.floor(r*4)/4)}drawTumbling(e,t,n,r,i,a,o,s){let c=this.normal,l=t.sprite,u=l[0]?.length??0,d=l.length,f=n,p=r-d/2,m=Math.cos(i),h=Math.sin(i),g=t.barrel,_=g.x,v=-g.y+d/2,y=f+_*m-v*h,x=p+_*h+v*m,S=e.angle*Math.PI/180,C=Math.cos(S),w=-Math.sin(S),T=C*m-w*h,E=C*h+w*m,D=g.width>>1;for(let e=1;e<=g.length;e++)c.rect(Math.round(y+T*e)-D,Math.round(x+E*e)-D,g.width,g.width,b(e===g.length?11051672:14209736,a));let O=e.shield>0,k=Math.ceil(Math.hypot(u,d)/2)+1,ee=Math.floor(f),A=Math.floor(p);for(let e=A-k;e<=A+k;e++)for(let t=ee-k;t<=ee+k;t++){let n=t+.5-f,r=e+.5-p,i=Math.floor(n*m+r*h+u/2),s=Math.floor(-n*h+r*m+d/2);if(i<0||s<0||i>=u||s>=d)continue;let g=l[s].charCodeAt(i);g!==46&&c.rect(t,e,1,1,b(di(g,o,O),a))}O&&this.drawShield(e,n,r,u,d,s);let j=r-d;this.drawDigit(n-13,j-7,e.player+1);let M=Math.max(0,Math.min(1,e.health/Math.max(1,e.maxHealth)));c.rect(n-8,j-5,16,1.6,0,.55),c.rect(n-8,j-5,16*M,1.6,M>.5?5952346:M>.25?15777856:14696512)}drawShield(e,t,n,r,i,a){let o=this.normal,s=(r>>1)+2,c=i+2,l=Math.max(this.shieldHitAt[e.player]??-1e9,this.shieldUpAt[e.player]??-1e9),u=a-l<18?1-(a-l)/18:0,d=a-(this.shieldUpAt[e.player]??-1e9);if(d>=0&&d<24){let e=n-Math.floor((i+4)*d/24),a=(r>>1)+2;for(let n=t-a;n<=t+a;n++)o.rect(n,e,1,1,n&1?oi:15268863,.9)}let f=e.shield/Math.max(1,e.maxShield),p=Math.min(1,.3+.4*f+.6*u),m=Math.floor(a/8);for(let e=n-c-1;e<n;e++){let r=(e+.5-n)/c;for(let n=t-s-1;n<=t+s;n++){let i=(n+.5-t)/s,a=i*i+r*r;a<.78||a>1.06||n+e+m&1&&u===0||o.rect(n,e,1,1,u>0?15268863:oi,p)}}}drawChute(t,n,r,i){let a=this.normal,o=e(t),s=Math.round(Math.sin(i*.08)),c=n+s,l=r-9-ci.length-6;for(let e=0;e<ci.length;e++){let t=ci[e],n=c-(t.length>>1);for(let r=0;r<t.length;r++){let i=t[r];i!==`.`&&a.rect(n+r,l+e,1,1,i===`w`?15921126:i===`d`?0:o,i===`d`?.35:1)}}let u=l+ci.length;for(let[e,t]of li){let n=r-u;for(let r=0;r<=n;r++){let i=Math.round(c+e+(t-e-s)*r/Math.max(1,n));a.rect(i,u+r,1,1,13617336,.85)}}}drawCharge(e,t,n){let r=this.normal,i=1-n/ui;for(let a=0;a<3;a++){let o=n-a*8;if(o<0)continue;let s=e-6+a*6,c=t-2-Math.floor(o/3);r.rect(s,c-1,1,3,8188028,i),r.rect(s-1,c,3,1,8188028,i)}}frostTank(e,t,n){let r=this.normal;r.rect(e-7,t-6,14,3,14085370,.55),r.rect(e-7,t-6,14,1,16777215,.8),r.push(e+.5,t-7,7,5,15136511,.45,F.Disc);for(let n=0;n<vi.length;n+=2)r.rect(e+vi[n],t-3,1,vi[n+1],15136511,.95);let i=Math.floor(n/9),a=e-7+(i*5+e)%14,o=t-6-i*3%3;r.rect(a,o,1,1,16777215);let s=e+10,c=t-16;r.rect(s-1,c-1,7,7,0,.6),r.rect(s+2,c,1,5,12575994),r.rect(s,c+2,5,1,12575994),r.rect(s,c,1,1,12575994),r.rect(s+4,c,1,1,12575994),r.rect(s,c+4,1,1,12575994),r.rect(s+4,c+4,1,1,12575994),r.rect(s+2,c+2,1,1,16777215)}rustTank(e,t,n,r,i,a,o,s){let c=this.normal,l=e-(n>>1);for(let e=0;e<r;e++)for(let t=0;t<n;t++){let n=(t*7+e*13+t*e%5)%9;n>3||c.rect(l+t,i+e+a(t),1,1,V[n&3],n===0?.95:.75)}let u=o%48;if(u<12){let t=(Math.floor(o/48)*5+e)%n;c.rect(l+t,i+r-1+a(t)+(u>>1),1,1,V[1])}let d=e+10+s*8,f=i-7;c.rect(d-1,f-1,7,7,0,.6),c.rect(d,f,5,5,V[1]),c.rect(d,f,5,1,V[3]),c.rect(d+1,f+2,1,1,V[0]),c.rect(d+3,f+1,1,1,V[0]),c.rect(d+2,f+3,2,1,V[0])}glueTank(e,t,n,r,i,a){let o=this.normal,s=n>>1;o.rect(e-s-3,t-1,n+6,1,R[2]);for(let n=-s-2;n<s+3;n+=5)o.rect(e+n,t-1,1,1,R[0]);let c=i>>4&1;for(let r=0;r<n;r++)(r+c)%3!=0&&o.rect(e-s+r,t-2,1,1,R[1]);o.rect(e-3,r+4,2,1,R[1]),o.rect(e+2,r+5,1,1,R[0]),o.rect(e-s-1,t-4,1,3,R[1]),o.rect(e+s,t-4,1,3,R[1]);for(let n=0;n<2;n++){let r=1+((i>>3)+n*2)%3,a=n===0?-s-2:s+1;o.rect(e+a,t-3,1,r,R[2])}let l=e+(a?18:10),u=r-7;o.rect(l-1,u-1,7,8,0,.6),o.rect(l+2,u,1,1,R[1]),o.rect(l+1,u+1,3,2,R[1]),o.rect(l,u+3,5,2,R[2]),o.rect(l+1,u+5,3,1,R[3]),o.rect(l+1,u+3,1,1,R[0])}tankTilt(e,t,n){let r=e=>{let n=Math.max(0,Math.min(this.mapWidth-1,e)),r=Math.min(this.mapHeight,t+12);for(let e=Math.max(0,t-6);e<r;e++)if(this.terrain[e*this.mapWidth+n]!==0)return e;return r},i=r(e),a=r(e+n-1);return i===a||n<2?{slope:0,pivot:0}:{slope:Math.max(-.4,Math.min(.4,(a-i)/(n-1))),pivot:a>i?0:n-1}}drawDigit(e,t,n){let r=ei[n];if(!r)return;let i=this.normal;i.rect(e-1,t-1,5,7,0,.6);for(let n=0;n<5;n++){let a=r[n];for(let r=0;r<3;r++)a&4>>r&&i.rect(e+r,t+n,1,1,16777215)}}coverTank(e,n,r,i){let a=this.normal,o=this.mapWidth,s=e-(r>>1);for(let e=Math.max(0,n-i);e<Math.min(this.mapHeight,n);e++)for(let n=Math.max(0,s);n<Math.min(o,s+r);n++){let r=this.terrain[e*o+n];if(r===0)continue;let i=this.palette.materials[r]??8018490;a.rect(n,e,1,1,n+e&1?t(i,.94):i)}}drawProjectiles(){let e=this.additive,t=this.palette.shells;for(let n of this.entities){if(n.kind!==`projectile`||this.fx.lances.owns(n.x,n.y))continue;let r=t?.[n.weapon];if(r?.shell===`ricochet`){this.drawRicochetBall(n.x,n.y,n.id);continue}if(r?.shell===`meteor`){this.drawMeteor(n.id,n.x,n.y,r.size??1);continue}if(r?.shell===`fire`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5;e.push(t,r,7,7,16738836,.55,F.Pixel),this.normal.push(t,r,3,3,16747040,1),e.push(t,r,1,1,16773280,1);continue}if(r?.shell===`glue`){let e=Math.floor(n.x)+.5,t=Math.floor(n.y)+.5,r=this.fxTick>>2&1;this.normal.push(e,t,4-r,3+r,R[2],1),this.normal.push(e,t+1,2,1,R[3],1),this.normal.push(e-.5,t-1,1,1,R[0],1);continue}if(r?.shell===`firework`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5;e.push(t,r+1,1,2,16752688,1),e.push(t,r,1,1,16777215,1);continue}if(r?.shell===`star`){let t=Math.floor(n.x)+.5,r=Math.floor(n.y)+.5,i=this.starColor.get(n.id)??16764992;this.fxTick+n.id&3||(e.push(t,r,3,1,i,.8),e.push(t,r,1,3,i,.8)),e.push(t,r,1,1,this.fxTick+n.id&7?i:16777215,1);continue}if(t?.[n.weapon]?.shell===`mud`){let e=Math.floor(n.x)+.5,t=Math.floor(n.y)+.5;this.normal.push(e,t,3,3,5917748,1),this.normal.push(e,t+1,1,1,3813408,1),this.normal.push(e-.5,t-1,1,1,12365446,1);continue}let i=Math.floor(n.x)+.5,a=Math.floor(n.y)+.5,o=this.fxTick+n.id&3,s=o===0?1:o===2?-1:0,c=o===1?1:o===3?-1:0;e.push(n.x,n.y,6,6,r?.trailColor??16751168,.6,F.Pixel),this.normal.push(i,a,2,2,r?.trailColor??16751168,1),e.push(i+s,a+c,1,1,16769184,.9),e.push(i,a,1,1,16777215,1)}}drawRicochetBall(e,t,n){let r=this.additive,i=Math.min(this.fx.heatAt(this.fxTick),B.length-1),a=B[i],o=B[Math.min(i+2,B.length-1)],s=Math.floor(e)+.5,c=Math.floor(t)+.5,l=this.fxTick>>1&1,u=4+i;r.push(s,c,u*2+6+l*2,u*2+6+l*2,a,.3,F.Pixel),r.push(s,c,u+2,u+2,a,.8,F.Pixel),r.push(s,c,u,u,o,1,F.Pixel),r.push(s,c,Math.max(1,u-2),Math.max(1,u-2),16777215,1,F.Pixel);let d=(Math.imul(this.fxTick+1,2654435761)^Math.imul(n+1,40503))>>>0,f=2+i,p=(u>>1)+2+(i>>1);for(let e=0;e<f;e++){d=Math.imul(d^d>>>15,2246822519)+2654435769>>>0;let e=(d>>>4)%(2*p+1)-p,t=(d>>>12)%(2*p+1)-p;r.push(s+e,c+t,1,1,d&1?a:16777215,.9)}}drawMeteor(e,t,n,r){let i=this.meteors.get(e);if(!i||i.dy<=0)return;let a=this.additive,o=Math.hypot(i.dx,i.dy)||1,s=i.dx/o,c=i.dy/o,l=Math.round(14*r),u=[16774864,16765024,16747040,14699024,10496016];for(let e=l;e>=1;e--){let i=e/l,o=Math.floor(t-s*e*1.4)+.5,d=Math.floor(n-c*e*1.4)+.5,f=Math.max(1,Math.round(3*r*(1-i*.75)));a.push(o,d,f,f,u[Math.min(4,Math.floor(i*5))],1-i*.55,F.Pixel)}let d=Math.floor(t)+.5,f=Math.floor(n)+.5,p=Math.round(4+3*r);a.push(d,f,p*2,p*2,16738836,.35,F.Pixel),a.push(d,f,p,p,16751152,.7,F.Pixel),this.normal.push(d,f,Math.round(2+2*r),Math.round(2+2*r),16767120,1),a.push(d,f,Math.round(1+r),Math.round(1+r),16777215,1)}unmount(){this.unsubscribe?.(),this.unsubscribe=void 0;let e=this.gl;this.normal.dispose(),this.additive.dispose(),e.deleteTexture(this.terrainTex),e.deleteTexture(this.coatTex),e.deleteTexture(this.heatTex),e.deleteTexture(this.paletteTex),e.deleteTexture(this.lookTex),e.deleteTexture(this.sceneTex),e.deleteTexture(this.colorTex),e.deleteFramebuffer(this.colorFbo),e.deleteProgram(this.bgProg),e.deleteFramebuffer(this.sceneFbo),e.deleteProgram(this.terrainProg),e.deleteProgram(this.postProg),e.deleteVertexArray(this.emptyVao),this.particles.dispose(),this.fluid.dispose(),this.fx.clear(),this.water.clear(),this.liquid.clear()}},vi=[-6,2,-3,1,0,3,3,1,5,2];function yi(e,t,n){let r=0;for(let i=0;i<t;i++){let a=0;for(;a<n&&e[a*t+i]===0;)a++;r+=a}return t>0?r/t:n}function bi(e,t,n,r){r.fill(0);for(let i=0;i<n;i++){let a=i*t;for(let o=0;o<t;o++)e[a+o]===0||i>0&&e[a-t+o]!==0||(r[a+o]=1,i>0&&(r[a-t+o]=1),i+1<n&&(r[a+t+o]=1))}}function xi(e,t,n,r,i){let a=Math.max(1,Math.ceil(Math.max(Math.abs(r-t),Math.abs(i-n))));for(let o=0;o<=a;o++){let s=o/a,c=Math.floor(t+(r-t)*s),l=Math.floor(n+(i-n)*s),u=e.length;u>=2&&e[u-2]===c&&e[u-1]===l||e.push(c,l)}}export{_i as PixelRenderer};
//# sourceMappingURL=pixel-Ci-sE4r-.js.map