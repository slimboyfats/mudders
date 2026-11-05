import type { EntityView, RenderSnapshot, ZoneView } from '@mudders/shared';
import type {
  Quality,
  RenderPalette,
  Renderer,
  RendererOptions,
  SnapshotStream,
  Vec2,
} from '../types';
import { drawWeather, drawZones, stormFlash, type AmbientProbe } from './ambient';
import { QuadBatch, Shape } from './batch';
import { Camera } from './camera';
import { EffectSystem, QUALITY_PARTICLES } from './effects';
import { compile, rgb, texture, uniforms } from './gl';
import { PKind, Particles } from './particles';
import { BG_FS, FULLSCREEN_VS, MAX_RIPPLES, POST_FS, TERRAIN_FS, TERRAIN_VS } from './shaders';
import { DEFAULT_THEME, pixelTheme, playerColor, shade, type PixelTheme } from './theme';

const FP = 65536;
const TANK_W = 16;
const TANK_H = 10;
const GRAVITY = 0.12;

interface Trail {
  id: number;
  turn: number;
  /** x0,y0,x1,y1,… in map cells. */
  pts: number[];
  live: boolean;
}

/**
 * The v1 pixel renderer (§2a, §2b) on raw WebGL2. Pipeline: sky → terrain (R8UI grid through a
 * palette shader, integer scale, nearest-neighbour, dirty-rect sub-uploads) → trails, debris and
 * tanks → cosmetic particles → post-process (shockwave ripple, flash tint, shake, vignette).
 */
export class PixelRenderer implements Renderer {
  readonly camera: Camera;
  private gl!: WebGL2RenderingContext;
  private canvas!: HTMLCanvasElement;
  private unsubscribe: (() => void) | undefined;
  private theme: PixelTheme = DEFAULT_THEME;
  private quality: Quality = 'medium';
  private palette!: RenderPalette;
  private shakeOn = true;

  private terrainTex!: WebGLTexture;
  /** Coating layer (oil…), same layout as the terrain texture. */
  private coatTex!: WebGLTexture;
  /** Shaded terrain colours, one texel per cell, re-shaded only inside dirty rects. */
  private colorTex!: WebGLTexture;
  private colorFbo!: WebGLFramebuffer;
  private bgProg!: WebGLProgram;
  private uBg!: ReturnType<
    typeof uniforms<
      | 'u_color'
      | 'u_view'
      | 'u_origin'
      | 'u_scale'
      | 'u_map'
      | 'u_top'
      | 'u_bottom'
      | 'u_letterbox'
      | 'u_flash'
      | 'u_vignette'
      | 'u_terrain'
      | 'u_coat'
      | 'u_look'
      | 'u_palette'
      | 'u_time'
      | 'u_haze'
      | 'u_stars'
      | 'u_starColor'
    >
  >;
  /** Material looks: 256×9 (row 0 = cycle length, ticks, hot; rows 1–8 = cycle colours). */
  private lookTex!: WebGLTexture;
  /** Dirty bounding box awaiting re-shade: x0, y0, x1, y1 (exclusive); x0 > x1 when clean. */
  private dirty = [0, 0, 0, 0];
  private paletteTex!: WebGLTexture;
  private sceneTex!: WebGLTexture;
  private sceneFbo!: WebGLFramebuffer;
  private sceneW = 0;
  private sceneH = 0;
  private terrainProg!: WebGLProgram;
  private postProg!: WebGLProgram;
  private emptyVao!: WebGLVertexArrayObject;
  private uTer!: ReturnType<
    typeof uniforms<
      | 'u_view'
      | 'u_origin'
      | 'u_scale'
      | 'u_map'
      | 'u_terrain'
      | 'u_coat'
      | 'u_palette'
      | 'u_grain'
      | 'u_light'
      | 'u_wet'
      | 'u_snow'
      | 'u_look'
    >
  >;
  private uPost!: ReturnType<
    typeof uniforms<
      | 'u_scene'
      | 'u_view'
      | 'u_shake'
      | 'u_rippleCount'
      | 'u_ripple'
      | 'u_rippleW'
      | 'u_tint'
      | 'u_origin'
      | 'u_scale'
      | 'u_split'
      | 'u_scan'
    >
  >;
  private normal!: QuadBatch;
  private additive!: QuadBatch;
  private particles!: Particles;
  private fx!: EffectSystem;

