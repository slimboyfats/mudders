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
  /** Small pops after the blast, all round it (count multiplier). */
  pops: number;
  /** Fire packed into the rising ball over the impact. */
  heart: number;
  /** Fire fed into the ground rolls, and extra for the roll behind the lean (the back one). */
  rollFire: number;
  backRoll: number;
  /**
   * A tongue: a stream of white-hot fire poured out of the impact for `tongueTicks` ticks along
   * `tongueDir`, reaching about `tongueLen` blast radii. 0 = none.
   */
  tongueDir: Cone;
  tongueLen: number;
  tongueTicks: number;
  /** A low billowing cloud of the ground's own dust, and a column of clods thrown straight up. */
  dustCloud: number;
  /** Hard white rays shot out from the centre in a star. */
  rays: number;
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
  heart: 1,
  rollFire: 1,
  backRoll: 1,
  tongueDir: Cone.None,
  tongueLen: 0,
  tongueTicks: 0,
  dustCloud: 0,
  rays: 0,
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
  // Lance: no ball at all. A long flat tongue of fire roars out downrange along the ground,
  // one roll curls up at its tip, the side behind stays almost bare
  {
    ...PLAIN,
    lean: 1,
    cone: Cone.Ahead,
    coneShare: 0.85,
    coneHalf: 0.16,
    coneSpeed: 2.4,
    bang: 0.5,
    heart: 0.1,
    heartUp: 0.5,
    rolls: 1.2,
    backRoll: 0.08,
    sparks: 2,
    tongueDir: Cone.Ahead,
    tongueLen: 5,
    tongueTicks: 14,
    smoke: 0.6,
  },
  // Fountain: a tall narrow pillar of fire straight up, five or six radii high, that goes on
  // pouring for most of a second, then sparks raining back down round it. Small ground rolls
  {
    ...PLAIN,
    cone: Cone.Up,
    coneShare: 0.85,
    coneHalf: 0.1,
    coneSpeed: 2.6,
    bang: 0.5,
    bangLife: 1.4,
    heart: 0.15,
    heartUp: 2.2,
    rolls: 0.5,
    rollFire: 0.3,
    sparks: 0.4,
    fountain: 1.6,
    tongueDir: Cone.Up,
    tongueLen: 6,
    tongueTicks: 24,
  },
  // Dirty: hardly any fire. A brown dome of the ground's dust billows out low and wide, a
  // column of clods shoots up out of the crater and rains back
  {
    ...PLAIN,
    // the dust is lit dull, not by fire
    light: 0x504030,
    bang: 0.2,
    bangLife: 0.5,
    fire: 0.12,
    heart: 0.5,
    smoke: 1.5,
    smokeTones: [],
    sparks: 0.15,
    glitter: 0.3,
    ejecta: 1.4,
    dust: 3,
    chunkMin: 6,
    dustCloud: 1.4,
  },
  // Flash: a white star of hard rays and a hanging cloud of strobing sparkles; the bang is
  // over in a blink and nothing burns or smokes after it
  {
    ...PLAIN,
    tint: 0xd8e6ff,
    light: 0xe8f0ff,
    bang: 0.8,
    bangLife: 0.3,
    fire: 0,
    smoke: 0.08,
    smokeTones: [0x8c8a96, 0xa4a2ae, 0xbab8c4, 0x9a98a4],
    sparks: 2.5,
    glitter: 10,
    ejecta: 0.6,
    rays: 1,
  },
  // Cracker: a smaller blast, then a long rattle of pops all over and round it
  { ...PLAIN, bang: 0.6, fire: 0.6, pops: 1, sparks: 1.3 },
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
