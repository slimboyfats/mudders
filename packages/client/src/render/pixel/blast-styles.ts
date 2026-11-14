/**
 * Explosion designs: how one blast looks, picked per weapon by the `style` number on its
 * `burst` effect (`"burst": { "count": 40, "style": 2 }`). Renderer-only: the sim never reads it.
 *
 * Every style keeps the house look: a hard bright bang first, then the air rolling up on each
 * side of the impact, all drawn as single cells. What changes is where the bang is thrown, how
 * much of it is fire, smoke or ground, what colour the flame burns and what follows it.
 */
export const BlastStyle = {
  /** The usual blast: a ball of fire and two even ground rolls. */
  Plain: 0,
  /** Shaped charge: the bang is thrown downrange in a narrow tongue, one big roll ahead. */
  Lance: 1,
  /** Fountain: the bang punches straight up in a column that rains sparks back down. */
  Fountain: 2,
  /** Dirty blast: little fire, a dark wall of the ground's own dust, clods and grit. */
  Dirty: 3,
  /** Magnesium flash: a white-blue glare, a cloud of strobing sparkles, almost no smoke. */
  Flash: 4,
  /** Cracker: the blast, then a string of small pops going off all round it. */
  Cracker: 5,
  /** Chemical flame: the fireball burns acid green. */
  Acid: 6,
  /** Chemical flame: the fireball burns ice blue. */
  Frost: 7,
  /** Chemical flame: the fireball burns violet. */
  Violet: 8,
} as const;
export type BlastStyle = (typeof BlastStyle)[keyof typeof BlastStyle];

/** The plain fire colour; a fire or bang cell of any other colour burns that colour instead. */
export const FIRE_RGB = 0xffa020;

/** Where a share of the bang is aimed. */
export const Cone = {
  /** Every way the ground allows (the plain ball). */
  None: 0,
  /** Downrange, the way the shell was going, lifted a little off the ground. */
  Ahead: 1,
  /** Straight out of the ground, along its normal. */
  Up: 2,
} as const;
export type Cone = (typeof Cone)[keyof typeof Cone];

/** The knobs one design turns on the shared fireball. 1 = as the plain blast. */
export interface BlastShape {
  /** Fire colour: {@link FIRE_RGB} for real fire, else a chemical flame. */
  tint: number;
  /** Colour of the light the fire casts. */
  light: number;
  /** 0 = the shell's own slant; above 0 forces a lean this hard to the side it came from. */
  lean: number;
  cone: Cone;
  /** Share of the bang thrown into the cone, its half-width (radians) and speed multiplier. */
  coneShare: number;
  coneHalf: number;
  coneSpeed: number;
  /** Bang cell count and life multipliers. */
  bang: number;
  bangLife: number;
  /** Burning cells let go into the heart and rolls. */
  fire: number;
  /** Speed of the heart's climb. */
  heartUp: number;
  /** Size of the ground rolls. */
  rolls: number;
  /** Soot let go after the fire, and its tones (empty = the ground's own dust colour). */
  smoke: number;
  smokeTones: readonly number[];
  sparks: number;
  /** Strobing white motes in the fireball. */
  glitter: number;
  /** Ground grains thrown, and dust kicked along the ground. */
  ejecta: number;
  dust: number;
  /** Throw clods out of blasts down to this radius (the plain blast: 18). */
  chunkMin: number;
  /** Sparks shot up the column that arc over and rain back down. */
  fountain: number;
  /** Small pops after the blast, all round it. */
  pops: number;
}

const SOOT_TONES = [0x4e4648, 0x625a5c, 0x777073, 0x5a4e48] as const;

const PLAIN: BlastShape = {
  tint: FIRE_RGB,
  light: 0xff8a30,
  lean: 0,
  cone: Cone.None,
  coneShare: 0,
  coneHalf: 0,
  coneSpeed: 1,
  bang: 1,
  bangLife: 1,
  fire: 1,
  heartUp: 1,
  rolls: 1,
  smoke: 1,
  smokeTones: SOOT_TONES,
  sparks: 1,
  glitter: 1,
  ejecta: 1,
  dust: 1,
  chunkMin: 18,
  fountain: 0,
  pops: 0,
};

const chem = (tint: number, light: number, smokeTones: readonly number[]): BlastShape => ({
  ...PLAIN,
  tint,
  light,
  smokeTones,
  glitter: 1.6,
});

/** One shape per {@link BlastStyle}, in order. */
export const BLAST_SHAPES: readonly BlastShape[] = [
  PLAIN,
  // Lance
  {
    ...PLAIN,
    lean: 1,
    cone: Cone.Ahead,
    coneShare: 0.7,
    coneHalf: 0.3,
    coneSpeed: 1.7,
    heartUp: 0.8,
    rolls: 1.1,
    sparks: 1.6,
  },
  // Fountain
  {
    ...PLAIN,
    cone: Cone.Up,
    coneShare: 0.7,
    coneHalf: 0.2,
    coneSpeed: 2,
    bangLife: 1.3,
    heartUp: 1.9,
    rolls: 0.6,
    sparks: 0.5,
    fountain: 1,
  },
  // Dirty
  {
    ...PLAIN,
    tint: FIRE_RGB,
    bang: 0.35,
    bangLife: 0.6,
    fire: 0.35,
    smoke: 2.2,
    smokeTones: [],
    sparks: 0.3,
    glitter: 0.4,
    ejecta: 2.6,
    dust: 3,
    chunkMin: 9,
  },
  // Flash
  {
    ...PLAIN,
    tint: 0xd8e6ff,
    light: 0xe8f0ff,
    bang: 1.1,
    bangLife: 0.55,
    fire: 0.45,
    smoke: 0.35,
    smokeTones: [0x8c8a96, 0xa4a2ae, 0xbab8c4, 0x9a98a4],
    sparks: 2.2,
    glitter: 7,
    ejecta: 0.7,
  },
  // Cracker
  { ...PLAIN, bang: 0.8, fire: 0.8, pops: 1, sparks: 1.3 },
  // Acid, Frost, Violet
  chem(0x86ff3c, 0x9cff60, [0x46564a, 0x5a6a5c, 0x6e7c6a, 0x4a5448]),
  chem(0x70d8ff, 0x9ee6ff, [0x5a6470, 0x707c88, 0x8a96a2, 0x64707c]),
  chem(0xc070ff, 0xd090ff, [0x4e4458, 0x62586e, 0x766c84, 0x584c62]),
];

/** A Cracker's small pops: a quick hard bang and little else. */
export const POP_SHAPE: BlastShape = { ...PLAIN, fire: 0.5, smoke: 0.4, bangLife: 0.7 };

/** The shape for a `style` number off a manifest (anything unknown draws the plain blast). */
export function blastShape(style: number | undefined): BlastShape {
  return BLAST_SHAPES[style ?? 0] ?? PLAIN;
}
