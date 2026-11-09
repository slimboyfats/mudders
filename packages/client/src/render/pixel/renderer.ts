import type { EffectEvent, EntityView, RenderSnapshot, TankView, ZoneView } from '@mudders/shared';
import type {
  Quality,
  RenderPalette,
  Renderer,
  RendererOptions,
  ShellLook,
  SnapshotStream,
  TankLook,
  Vec2,
} from '../types';
import { drawWeather, drawZones, emitWeather, stormFlash, type AmbientProbe } from './ambient';
import { drawDeathWall } from './deathwall';
import { GpuFluid, QUALITY_FLUID } from './fluid';
import { drawStorm, stormFor, type StormKind } from './storm';
import { WaterFx } from './splash';
import { LiquidSurface } from './liquid';
import { QuadBatch, Shape } from './batch';
import { Camera } from './camera';
import { EffectSystem, GLUE, QUALITY_PARTICLES, RICOCHET_HEAT, RUST } from './effects';
import { compile, rgb, texture, uniforms } from './gl';
import {
  HEAT_NONE,
  HEAT_RGB,
  HEAT_STRENGTH,
  Lights,
  band,
  heatFalloff,
  heatField,
  lightAt,
  litColor,
} from './lighting';
import { PKind } from './particles';
import { drawPsiAura, drawPsiShell, drawPsiTether } from './psi';
import { GpuParticles } from './gpu-particles';
import {
  BG_FS,
  CUT_REACH,
  FULLSCREEN_VS,
  HAZE_TICKS,
  MAX_RIPPLES,
  POST_FS,
  SCENERY_FS,
  TERRAIN_FS,
  TERRAIN_VS,
} from './shaders';
import {
  DEFAULT_THEME,
  mix,
  pixelTheme,
  playerColor,
  shade,
  withTemperature,
  withWeather,
  type PixelTheme,
} from './theme';
import { drawHull, drawTurret, makeWreck, stepWreck, type Wreck } from './wreck';
import { drawWarp, type WarpFx } from './warp';
import { Rockets } from './rocket';

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
  'u_boil',
  'u_cloudLight',
  'u_cloudShadow',
  'u_ranges',
  'u_rangeCount',
  'u_horizon',
  'u_cam',
] as const;
/** How long fresh char smoulders after a blast (ticks; keep in step with the shader). */
const EMBER_TICKS = 600;
/** Most flaming surface cells tracked between look scans. */
const FLAME_CAP = 2048;
const GRAVITY = 0.12;
const SHIELD_RGB = 0x7fe0ff;

/** The standard tank's look, for tanks whose type has no sprite in the palette. */
const STANDARD_LOOK: TankLook = {
  sprite: [
    '......HHHH......',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '.HHHHHHHHHHHHHH.',
    '.hhhhhhhhhhhhhh.',
    '.dhhhhhhhhhhhhd.',
    'tttttttttttttttt',
    'twwttwwttwwttwwt',
    'tttttttttttttttt',
  ],
  barrel: { x: 0, y: 7, length: 8, width: 1 },
};

/** Sprite cell code (manifest `look.sprite`) → colour in this player's colour. */
/** Parachute canopy, top row first: `c` player colour, `w` white panel, `d` shade. */
const CHUTE = [
  '......ccwwwcc......',
  '...cccwwcccwwccc...',
  '.ccwwcccwwwcccwwcc.',
  'cccwwcccwwwcccwwccc',
  'cccwwcccwwwcccwwccc',
  'd.d.d.d.d.d.d.d.d.d',
];
/** Cords: column offsets at the canopy rim → at the hull top. */
const CHUTE_CORDS: readonly (readonly [number, number])[] = [
  [-9, -6],
  [-4, -2],
  [4, 2],
  [9, 6],
];
/** How long a battery's plus signs show, in ticks. */
const BATTERY_TICKS = 45;

function spriteColor(code: number, col: number, shieldOn: boolean): number {
  switch (code) {
    case 72: // H
      return shade(col, 1.3);
    case 100: // d
      return shade(col, 0.72);
    case 116: // t
      return 0x2b2622;
    case 119: // w
      return 0x55504a;
    case 109: // m
      return 0xd8d2c8;
    case 115: // s
      return shieldOn ? SHIELD_RGB : 0x4a5a60;
    case 103: // g
      return 0x9fd0e0;
    default:
      return col;
  }
}

interface Trail {
  id: number;
  turn: number;
  /** Last position seen (sub-cell), NaN before the first. */
  lx: number;
  ly: number;
  /** Cells the shell passed through, x0,y0,x1,y1,… oldest first, one entry per map cell. */
  cells: number[];
  /** 0xRRGGBB, or -1 for the theme's trail colour. */
  color: number;
  live: boolean;
}

/** Cells of a live trail behind the head drawn white-hot, then in full colour, then dimmed. */
const TRAIL_HOT = 3;
const TRAIL_FULL = 40;
const TRAIL_DIM = 140;

/** Hard shade bands for flying debris cells. */
const DEBRIS_SHADES = [0.62, 0.8, 0.96, 1.12] as const;

/**
 * The v1 pixel renderer (§2a, §2b) on raw WebGL2. Pipeline: sky → terrain (R8UI grid through a
 * palette shader, integer scale, nearest-neighbour, dirty-rect sub-uploads) → trails, debris and
 * tanks → cosmetic particles → post-process (shockwave ripple, flash tint, shake, vignette).
 */
/** Ticks the death-zone wall takes to creep to its new line after sudden death moves it. */
const ZONE_CREEP_TICKS = 180;

export class PixelRenderer implements Renderer {
  readonly camera: Camera;
  private gl!: WebGL2RenderingContext;
  private canvas!: HTMLCanvasElement;
  private unsubscribe: (() => void) | undefined;
  private theme: PixelTheme = DEFAULT_THEME;
  /** The chosen theme before the match weather is laid over it. */
  private baseTheme: PixelTheme = DEFAULT_THEME;
  private weather: RenderSnapshot['weather'] = undefined;
  /** Air temperature (°C) from the sim; drives the snow/sand storm. */
  private temperature = 15;
  /** Sudden-death zone width (cells) and the tick it last grew. */
  private deathZone = 0;
  /** The Spotter Flare aim preview from the last snapshot (flat x, y pairs), or null. */
  private preview: number[] | null = null;
  private zoneGrewAt = -1e9;
  /** Zone width shown when it started moving to `deathZone`; the wall creeps, never jumps. */
  private zoneFrom = 0;
  private stormKind: StormKind = 'snow';
  /** Storm strength now (0…1), eased per cosmetic tick towards what the temperature calls for. */
  private stormK = -1;
  /** Signed, quantised storm strength the current theme was tinted for. */
  private themeStep = 0;
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
  /** Death sequences by player (blown-off turret, burning hull, cook-offs). */
  private wrecks: (Wreck | undefined)[] = [];
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
      | 'u_white'
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
      | 'u_lightCount'
      | 'u_lights'
      | 'u_lightCol'
      | 'u_heat'
      | 'u_heatOn'
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
  /** This frame's point lights (blasts, fireballs), see lighting.ts. */
  private readonly lights = new Lights();
  private readonly lightTmp: [number, number, number] = [0, 0, 0];
  /** Cells to the nearest hot or burning cell (R8UI), rebuilt with each look scan. */
  private heat = new Uint8Array(0);
  private heatTex!: WebGLTexture;
  private heatOn = false;
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
      | 'u_swirl'
      | 'u_tint'
      | 'u_origin'
      | 'u_scale'
      | 'u_split'
      | 'u_scan'
      | 'u_wob'
    >
  >;
  private normal!: QuadBatch;
  private additive!: QuadBatch;
  private particles!: GpuParticles;
  /** The smoke and gas field (off where float render targets are missing). */
  private fluid!: GpuFluid;
  /** Waves, glints and bubbles along every liquid surface. */
  private liquid!: LiquidSurface;
  private fx!: EffectSystem;
  /** Water splashes and ripples (cosmetic, watches the snapshots). */
  private water!: WaterFx;
  private onCues: ((events: readonly EffectEvent[]) => void) | undefined;

  /** Latest snapshot state the renderer mirrors (read-only views). */
  private terrain: Uint8Array;
  private entities: EntityView[] = [];
  /** Meteor shells: last position and per-tick motion by projectile id (for streaks and trails). */
  private readonly meteors = new Map<number, { x: number; y: number; dx: number; dy: number }>();
  /** V3 rockets and their spent stages (`rocket` / `stage` shell looks). */
  private readonly rockets = new Rockets({ add: (e) => this.particles.add(e) }, () =>
    this.fluid?.ok ? this.fluid : null,
  );
  private zones: ZoneView[] = [];
  private readonly probe: AmbientProbe;
  private debris: RenderSnapshot['debris'] = {
    count: 0,
    x: new Int32Array(0),
    y: new Int32Array(0),
    vx: new Int32Array(0),
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
  /** Per ripple slot: twist in radians at the centre for a swirl lens (0 = a ring wave). */
  private swirl = new Float32Array(MAX_RIPPLES);
  /** Tick each player's shield last soaked a hit (for the flash). */
  private shieldHitAt: number[] = [];
  /** Tick each player last switched a shield on, or used a battery (gear, §5.1). */
  private shieldUpAt: number[] = [];
  private batteryAt: number[] = [];
  /**
   * Tanks a shockwave threw, tumbling (cosmetic): spin rate (rad/tick), launch tick, last tick
   * seen in the air, and the angle it was left at when it landed (eased back to upright).
   */
  private tumble: ({ rate: number; at: number; fly: number; land: number; rest: number } | null)[] =
    [];
  /** Tanks warping (Teleport Shell, Swap Ray): broken into pixels, streaking, pulling together. */
  private warps: (WarpFx | null)[] = [];

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
      liquid: (x, y) => this.water.isLiquid(x, y),
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
    this.baseTheme = pixelTheme(options.theme, options.palette.themes);
    this.theme = this.baseTheme;
    this.shakeOn = options.shake ?? true;
    this.onCues = options.onCues;
    this.water = new WaterFx(
      this.mapWidth,
      this.mapHeight,
      options.palette.liquids ?? [],
      options.palette.materials,
    );
    this.liquid = new LiquidSurface(
      this.mapWidth,
      this.mapHeight,
      options.palette.liquids ?? [],
      options.palette.hotLiquids ?? [],
      options.palette.heavyLiquids ?? [],
      options.palette.materials,
    );
    this.water.listener = this.liquid;

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
      'u_white',
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
      'u_lightCount',
      'u_lights',
      'u_lightCol',
      'u_heat',
      'u_heatOn',
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
      'u_swirl',
      'u_tint',
      'u_origin',
      'u_scale',
      'u_split',
      'u_scan',
      'u_wob',
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
    this.heat = new Uint8Array(this.mapWidth * this.mapHeight).fill(HEAT_NONE);
    this.heatTex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8UI,
      this.mapWidth,
      this.mapHeight,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      this.heat,
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
      // glinting cells animate too, so they keep the animated-terrain pass on
      this.lookFlags[l.cell] = (n >= 2 || l.glint ? 1 : 0) | (l.hot ? 2 : 0) | (l.flames ? 4 : 0);
      look[l.cell * 4 + 1] = Math.max(1, Math.min(255, l.ticks));
      // b: 255 hot, 96 glint (the shader tells them apart by range)
      look[l.cell * 4 + 2] = l.hot ? 255 : l.glint ? 96 : 0;
      // a: 255 topsoil, 128 char-only
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
    const cap = q.cap;
    const fq = QUALITY_FLUID[quality];
    if (!old || old.cap !== cap) {
      old?.dispose();
      this.fluid?.dispose();
      this.particles = new GpuParticles(this.gl, cap, q.mult);
      this.fluid = new GpuFluid(this.gl, this.mapWidth, this.mapHeight, fq.div, fq.iters);
      this.fx = new EffectSystem(this.particles, this.fluid, {
        width: this.mapWidth,
        height: this.mapHeight,
        material: (x, y) =>
          x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight
            ? 0
            : this.terrain[y * this.mapWidth + x]!,
        color: (m) => this.palette.materials[m] ?? 0x7a5a3a,
        grass: (x, y) => this.grassMask[y * this.mapWidth + x] !== 0,
      });
    }
    this.fx.mult = q.mult;
    this.water.mult = q.mult;
    this.liquid.mult = q.mult;
  }