  /** Latest snapshot state the renderer mirrors (read-only views). */
  private terrain: Uint8Array;
  private entities: EntityView[] = [];
  private zones: ZoneView[] = [];
  private readonly probe: AmbientProbe;
  private debris: RenderSnapshot['debris'] = {
    count: 0,
    x: new Int32Array(0),
    y: new Int32Array(0),
    material: new Uint8Array(0),
  };
  private wind = 0;
  private lastTick = 0;
  private fxTick = -1;
  private trails: Trail[] = [];
  private rippleBuf = new Float32Array(MAX_RIPPLES * 4);
  private rippleW = new Float32Array(MAX_RIPPLES);

  constructor(
    readonly mapWidth: number,
    readonly mapHeight: number,
  ) {
    this.camera = new Camera(mapWidth, mapHeight);
    this.terrain = new Uint8Array(mapWidth * mapHeight);
    this.probe = {
      width: mapWidth,
      height: mapHeight,
      solid: (x, y) =>
        x >= 0 && y >= 0 && x < mapWidth && y < mapHeight && this.terrain[y * mapWidth + x] !== 0,
    };
  }

  mount(canvas: HTMLCanvasElement, snapshots: SnapshotStream, options: RendererOptions): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.palette = options.palette;
    this.theme = pixelTheme(options.theme, options.palette.themes);
    this.shakeOn = options.shake ?? true;

