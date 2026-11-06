import type { EntityView, RenderSnapshot, TankView, ZoneView } from '@mudders/shared';
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
import {
  BG_FS,
  FULLSCREEN_VS,
  MAX_RIPPLES,
  POST_FS,
  SCENERY_FS,
  TERRAIN_FS,
  TERRAIN_VS,
} from './shaders';
import { DEFAULT_THEME, pixelTheme, playerColor, shade, type PixelTheme } from './theme';

/** 3×5 pixel digits 1–9, one row per entry, bit 2 = left column. */
const DIGITS: Record<number, readonly number[]> = {
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b110, 0b001, 0b010, 0b100, 0b111],
  3: [0b110, 0b001, 0b010, 0b001, 0b110],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b110, 0b001, 0b110],
  6: [0b011, 0b100, 0b110, 0b101, 0b010],
  7: [0b111, 0b001, 0b010, 0b010, 0b010],
  8: [0b010, 0b101, 0b010, 0b101, 0b010],
  9: [0b010, 0b101, 0b011, 0b001, 0b110],
};

const FP = 65536;
const SCENERY_UNIFORMS = [
  'u_size',
  'u_map',
  'u_top',
  'u_bottom',
  'u_cloud',
  'u_cloudLight',
  'u_cloudShadow',
  'u_ranges',
  'u_rangeCount',
  'u_horizon',
  'u_cam',
] as const;
const TANK_W = 16;
/** How long fresh char smoulders after a blast (ticks; keep in step with the shader). */
const EMBER_TICKS = 600;
/** Most flaming surface cells tracked between look scans. */
const FLAME_CAP = 2048;
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
  /** Where grass may grow (R8UI, 1 = round-start surface), seeded once per round. */
  private grassTex!: WebGLTexture;
  private readonly grassMask: Uint8Array;
  /** Round the grass mask was seeded for (snapshot turn / 1000); -1 = not yet. */
  private grassRound = -1;
  /** Tick + 1 of the last blast over each cell (R32UI, 0 = none): fresh char smoulders. */
  private burnTex!: WebGLTexture;
  private readonly burn: Uint32Array;
  /** Last tick any cell was scorched (-1 = none): the ember pass is skipped after it cools. */
  private lastBurn = -1;
  /** Where each wreck is drawn (by player; NaN = not dead yet): it drops onto the ground left
   * under it, since the sim stops moving dead tanks. */
  private wreckY: number[] = [];
  private wreckV: number[] = [];
  /** Shaded terrain colours, one texel per cell, re-shaded only inside dirty rects. */
  private colorTex!: WebGLTexture;
  private colorFbo!: WebGLFramebuffer;
  private bgProg!: WebGLProgram;
  /** Painted sky, clouds and parallax ranges, one texel per 2×2 cells; redrawn on change only. */
  private sceneryProg!: WebGLProgram;
  private uScn!: Record<(typeof SCENERY_UNIFORMS)[number], WebGLUniformLocation | null>;
  private sceneryTex!: WebGLTexture;
  private sceneryFbo!: WebGLFramebuffer;
  private sceneryW = 0;
  private sceneryH = 0;
  private sceneryKey = '';
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
      | 'u_anim'
      | 'u_stars'
      | 'u_starColor'
      | 'u_scenery'
      | 'u_grass'
      | 'u_grassMask'
      | 'u_burn'
      | 'u_burnOn'
    >
  >;
  /** Material looks: 256×9 (row 0 = cycle length, ticks, hot; rows 1–8 = cycle colours). */
  private lookTex!: WebGLTexture;
  /** Per material cell: 1 = palette-cycled, 2 = hot (bit flags), from the palette's looks. */
  private readonly lookFlags = new Uint8Array(256);
  /** Whether any animated or hot cell is on the map (rescanned every 20 ticks): the background
   * pass skips cycling and the haze search entirely when nothing needs them (cheap on SwiftShader
   * and low-end phones). */
  private anyCycle = false;
  private anyHot = false;
  /** Exposed flaming cells (index into the grid) found by the last look scan, at most FLAME_CAP. */
  private readonly flameCells = new Int32Array(FLAME_CAP);
  private flameN = 0;
  private coating: Uint8Array = new Uint8Array(0);
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
      | 'u_grass'
      | 'u_ground'
      | 'u_flowers'
      | 'u_grassMask'
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
  /** Cloud drift in map cells, accumulated per tick from a slow breeze plus the wind. */
  private cloudX = 0;
  /** Mean ground row of the first snapshot: where the scenery ranges stand. */
  private horizon = -1;
  private rangeBuf = new Float32Array(9);
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
    this.grassMask = new Uint8Array(mapWidth * mapHeight);
    this.burn = new Uint32Array(mapWidth * mapHeight);
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
      'u_grass',
      'u_ground',
      'u_flowers',
      'u_grassMask',
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
      'u_anim',
      'u_stars',
      'u_starColor',
      'u_scenery',
      'u_grass',
      'u_grassMask',
      'u_burn',
      'u_burnOn',
    ]);
    this.sceneryProg = compile(gl, FULLSCREEN_VS, SCENERY_FS);
    this.uScn = uniforms(gl, this.sceneryProg, SCENERY_UNIFORMS);
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
    this.grassTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8UI,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      this.grassMask,
    );
    this.burnTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32UI,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_INT,
      this.burn,
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
    this.sceneryW = Math.ceil(this.mapWidth / 2);
    this.sceneryH = Math.ceil(this.mapHeight / 2);
    this.sceneryTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.sceneryW,
      this.sceneryH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    this.sceneryFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneryFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneryTex,
      0,
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
      this.lookFlags[l.cell] = (n >= 2 ? 1 : 0) | (l.hot ? 2 : 0) | (l.flames ? 4 : 0);
      look[l.cell * 4 + 1] = Math.max(1, Math.min(255, l.ticks));
      look[l.cell * 4 + 2] = l.hot ? 255 : 0;
      look[l.cell * 4 + 3] = l.topsoil ? 255 : l.char ? 128 : 0;
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
        // shading reads neighbours (up to 32 up for soil depth, 1 down/sideways): widen the box
        const d = this.dirty;
        const clean = d[0]! >= d[2]!;
        d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, r.x - 1));
        d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, r.y - 1));
        d[2] = Math.min(this.mapWidth, Math.max(clean ? -Infinity : d[2]!, r.x + r.w + 1));
        d[3] = Math.min(this.mapHeight, Math.max(clean ? -Infinity : d[3]!, r.y + r.h + 32));
      }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    this.terrain = s.terrain;
    this.coating = s.coating;
    // grass belongs to the ground a round starts with: craters dug later stay bare. The round
    // number goes up when a round ends; the next map arrives later as one whole-map rect.
    const round = Math.floor(s.turn / 1000);
    const fresh =
      this.grassRound < 0 ||
      (round !== this.grassRound &&
        s.dirtyRects.some((r) => r.x === 0 && r.y === 0 && r.w >= s.width && r.h >= s.height));
    if (fresh && s.width === this.mapWidth && s.height === this.mapHeight) {
      this.grassRound = round;
      grassMask(s.terrain, s.width, s.height, this.grassMask);
      gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        s.width,
        s.height,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        this.grassMask,
      );
      this.dirty = [0, 0, this.mapWidth, this.mapHeight];
      this.burn.fill(0);
      this.lastBurn = -1;
      this.uploadBurn(0, 0, s.width, s.height);
      this.wreckY = [];
      this.wreckV = [];
    }
    if (s.tick % 20 === 0 || this.fxTick < 0) this.scanLooks();
    if (this.horizon < 0) this.horizon = meanGround(s.terrain, s.width, s.height);
    this.entities = s.entities;
    this.zones = [];
    for (const e of s.entities) if (e.kind === 'zone') this.zones.push(e);
    this.debris = s.debris;
    this.wind = s.wind;
    this.lastTick = s.tick;
    if (this.fxTick < 0) this.fxTick = s.tick;
    // catch cosmetic time up to this snapshot before spawning its events
    while (this.fxTick < s.tick) this.stepFx();
    for (const e of s.effectEvents) {
      this.fx.handle(e);
      if (e.type === 'flash') {
        if ((e.params.strength ?? 1) > 0) this.scorch(e.x, e.y, e.radius, e.tick);
      }
      // dirt geysers throw the char wider than the crater
      else if (e.type === 'geyser') this.scorch(e.x, e.y, e.radius * 1.8, e.tick);
    }
    this.updateTrails(s);
  }

  /** Stamp a blast's tick over the cells it reached, so the char there smoulders for a while. */
  private scorch(x: number, y: number, radius: number, tick: number): void {
    const r = Math.ceil(radius * 1.15) + 2;
    const w = this.mapWidth;
    const x0 = Math.max(0, Math.floor(x - r));
    const y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(w, Math.ceil(x + r) + 1);
    const y1 = Math.min(this.mapHeight, Math.ceil(y + r) + 1);
    if (x0 >= x1 || y0 >= y1) return;
    const r2 = r * r;
    const stamp = tick + 1;
    const burn = this.burn;
    for (let cy = y0; cy < y1; cy++) {
      const dy = cy - y;
      for (let cx = x0; cx < x1; cx++) {
        const dx = cx - x;
        if (dx * dx + dy * dy <= r2) burn[cy * w + cx] = stamp;
      }
    }
    this.lastBurn = Math.max(this.lastBurn, tick);
    this.uploadBurn(x0, y0, x1 - x0, y1 - y0);
  }

  private uploadBurn(x: number, y: number, w: number, h: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.burnTex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.mapWidth);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_INT, this.burn);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  /** First solid row at or below `y` under a wreck's 14-cell footprint (map height if none). */
  private restRow(x: number, y: number): number {
    const w = this.mapWidth;
    const t = this.terrain;
    for (let r = Math.max(0, Math.floor(y)); r < this.mapHeight; r++) {
      const row = r * w;
      for (let cx = Math.max(0, x - 7); cx < Math.min(w, x + 7); cx++)
        if (t[row + cx] !== 0) return r;
    }
    return this.mapHeight + 12;
  }

  /** Drop wrecks onto whatever ground is left under them, one cosmetic tick at a time. */
  private stepWrecks(): void {
    for (const e of this.entities) {
      if (e.kind !== 'tank') continue;
      const p = e.player;
      if (e.alive) {
        this.wreckY[p] = NaN;
        continue;
      }
      let y = this.wreckY[p] ?? NaN;
      if (Number.isNaN(y)) {
        y = e.y;
        this.wreckV[p] = 0;
      }
      const rest = this.restRow(e.x, y);
      if (y < rest) {
        const v = Math.min((this.wreckV[p] ?? 0) + 0.2, 4);
        this.wreckV[p] = v;
        y = Math.min(y + v, rest);
      } else {
        this.wreckV[p] = 0;
      }
      this.wreckY[p] = y;
    }
  }

  /** Row a tank is drawn standing on: wrecks use their dropped position. */
  private tankY(e: TankView): number {
    if (e.alive) return e.y;
    const y = this.wreckY[e.player];
    return y === undefined || Number.isNaN(y) ? e.y : Math.floor(y);
  }

  private scanLooks(): void {
    const f = this.lookFlags;
    let any = 0;
    const t = this.terrain;
    for (let i = 0; i < t.length; i++) any |= f[t[i]!]!;
    const c = this.coating;
    for (let i = 0; i < c.length; i++) any |= f[c[i]!]!;
    this.anyCycle = (any & 1) !== 0;
    this.anyHot = (any & 2) !== 0;
    this.flameN = 0;
    if ((any & 4) === 0) return;
    // flaming cells with air above: where the flame tongues lick up from
    const w = this.mapWidth;
    for (let i = w; i < t.length && this.flameN < FLAME_CAP; i++) {
      if ((f[t[i]!]! & 4) !== 0 && t[i - w] === 0) this.flameCells[this.flameN++] = i;
    }
  }

  /** Flame tongues, sparks and black smoke rising off burning surfaces (napalm, burning oil). */
  private stepFlames(): void {
    const n = this.flameN;
    if (n === 0) return;
    const w = this.mapWidth;
    const t = this.terrain;
    const f = this.lookFlags;
    const mult = QUALITY_PARTICLES[this.quality].mult;
    const tries = Math.min(n, Math.round((4 + n / 6) * mult));
    let s = Math.imul(this.fxTick + 1, 2654435761) >>> 0;
    let bx0 = w;
    let bx1 = 0;
    let by0 = this.mapHeight;
    let by1 = 0;
    let grassBurnt = false;
    for (let k = 0; k < tries; k++) {
      s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      const i = this.flameCells[s % n]!;
      if ((f[t[i]!]! & 4) === 0 || t[i - w] !== 0) continue; // burnt out or buried since the scan
      const x = (i % w) + 0.5;
      const y = Math.floor(i / w);
      const r = (s >>> 8) & 255;
      // the ground under burning jelly chars and keeps smouldering after it burns out
      const bx = i % w;
      const stamp = this.fxTick + 1;
      for (let dy = -1; dy <= 3; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= this.mapHeight) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = bx + dx;
          if (cx < 0 || cx >= w) continue;
          const j = yy * w + cx;
          this.burn[j] = stamp;
          // and the grass under it burns away for the rest of the round
          if (this.grassMask[j] !== 0) {
            this.grassMask[j] = 0;
            grassBurnt = true;
          }
        }
      }
      if (bx - 1 < bx0) bx0 = bx - 1;
      if (bx + 2 > bx1) bx1 = bx + 2;
      if (y - 1 < by0) by0 = Math.max(0, y - 1);
      if (y + 4 > by1) by1 = y + 4;
      // a tongue: a short-lived column of hot cells, yellow core over orange
      this.particles.add({
        x,
        y: y - 1,
        vx: ((r & 15) - 7.5) * 0.02,
        vy: -0.3 - (r >> 4) * 0.04,
        life: 8 + (r & 7),
        size: 1 + (r & 1) + ((r >> 7) & 1),
        color: 0,
        kind: PKind.Flame,
      });
      if ((r & 7) === 0) {
        this.particles.add({
          x,
          y: y - 2,
          vx: ((r & 15) - 7.5) * 0.04,
          vy: -0.9 - (r >> 5) * 0.05,
          life: 18,
          size: 1,
          color: 0xffc040,
          kind: PKind.Spark,
        });
      }
      if ((r & 15) === 0) {
        this.particles.add({
          x,
          y: y - 6,
          vx: this.wind * 0.08,
          vy: -0.35,
          life: 70,
          size: 3 + (r & 3),
          color: 0x2a2428,
          kind: PKind.Smoke,
        });
      }
    }
    if (bx1 > bx0) {
      const x0 = Math.max(0, bx0);
      const x1 = Math.min(w, bx1);
      const y1 = Math.min(this.mapHeight, by1);
      this.lastBurn = Math.max(this.lastBurn, this.fxTick);
      this.uploadBurn(x0, by0, x1 - x0, y1 - by0);
      if (grassBurnt) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, by0);
        const gw = x1 - x0;
        const gh = y1 - by0;
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          x0,
          by0,
          gw,
          gh,
          gl.RED_INTEGER,
          gl.UNSIGNED_BYTE,
          this.grassMask,
        );
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        // re-shade the burnt patch (shading looks up to 32 rows down for soil depth)
        const d = this.dirty;
        const clean = d[0]! >= d[2]!;
        d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, x0 - 1));
        d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, by0 - 1));
        d[2] = Math.min(w, Math.max(clean ? -Infinity : d[2]!, x1 + 1));
        d[3] = Math.min(this.mapHeight, Math.max(clean ? -Infinity : d[3]!, y1 + 32));
      }
    }
  }

  private stepFx(): void {
    this.particles.step(GRAVITY, this.wind);
    this.stepWrecks();
    this.cloudX += 0.012 + this.wind * 0.004;
    this.fx.tick(this.fxTick);
    this.stepFlames();
    // burning shells shed flames as they fly
    const shells = this.palette.shells;
    if (shells) {
      for (const e of this.entities) {
        if (e.kind !== 'projectile') continue;
        const look = shells[e.weapon]?.shell;
        const r = Math.imul(this.fxTick + 1, 2654435761) ^ Math.imul(e.id + 1, 40503);
        if (look === 'mud') {
          // mud globs drip as they fly
          if ((r >>> 20) % 3 === 0) {
            this.particles.add({
              x: e.x + ((r >>> 4) & 1) - 0.5,
              y: e.y + 1.5,
              vx: 0,
              vy: 0.1,
              life: 14 + ((r >>> 12) & 7),
              size: 1,
              color: (r >>> 8) & 1 ? 0x5a4c34 : 0x7a6a48,
              kind: PKind.Chunk,
            });
          }
          continue;
        }
        if (look !== 'fire') continue;
        this.particles.add({
          x: e.x + ((r >>> 4) & 3) - 1.5,
          y: e.y + ((r >>> 8) & 3) - 1.5,
          vx: 0,
          vy: -0.2,
          life: 10 + ((r >>> 12) & 7),
          size: 2 + ((r >>> 16) & 1),
          color: 0,
          kind: PKind.Flame,
        });
      }
    }
    // smoke from wrecks
    if (this.fxTick % 9 === 0) {
      for (const e of this.entities) {
        if (e.kind !== 'tank' || e.alive) continue;
        const seed = (this.fxTick * 31 + e.player * 17) % 13;
        this.particles.add({
          x: e.x - 3 + (seed % 6),
          y: this.tankY(e) - 5,
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
      if (this.palette.shells?.[e.weapon]?.trail === false) continue;
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
    this.paintScenery((W / 2 - ox) / scale, (H / 2 - oy) / scale);
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
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneryTex);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.burnTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uBg.u_grassMask, 6);
    gl.uniform1i(this.uBg.u_burn, 7);
    gl.uniform1f(this.uBg.u_burnOn, this.lastBurn >= 0 && t - this.lastBurn < EMBER_TICKS ? 1 : 0);
    gl.uniform1i(this.uBg.u_terrain, 1);
    gl.uniform1i(this.uBg.u_coat, 2);
    gl.uniform1i(this.uBg.u_look, 3);
    gl.uniform1i(this.uBg.u_palette, 4);
    gl.uniform1f(this.uBg.u_time, t);
    gl.uniform1f(this.uBg.u_haze, distort && this.anyHot ? 1 : 0);
    gl.uniform1f(this.uBg.u_anim, this.anyCycle ? 1 : 0);
    gl.uniform1f(
      this.uBg.u_stars,
      th.ambient.kind === 'stars' ? Math.min(0.05, th.ambient.density / 6000) : 0,
    );
    gl.uniform3fv(this.uBg.u_starColor, rgb(th.ambient.color));
    gl.uniform1i(this.uBg.u_scenery, 5);
    gl.uniform4f(this.uBg.u_grass, ...rgb(th.grass < 0 ? 0 : th.grass), th.grass < 0 ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // sprites
    const mult = this.fx.mult;
    drawZones(this.normal, this.additive, this.zones, t, this.probe, mult);
    this.drawTrails();
    this.drawDebris();
    this.drawTanks(t);
    this.particles.draw(this.normal, this.additive);
    this.fx.drawMushrooms(this.normal, this.additive, t);
    this.fx.drawVortices(this.normal, this.additive, t);
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

  /**
   * Redraw the scenery cache when anything it shows has moved: the clouds' whole-art-pixel drift,
   * the camera's parallax offsets (whole art pixels per layer) or the theme.
   */
  private paintScenery(camX: number, camY: number): void {
    const th = this.theme;
    const mw = this.mapWidth;
    const mh = this.mapHeight;
    const dx = camX - mw / 2;
    const dy = camY - mh / 2;
    let key = `${th.skyTop},${th.skyBottom},${th.clouds.cover},${th.clouds.light},${th.clouds.shadow},${th.ranges.join('/')},${this.horizon},${Math.floor(this.cloudX / 2)}`;
    for (const k of [0.9, 0.85, 0.75, 0.55, 0.35]) {
      key += `,${Math.floor((dx * k) / 2)},${Math.floor((dy * k) / 2)}`;
    }
    if (key === this.sceneryKey) return;
    this.sceneryKey = key;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneryFbo);
    gl.viewport(0, 0, this.sceneryW, this.sceneryH);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(this.sceneryProg);
    const u = this.uScn;
    gl.uniform2f(u.u_size, this.sceneryW, this.sceneryH);
    gl.uniform2f(u.u_map, mw, mh);
    gl.uniform3fv(u.u_top, rgb(th.skyTop));
    gl.uniform3fv(u.u_bottom, rgb(th.skyBottom));
    gl.uniform2f(u.u_cloud, th.clouds.cover, this.cloudX);
    gl.uniform3fv(u.u_cloudLight, rgb(th.clouds.light));
    gl.uniform3fv(u.u_cloudShadow, rgb(th.clouds.shadow));
    const nr = th.ranges.length;
    for (let i = 0; i < nr; i++) this.rangeBuf.set(rgb(th.ranges[i]!), i * 3);
    gl.uniform3fv(u.u_ranges, this.rangeBuf);
    gl.uniform1i(u.u_rangeCount, nr);
    gl.uniform1f(u.u_horizon, this.horizon < 0 ? mh * 0.6 : this.horizon);
    gl.uniform2f(u.u_cam, camX, camY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    const g = this.theme.grass;
    gl.uniform4f(this.uTer.u_grass, ...rgb(g < 0 ? 0 : g), g < 0 ? 0 : 1);
    gl.uniform3fv(this.uTer.u_ground, rgb(this.theme.ground));
    gl.uniform1f(this.uTer.u_flowers, this.theme.flowers);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lookTex);
    gl.uniform1i(this.uTer.u_look, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    gl.uniform1i(this.uTer.u_grassMask, 4);
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
      const y = this.tankY(e);
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
      // player number beside the health bar, so tanks never differ by colour alone (§8)
      this.drawDigit(x - 13, y - 16, e.player + 1);
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

  /** A 3×5 pixel digit (1–9) on a dark backing, top-left at (x, y). */
  private drawDigit(x: number, y: number, n: number): void {
    const rows = DIGITS[n];
    if (!rows) return;
    const b = this.normal;
    b.rect(x - 1, y - 1, 5, 7, 0x000000, 0.6);
    for (let r = 0; r < 5; r++) {
      const bits = rows[r]!;
      for (let c = 0; c < 3; c++) if (bits & (4 >> c)) b.rect(x + c, y + r, 1, 1, 0xffffff);
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
    const shells = this.palette.shells;
    for (const e of this.entities) {
      if (e.kind !== 'projectile') continue;
      if (shells?.[e.weapon]?.shell === 'fire') {
        // a burning gob: orange body, yellow-white heart
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        g.push(x, y, 7, 7, 0xff6a14, 0.55, Shape.Pixel);
        this.normal.push(x, y, 3, 3, 0xff8a20, 1);
        g.push(x, y, 1, 1, 0xfff0a0, 1);
        continue;
      }
      if (shells?.[e.weapon]?.shell === 'mud') {
        // a wet glob of mud: dark body, a lit cell on top where the light catches it
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        this.normal.push(x, y, 3, 3, 0x5a4c34, 1);
        this.normal.push(x, y + 1, 1, 1, 0x3a3020, 1);
        this.normal.push(x - 0.5, y - 1, 1, 1, 0xbcae86, 1);
        continue;
      }
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

/** Mean row of the topmost solid cell per column (columns with no ground count as the bottom). */
export function meanGround(terrain: Uint8Array, w: number, h: number): number {
  let sum = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && terrain[y * w + x] === 0) y++;
    sum += y;
  }
  return w > 0 ? sum / w : h;
}

/**
 * Grass mask for a round's starting ground: 1 on each surface cell (solid with air or the map top
 * above) and one row either side of it, so a cell of settling doesn't strip the grass. Ground
 * exposed later by a blast is lower than this, so it stays bare dirt.
 */
export function grassMask(terrain: Uint8Array, w: number, h: number, out: Uint8Array): void {
  out.fill(0);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (terrain[row + x] === 0 || (y > 0 && terrain[row - w + x] !== 0)) continue;
      out[row + x] = 1;
      if (y > 0) out[row - w + x] = 1;
      if (y + 1 < h) out[row + w + x] = 1;
    }
  }
}