  setTheme(id: string): void {
    this.baseTheme = pixelTheme(id, this.palette.themes);
    this.applyTheme();
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
        // shading reads neighbours (up to 32 up for soil depth, 1 down, CUT_REACH sideways for
        // crater walls cut through the turf): widen the box
        const d = this.dirty;
        const clean = d[0]! >= d[2]!;
        d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, r.x - CUT_REACH));
        d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, r.y - 1));
        d[2] = Math.min(this.mapWidth, Math.max(clean ? -Infinity : d[2]!, r.x + r.w + CUT_REACH));
        d[3] = Math.min(this.mapHeight, Math.max(clean ? -Infinity : d[3]!, r.y + r.h + 32));
      }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    this.terrain = s.terrain;
    this.water.setTerrain(s.terrain);
    this.liquid.setTerrain(s.terrain);
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
      this.wrecks = [];
      // a new map: nothing from the last round carries over (shell trails, smoke columns, debris,
      // flames, shield and battery flashes)
      this.clearRoundFx();
    }
    if (s.tick % 20 === 0 || this.fxTick < 0) this.scanLooks();
    if (this.horizon < 0) this.horizon = meanGround(s.terrain, s.width, s.height);
    this.entities = s.entities;
    this.zones = [];
    for (const e of s.entities) if (e.kind === 'zone') this.zones.push(e);
    this.witherGrass();
    this.debris = s.debris;
    this.wind = s.wind;
    this.temperature = s.temperature ?? 15;
    this.preview = s.preview ?? null;
    const zone = s.deathZone ?? 0;
    if (zone > this.deathZone) {
      this.zoneFrom = this.shownZone(s.tick);
      this.zoneGrewAt = s.tick;
    } else if (zone < this.deathZone) this.zoneFrom = zone; // a new round: clear at once
    this.deathZone = zone;
    if (this.stormK < 0) {
      const st = stormFor(this.temperature);
      this.stormKind = st.kind;
      this.stormK = st.k;
      this.applyTheme();
    }
    if ((s.weather?.id ?? '') !== (this.weather?.id ?? '')) {
      this.weather = s.weather;
      this.applyTheme();
      this.dirty = [0, 0, this.mapWidth, this.mapHeight];
    }
    this.lastTick = s.tick;
    if (this.fxTick < 0) this.fxTick = s.tick;
    // catch cosmetic time up to this snapshot before spawning its events
    while (this.fxTick < s.tick) this.stepFx();
    for (const e of s.effectEvents) {
      this.fx.handle(e);
      if (e.type === 'flash') {
        this.water.blast(e);
        this.liquid.blast(e.x, e.y, e.radius);
        if ((e.params.strength ?? 1) > 0) this.scorch(e.x, e.y, e.radius, e.tick);
      }
      // dirt geysers throw the char wider than the crater
      else if (e.type === 'geyser') this.scorch(e.x, e.y, e.radius * 1.8, e.tick);
      else if (e.type === 'tsunami') this.scour(e.x, e.params.dir ?? 1, (e.params.len ?? 0) + 12);
      if (e.type === 'v3Burn') this.rockets.burn(e.params.id ?? -1, e.params.stage ?? 2, e.tick);
      if (e.type === 'tankDeath') this.startWreck(e.params.player ?? -1, e.tick);
      if (e.type === 'shieldHit') this.shieldHitAt[e.params.player ?? -1] = e.tick;
      else if (e.type === 'shieldUp') this.shieldUpAt[e.params.player ?? -1] = e.tick;
      else if (e.type === 'battery') this.batteryAt[e.params.player ?? -1] = e.tick;
      else if (e.type === 'shockFling') {
        // flipped by a blast underneath: tumbles end over end the way it was thrown
        const pl = e.params.player ?? -1;
        const dir = e.params.dir ?? 1;
        const rate = dir * (0.22 + ((e.tick * 7 + pl * 13) % 10) * 0.012);
        this.tumble[pl] = { rate, at: e.tick, fly: e.tick, land: -1, rest: 0 };
      } else if (e.type === 'warpOut') {
        const pr = e.params;
        this.warps[pr.player ?? -1] = {
          out: e.tick,
          outDur: Math.max(1, pr.ticks ?? 26),
          in: -1,
          inDur: 26,
          fx: e.x,
          fy: e.y,
          tx: pr.tx ?? e.x,
          ty: pr.ty ?? e.y,
        };
      } else if (e.type === 'warpIn') {
        const w = this.warps[e.params.player ?? -1];
        if (w) {
          w.in = e.tick;
          w.inDur = Math.max(1, e.params.ticks ?? 26);
          w.tx = e.x;
          w.ty = e.y;
        }
      } else if (e.type === 'shockFly') {
        const tb = this.tumble[e.params.player ?? -1];
        if (tb) tb.fly = e.tick;
      }
    }
    this.fx.lances.track(s.entities, s.tick);
    this.tagStars();
    this.updateTrails(s);
    const cues = this.water.drainCues();
    if (cues.length > 0) this.onCues?.(cues);
  }

  /** Drop every cosmetic left over from the last round, so a new map starts clean. */
  private clearRoundFx(): void {
    this.trails = [];
    this.particles.clear();
    this.fluid.clear();
    this.fx.clear();
    this.water.clear();
    this.liquid.clear();
    this.meteors.clear();
    this.rockets.clear();
    this.starColor = new Map();
    this.shieldHitAt = [];
    this.shieldUpAt = [];
    this.batteryAt = [];
    this.tumble = [];
    this.warps = [];
  }

  /**
   * Firework stars take the colour of the burst they came out of. Tagged once, after this
   * snapshot's bursts are handled, and kept by projectile id while the star flies.
   */
  private tagStars(): void {
    const shells = this.palette.shells;
    if (!shells) return;
    const prev = this.starColor;
    let next: Map<number, number> | null = null;
    for (const e of this.entities) {
      if (e.kind !== 'projectile' || shells[e.weapon]?.shell !== 'star') continue;
      next ??= new Map();
      let c = prev.get(e.id);
      if (c === undefined) {
        const found = this.fx.fireworkColor(e.x, this.fxTick, true);
        c = found < 0 ? 0xffd040 : found;
      }
      next.set(e.id, c);
    }
    this.starColor = next ?? (prev.size > 0 ? new Map() : prev);
  }

  /**
   * Gas clouds wither the grass they creep over: grass-mask cells under a puff turn from 1 (grass)
   * to 2 (withered, drawn dry and brown). Cosmetic and one-way, like the burn marks.
   */
  private witherGrass(): void {
    const m = this.grassMask;
    const w = this.mapWidth;
    const h = this.mapHeight;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    for (const z of this.zones) {
      const pf = z.puffs;
      if (!pf || pf.length === 0 || z.look !== 'toxic') continue;
      // the cloud swells over its first second; reach the grass once it has
      const r = Math.round((z.puffRadius ?? 8) * Math.min(1, 0.3 + (z.age ?? 1000) / 50));
      for (let i = 0; i < pf.length; i += 2) {
        const px = pf[i]!;
        const py = pf[i + 1]!;
        const ya = Math.max(0, py - r);
        const yb = Math.min(h - 1, py + 4);
        for (let x = Math.max(0, px - r); x <= Math.min(w - 1, px + r); x++) {
          const dx = x - px;
          for (let y = ya; y <= yb; y++) {
            const k = y * w + x;
            if (m[k] !== 1) continue;
            const dy = Math.max(0, py - y);
            if (dx * dx + dy * dy > r * r) continue;
            m[k] = 2;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
    }
    if (x0 > x1) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x0,
      y0,
      x1 - x0 + 1,
      y1 - y0 + 1,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      m,
    );
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    // re-shade the turf under it (shading reads up to 32 rows down from the surface)
    const d = this.dirty;
    const clean = d[0]! >= d[2]!;
    d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, x0 - 1));
    d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, y0 - 1));
    d[2] = Math.min(w, Math.max(clean ? -Infinity : d[2]!, x1 + 2));
    d[3] = Math.min(h, Math.max(clean ? -Infinity : d[3]!, y1 + 34));
  }

  /** A dirt wave rolled over these columns: the ground it leaves behind is bare, so no grass. */
  private scour(front: number, dir: number, len: number): void {
    const a = dir > 0 ? front - len : front - 2;
    const b = dir > 0 ? front + 2 : front + len;
    const x0 = Math.max(0, Math.floor(a));
    const x1 = Math.min(this.mapWidth, Math.ceil(b) + 1);
    if (x0 >= x1) return;
    const w = this.mapWidth;
    for (let y = 0; y < this.mapHeight; y++) this.grassMask.fill(0, y * w + x0, y * w + x1);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x0,
      0,
      x1 - x0,
      this.mapHeight,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      this.grassMask,
    );
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    const d = this.dirty;
    const clean = d[0]! >= d[2]!;
    d[0] = clean ? x0 : Math.min(d[0]!, x0);
    d[1] = 0;
    d[2] = clean ? x1 : Math.max(d[2]!, x1);
    d[3] = this.mapHeight;
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

  /** A tank just died: blow its turret off and set the hull burning (see `wreck.ts`). */
  private startWreck(player: number, tick: number): void {
    for (const e of this.entities) {
      if (e.kind !== 'tank' || e.player !== player) continue;
      const look = (e.tank && this.palette.tanks?.[e.tank]) || STANDARD_LOOK;
      const col = playerColor(player);
      this.wrecks[player] = makeWreck(
        look,
        (code) => spriteColor(code, col, false),
        player,
        e.x,
        e.y,
        e.angle,
        tick,
      );
    }
  }

  /** One cosmetic tick of every death sequence; cook-offs become small blasts. */
  private stepDeaths(): void {
    const t = this.fxTick;
    for (const e of this.entities) {
      if (e.kind !== 'tank' || e.alive) continue;
      const w = this.wrecks[e.player];
      if (!w) continue;
      const solid = (x: number, y: number) => this.probe.solid(x, y);
      const cook = stepWreck(
        w,
        t,
        e.x,
        this.tankY(e),
        solid,
        this.particles,
        this.fx.mult,
        this.mapHeight,
      );
      if (cook) this.fx.cookOff(cook.x, cook.y, cook.radius, cook.big, t);
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
    this.scanHeat((any & 6) !== 0);
    this.flameN = 0;
    if ((any & 4) === 0) return;
    // flaming cells with air above: where the flame tongues lick up from
    const w = this.mapWidth;
    for (let i = w; i < t.length && this.flameN < FLAME_CAP; i++) {
      if ((f[t[i]!]! & 4) !== 0 && t[i - w] === 0) this.flameCells[this.flameN++] = i;
    }
  }

  /** Rebuild and upload the heat field lava and flames light the ground from. */
  private scanHeat(any: boolean): void {
    if (!any && !this.heatOn) return;
    const w = this.mapWidth;
    const h = this.mapHeight;
    this.heatOn = any && heatField(this.terrain, this.coating, this.lookFlags, w, h, this.heat);
    if (!this.heatTex) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.heatTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.heat);
  }

  /** Flame tongues, sparks and black smoke rising off burning surfaces (napalm, burning oil). */
  /**
   * What pours into the smoke field each tick besides the effects' blasts: gas clouds spread
   * their dye on the wind (burning ground breathes in `stepFlames`). Then the tick itself.
   */
  private feedFluid(): void {
    const f = this.fluid;
    if (f.ok) {
      for (const z of this.zones) {
        if (z.look !== 'gas' && z.look !== 'toxic') continue;
        f.splat(z.x, z.y, z.radius * 0.8, this.wind * 20, 0, 0, 0, 0.06);
      }
    }
    f.step(this.wind);
  }

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
    // gusts: the wind comes in slow puffs, so the flames lean and stretch in licks rather than
    // a steady lean (a few seconds per puff, in hard steps)
    const puff = (Math.imul((this.fxTick >> 5) + 1, 1597334677) >>> 0) / 4294967296;
    const lick = 0.4 + puff * 1.2;
    const lean = this.wind * 50 * lick;
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
        vx: ((r & 15) - 7.5) * 0.02 + lean,
        vy: (-0.3 - (r >> 4) * 0.04) * (0.7 + lick * 0.4),
        life: 8 + (r & 7) + (lick > 1.2 ? 3 : 0),
        size: 1 + (r & 1) + ((r >> 7) & 1),
        color: 0,
        kind: PKind.Flame,
      });
      // the fire breathes heat and soot into the smoke field
      if ((r & 3) === 2) this.fluid.splat(x, y - 2, 5, 0, -0.4, 0.22, 0.5);
      // embers lift off the fire and ride the wind, more in a gust
      if ((r & 3) === 1 && (r >> 2) % 3 < (lick > 1 ? 2 : 1)) {
        this.particles.add({
          x: x + ((r >> 2) & 3) - 1.5,
          y: y - 3,
          vx: lean * 0.6 + ((r >> 4) & 3) * 0.1 - 0.15,
          vy: -0.5 - ((r >> 6) & 3) * 0.2,
          life: 30 + (r & 31),
          size: 1,
          color: (r & 8) === 0 ? 0xffd060 : 0xff7030,
          kind: PKind.Ember,
        });
      }
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
        d[0] = Math.max(0, Math.min(clean ? Infinity : d[0]!, x0 - CUT_REACH));
        d[1] = Math.max(0, Math.min(clean ? Infinity : d[1]!, by0 - 1));
        d[2] = Math.min(w, Math.max(clean ? -Infinity : d[2]!, x1 + CUT_REACH));
        d[3] = Math.min(this.mapHeight, Math.max(clean ? -Infinity : d[3]!, y1 + 32));
      }
    }
  }

  /**
   * Meteors: a dense tail of fire filled in along each tick's move, burning out into a long
   * column of black smoke, with sparks shed backwards. Waiting (hidden) meteors and the jump to
   * their entry point are skipped.
   */
  private stepMeteors(shells: Readonly<Record<string, ShellLook>>): void {
    const live = this.meteorLive;
    live.clear();
    for (const e of this.entities) {
      if (e.kind !== 'projectile') continue;
      const look = shells[e.weapon];
      if (look?.shell !== 'meteor') continue;
      live.add(e.id);
      const m = this.meteors.get(e.id);
      if (!m) {
        this.meteors.set(e.id, { x: e.x, y: e.y, dx: 0, dy: 0 });
        continue;
      }
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      const x0 = m.x;
      const y0 = m.y;
      m.x = e.x;
      m.y = e.y;
      if (dy <= 0 || dy > 24 || Math.abs(dx) > 24) {
        m.dx = 0;
        m.dy = 0;
        continue;
      }
      m.dx = dx;
      m.dy = dy;
      if (e.y < -8) continue;
      const sz = look.size ?? 1;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), dy) / 1.5));
      const mult = QUALITY_PARTICLES[this.quality].mult;
      let r = (Math.imul(this.fxTick + 1, 2654435761) ^ Math.imul(e.id + 1, 40503)) >>> 0;
      for (let i = 0; i < steps; i++) {
        r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
        const t = i / steps;
        this.particles.add({
          x: x0 + dx * t + ((r & 3) - 1.5) * 0.6 * sz,
          y: y0 + dy * t + (((r >>> 2) & 3) - 1.5) * 0.6 * sz,
          vx: -dx * 0.03,
          vy: -dy * 0.03 - 0.15,
          life: (12 + ((r >>> 4) & 15)) * (0.7 + sz * 0.3),
          size: Math.round((2 + ((r >>> 8) & 1)) * sz),
          color: 0,
          kind: PKind.Flame,
        });
        if (((r >>> 9) & 3) === 0 && mult > 0.4) {
          this.particles.add({
            x: x0 + dx * t,
            y: y0 + dy * t,
            vx: -dx * 0.12 + (((r >>> 12) & 15) - 7.5) * 0.06,
            vy: -dy * 0.12 - 0.2,
            life: 14 + ((r >>> 16) & 15),
            size: 1,
            color: (r >>> 20) & 1 ? 0xffe070 : 0xff8a20,
            kind: PKind.Spark,
          });
        }
      }
      // the smoke column it leaves hanging in the sky
      if (((r >>> 24) & 1) === 0 || sz > 1) {
        this.particles.add({
          x: x0 - dx * 0.5,
          y: y0 - dy * 0.5,
          vx: this.wind * 0.06,
          vy: -0.05,
          life: 110 + ((r >>> 25) & 63),
          size: Math.round((3 + ((r >>> 26) & 3)) * sz),
          color: (r >>> 28) & 1 ? 0x2a2428 : 0x4a4044,
          kind: PKind.Smoke,
        });
      }
    }
    for (const id of [...this.meteors.keys()]) if (!live.has(id)) this.meteors.delete(id);
  }

  private readonly meteorLive = new Set<number>();
  /** Firework star colours by projectile id (see `tagStars`). */
  private starColor = new Map<number, number>();

  /** Theme + weather + the temperature's tint (in quarter steps of storm strength). */
  private applyTheme(): void {
    const q = Math.round(Math.max(0, this.stormK) * 8) / 8;
    this.themeStep = q * (this.stormKind === 'sand' ? 1 : -1);
    this.theme = withTemperature(
      withWeather(this.baseTheme, this.weather),
      this.stormKind === 'sand' ? q : 0,
      this.stormKind === 'snow' ? q : 0,
    );
    this.dirty = [0, 0, this.mapWidth, this.mapHeight];
  }

  /** Ease the storm towards the temperature's; a change of kind dies down before it turns. */
  private stepStorm(): void {
    const st = stormFor(this.temperature);
    const k = Math.max(0, this.stormK);
    if (st.kind !== this.stormKind && k > 0) {
      this.stormK = Math.max(0, k - 0.01);
      return;
    }
    this.stormKind = st.kind;
    this.stormK = k < st.k ? Math.min(st.k, k + 0.008) : Math.max(st.k, k - 0.008);
    const step = (Math.round(this.stormK * 8) / 8) * (this.stormKind === 'sand' ? 1 : -1);
    if (step !== this.themeStep) this.applyTheme();
  }

  private stepFx(): void {
    this.stepStorm();
    this.particles.step(GRAVITY, this.wind);
    this.stepWrecks();
    this.stepDeaths();
    this.cloudX += 0.012 + this.wind * 0.004;
    emitWeather(this.particles, this.theme, this.fxTick, this.wind, this.probe, this.fx.mult);
    this.fx.wind = this.wind;
    this.fx.tick(this.fxTick);
    this.water.tick(this.entities, this.fxTick);
    this.liquid.tick(this.fxTick, this.wind, this.particles);
    this.stepFlames();
    this.feedFluid();
    // burning shells shed flames as they fly
    const shells = this.palette.shells;
    if (shells) {
      this.stepMeteors(shells);
      this.rockets.prune(this.fxTick);
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
        if (look === 'rocket' || look === 'stage') {
          this.rockets.step(
            e.id,
            e.x,
            e.y,
            look === 'stage',
            this.fxTick,
            QUALITY_PARTICLES[this.quality].mult,
          );
          continue;
        }
        if (look === 'firework') {
          // a fizzing rocket: gold sparks spat out behind it, now and then a wisp of smoke
          this.particles.add({
            x: e.x + ((r >>> 4) & 1) - 0.5,
            y: e.y + 1.5,
            vx: (((r >>> 8) & 7) - 3.5) * 0.06,
            vy: 0.25 + ((r >>> 12) & 3) * 0.08,
            life: 8 + ((r >>> 16) & 7),
            size: 1,
            color: (r >>> 20) & 1 ? 0xffd060 : 0xfff6d0,
            kind: PKind.Spark,
          });
          if ((r >>> 24) % 5 === 0) {
            this.particles.add({
              x: e.x,
              y: e.y + 2,
              vx: 0,
              vy: 0,
              life: 30,
              size: 2,
              color: 0x8a8490,
              kind: PKind.Smoke,
            });
          }
          continue;
        }
        if (look === 'star') {
          // a burning star sheds a strobing glitter tail in its colour
          if ((r >>> 20) & 1) {
            const c = this.starColor.get(e.id) ?? 0xffd040;
            this.particles.add({
              x: e.x,
              y: e.y,
              vx: 0,
              vy: 0.02,
              life: 14 + ((r >>> 12) & 7),
              size: 1,
              color: (r >>> 8) % 3 === 0 ? 0xffffff : c,
              kind: PKind.Glitter,
            });
          }
          continue;
        }
        if (look === undefined || look === 'spark') {
          // a plain shell: hot sparks spat out behind it as it flies, in its trail colour
          const tr = this.trails.find((t) => t.id === e.id);
          const vx = tr && !Number.isNaN(tr.lx) ? e.x - tr.lx : 0;
          const vy = tr && !Number.isNaN(tr.ly) ? e.y - tr.ly : 0;
          const sp = Math.hypot(vx, vy);
          const n = sp > 2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const r2 = Math.imul(r + i * 97, 2246822519) >>> 0 || 1;
            this.particles.add({
              x: e.x + (((r2 >>> 4) & 3) - 1.5) * 0.5,
              y: e.y + (((r2 >>> 8) & 3) - 1.5) * 0.5,
              vx: -vx * 0.12 + (((r2 >>> 12) & 7) - 3.5) * 0.05,
              vy: -vy * 0.12 + (((r2 >>> 16) & 7) - 3.5) * 0.05,
              life: 6 + ((r2 >>> 20) & 7),
              size: 1,
              color: (r2 >>> 24) % 3 === 0 ? 0xffffff : (shells[e.weapon]?.trailColor ?? 0xffb050),
              kind: PKind.Spark,
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
    // ricochet balls shed sparks in their heat colour
    if (shells) {
      const heat = Math.min(this.fx.heatAt(this.fxTick), RICOCHET_HEAT.length - 1);
      for (const e of this.entities) {
        if (e.kind !== 'projectile' || shells[e.weapon]?.shell !== 'ricochet') continue;
        let r = (Math.imul(this.fxTick + 7, 2654435761) ^ Math.imul(e.id + 3, 40503)) >>> 0;
        const n = 1 + (heat >> 1);
        for (let i = 0; i < n; i++) {
          r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
          this.particles.add({
            x: e.x + ((r >>> 4) & 3) - 1.5,
            y: e.y + ((r >>> 8) & 3) - 1.5,
            vx: (((r >>> 12) & 15) - 7.5) * 0.04,
            vy: (((r >>> 16) & 15) - 7.5) * 0.04,
            life: 8 + ((r >>> 20) & 7) + heat * 2,
            size: 1,
            color: (r & 3) === 0 ? 0xffffff : RICOCHET_HEAT[heat]!,
            kind: PKind.Spark,
          });
        }
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
    const shells = this.palette.shells;
    for (const e of s.entities) {
      if (e.kind !== 'projectile' || this.fx.lances.owns(e.x, e.y)) continue;
      const look = shells?.[e.weapon];
      if (look?.trail === false) continue;
      let tr = this.trails.find((t) => t.id === e.id);
      if (!tr) {
        // a new shot clears trails from earlier turns (they persist faintly until then, §3.3)
        this.trails = this.trails.filter((t) => t.turn === s.turn);
        const color = look?.trailColor ?? -1;
        tr = { id: e.id, turn: s.turn, lx: NaN, ly: NaN, cells: [], color, live: true };
        this.trails.push(tr);
      }
      tr.live = true;
      // skip wrap-around jumps
      if (!Number.isNaN(tr.lx) && Math.abs(tr.lx - e.x) <= s.width / 2) {
        this.graze(tr, e.id, e.x, e.y, s.tick);
        rasterTrail(tr.cells, tr.lx, tr.ly, e.x, e.y);
      } else rasterTrail(tr.cells, e.x, e.y, e.x, e.y);
      tr.lx = e.x;
      tr.ly = e.y;
    }
  }

  /**
   * A shell skimming the ground (moving along it, not into it) throws sparks off the surface and
   * kicks a little grit of the local material: hard 1-cell sparks in white, gold and the shell's
   * trail colour, flying out along the surface normal and forward with the shell.
   */
  private graze(tr: Trail, id: number, x: number, y: number, tick: number): void {
    const vx = x - tr.lx;
    const vy = y - tr.ly;
    const sp = Math.hypot(vx, vy);
    if (sp < 0.5) return;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const p = this.probe;
    if (p.solid(cx, cy)) return; // burrowing (diggers) or already hitting
    // solid cells within two cells, summed into an outward surface normal
    let nx = 0;
    let ny = 0;
    let hits = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if ((dx === 0 && dy === 0) || !p.solid(cx + dx, cy + dy)) continue;
        nx -= dx;
        ny -= dy;
        hits++;
      }
    }
    if (hits === 0) return;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) return;
    nx /= nl;
    ny /= nl;
    // diving straight in is an impact, not a graze
    if (-(vx * nx + vy * ny) / sp > 0.75) return;
    const col = tr.color < 0 ? this.theme.trail : tr.color;
    const ground = this.palette.materials[this.groundCellNear(cx, cy)] ?? 0x7a5a3a;
    let r = (Math.imul(tick + 13, 2654435761) ^ Math.imul(id + 5, 40503)) >>> 0;
    const n = Math.min(6, 2 + hits / 4) * this.fx.mult;
    for (let i = 0; i < n; i++) {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      const kick = 0.5 + ((r >>> 4) & 15) * 0.06;
      const fwd = 0.15 + ((r >>> 8) & 15) * 0.03;
      const side = (((r >>> 12) & 15) - 7.5) * 0.05;
      const pick = (r >>> 16) & 7;
      this.particles.add({
        x: x - nx * 0.5,
        y: y - ny * 0.5,
        vx: nx * kick + (vx / sp) * fwd * sp - ny * side,
        vy: ny * kick + (vy / sp) * fwd * sp + nx * side,
        life: 6 + ((r >>> 20) & 7),
        size: 1,
        color: pick < 2 ? 0xffffff : pick < 5 ? 0xffd860 : col,
        kind: PKind.Spark,
      });
    }
    if ((r >>> 24) & 1) {
      this.particles.add({
        x: x - nx,
        y: y - ny,
        vx: nx * 0.6 + (vx / sp) * 0.3,
        vy: ny * 0.6 - 0.4,
        life: 14 + ((r >>> 26) & 7),
        size: 1,
        color: shade(ground, 0.8 + ((r >>> 28) & 3) * 0.1),
        kind: PKind.Chunk,
      });
    }
  }

  /** Material of the nearest solid cell around (x, y), or 0. */
  private groundCellNear(x: number, y: number): number {
    const W = this.mapWidth;
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= this.mapHeight) continue;
          const m = this.terrain[yy * W + xx]!;
          if (m !== 0) return m;
        }
      }
    }
    return 0;
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────

  /** The death-zone width drawn at tick time `t`: eased from where it was to the sim's. */
  private shownZone(t: number): number {
    const k = Math.min(1, Math.max(0, (t - this.zoneGrewAt) / ZONE_CREEP_TICKS));
    const e = k * k * (3 - 2 * k);
    return this.zoneFrom + (this.deathZone - this.zoneFrom) * e;
  }

  render(time: number, held = 0): void {
    const gl = this.gl;
    this.fx.held = held;
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
    this.swirl.fill(0);
    if (distort) {
      // black holes first: a standing swirl lens round each one
      for (const s of this.fx.swirls(t)) {
        if (nRipples >= MAX_RIPPLES) break;
        this.rippleBuf[nRipples * 4] = ox + s.x * scale;
        this.rippleBuf[nRipples * 4 + 1] = oy + s.y * scale;
        this.rippleBuf[nRipples * 4 + 2] = s.r * scale;
        this.rippleBuf[nRipples * 4 + 3] = s.strength;
        this.rippleW[nRipples] = 1;
        this.swirl[nRipples] = s.twist;
        nRipples++;
      }
      for (const r of this.fx.ripples) {
        if (nRipples >= MAX_RIPPLES) break;
        const k = (t - r.start) / r.dur;
        if (k < 0 || k > 1) continue;
        this.rippleBuf[nRipples * 4] = ox + r.x * scale;
        this.rippleBuf[nRipples * 4 + 1] = oy + r.y * scale;
        this.rippleBuf[nRipples * 4 + 2] = r.maxR * Math.sqrt(k) * scale;
        this.rippleBuf[nRipples * 4 + 3] = r.strength * (1 - k);
        // a column wave keeps its width and flags itself with a negative one (see POST_FS)
        this.rippleW[nRipples] = r.column ? -r.width * scale : r.width * scale * (0.7 + 0.6 * k);
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
    this.fluid.update(this.terrainTex);
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
    // nuke whiteout; softer for players who asked their system for less motion
    gl.uniform1f(this.uBg.u_white, fx.whiteout(t) * (this.shakeOn ? 1 : 0.4));
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
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.heatTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uBg.u_heat, 8);
    gl.uniform1f(this.uBg.u_heatOn, this.heatOn ? 1 : 0);
    this.lights.clear();
    this.fx.collectLights(this.lights, t);
    gl.uniform1i(this.uBg.u_lightCount, this.lights.count);
    gl.uniform4fv(this.uBg.u_lights, this.lights.pos);
    gl.uniform3fv(this.uBg.u_lightCol, this.lights.col);
    gl.uniform1i(this.uBg.u_grassMask, 6);
    gl.uniform1i(this.uBg.u_burn, 7);
    gl.uniform1f(this.uBg.u_burnOn, this.lastBurn >= 0 && t - this.lastBurn < EMBER_TICKS ? 1 : 0);
    gl.uniform1i(this.uBg.u_terrain, 1);
    gl.uniform1i(this.uBg.u_coat, 2);
    gl.uniform1i(this.uBg.u_look, 3);
    gl.uniform1i(this.uBg.u_palette, 4);
    gl.uniform1f(this.uBg.u_time, t);
    // haze over hot ground, and over fresh craters while they cool
    const warm = this.lastBurn >= 0 && t - this.lastBurn < HAZE_TICKS;
    gl.uniform1f(this.uBg.u_haze, distort && (this.anyHot || warm) ? 1 : 0);
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
    this.fx.drawFunnels(this.normal, this.additive, t);
    this.fx.drawPosts(this.normal, t);
    this.fx.drawKaijus(this.normal, this.additive, t);
    this.fx.drawPortals(this.normal, t);
    this.drawDebris();
    this.fx.drawChunks(this.normal);
    this.drawMines(t);
    this.drawTanks(t);
    this.fx.drawGoo(this.normal, t);
    // everything so far goes under the particles, which draw straight from GPU state
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.normal.flush(view, origin, scale);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.additive.flush(view, origin, scale);
    gl.disable(gl.BLEND);
    // the smoke field sits over the ground and under the particles, sparks and shells
    this.fluid.draw(this.terrainTex, view, origin, scale);
    this.particles.draw(this.terrainTex, this.mapWidth, this.mapHeight, view, origin, scale);
    this.liquid.draw(this.normal, this.additive, t);
    this.water.draw(this.normal, t);
    this.fx.drawMushrooms(this.normal, this.additive, t);
    this.fx.drawVortices(this.normal, this.additive, t);
    this.fx.drawMagnets(this.normal, this.additive, t);
    this.fx.drawPsiWaves(this.normal, this.additive, t);
    this.fx.drawGravity(this.normal, this.additive, t);
    this.drawProjectiles();
    this.drawPreview(t);
    this.fx.drawGlows(this.additive, t);
    this.fx.drawBolts(this.additive, t);
    this.fx.lances.draw(this.additive, t);
    this.fx.ions.draw(this.additive, t);
    this.fx.drawCrystals(this.additive, t);
    drawWeather(this.normal, this.additive, th, t, this.wind, this.probe, mult);
    drawStorm(this.normal, this.stormKind, this.stormK, t, this.wind, this.probe, mult);
    // the death wall last, over smoke, sparks and weather
    drawDeathWall(
      this.normal,
      this.shownZone(t),
      t,
      {
        width: this.mapWidth,
        height: this.mapHeight,
        x0: -ox / scale,
        x1: (W - ox) / scale,
        y0: -oy / scale,
        y1: (H - oy) / scale,
      },
      Math.max(0, 1 - (t - this.zoneGrewAt) / ZONE_CREEP_TICKS),
    );
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
      gl.uniform1fv(this.uPost.u_swirl, this.swirl);
      gl.uniform3f(this.uPost.u_tint, sky[0] * 0.36, sky[1] * 0.36, sky[2] * 0.36);
      gl.uniform1f(this.uPost.u_split, split);
      gl.uniform1f(this.uPost.u_scan, scan);
      gl.uniform1f(this.uPost.u_wob, t * 0.35);
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
    let key = `${th.skyTop},${th.skyBottom},${th.clouds.cover},${th.clouds.light},${th.clouds.shadow},${th.ranges.join('/')},${this.horizon},${Math.floor(this.cloudX / 2)},${Math.floor(this.fxTick / 10)}`;
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
    // the clouds boil in slow steps: the scenery repaints every ten ticks for it
    gl.uniform1f(u.u_boil, Math.floor(this.fxTick / 10));
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

  /**
   * Shell trails on the pixel grid, in the weapon type's colour (§2a: no smooth lines). A live
   * trail runs in hard bands back from the shell: a few white-hot cells, full colour, a dimmer
   * shade, then a checkerboard dither. Trails of finished shots stay as a faint dither until the
   * next shot.
   */
  private drawTrails(): void {
    const b = this.normal;
    for (const tr of this.trails) {
      const col = tr.color < 0 ? this.theme.trail : tr.color;
      const hot = mix(col, 0xffffff, 0.6);
      const dim = shade(col, 0.7);
      const c = tr.cells;
      const n = c.length >> 1;
      for (let i = 0; i < n; i++) {
        const x = c[i * 2]!;
        const y = c[i * 2 + 1]!;
        const back = n - 1 - i;
        if (!tr.live) {
          if (((x + y) & 1) === 0) b.push(x + 0.5, y + 0.5, 1, 1, dim, 0.45);
        } else if (back < TRAIL_HOT) b.push(x + 0.5, y + 0.5, 1, 1, hot, 0.95);
        else if (back < TRAIL_FULL) b.push(x + 0.5, y + 0.5, 1, 1, col, 0.8);
        else if (back < TRAIL_DIM) b.push(x + 0.5, y + 0.5, 1, 1, dim, 0.6);
        else if (((x + y) & 1) === 0) b.push(x + 0.5, y + 0.5, 1, 1, dim, 0.5);
      }
    }
  }

  private drawDebris(): void {
    const d = this.debris;
    const pal = this.palette.materials;
    for (let i = 0; i < d.count; i++) {
      const x = Math.floor(d.x[i]! / FP);
      const y = Math.floor(d.y[i]! / FP);
      // a stable per-particle hash (debris never changes its sideways speed in flight) picks one
      // of a few hard shade bands, and makes one in sixteen a 2×2 clod, so a shower reads as
      // grit and clods instead of one flat colour
      const h = Math.imul(d.vx[i]! ^ (d.material[i]! << 20), 0x9e3779b1) >>> 27;
      const col = shade(pal[d.material[i]!] ?? 0x7a5a3a, DEBRIS_SHADES[h & 3]!);
      if (h >= 30) this.normal.push(x + 1, y + 1, 2, 2, col, 1);
      else this.normal.push(x + 0.5, y + 0.5, 1, 1, col, 1);
    }
  }

  /**
   * Black Hole Mines: a squat dark dome on the ground with a black eye, two violet cells orbiting
   * it, and once armed a slow blinking light and a dotted ring marking how close is too close.
   */
  private drawMines(t: number): void {
    const n = this.normal;
    const a = this.additive;
    for (const e of this.entities) {
      if (e.kind !== 'mine') continue;
      const x = e.x + 0.5;
      const y = e.y + 0.5;
      // dome: 7 wide at the ground, 5 above, 3 on top; lit cells top-left
      n.push(x, y, 7, 1, 0x1a1226, 1);
      n.push(x, y - 1, 5, 1, 0x2a1d40, 1);
      n.push(x, y - 2, 3, 1, 0x3a2a58, 1);
      n.push(x - 2, y - 1, 1, 1, 0x6a54a0, 1);
      n.push(x - 1, y - 2, 1, 1, 0x8a74c8, 1);
      // the eye: a black cell ringed in violet, breathing slowly
      const breathe = Math.floor(t / 12 + e.id) % 4 === 0 ? 1 : 0.6;
      a.push(x, y - 1, 3, 1, 0x8040ff, 0.5 * breathe);
      n.push(x, y - 1, 1, 1, 0x000000, 1);
      // two cells orbiting the eye, snapped to whole cells
      for (let k = 0; k < 2; k++) {
        const ang = t * 0.12 + e.id * 1.7 + k * Math.PI;
        const ox = Math.round(Math.cos(ang) * 5);
        const oy = Math.round(Math.sin(ang) * 2) - 2;
        if (this.probe.solid(e.x + ox, e.y + oy)) continue;
        a.push(x + ox, y + oy, 1, 1, k === 0 ? 0xd0b0ff : 0x7a48ff, 0.9);
      }
      if (!e.armed) continue;
      // armed: a light that blinks once a second and a dotted ring at the trip distance
      if ((t + e.id * 7) % 40 < 5) {
        a.push(x, y - 3, 1, 1, 0xff60d0, 1);
        a.push(x, y - 3, 3, 3, 0xff40c0, 0.35, Shape.Pixel);
      }
      const r = e.radius;
      const steps = Math.max(16, Math.round(r * 1.6));
      const spin = Math.floor(t / 6) % 2;
      for (let s = spin; s < steps; s += 2) {
        const ang = (s / steps) * Math.PI * 2;
        const rx = Math.round(e.x + Math.cos(ang) * r);
        const ry = Math.round(e.y - 2 + Math.sin(ang) * r);
        if (this.probe.solid(rx, ry)) continue;
        a.push(rx + 0.5, ry + 0.5, 1, 1, 0x9058ff, 0.45);
      }
    }
  }

  /** Light on a tank from this frame's blasts and nearby lava or flames, banded like the ground. */
  private tankLight(x: number, y: number): [number, number, number] {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const l = lightAt(this.lights, xi, yi, this.lightTmp);
    if (this.heatOn && xi >= 0 && yi >= 0 && xi < this.mapWidth && yi < this.mapHeight) {
      const q = band(heatFalloff(this.heat[yi * this.mapWidth + xi]!) * HEAT_STRENGTH, xi, yi);
      l[0] += HEAT_RGB[0] * q;
      l[1] += HEAT_RGB[1] * q;
      l[2] += HEAT_RGB[2] * q;
    }
    return l;
  }

  private drawTanks(t: number): void {
    const b = this.normal;
    const looks = this.palette.tanks;
    for (const w of this.wrecks) if (w) drawTurret(b, w, t);
    for (const e of this.entities) {
      if (e.kind !== 'tank') continue;
      const x = e.x;
      const y = this.tankY(e);
      const col = playerColor(e.player);
      const look = (e.tank && looks?.[e.tank]) || STANDARD_LOOK;
      const rows = look.sprite;
      const sw = rows[0]?.length ?? 0;
      const sh = rows.length;
      const x0 = x - (sw >> 1);
      const y0 = y - sh;
      const lit = this.tankLight(x, y - (sh >> 1));
      if (!e.alive) {
        const w = this.wrecks[e.player];
        if (w) {
          drawHull(b, w, x, y, t);
        } else {
          // a flattened wreck as wide as the tank (died before this renderer saw it)
          b.rect(x0 + 1, y - 3, sw - 2, 3, litColor(0x2a2426, lit));
          b.rect(x - 4, y - 5, 7, 2, litColor(0x1d191b, lit));
        }
        continue;
      }
      const wp = this.warps[e.player];
      if (wp) {
        const shielded = e.shield > 0;
        const paint = (code: number) => litColor(spriteColor(code, col, shielded), lit);
        if (drawWarp(b, wp, rows, x, y, e.player, t, paint)) continue;
        this.warps[e.player] = null;
      }
      const spin = e.alive ? this.tumbleAngle(e.player, t) : 0;
      if (spin !== 0) {
        this.drawTumbling(e, look, x, y, spin, lit, col, t);
        continue;
      }
      // the tank leans with the ground: each sprite column drops by whole cells (a pixel shear)
      const tilt = this.tankTilt(x0, y, sw);
      const lean = (c: number) => Math.round(tilt.slope * (c - tilt.pivot));
      // barrel first, so the turret covers its base; whole cells along the aim
      const br = look.barrel;
      const a = (e.angle * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = x + br.x;
      const py = y - br.y + lean(br.x + (sw >> 1));
      const off = br.width >> 1;
      for (let i = 1; i <= br.length; i++) {
        const cx = Math.round(px + ca * i);
        const cy = Math.round(py - sa * i);
        b.rect(
          cx - off,
          cy - off,
          br.width,
          br.width,
          litColor(i === br.length ? 0xa8a298 : 0xd8d2c8, lit),
        );
      }
      const shieldOn = e.shield > 0;
      for (let r = 0; r < sh; r++) {
        const row = rows[r]!;
        for (let c = 0; c < sw; c++) {
          const code = row.charCodeAt(c);
          if (code === 46) continue; // '.'
          b.rect(x0 + c, y0 + r + lean(c), 1, 1, litColor(spriteColor(code, col, shieldOn), lit));
        }
      }
      if (shieldOn) this.drawShield(e, x, y, sw, sh, t);
      this.coverTank(x, y, sw, sh);
      if (e.chute) this.drawChute(e.player, x, y0, t);
      const charged = t - (this.batteryAt[e.player] ?? -1e9);
      if (charged < BATTERY_TICKS) this.drawCharge(x, y0, charged);
      if (e.chill > 0) this.frostTank(x, y, t);
      if (e.glue > 0) this.glueTank(x, y, sw, y0, t, e.chill > 0);
      if ((e.rust ?? 0) > 0) {
        this.rustTank(x, y, sw, sh, y0, lean, t, (e.chill > 0 ? 1 : 0) + (e.glue > 0 ? 1 : 0));
      }
      if ((e.mind ?? 0) > 0) this.mindTank(e, x, y, sw, sh, y0, t);
      if ((e.jam ?? 0) > 0) {
        const marks = (e.chill > 0 ? 1 : 0) + (e.glue > 0 ? 1 : 0) + ((e.rust ?? 0) > 0 ? 1 : 0);
        this.jamTank(x, sw, sh, y0, lean, t, e.player, marks);
      }
      if ((e.mark ?? 0) > 0) this.markTank(x, y, sw, sh, t, playerColor(e.markBy ?? 0));
      // player number beside the health bar, so tanks never differ by colour alone (§8)
      const top = y0;
      this.drawDigit(x - 13, top - 7, e.player + 1);
      // health bar (and the shield left, above it)
      const hp = Math.max(0, Math.min(1, e.health / Math.max(1, e.maxHealth)));
      b.rect(x - 8, top - 5, 16, 1.6, 0x000000, 0.55);
      b.rect(x - 8, top - 5, 16 * hp, 1.6, hp > 0.5 ? 0x5ad35a : hp > 0.25 ? 0xf0c040 : 0xe04040);
      if (e.maxShield > 0) {
        const sp = Math.max(0, Math.min(1, e.shield / e.maxShield));
        b.rect(x - 8, top - 7, 16, 1, 0x000000, 0.55);
        if (sp > 0) b.rect(x - 8, top - 7, Math.max(1, Math.round(16 * sp)), 1, SHIELD_RGB);
      }
      if (e.active) {
        const bob = Math.sin(t * 0.12) * 1.2;
        b.push(x + 0.5, top - 10 + bob, 3.2, 3.2, col, 1, Shape.Rect, Math.PI / 4);
        b.push(x + 0.5, top - 10 + bob, 1.4, 1.4, 0xffffff, 0.9, Shape.Rect, Math.PI / 4);
      }
    }
  }

  /**
   * A mind-linked tank (Telepathy): the psychic aura and eye mark, and while its caster is at the
   * controls, the tether of sparks from the caster's tank.
   */
  private mindTank(
    e: TankView,
    x: number,
    y: number,
    sw: number,
    sh: number,
    top: number,
    t: number,
  ): void {
    const by = e.mindBy ?? -1;
    let caster: TankView | undefined;
    for (const o of this.entities) {
      if (o.kind === 'tank' && o.player === by && o.alive) caster = o;
    }
    const steered = e.active && caster !== undefined;
    const marks =
      (e.chill > 0 ? 1 : 0) +
      (e.glue > 0 ? 1 : 0) +
      ((e.rust ?? 0) > 0 ? 1 : 0) +
      ((e.jam ?? 0) > 0 ? 1 : 0);
    drawPsiAura(
      this.normal,
      this.additive,
      x,
      y - (sh >> 1),
      sw >> 1,
      top,
      t,
      steered,
      x + 10 + marks * 8,
    );
    if (steered && caster) {
      const solid = (cx: number, cy: number) => this.probe.solid(cx, cy);
      drawPsiTether(
        this.normal,
        this.additive,
        caster.x,
        this.tankY(caster) - 9,
        x,
        top - 2,
        t,
        solid,
      );
    }
  }

  /** A thrown tank's tumble angle now (0 = upright; eases back upright after landing). */
  private tumbleAngle(player: number, t: number): number {
    const tb = this.tumble[player];
    if (!tb) return 0;
    if (t <= tb.fly + 1) return tb.rate * (t - tb.at);
    if (tb.land < 0) {
      tb.land = t;
      // come to rest on its tracks: finish the turn it's in (or fall back), whichever is nearer
      const a = tb.rate * (tb.fly + 1 - tb.at);
      const turn = Math.PI * 2;
      tb.rest = a - Math.round(a / turn) * turn;
    }
    const k = (t - tb.land) / 8;
    if (k >= 1) {
      this.tumble[player] = null;
      return 0;
    }
    // a hard settle in whole steps, not a smooth ease
    return tb.rest * (1 - Math.floor(k * 4) / 4);
  }

  /**
   * A tumbling tank: the sprite rotated about its middle by sampling it back from each screen
   * cell (nearest cell, so it stays crisp pixels with no holes), barrel and all.
   */
  private drawTumbling(
    e: TankView,
    look: typeof STANDARD_LOOK,
    x: number,
    y: number,
    ang: number,
    lit: [number, number, number],
    col: number,
    t: number,
  ): void {
    const b = this.normal;
    const rows = look.sprite;
    const sw = rows[0]?.length ?? 0;
    const sh = rows.length;
    const cx = x;
    const cy = y - sh / 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // barrel: its base and aim turn with the hull
    const br = look.barrel;
    const bx = br.x;
    const by = -br.y + sh / 2;
    const bpx = cx + bx * ca - by * sa;
    const bpy = cy + bx * sa + by * ca;
    const aim = (e.angle * Math.PI) / 180;
    const dx = Math.cos(aim);
    const dy = -Math.sin(aim);
    const rdx = dx * ca - dy * sa;
    const rdy = dx * sa + dy * ca;
    const off = br.width >> 1;
    for (let i = 1; i <= br.length; i++) {
      b.rect(
        Math.round(bpx + rdx * i) - off,
        Math.round(bpy + rdy * i) - off,
        br.width,
        br.width,
        litColor(i === br.length ? 0xa8a298 : 0xd8d2c8, lit),
      );
    }
    const shieldOn = e.shield > 0;
    const R = Math.ceil(Math.hypot(sw, sh) / 2) + 1;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    for (let py = y0 - R; py <= y0 + R; py++) {
      for (let px = x0 - R; px <= x0 + R; px++) {
        // screen cell centre back into sprite space
        const ux = px + 0.5 - cx;
        const uy = py + 0.5 - cy;
        const sx = Math.floor(ux * ca + uy * sa + sw / 2);
        const sy = Math.floor(-ux * sa + uy * ca + sh / 2);
        if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
        const code = rows[sy]!.charCodeAt(sx);
        if (code === 46) continue;
        b.rect(px, py, 1, 1, litColor(spriteColor(code, col, shieldOn), lit));
      }
    }
    if (shieldOn) this.drawShield(e, x, y, sw, sh, t);
    const top = y - sh;
    this.drawDigit(x - 13, top - 7, e.player + 1);
    const hp = Math.max(0, Math.min(1, e.health / Math.max(1, e.maxHealth)));
    b.rect(x - 8, top - 5, 16, 1.6, 0x000000, 0.55);
    b.rect(x - 8, top - 5, 16 * hp, 1.6, hp > 0.5 ? 0x5ad35a : hp > 0.25 ? 0xf0c040 : 0xe04040);
  }

  /**
   * A shield is a dithered band of whole cells hugging the tank: a checkerboard that crawls with
   * time, fainter as the shield wears down and bright for a moment after it soaks a hit.
   */
  private drawShield(e: TankView, x: number, y: number, sw: number, sh: number, t: number): void {
    const b = this.normal;
    const rx = (sw >> 1) + 2;
    const ry = sh + 2;
    const hit = Math.max(this.shieldHitAt[e.player] ?? -1e9, this.shieldUpAt[e.player] ?? -1e9);
    const flash = t - hit < 18 ? 1 - (t - hit) / 18 : 0;
    // switching a shield on: a band of whole cells sweeps up over the tank first
    const up = t - (this.shieldUpAt[e.player] ?? -1e9);
    if (up >= 0 && up < 24) {
      const rowY = y - Math.floor(((sh + 4) * up) / 24);
      const half = (sw >> 1) + 2;
      for (let cx = x - half; cx <= x + half; cx++) {
        b.rect(cx, rowY, 1, 1, (cx & 1) === 0 ? 0xe8fbff : SHIELD_RGB, 0.9);
      }
    }
    const left = e.shield / Math.max(1, e.maxShield);
    const alpha = Math.min(1, 0.3 + 0.4 * left + 0.6 * flash);
    const phase = Math.floor(t / 8);
    for (let cy = y - ry - 1; cy < y; cy++) {
      const dy = (cy + 0.5 - y) / ry;
      for (let cx = x - rx - 1; cx <= x + rx; cx++) {
        const dx = (cx + 0.5 - x) / rx;
        const d = dx * dx + dy * dy;
        if (d < 0.78 || d > 1.06) continue;
        if (((cx + cy + phase) & 1) !== 0 && flash === 0) continue;
        b.rect(cx, cy, 1, 1, flash > 0 ? 0xe8fbff : SHIELD_RGB, alpha);
      }
    }
  }

  /**
   * An open parachute (gear, §5.1): a stepped dome of whole cells in the player's colour with
   * white panels, swaying a cell either way, on four cords down to the hull.
   */
  private drawChute(player: number, x: number, top: number, t: number): void {
    const b = this.normal;
    const col = playerColor(player);
    const sway = Math.round(Math.sin(t * 0.08));
    const cx = x + sway;
    // high enough to clear the player number and health bar
    const cy = top - 9 - CHUTE.length - 6;
    for (let r = 0; r < CHUTE.length; r++) {
      const row = CHUTE[r]!;
      const x0 = cx - (row.length >> 1);
      for (let c = 0; c < row.length; c++) {
        const code = row[c];
        if (code === '.') continue;
        b.rect(
          x0 + c,
          cy + r,
          1,
          1,
          code === 'w' ? 0xf2efe6 : code === 'd' ? 0x000000 : col,
          code === 'd' ? 0.35 : 1,
        );
      }
    }
    // cords: whole cells from the canopy's rim to the hull top
    const bottom = cy + CHUTE.length;
    for (const [from, to] of CHUTE_CORDS) {
      const steps = top - bottom;
      for (let i = 0; i <= steps; i++) {
        const px = Math.round(cx + from + ((to - from - sway) * i) / Math.max(1, steps));
        b.rect(px, bottom + i, 1, 1, 0xcfc8b8, 0.85);
      }
    }
  }

  /** Battery (gear, §5.1): green plus signs climb off the hull for a moment, in whole cells. */
  private drawCharge(x: number, top: number, age: number): void {
    const b = this.normal;
    const fade = 1 - age / BATTERY_TICKS;
    for (let k = 0; k < 3; k++) {
      const a = age - k * 8;
      if (a < 0) continue;
      const px = x - 6 + k * 6;
      const py = top - 2 - Math.floor(a / 3);
      b.rect(px, py - 1, 1, 3, 0x7cf07c, fade);
      b.rect(px - 1, py, 3, 1, 0x7cf07c, fade);
    }
  }

  /**
   * A frosted tank (Frost Bomb): rimed hull and dome, icicles hanging off the hull, a glint that
   * hops around in whole steps, and a snowflake mark beside the health bar so the state reads
   * without colour.
   */
  private frostTank(x: number, y: number, t: number): void {
    const b = this.normal;
    b.rect(x - 7, y - 6, 14, 3, 0xd6ecfa, 0.55);
    b.rect(x - 7, y - 6, 14, 1, 0xffffff, 0.8);
    b.push(x + 0.5, y - 7, 7, 5, 0xe6f6ff, 0.45, Shape.Disc);
    for (let i = 0; i < ICICLES.length; i += 2) {
      b.rect(x + ICICLES[i]!, y - 3, 1, ICICLES[i + 1]!, 0xe6f6ff, 0.95);
    }
    const st = Math.floor(t / 9);
    const gx = x - 7 + ((st * 5 + x) % 14);
    const gy = y - 6 - ((st * 3) % 3);
    b.rect(gx, gy, 1, 1, 0xffffff);
    // snowflake: a 5×5 plus with diagonal tips, right of the health bar
    const sx = x + 10;
    const sy = y - 16;
    b.rect(sx - 1, sy - 1, 7, 7, 0x000000, 0.6);
    b.rect(sx + 2, sy, 1, 5, 0xbfe4fa);
    b.rect(sx, sy + 2, 5, 1, 0xbfe4fa);
    b.rect(sx, sy, 1, 1, 0xbfe4fa);
    b.rect(sx + 4, sy, 1, 1, 0xbfe4fa);
    b.rect(sx, sy + 4, 1, 1, 0xbfe4fa);
    b.rect(sx + 4, sy + 4, 1, 1, 0xbfe4fa);
    b.rect(sx + 2, sy + 2, 1, 1, 0xffffff);
  }

  /**
   * A rusted tank (Thunderstorm): dithered rust blotches eat over the hull in hard bands (the same
   * cells every frame, so it reads as a coat, not noise), a flake now and then drops off the hull,
   * and a rust mark sits beside the health bar (after any frost and glue marks) so the state reads
   * without colour.
   */
  private rustTank(
    x: number,
    y: number,
    sw: number,
    sh: number,
    top: number,
    lean: (c: number) => number,
    t: number,
    marks: number,
  ): void {
    const b = this.normal;
    const x0 = x - (sw >> 1);
    for (let r = 0; r < sh; r++) {
      for (let c = 0; c < sw; c++) {
        const k = (c * 7 + r * 13 + ((c * r) % 5)) % 9;
        if (k > 3) continue;
        b.rect(x0 + c, top + r + lean(c), 1, 1, RUST[k & 3]!, k === 0 ? 0.95 : 0.75);
      }
    }
    // a flake works loose and drops off the hull, one cell a step
    const ph = t % 48;
    if (ph < 12) {
      const fc = (Math.floor(t / 48) * 5 + x) % sw;
      b.rect(x0 + fc, top + sh - 1 + lean(fc) + (ph >> 1), 1, 1, RUST[1]!);
    }
    // rust mark: a 5×5 pitted plate right of the health bar
    const sx = x + 10 + marks * 8;
    const sy = top - 7;
    b.rect(sx - 1, sy - 1, 7, 7, 0x000000, 0.6);
    b.rect(sx, sy, 5, 5, RUST[1]!);
    b.rect(sx, sy, 5, 1, RUST[3]!);
    b.rect(sx + 1, sy + 2, 1, 1, RUST[0]!);
    b.rect(sx + 3, sy + 1, 1, 1, RUST[0]!);
    b.rect(sx + 2, sy + 3, 2, 1, RUST[0]!);
  }

  /**
   * A spotted tank (Spotter Flare): a reticle of four hard corner brackets in the marker's colour
   * that tightens in on the hull in whole-cell steps and snaps back, with a red dot on the hull.
   */
  private markTank(x: number, y: number, sw: number, sh: number, t: number, color: number): void {
    const b = this.additive;
    const k = (t >> 3) % 4;
    const gap = 5 - k;
    const x0 = x - (sw >> 1) - gap;
    const x1 = x + (sw >> 1) + gap - 1;
    const y0 = y - sh - gap;
    const y1 = y + gap - 1;
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ] as const) {
      b.push(cx + 0.5, cy + 0.5, 1, 1, 0xffffff, 1);
      b.push(cx + dx + 0.5, cy + 0.5, 1, 1, color, 1);
      b.push(cx + 2 * dx + 0.5, cy + 0.5, 1, 1, color, 1);
      b.push(cx + 0.5, cy + dy + 0.5, 1, 1, color, 1);
      b.push(cx + 0.5, cy + 2 * dy + 0.5, 1, 1, color, 1);
    }
    if (((t >> 2) & 1) === 0) b.push(x + 0.5, y - (sh >> 1) + 0.5, 1, 1, 0xff3030, 1);
  }

  /**
   * The Spotter Flare aim preview: the whole flight path as aimed, a dashed line of cells in
   * the team colour with white beads marching along it, and a cross where it lands.
   */
  private drawPreview(t: number): void {
    const p = this.preview;
    if (!p || p.length < 4) return;
    const b = this.additive;
    const active = this.entities.find((e) => e.kind === 'tank' && e.active);
    const color = active?.kind === 'tank' ? playerColor(active.player) : 0xffffff;
    const n = p.length >> 1;
    // a dashed line through every cell the shell crosses (two on, one off), with white 2×2 beads
    // every twelfth cell marching along it
    const phase = (t >> 1) % 12;
    let k = 0;
    for (let i = 1; i < n; i++) {
      const x0 = p[i * 2 - 2]!;
      const y0 = p[i * 2 - 1]!;
      const dx = p[i * 2]! - x0;
      const dy = p[i * 2 + 1]! - y0;
      const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
      for (let j = 0; j < steps; j++, k++) {
        const px = x0 + Math.round((dx * j) / steps);
        const py = y0 + Math.round((dy * j) / steps);
        if (py < 0) continue;
        if (k % 12 === phase) b.push(px + 1, py + 1, 2, 2, 0xffffff, 0.95);
        else if (k % 3 !== 2) b.push(px + 0.5, py + 0.5, 1, 1, color, 0.7);
      }
    }
    const ex = p[(n - 1) * 2]! + 0.5;
    const ey = p[(n - 1) * 2 + 1]! + 0.5;
    b.push(ex, ey, 5, 1, 0xffffff, 0.9);
    b.push(ex, ey, 1, 5, 0xffffff, 0.9);
    b.push(ex, ey, 1, 1, color, 1);
  }

  /**
   * A jammed tank (Shield Breaker EMP): its electrics are fried. Now and then a fork of blue-white
   * static crawls over the hull a cell at a time and a spark spits off it, and a lightning mark
   * sits beside the health bar (after any frost, glue and rust marks).
   */
  private jamTank(
    x: number,
    sw: number,
    sh: number,
    top: number,
    lean: (c: number) => number,
    t: number,
    player: number,
    marks: number,
  ): void {
    const g = this.additive;
    const x0 = x - (sw >> 1);
    const ph = (t + player * 17) % 40;
    if (ph < 10) {
      // a crawl of static: three cells hopping along the hull
      const c0 = (Math.floor((t + player * 17) / 40) * 7 + ph * 2) % sw;
      for (let k = 0; k < 3; k++) {
        const c = (c0 + k) % sw;
        const r = (c * 5 + ph + k) % Math.max(1, sh - 1);
        g.push(x0 + c + 0.5, top + r + lean(c) + 0.5, 1, 1, k === 1 ? 0xffffff : 0x70d0ff, 1);
      }
      if (ph === 4) g.push(x0 + c0 + 0.5, top - 1.5, 1, 1, 0xa0e8ff, 1);
    }
    // jam mark: a black plate with a blue zig-zag bolt, right of the health bar
    const b = this.normal;
    const sx = x + 10 + marks * 8;
    const sy = top - 7;
    b.rect(sx - 1, sy - 1, 7, 7, 0x000000, 0.6);
    b.rect(sx, sy, 5, 5, 0x1a2438);
    const bolt = (t >> 3) & 1 ? 0xffffff : 0x70d0ff;
    b.rect(sx + 3, sy, 1, 1, bolt);
    b.rect(sx + 2, sy + 1, 1, 1, bolt);
    b.rect(sx + 1, sy + 2, 3, 1, bolt);
    b.rect(sx + 2, sy + 3, 1, 1, bolt);
    b.rect(sx + 1, sy + 4, 1, 1, bolt);
  }

  /**
   * A glued tank (Glue Bomb): a puddle of cream goo under it, dithered goo gumming the treads, gobs
   * on the hull, strings and drips at the hull ends that stretch in whole cells, and a drop mark
   * beside the health bar (next to the frost mark if both) so the state reads without colour.
   */
  private glueTank(
    x: number,
    y: number,
    sw: number,
    top: number,
    t: number,
    frosted: boolean,
  ): void {
    const b = this.normal;
    const half = sw >> 1;
    // puddle the tank sits in, wider than the hull, with a few lit cells
    b.rect(x - half - 3, y - 1, sw + 6, 1, GLUE[2]);
    for (let c = -half - 2; c < half + 3; c += 5) b.rect(x + c, y - 1, 1, 1, GLUE[0]);
    // goo gumming the treads: a dithered row, so the tank's own colour still shows through
    const ph = (t >> 4) & 1;
    for (let c = 0; c < sw; c++) {
      if ((c + ph) % 3 !== 0) b.rect(x - half + c, y - 2, 1, 1, GLUE[1]);
    }
    // gobs on the hull, and strings from the hull ends down into the puddle
    b.rect(x - 3, top + 4, 2, 1, GLUE[1]);
    b.rect(x + 2, top + 5, 1, 1, GLUE[0]);
    b.rect(x - half - 1, y - 4, 1, 3, GLUE[1]);
    b.rect(x + half, y - 4, 1, 3, GLUE[1]);
    // drips off the hull ends: stretch a cell at a time, then snap back
    for (let i = 0; i < 2; i++) {
      const len = 1 + (((t >> 3) + i * 2) % 3);
      const dx = i === 0 ? -half - 2 : half + 1;
      b.rect(x + dx, y - 3, 1, len, GLUE[2]);
    }
    // drop mark: a 5×6 teardrop right of the health bar
    const sx = x + (frosted ? 18 : 10);
    const sy = top - 7;
    b.rect(sx - 1, sy - 1, 7, 8, 0x000000, 0.6);
    b.rect(sx + 2, sy, 1, 1, GLUE[1]);
    b.rect(sx + 1, sy + 1, 3, 2, GLUE[1]);
    b.rect(sx, sy + 3, 5, 2, GLUE[2]);
    b.rect(sx + 1, sy + 5, 3, 1, GLUE[3]);
    b.rect(sx + 1, sy + 3, 1, 1, GLUE[0]);
  }

  /**
   * How a tank standing at row `y` across columns `x0…x0+sw-1` leans: the ground's slope between
   * its two ends (cells per column, at most about 22°), pivoting on the end that stands highest.
   * The sim keeps tanks level on their highest support; this is only how they are drawn.
   */
  private tankTilt(x0: number, y: number, sw: number): { slope: number; pivot: number } {
    const ground = (cx: number): number => {
      const c = Math.max(0, Math.min(this.mapWidth - 1, cx));
      const bottom = Math.min(this.mapHeight, y + 12);
      for (let r = Math.max(0, y - 6); r < bottom; r++) {
        if (this.terrain[r * this.mapWidth + c] !== 0) return r;
      }
      return bottom;
    };
    const l = ground(x0);
    const r = ground(x0 + sw - 1);
    if (l === r || sw < 2) return { slope: 0, pivot: 0 };
    const slope = Math.max(-0.4, Math.min(0.4, (r - l) / (sw - 1)));
    // pivot on the high end, so it stays planted while the low end drops to its ground
    return { slope, pivot: r > l ? 0 : sw - 1 };
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
  private coverTank(x: number, y: number, sw: number, sh: number): void {
    const b = this.normal;
    const w = this.mapWidth;
    const x0 = x - (sw >> 1);
    for (let cy = Math.max(0, y - sh); cy < Math.min(this.mapHeight, y); cy++) {
      for (let cx = Math.max(0, x0); cx < Math.min(w, x0 + sw); cx++) {
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
      if (e.kind !== 'projectile' || this.fx.lances.owns(e.x, e.y)) continue;
      const look = shells?.[e.weapon];
      if (look?.shell === 'ricochet') {
        this.drawRicochetBall(e.x, e.y, e.id);
        continue;
      }
      if (look?.shell === 'meteor') {
        this.drawMeteor(e.id, e.x, e.y, look.size ?? 1);
        continue;
      }
      if (look?.shell === 'plasma') {
        // a small ball of plasma: violet body, blue ring cells flickering round, a white heart
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        this.normal.push(x, y, 3, 3, 0x6a4cff, 1);
        const k = (this.fxTick + e.id) % 4;
        this.normal.push(
          x + (k === 0 ? 2 : k === 2 ? -2 : 0),
          y + (k === 1 ? 2 : k === 3 ? -2 : 0),
          1,
          1,
          0x4ac0ff,
          1,
        );
        g.push(x, y, 1, 1, 0xe8fcff, 1);
        continue;
      }
      if (look?.shell === 'vapor') {
        this.drawVapor(e.x, e.y, e.id);
        continue;
      }
      if (look?.shell === 'rail') {
        // a railgun slug: a white-hot cell in a cyan glint that flickers between a bar and a plus
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        const k = (this.fxTick + e.id) & 1;
        g.push(x, y, k === 0 ? 5 : 1, k === 0 ? 1 : 5, 0x60e0ff, 0.9);
        g.push(x, y, 3, 3, 0x60e0ff, 0.5, Shape.Pixel);
        g.push(x, y, 1, 1, 0xffffff, 1);
        continue;
      }
      if (look?.shell === 'fire') {
        // a burning gob: orange body, yellow-white heart
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        g.push(x, y, 7, 7, 0xff6a14, 0.55, Shape.Pixel);
        this.normal.push(x, y, 3, 3, 0xff8a20, 1);
        g.push(x, y, 1, 1, 0xfff0a0, 1);
        continue;
      }
      if (look?.shell === 'psi') {
        drawPsiShell(this.normal, g, e.x, e.y, e.id, this.fxTick);
        continue;
      }
      if (look?.shell === 'glue') {
        // a wobbling glob of glue: cream body that squashes and stretches, a lit cell on top
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        const wob = (this.fxTick >> 2) & 1;
        this.normal.push(x, y, 4 - wob, 3 + wob, GLUE[2], 1);
        this.normal.push(x, y + 1, 2, 1, GLUE[3], 1);
        this.normal.push(x - 0.5, y - 1, 1, 1, GLUE[0], 1);
        continue;
      }
      if (look?.shell === 'rocket') {
        this.rockets.drawRocket(e.id, e.x, e.y, this.fxTick, g, this.normal);
        continue;
      }
      if (look?.shell === 'stage') {
        this.rockets.drawStage(e.id, e.x, e.y, this.fxTick, this.normal);
        continue;
      }
      if (look?.shell === 'firework') {
        // a rocket: white-hot head over a gold body
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        g.push(x, y + 1, 1, 2, 0xffa030, 1);
        g.push(x, y, 1, 1, 0xffffff, 1);
        continue;
      }
      if (look?.shell === 'star') {
        // a burning star: one hot cell in its colour, flaring into a plus every few ticks
        const x = Math.floor(e.x) + 0.5;
        const y = Math.floor(e.y) + 0.5;
        const c = this.starColor.get(e.id) ?? 0xffd040;
        if (((this.fxTick + e.id) & 3) === 0) {
          g.push(x, y, 3, 1, c, 0.8);
          g.push(x, y, 1, 3, c, 0.8);
        }
        g.push(x, y, 1, 1, ((this.fxTick + e.id) & 7) === 0 ? 0xffffff : c, 1);
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
      // a plain shell: a halo, a 2-cell body with a lit cell spinning round it, white-hot heart
      const x = Math.floor(e.x) + 0.5;
      const y = Math.floor(e.y) + 0.5;
      const spin = (this.fxTick + e.id) & 3;
      const sx = spin === 0 ? 1 : spin === 2 ? -1 : 0;
      const sy = spin === 1 ? 1 : spin === 3 ? -1 : 0;
      g.push(e.x, e.y, 6, 6, look?.trailColor ?? 0xff9a40, 0.6, Shape.Pixel);
      this.normal.push(x, y, 2, 2, look?.trailColor ?? 0xff9a40, 1);
      g.push(x + sx, y + sy, 1, 1, 0xffe0a0, 0.9);
      g.push(x, y, 1, 1, 0xffffff, 1);
    }
  }

  /**
   * A puff of fuel vapour (Fuel-Air Bomb): a loose clump of single cells in pale ochre and grey,
   * thinner towards the rim, each cell hopping to a new spot every few ticks so the cloud seethes
   * instead of sliding. Many puffs overlap into one cloud. Positions come from a hash of the puff
   * and the tick, so nothing is stored per puff.
   */
  private drawVapor(px: number, py: number, id: number): void {
    const b = this.normal;
    const step = this.fxTick >> 2;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    for (let i = 0; i < 40; i++) {
      let h = Math.imul(id * 9973 + i * 7919 + ((step + i) >> 1) * 104729, 0x9e3779b1);
      h ^= h >>> 15;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      // a ring index: most cells near the middle, a few out at the rim
      const ring = (h & 7) < 4 ? 2 : (h & 7) < 7 ? 5 : 8;
      const dx = ((h >>> 4) % (2 * ring + 1)) - ring;
      const dy = (((h >>> 12) % (2 * ring + 1)) - ring) >> 1;
      const tone = (h >>> 20) & 3;
      const c = tone === 0 ? 0xd8c890 : tone === 1 ? 0xb8ae88 : tone === 2 ? 0xe8e0b8 : 0x9a9478;
      b.push(cx + dx + 0.5, cy + dy + 0.5, 1, 1, c, ring === 8 ? 0.45 : ring === 5 ? 0.6 : 0.75);
    }
  }

  /**
   * A Ricochet Ball: a ball of energy in hard concentric bands (halo, body, white heart) that
   * swells and climbs from cyan to white-hot with each bounce, with a crackle of stray cells
   * flickering around it.
   */
  private drawRicochetBall(fx: number, fy: number, id: number): void {
    const g = this.additive;
    const heat = Math.min(this.fx.heatAt(this.fxTick), RICOCHET_HEAT.length - 1);
    const col = RICOCHET_HEAT[heat]!;
    const hot = RICOCHET_HEAT[Math.min(heat + 2, RICOCHET_HEAT.length - 1)]!;
    const x = Math.floor(fx) + 0.5;
    const y = Math.floor(fy) + 0.5;
    // pulse a cell bigger every few ticks
    const pulse = (this.fxTick >> 1) & 1;
    const body = 4 + heat;
    g.push(x, y, body * 2 + 6 + pulse * 2, body * 2 + 6 + pulse * 2, col, 0.3, Shape.Pixel);
    g.push(x, y, body + 2, body + 2, col, 0.8, Shape.Pixel);
    g.push(x, y, body, body, hot, 1, Shape.Pixel);
    g.push(x, y, Math.max(1, body - 2), Math.max(1, body - 2), 0xffffff, 1, Shape.Pixel);
    // crackle: a few cells jumping around the rim, more as it heats up
    let r = (Math.imul(this.fxTick + 1, 2654435761) ^ Math.imul(id + 1, 40503)) >>> 0;
    const n = 2 + heat;
    const reach = (body >> 1) + 2 + (heat >> 1);
    for (let i = 0; i < n; i++) {
      r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      const dx = ((r >>> 4) % (2 * reach + 1)) - reach;
      const dy = ((r >>> 12) % (2 * reach + 1)) - reach;
      g.push(x + dx, y + dy, 1, 1, (r & 1) === 0 ? 0xffffff : col, 0.9);
    }
  }

  /** A meteor: a white-hot head on a tapering streak that bands yellow → orange → red. */
  private drawMeteor(id: number, ex: number, ey: number, sz: number): void {
    const m = this.meteors.get(id);
    if (!m || m.dy <= 0) return; // waiting above the map
    const g = this.additive;
    const len = Math.hypot(m.dx, m.dy) || 1;
    const ux = m.dx / len;
    const uy = m.dy / len;
    const n = Math.round(14 * sz);
    const BANDS = [0xfff6d0, 0xffd060, 0xff8a20, 0xe04a10, 0xa02810] as const;
    for (let k = n; k >= 1; k--) {
      const f = k / n;
      const x = Math.floor(ex - ux * k * 1.4) + 0.5;
      const y = Math.floor(ey - uy * k * 1.4) + 0.5;
      const w = Math.max(1, Math.round(3 * sz * (1 - f * 0.75)));
      g.push(x, y, w, w, BANDS[Math.min(4, Math.floor(f * 5))]!, 1 - f * 0.55, Shape.Pixel);
    }
    const x = Math.floor(ex) + 0.5;
    const y = Math.floor(ey) + 0.5;
    const hs = Math.round(4 + 3 * sz);
    g.push(x, y, hs * 2, hs * 2, 0xff6a14, 0.35, Shape.Pixel);
    g.push(x, y, hs, hs, 0xff9a30, 0.7, Shape.Pixel);
    this.normal.push(x, y, Math.round(2 + 2 * sz), Math.round(2 + 2 * sz), 0xffd890, 1);
    g.push(x, y, Math.round(1 + sz), Math.round(1 + sz), 0xffffff, 1);
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const gl = this.gl;
    this.normal.dispose();
    this.additive.dispose();
    gl.deleteTexture(this.terrainTex);
    gl.deleteTexture(this.coatTex);
    gl.deleteTexture(this.heatTex);
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
    this.particles.dispose();
    this.fluid.dispose();
    this.fx.clear();
    this.water.clear();
    this.liquid.clear();
  }
}

/** Icicles under a frosted tank's hull: x offset from the centre, length in cells. */
const ICICLES = [-6, 2, -3, 1, 0, 3, 3, 1, 5, 2] as const;

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

/**
 * Append the map cells on the segment (x0, y0) → (x1, y1) to `out` (x, y pairs), skipping the
 * first cell when it repeats the last one stored, so a trail holds each cell it crossed once in a row.
 */
export function rasterTrail(out: number[], x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor(x0 + (x1 - x0) * t);
    const cy = Math.floor(y0 + (y1 - y0) * t);
    const n = out.length;
    if (n >= 2 && out[n - 2] === cx && out[n - 1] === cy) continue;
    out.push(cx, cy);
  }
}
