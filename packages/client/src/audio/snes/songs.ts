import type { InstrumentId } from './instruments';
import type { Tension } from '../tension';

/**
 * Scores for the SNES-style sequencer (original, CC0, Mudders contributors). A song loops; each
 * track belongs to a tension layer (0 always on, 1 and 2 fade in as the match gets tense, §7.2). A
 * sting is a short phrase over the music, started on the next beat. Times are in sixteenth notes.
 */
export interface Note {
  /** Start, in sixteenths from the start of the song or sting (fractions allowed). */
  at: number;
  /** Length in sixteenths. */
  len: number;
  /** MIDI note number (ignored by unpitched drums). */
  pitch: number;
  /** 0-1. */
  vel: number;
}

export interface Track {
  inst: InstrumentId;
  layer: Tension;
  /** Stereo place, -1 … 1. */
  pan: number;
  /** Share sent to the echo, 0-1. */
  echo: number;
  /** Delayed vibrato in semitones (lead voices). */
  vibrato?: number;
  /** Shorter notes than the instrument's own envelope (staccato strings). */
  staccato?: boolean;
  notes: Note[];
}

export interface Song {
  bpm: number;
  /** Loop length in sixteenths (0 for a sting: it plays once). */
  length: number;
  tracks: Track[];
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 69, "G#5" → 80, "Bb3" → 58. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]!]! + acc;
}

/** A chord as its root and a minor/major third. */
interface Chord {
  root: string;
  minor: boolean;
}
const c = (root: string, minor = false): Chord => ({ root, minor });

/** Chord tones from the root (MIDI): root, third, fifth. */
function triad(ch: Chord, octave: number): [number, number, number] {
  const r = midi(`${ch.root}${octave}`);
  return [r, r + (ch.minor ? 3 : 4), r + 7];
}

/** A melody as [note or '-', length in sixteenths] pairs, laid end to end from `at`. */
function phrase(at: number, parts: readonly (readonly [string, number])[], vel: number): Note[] {
  const out: Note[] = [];
  let t = at;
  for (const [n, len] of parts) {
    if (n !== '-') out.push({ at: t, len, pitch: midi(n), vel });
    t += len;
  }
  return out;
}

// ── battle ──────────────────────────────────────────────────────────────────────────────────

const BAR = 16;

/** Sixteen bars in A minor: a calm statement, then a lifted second half. */
const BATTLE_CHORDS: Chord[] = [
  c('A', true),
  c('F'),
  c('C'),
  c('G'),
  c('A', true),
  c('F'),
  c('D', true),
  c('E'),
  c('F'),
  c('G'),
  c('E', true),
  c('A', true),
  c('D', true),
  c('G'),
  c('E'),
  c('E'),
];

const BATTLE_MELODY: (readonly [string, number])[][] = [
  [
    ['E5', 6],
    ['D5', 2],
    ['C5', 4],
    ['B4', 4],
  ],
  [
    ['A4', 8],
    ['C5', 4],
    ['F5', 4],
  ],
  [
    ['E5', 10],
    ['G5', 2],
    ['E5', 4],
  ],
  [
    ['D5', 12],
    ['-', 4],
  ],
  [
    ['E5', 4],
    ['A5', 8],
    ['G5', 4],
  ],
  [
    ['F5', 6],
    ['E5', 2],
    ['C5', 8],
  ],
  [
    ['D5', 4],
    ['F5', 4],
    ['A5', 6],
    ['G5', 2],
  ],
  [
    ['G#5', 12],
    ['E5', 4],
  ],
  [
    ['A5', 8],
    ['G5', 4],
    ['F5', 4],
  ],
  [
    ['G5', 6],
    ['F5', 2],
    ['D5', 8],
  ],
  [
    ['E5', 8],
    ['G5', 4],
    ['B5', 4],
  ],
  [
    ['A5', 12],
    ['-', 4],
  ],
  [
    ['F5', 4],
    ['E5', 4],
    ['D5', 4],
    ['A4', 4],
  ],
  [
    ['B4', 4],
    ['D5', 4],
    ['G5', 8],
  ],
  [
    ['G#5', 8],
    ['F5', 4],
    ['E5', 4],
  ],
  [
    ['E5', 8],
    ['D5', 4],
    ['B4', 4],
  ],
];