    this.terrainProg = compile(gl, TERRAIN_VS, TERRAIN_FS);
    this.uTer = uniforms(gl, this.terrainProg, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_map',
      'u_terrain',
      'u_coat',
      'u_palette',
      'u_grain',
      'u_light',
      'u_wet',
      'u_snow',
      'u_look',
    ]);
    this.bgProg = compile(gl, FULLSCREEN_VS, BG_FS);
    this.uBg = uniforms(gl, this.bgProg, [
      'u_color',
      'u_view',
      'u_origin',
      'u_scale',
      'u_map',
      'u_top',
      'u_bottom',
      'u_letterbox',
      'u_flash',
      'u_vignette',
      'u_terrain',
      'u_coat',
      'u_look',
      'u_palette',
      'u_time',
      'u_haze',
      'u_stars',
      'u_starColor',
    ]);
    this.postProg = compile(gl, FULLSCREEN_VS, POST_FS);
    this.uPost = uniforms(gl, this.postProg, [
      'u_scene',
      'u_view',
      'u_shake',
      'u_rippleCount',
      'u_ripple',
      'u_rippleW',
      'u_tint',
      'u_origin',
      'u_scale',
      'u_split',
      'u_scan',
    ]);
    this.emptyVao = gl.createVertexArray();

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.terrainTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8UI,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      this.terrain,
    );
    this.coatTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8UI,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      new Uint8Array(this.mapWidth * this.mapHeight),
    );
    this.paletteTex = texture(gl);
    this.lookTex = texture(gl);
    this.uploadPalette();
    this.colorTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    this.colorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.dirty = [0, 0, this.mapWidth, this.mapHeight];
    this.sceneTex = texture(gl, gl.LINEAR);
    this.sceneFbo = gl.createFramebuffer();

    this.normal = new QuadBatch(gl);
    this.additive = new QuadBatch(gl);
    this.setQuality(options.quality);

    this.unsubscribe = snapshots.subscribe((s) => this.push(s));
    this.resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, 1);
  }

  private uploadPalette(): void {
    const gl = this.gl;
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const c = this.palette.materials[i] ?? 0;
      data[i * 4] = (c >> 16) & 255;
      data[i * 4 + 1] = (c >> 8) & 255;
      data[i * 4 + 2] = c & 255;
      data[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const look = new Uint8Array(256 * 9 * 4);
    for (const l of this.palette.looks ?? []) {
      if (l.cell <= 0 || l.cell > 255) continue;
      const n = Math.min(8, l.cycle.length);
      look[l.cell * 4] = n >= 2 ? n : 0;
      look[l.cell * 4 + 1] = Math.max(1, Math.min(255, l.ticks));
      look[l.cell * 4 + 2] = l.hot ? 255 : 0;
      for (let i = 0; i < n; i++) {
        const o = ((1 + i) * 256 + l.cell) * 4;
        const c = l.cycle[i]!;
        look[o] = (c >> 16) & 255;
        look[o + 1] = (c >> 8) & 255;
        look[o + 2] = c & 255;
        look[o + 3] = 255;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lookTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 9, 0, gl.RGBA, gl.UNSIGNED_BYTE, look);
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    const q = QUALITY_PARTICLES[quality];
    const old = this.particles;
    if (!old || old.cap !== q.cap) {
      this.particles = new Particles(q.cap);
      this.fx = new EffectSystem(this.particles, {
        width: this.mapWidth,
        height: this.mapHeight,
        material: (x, y) =>
          x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight
            ? 0
            : this.terrain[y * this.mapWidth + x]!,
        color: (m) => this.palette.materials[m] ?? 0x7a5a3a,
      });
    }
    this.fx.mult = q.mult;
  }

  setTheme(id: string): void {
    this.theme = pixelTheme(id, this.palette.themes);
    this.dirty = [0, 0, this.mapWidth, this.mapHeight];
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.camera.setViewport(cssWidth, cssHeight, dpr);
    const w = this.camera.vw;
    const h = this.camera.vh;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (w !== this.sceneW || h !== this.sceneH) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.sceneTex,
        0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.sceneW = w;
      this.sceneH = h;
    }
  }

  unproject(p: Vec2): Vec2 {
    return this.camera.unproject(p);
  }

  project(p: Vec2): Vec2 {
    return this.camera.project(p);
  }

  // ── snapshot intake ─────────────────────────────────────────────────────────────────────

  private push(s: RenderSnapshot): void {
    const gl = this.gl;
    if (s.dirtyRects.length > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, s.width);
      for (const r of s.dirtyRects) {
        if (r.w <= 0 || r.h <= 0) continue;
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r.x);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r.y);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          r.x,
          r.y,
          r.w,
          r.h,
          gl.RED_INTEGER,
          gl.UNSIGNED_BYTE,
          s.terrain,
        );
        gl.bindTexture(gl.TEXTURE_2D, this.coatTex);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          r.x,
          r.y,
          r.w,
          r.h,
          gl.RED_INTEGER,
          gl.UNSIGNED_BYTE,
          s.coating,
        );
        gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
        // shading reads neighbours (up to 6 up for wet/snow, 1 down/sideways): widen the box
        const d = this.dirty;
        const clean = d[0]! >= d[2]!;
        d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, r.x - 1));
        d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, r.y - 1));
        d[2] = Math.min(this.mapWidth, Math.max(clean ? -Infinity : d[2]!, r.x + r.w + 1));
        d[3] = Math.min(this.mapHeight, Math.max(clean ? -Infinity : d[3]!, r.y + r.h + 6));
      }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    this.terrain = s.terrain;
    this.entities = s.entities;
    this.zones = [];
    for (const e of s.entities) if (e.kind === 'zone') this.zones.push(e);
    this.debris = s.debris;
    this.wind = s.wind;
    this.lastTick = s.tick;
    if (this.fxTick < 0) this.fxTick = s.tick;
    // catch cosmetic time up to this snapshot before spawning its events
    while (this.fxTick < s.tick) this.stepFx();
    for (const e of s.effectEvents) this.fx.handle(e);
    this.updateTrails(s);
  }

  private stepFx(): void {
    this.particles.step(GRAVITY, this.wind);
    this.fx.tick(this.fxTick);
    // smoke from wrecks
    if (this.fxTick % 9 === 0) {
      for (const e of this.entities) {
        if (e.kind !== 'tank' || e.alive) continue;
        const seed = (this.fxTick * 31 + e.player * 17) % 13;
        this.particles.add({
          x: e.x - 3 + (seed % 6),
          y: e.y - 5,
          vx: 0,
          vy: -0.2,
          life: 70,
          size: 3 + (seed % 3),
          color: 0x3a3438,
          kind: PKind.Smoke,
        });
      }
    }
    this.fxTick++;
  }

  private updateTrails(s: RenderSnapshot): void {
    for (const t of this.trails) t.live = false;
    for (const e of s.entities) {
      if (e.kind !== 'projectile') continue;
      let tr = this.trails.find((t) => t.id === e.id);
      if (!tr) {
        // a new shot clears trails from earlier turns (they persist faintly until then, §3.3)
        this.trails = this.trails.filter((t) => t.turn === s.turn);
        tr = { id: e.id, turn: s.turn, pts: [], live: true };
        this.trails.push(tr);
      }
      tr.live = true;
      const n = tr.pts.length;
      // skip wrap-around jumps
      if (n >= 2 && Math.abs(tr.pts[n - 2]! - e.x) > s.width / 2) tr.pts.push(NaN, NaN);
      tr.pts.push(e.x, e.y);
    }
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────

  render(time: number): void {
    const gl = this.gl;
    const cam = this.camera;
    const W = cam.vw;
    const H = cam.vh;
    const scale = cam.scale;
    const ox = cam.ox;
    const oy = cam.oy;
    const view: [number, number] = [W, H];
    const origin: [number, number] = [ox, oy];
    const th = this.theme;
    const t = Math.max(time, this.lastTick);

    // ripples, shake and the flash tint need a post pass; most frames draw straight to the canvas
    const distort = this.quality !== 'low';
    let nRipples = 0;
    if (distort) {
      for (const r of this.fx.ripples) {
        if (nRipples >= MAX_RIPPLES) break;
        const k = (t - r.start) / r.dur;
        if (k < 0 || k > 1) continue;
        this.rippleBuf[nRipples * 4] = ox + r.x * scale;
        this.rippleBuf[nRipples * 4 + 1] = oy + r.y * scale;
        this.rippleBuf[nRipples * 4 + 2] = r.maxR * Math.sqrt(k) * scale;
        this.rippleBuf[nRipples * 4 + 3] = r.strength * (1 - k);
        this.rippleW[nRipples] = r.width * scale * (0.7 + 0.6 * k);
        nRipples++;
      }
    }
    const [sx, sy] = this.shakeOn ? this.fx.shake(t) : [0, 0];
    const shakeX = Math.round(sx) * scale; // whole cells: the grid never smears
    const shakeY = Math.round(sy) * scale;
    const fx = this.fx;
    const storm = stormFlash(t, th.flicker);
    const sky = fx.sky;
    const flash = Math.max(fx.skyFlash, storm);
    const split = distort ? Math.round(fx.split) * scale : 0;
    const scan = th.scanlines;
    const post = nRipples > 0 || shakeX !== 0 || shakeY !== 0 || flash > 0 || split > 0 || scan > 0;

    this.shadeTerrain();
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? this.sceneFbo : null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);

    // background: letterbox, sky, terrain, vignette in one pass
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(this.bgProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.uniform1i(this.uBg.u_color, 0);
    gl.uniform2f(this.uBg.u_view, W, H);
    gl.uniform2f(this.uBg.u_origin, ox, oy);
    gl.uniform1f(this.uBg.u_scale, scale);
    gl.uniform2f(this.uBg.u_map, this.mapWidth, this.mapHeight);
    gl.uniform3fv(this.uBg.u_top, rgb(th.skyTop));
    gl.uniform3fv(this.uBg.u_bottom, rgb(th.skyBottom));
    gl.uniform3fv(this.uBg.u_letterbox, rgb(th.letterbox));
    gl.uniform3f(
      this.uBg.u_flash,
      sky[0] + storm * 0.55,
      sky[1] + storm * 0.6,
      sky[2] + storm * 0.75,
    );
    gl.uniform1f(this.uBg.u_vignette, this.quality === 'low' ? 0 : th.vignette);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.coatTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lookTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uBg.u_terrain, 1);
    gl.uniform1i(this.uBg.u_coat, 2);
    gl.uniform1i(this.uBg.u_look, 3);
    gl.uniform1i(this.uBg.u_palette, 4);
    gl.uniform1f(this.uBg.u_time, t);
    gl.uniform1f(this.uBg.u_haze, distort ? 1 : 0);
    gl.uniform1f(
      this.uBg.u_stars,
      th.ambient.kind === 'stars' ? Math.min(0.05, th.ambient.density / 6000) : 0,
    );
    gl.uniform3fv(this.uBg.u_starColor, rgb(th.ambient.color));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // sprites
    const mult = this.fx.mult;
    drawZones(this.normal, this.additive, this.zones, t, this.probe, mult);
    this.drawTrails();
    this.drawDebris();
    this.drawTanks(t);
    this.particles.draw(this.normal, this.additive);
    this.drawProjectiles();
    this.fx.drawGlows(this.additive, t);
    this.fx.drawBolts(this.additive, t);
    drawWeather(this.normal, this.additive, th, t, this.wind, this.probe, mult);
    if (!distort) this.fx.drawRippleRings(this.additive, t);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.normal.flush(view, origin, scale);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.additive.flush(view, origin, scale);
    gl.disable(gl.BLEND);

    if (post) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.bindVertexArray(this.emptyVao);
      gl.useProgram(this.postProg);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(this.uPost.u_scene, 0);
      gl.uniform2f(this.uPost.u_view, W, H);
      gl.uniform2f(this.uPost.u_shake, shakeX, shakeY);
      gl.uniform2f(this.uPost.u_origin, ox, oy);
      gl.uniform1f(this.uPost.u_scale, scale);
      gl.uniform1i(this.uPost.u_rippleCount, nRipples);
      gl.uniform4fv(this.uPost.u_ripple, this.rippleBuf);
      gl.uniform1fv(this.uPost.u_rippleW, this.rippleW);
      gl.uniform3f(this.uPost.u_tint, sky[0] * 0.36, sky[1] * 0.36, sky[2] * 0.36);
      gl.uniform1f(this.uPost.u_split, split);
      gl.uniform1f(this.uPost.u_scan, scan);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
  }

  private shadeTerrain(): void {
    const d = this.dirty;
    if (d[0]! >= d[2]! || d[1]! >= d[3]!) return;
    const gl = this.gl;
    const mw = this.mapWidth;
    const mh = this.mapHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFbo);
    gl.viewport(0, 0, mw, mh);
    gl.enable(gl.SCISSOR_TEST);
    // the colour texture is stored with map row 0 at the bottom (GL convention); the terrain
    // vertex shader flips y, so the scissor box is flipped too
    gl.scissor(d[0]!, mh - d[3]!, d[2]! - d[0]!, d[3]! - d[1]!);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(this.terrainProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.coatTex);
    gl.uniform1i(this.uTer.u_terrain, 0);
    gl.uniform1i(this.uTer.u_palette, 1);
    gl.uniform1i(this.uTer.u_coat, 2);
    gl.uniform2f(this.uTer.u_view, mw, mh);
    gl.uniform2f(this.uTer.u_origin, 0, 0);
    gl.uniform1f(this.uTer.u_scale, 1);
    gl.uniform2f(this.uTer.u_map, mw, mh);
    gl.uniform1f(this.uTer.u_grain, this.theme.grain);
    gl.uniform3fv(this.uTer.u_light, rgb(this.theme.light));
    gl.uniform1f(this.uTer.u_wet, this.theme.wet);
    gl.uniform1f(this.uTer.u_snow, this.theme.snow);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lookTex);
    gl.uniform1i(this.uTer.u_look, 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    d[0] = 1;
    d[2] = 0;
  }

  private drawTrails(): void {
    const b = this.normal;
    const col = this.theme.trail;
    for (const tr of this.trails) {
      const a = tr.live ? 0.55 : 0.22;
      const p = tr.pts;
      for (let i = 2; i < p.length; i += 2) {
        if (Number.isNaN(p[i]!) || Number.isNaN(p[i - 2]!)) continue;
        // fade the tail of a live trail
        const k = tr.live ? Math.max(0.25, 1 - (p.length - i) / 240) : 1;
        b.line(p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!, 0.7, col, a * k);
      }
    }
  }

  private drawDebris(): void {
    const d = this.debris;
    const pal = this.palette.materials;
    for (let i = 0; i < d.count; i++) {
      const x = Math.floor(d.x[i]! / FP);
      const y = Math.floor(d.y[i]! / FP);
      this.normal.push(x + 0.5, y + 0.5, 1, 1, shade(pal[d.material[i]!] ?? 0x7a5a3a, 1.1), 1);
    }
  }

  private drawTanks(t: number): void {
    const b = this.normal;
    for (const e of this.entities) {
      if (e.kind !== 'tank') continue;
      const x = e.x;
      const y = e.y;
      const col = playerColor(e.player);
      if (!e.alive) {
        b.rect(x - 7, y - 3, 14, 3, 0x2a2426);
        b.rect(x - 4, y - 5, 7, 2, 0x1d191b);
        continue;
      }
      // treads + wheels
      b.rect(x - TANK_W / 2, y - 3, TANK_W, 3, 0x2b2622);
      for (let w = -6; w <= 6; w += 4) b.push(x + w, y - 1.5, 2.2, 2.2, 0x55504a, 1, Shape.Disc);
      // hull
      b.rect(x - 7, y - 6, 14, 3, col);
      b.rect(x - 7, y - 6, 14, 1, shade(col, 1.3));
      // barrel
      const a = (e.angle * Math.PI) / 180;
      const bx = x + 0.5;
      const by = y - 7.5;
      b.line(bx, by, bx + Math.cos(a) * 8, by - Math.sin(a) * 8, 1.4, 0xd8d2c8);
      // turret dome
      b.push(x + 0.5, y - 7, 7, 5, shade(col, 1.12), 1, Shape.Disc);
      this.coverTank(x, y);
      // health bar
      const hp = Math.max(0, Math.min(1, e.health / 100));
      b.rect(x - 8, y - 14, 16, 1.6, 0x000000, 0.55);
      b.rect(x - 8, y - 14, 16 * hp, 1.6, hp > 0.5 ? 0x5ad35a : hp > 0.25 ? 0xf0c040 : 0xe04040);
      if (e.active) {
        const bob = Math.sin(t * 0.12) * 1.2;
        b.push(x + 0.5, y - 19 + bob, 3.2, 3.2, col, 1, Shape.Rect, Math.PI / 4);
        b.push(x + 0.5, y - 19 + bob, 1.4, 1.4, 0xffffff, 0.9, Shape.Rect, Math.PI / 4);
      }
    }
  }

  /**
   * Terrain overlapping the tank body (sunk into quicksand, or buried) is drawn over the sprite,
   * cell by cell with a two-tone dither, so the tank reads as sitting in the ground.
   */
  private coverTank(x: number, y: number): void {
    const b = this.normal;
    const w = this.mapWidth;
    for (let cy = Math.max(0, y - TANK_H); cy < Math.min(this.mapHeight, y); cy++) {
      for (let cx = Math.max(0, x - TANK_W / 2); cx < Math.min(w, x + TANK_W / 2); cx++) {
        const m = this.terrain[cy * w + cx]!;
        if (m === 0) continue;
        const c = this.palette.materials[m] ?? 0x7a5a3a;
        b.rect(cx, cy, 1, 1, ((cx + cy) & 1) === 0 ? c : shade(c, 0.94));
      }
    }
  }

  private drawProjectiles(): void {
    const g = this.additive;
    for (const e of this.entities) {
      if (e.kind !== 'projectile') continue;
      g.push(e.x, e.y, 6, 6, 0xff9a40, 0.6, Shape.Pixel);
      g.push(Math.floor(e.x) + 0.5, Math.floor(e.y) + 0.5, 2, 2, 0xffffff, 1);
    }
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const gl = this.gl;
    this.normal.dispose();
    this.additive.dispose();
    gl.deleteTexture(this.terrainTex);
    gl.deleteTexture(this.coatTex);
    gl.deleteTexture(this.paletteTex);
    gl.deleteTexture(this.lookTex);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.colorTex);
    gl.deleteFramebuffer(this.colorFbo);
    gl.deleteProgram(this.bgProg);
    gl.deleteFramebuffer(this.sceneFbo);
    gl.deleteProgram(this.terrainProg);
    gl.deleteProgram(this.postProg);
    gl.deleteVertexArray(this.emptyVao);
    this.particles.clear();
    this.fx.clear();
  }
}