function battle(): Song {
  const chords = BATTLE_CHORDS;
  const t = (
    inst: InstrumentId,
    layer: Tension,
    pan: number,
    echo: number,
    extra: Partial<Track> = {},
  ): Track => ({
    inst,
    layer,
    pan,
    echo,
    notes: [],
    ...extra,
  });
  // layer 0: strings pad, fingered bass, harp arpeggio, flute lead
  const pad = t('strings', 0, -0.25, 0.35);
  const bass = t('bass', 0, 0, 0.1);
  const harp = t('harp', 0, 0.35, 0.5);
  const lead = t('flute', 0, 0.1, 0.45, { vibrato: 0.25 });
  // layer 1: timpani, snare, hats, a driving bass in eighths
  const timp = t('timpani', 1, -0.2, 0.2);
  const snare = t('snare', 1, 0.15, 0.35);
  const hats = t('hat', 1, 0.45, 0.1);
  const drive = t('bass', 1, 0, 0.05);
  // layer 2: kick, crash, snare fills, brass stabs, staccato strings, choir
  const kick = t('kick', 2, 0, 0.05);
  const crash = t('crash', 2, -0.4, 0.3);
  const fill = t('snare', 2, 0.15, 0.3);
  const brass = t('brass', 2, 0.3, 0.3);
  const ostinato = t('strings', 2, -0.45, 0.2, { staccato: true });
  const choir = t('choir', 2, 0, 0.5);

  chords.forEach((ch, b) => {
    const at = b * BAR;
    const [r, third, fifth] = triad(ch, 4);
    const low = midi(`${ch.root}2`);
    for (const p of [r, third, fifth]) pad.notes.push({ at, len: BAR, pitch: p, vel: 0.5 });
    bass.notes.push({ at, len: 7, pitch: low, vel: 0.8 });
    bass.notes.push({ at: at + 8, len: 4, pitch: low + 7, vel: 0.6 });
    bass.notes.push({ at: at + 12, len: 3, pitch: low + 12, vel: 0.55 });
    const arp = [r - 12, third - 12, fifth - 12, r, third, fifth, r + 12, fifth];
    arp.forEach((p, k) =>
      harp.notes.push({ at: at + k * 2, len: 2, pitch: p, vel: k === 0 ? 0.55 : 0.38 }),
    );
    lead.notes.push(...phrase(at, BATTLE_MELODY[b]!, 0.55));

    timp.notes.push({ at, len: 6, pitch: low, vel: 0.85 });
    timp.notes.push({ at: at + 8, len: 6, pitch: low + 7, vel: 0.6 });
    for (const s of [4, 12]) snare.notes.push({ at: at + s, len: 2, pitch: 60, vel: 0.6 });
    for (let s = 0; s < BAR; s += 2)
      hats.notes.push({ at: at + s, len: 1, pitch: 60, vel: s % 4 === 2 ? 0.5 : 0.28 });
    for (let s = 0; s < BAR; s += 2)
      drive.notes.push({
        at: at + s,
        len: 1,
        pitch: low + (s % 8 === 6 ? 19 : 12),
        vel: s % 4 === 0 ? 0.6 : 0.45,
      });

    for (let s = 0; s < BAR; s += 4) kick.notes.push({ at: at + s, len: 2, pitch: 60, vel: 0.85 });
    if (b % 8 === 0) crash.notes.push({ at, len: 8, pitch: 60, vel: 0.8 });
    if (b % 4 === 3)
      for (let s = 12; s < BAR; s++)
        fill.notes.push({ at: at + s, len: 1, pitch: 60, vel: 0.35 + (s - 12) * 0.12 });
    for (const [s, len] of [
      [0, 3],
      [6, 2],
      [10, 4],
    ] as const)
      for (const p of [r, third, fifth])
        brass.notes.push({ at: at + s, len, pitch: p, vel: s === 0 ? 0.6 : 0.45 });
    const ost = [r - 12, fifth - 12, r, fifth - 12];
    for (let s = 0; s < BAR; s++)
      ostinato.notes.push({
        at: at + s,
        len: 1,
        pitch: ost[s % 4]!,
        vel: s % 4 === 0 ? 0.55 : 0.38,
      });
    choir.notes.push({ at, len: BAR, pitch: r + 12, vel: 0.4 });
    choir.notes.push({ at, len: BAR, pitch: fifth, vel: 0.35 });
  });
  return {
    bpm: 100,
    length: chords.length * BAR,
    tracks: [
      pad,
      bass,
      harp,
      lead,
      timp,
      snare,
      hats,
      drive,
      kick,
      crash,
      fill,
      brass,
      ostinato,
      choir,
    ],
  };
}

// ── stings ──────────────────────────────────────────────────────────────────────────────────

const sting = (tracks: Track[]): Song => ({ bpm: 100, length: 0, tracks });
const st = (
  inst: InstrumentId,
  pan: number,
  echo: number,
  notes: Note[],
  extra: Partial<Track> = {},
): Track => ({
  inst,
  layer: 0,
  pan,
  echo,
  notes,
  ...extra,
});

/** A tank destroyed: a falling brass call over a timpani roll and a crash. */
function stingKill(): Song {
  return sting([
    st(
      'brass',
      0.2,
      0.4,
      phrase(
        0,
        [
          ['A5', 2],
          ['E5', 2],
          ['C5', 2],
          ['A4', 10],
        ],
        0.75,
      ),
    ),
    st(
      'brass',
      -0.2,
      0.4,
      phrase(
        0,
        [
          ['E5', 2],
          ['C5', 2],
          ['A4', 2],
          ['E4', 10],
        ],
        0.55,
      ),
    ),
    st(
      'timpani',
      0,
      0.2,
      Array.from({ length: 6 }, (_, i) => ({
        at: i,
        len: 1,
        pitch: midi('A2'),
        vel: 0.4 + i * 0.1,
      })),
    ),
    st('crash', -0.3, 0.3, [{ at: 6, len: 8, pitch: 60, vel: 0.8 }]),
    st('timpani', 0, 0.2, [{ at: 6, len: 8, pitch: midi('A2'), vel: 1 }]),
  ]);
}

/** The last two left: a harp sweep up the A minor scale into a held string and choir chord. */
function stingDuel(): Song {
  const scale = [
    'A3',
    'B3',
    'C4',
    'D4',
    'E4',
    'F4',
    'G4',
    'A4',
    'B4',
    'C5',
    'D5',
    'E5',
    'F5',
    'G5',
    'A5',
  ];
  return sting([
    st(
      'harp',
      0.3,
      0.5,
      scale.map((n, i) => ({ at: i * 0.5, len: 2, pitch: midi(n), vel: 0.5 + i * 0.02 })),
    ),
    st('strings', -0.3, 0.4, [
      { at: 8, len: 16, pitch: midi('A3'), vel: 0.6 },
      { at: 8, len: 16, pitch: midi('C4'), vel: 0.6 },
      { at: 8, len: 16, pitch: midi('E4'), vel: 0.6 },
    ]),
    st('choir', 0, 0.5, [{ at: 8, len: 16, pitch: midi('A4'), vel: 0.5 }]),
    st(
      'timpani',
      0,
      0.2,
      Array.from({ length: 8 }, (_, i) => ({
        at: i,
        len: 1,
        pitch: midi('E2'),
        vel: 0.25 + i * 0.08,
      })),
    ),
    st('timpani', 0, 0.2, [{ at: 8, len: 8, pitch: midi('A2'), vel: 0.95 }]),
  ]);
}

/** Sudden death: a low brass tritone (A against D#) over hammered kicks and a long crash. */
function stingSuddenDeath(): Song {
  return sting([
    st('brass', -0.2, 0.4, [{ at: 0, len: 14, pitch: midi('A2'), vel: 0.8 }]),
    st('brass', 0.2, 0.4, [{ at: 0, len: 14, pitch: midi('D#3'), vel: 0.7 }]),
    st('choir', 0, 0.5, [
      { at: 2, len: 14, pitch: midi('A4'), vel: 0.4 },
      { at: 2, len: 14, pitch: midi('Bb4'), vel: 0.35 },
    ]),
    st(
      'kick',
      0,
      0.1,
      [0, 3, 6, 8].map((at) => ({ at, len: 2, pitch: 60, vel: 0.95 })),
    ),
    st(
      'timpani',
      0,
      0.2,
      [0, 3, 6].map((at) => ({ at, len: 3, pitch: midi('A2'), vel: 0.9 })),
    ),
    st('crash', 0.3, 0.3, [{ at: 0, len: 12, pitch: 60, vel: 0.9 }]),
  ]);
}

/** Every live song and sting by the name an audio manifest's `live.song` gives. */
export const SONGS: Readonly<Record<string, () => Song>> = {
  battle,
  'sting-kill': stingKill,
  'sting-duel': stingDuel,
  'sting-sudden-death': stingSuddenDeath,
};
