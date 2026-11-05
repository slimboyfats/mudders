/**
 * Writes the core pack's music (§8b) as ProTracker MOD files: original tunes, composed here as
 * note data, played through single-cycle chip waveforms and noise drums that this script also
 * synthesises. Output is byte-for-byte reproducible, so the committed modules can always be
 * rebuilt and checked: `pnpm --filter @mudders/content music` (CC0, see the audio manifests).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO = resolve(HERE, '../core/audio');

// ── format ──────────────────────────────────────────────────────────────────────────────────

/** ProTracker periods, finetune 0, octaves 1–3 (C-1 … B-3). */
const PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302,
  285, 269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];
const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** "A-2" → period. */
function period(note: string): number {
  const i = NAMES.indexOf(note.slice(0, 2));
  const oct = Number(note[2]);
  const p = PERIODS[(oct - 1) * 12 + i];
  if (i < 0 || p === undefined) throw new Error(`bad note ${note}`);
  return p;
}

/** Shift a note name by semitones (stays within octaves 1–3). */
function transpose(note: string, semis: number): string {
  const i = (Number(note[2]) - 1) * 12 + NAMES.indexOf(note.slice(0, 2)) + semis;
  if (i < 0 || i >= 36) throw new Error(`out of range ${note}+${semis}`);
  return `${NAMES[i % 12]}${Math.floor(i / 12) + 1}`;
}

interface Sample {
  name: string;
  data: Int8Array;
  volume: number;
  /** Loop the whole sample (single-cycle waves). */
  loop: boolean;
}

interface Cell {
  note?: string;
  sample?: number;
  fx?: number;
  param?: number;
}

type Pattern = Cell[][]; // [row][channel]

function emptyPattern(): Pattern {
  return Array.from({ length: 64 }, () => [{}, {}, {}, {}]);
}

function writeMod(
  title: string,
  samples: Sample[],
  patterns: Pattern[],
  order: number[],
): Uint8Array {
  const parts: number[] = [];
  const str = (s: string, n: number) => {
    for (let i = 0; i < n; i++) parts.push(i < s.length ? s.charCodeAt(i) & 127 : 0);
  };
  const u16 = (v: number) => parts.push((v >> 8) & 255, v & 255);
  str(title, 20);
  for (let i = 0; i < 31; i++) {
    const s = samples[i];
    if (!s) {
      str('', 22);
      u16(0);
      parts.push(0, 0);
      u16(0);
      u16(1);
      continue;
    }
    str(s.name, 22);
    u16(s.data.length >> 1);
    parts.push(0, s.volume);
    u16(0);
    u16(s.loop ? s.data.length >> 1 : 1);
  }
  parts.push(order.length, 127);
  for (let i = 0; i < 128; i++) parts.push(order[i] ?? 0);
  str('M.K.', 4);
  for (const p of patterns) {
    for (const row of p) {
      for (const c of row) {
        const per = c.note ? period(c.note) : 0;
        const smp = c.sample ?? 0;
        parts.push((smp & 0xf0) | ((per >> 8) & 0x0f), per & 255);
        parts.push(((smp & 0x0f) << 4) | ((c.fx ?? 0) & 0x0f), c.param ?? 0);
      }
    }
  }
  for (const s of samples) for (const v of s.data) parts.push(v & 255);
  return Uint8Array.from(parts);
}

// ── chip waveforms ──────────────────────────────────────────────────────────────────────────

const RATE = 8287; // playback rate of C-2 (period 428)

function pulse(len: number, duty: number, amp: number): Int8Array {
  const d = new Int8Array(len);
  for (let i = 0; i < len; i++) d[i] = i < len * duty ? amp : -amp;
  return d;
}

function triangle(len: number, amp: number): Int8Array {
  const d = new Int8Array(len);
  // 16 steps per half like a chip DAC
  for (let i = 0; i < len; i++) {
    const ph = i / len;
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    d[i] = Math.round((Math.round(tri * 7.5 + 7.5) / 7.5 - 1) * amp);
  }
  return d;
}

/** 15-bit LFSR noise, one new value every `hold` samples. */
function lfsr(len: number, hold: number, short: boolean): Float64Array {
  const out = new Float64Array(len);
  let reg = 1;
  let v = 1;
  for (let i = 0; i < len; i++) {
    if (i % hold === 0) {
      const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
      v = reg & 1 ? 1 : -1;
    }
    out[i] = v;
  }
  return out;
}

function kick(): Int8Array {
  const n = 1400;
  const d = new Int8Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 45 + 150 * Math.exp(-t * 28);
    ph += f / RATE;
    const sq = ph % 1 < 0.5 ? 1 : -1;
    d[i] = Math.round(sq * 110 * Math.exp(-t * 9));
  }
  return d;
}

function snare(): Int8Array {
  const n = 1800;
  const d = new Int8Array(n);
  const nz = lfsr(n, 1, false);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    ph += 190 / RATE;
    const tone = (ph % 1 < 0.5 ? 1 : -1) * Math.exp(-t * 30);
    d[i] = Math.round((nz[i]! * 0.8 * Math.exp(-t * 14) + tone * 0.5) * 100);
  }
  return d;
}

function hat(): Int8Array {
  const n = 520;
  const d = new Int8Array(n);
  const nz = lfsr(n, 1, true);
  for (let i = 0; i < n; i++) d[i] = Math.round(nz[i]! * 70 * Math.exp((-i / RATE) * 60));
  return d;
}

// ── composition helpers ─────────────────────────────────────────────────────────────────────

const S = { lead: 1, chord: 2, bass: 3, kick: 4, snare: 5, hat: 6, thin: 7 } as const;
const FX = { arp: 0x0, vib: 0x4, slide: 0xa, vol: 0xc } as const;

/** Write notes `{row: note}` into a channel, sliding the volume down on empty rows. */
function voice(
  p: Pattern,
  ch: number,
  sample: number,
  notes: Record<number, string>,
  decay: number,
  extra?: (row: number) => Cell | undefined,
): void {
  for (let r = 0; r < 64; r++) {
    const n = notes[r];
    const cell: Cell = n ? { note: n, sample } : {};
    const x = extra?.(r);
    if (x) Object.assign(cell, x);
    else if (!n && decay > 0) Object.assign(cell, { fx: FX.slide, param: decay });
    p[r]![ch] = cell;
  }
}

/** Notes from a bar list: each bar is `{row: note}` within 16 rows. */
function bars(...b: Record<number, string>[]): Record<number, string> {
  const out: Record<number, string> = {};
  b.forEach((bar, i) => {
    for (const [r, n] of Object.entries(bar)) out[i * 16 + Number(r)] = n;
  });
  return out;
}

interface Chord {
  root: string;
  minor: boolean;
}
const ch = (root: string, minor: boolean): Chord => ({ root, minor });

/** Driving bass: root, octave and fifth in eighths. */
function bassLine(chords: Chord[], rows: number[]): Record<number, string> {
  const out: Record<number, string> = {};
  chords.forEach((c, i) => {
    rows.forEach((r, k) => {
      out[i * 16 + r] = k === 2 || k === 5 ? transpose(c.root, 12) : c.root;
    });
  });
  return out;
}

function drums(p: Pattern, chn: number, kicks: number[], snares: number[], hats: number[]): void {
  for (let r = 0; r < 64; r++) {
    const b = r % 16;
    if (kicks.includes(b)) p[r]![chn] = { note: 'C-2', sample: S.kick };
    else if (snares.includes(b)) p[r]![chn] = { note: 'C-2', sample: S.snare };
    else if (hats.includes(b)) p[r]![chn] = { note: 'C-2', sample: S.hat, fx: FX.vol, param: 28 };
  }
}

/** Chord stabs: an arpeggiated root (minor/major third + fifth) for two rows, then a fast fade. */
function stabs(p: Pattern, chn: number, sample: number, chords: Chord[], rows: number[]): void {
  for (let r = 0; r < 64; r++) p[r]![chn] = { fx: FX.slide, param: 0x08 };
  chords.forEach((c, i) => {
    const arp = c.minor ? 0x37 : 0x47;
    for (const r of rows) {
      const at = i * 16 + r;
      p[at]![chn] = { note: transpose(c.root, 12), sample, fx: FX.arp, param: arp };
      if (at + 1 < 64) p[at + 1]![chn] = { fx: FX.arp, param: arp };
    }
  });
}

/** A continuous chip arpeggio on every row (the classic "chord" sound). */
function arpBed(p: Pattern, chn: number, sample: number, chords: Chord[]): void {
  chords.forEach((c, i) => {
    const arp = c.minor ? 0x37 : 0x47;
    for (let r = 0; r < 16; r++) {
      const at = i * 16 + r;
      p[at]![chn] =
        r === 0
          ? { note: transpose(c.root, 12), sample, fx: FX.arp, param: arp }
          : { fx: FX.arp, param: arp };
    }
  });
}

// ── songs ───────────────────────────────────────────────────────────────────────────────────

function samples(): Sample[] {
  return [
    { name: 'pulse 50', data: pulse(32, 0.5, 90), volume: 34, loop: true },
    { name: 'pulse 25', data: pulse(32, 0.25, 90), volume: 30, loop: true },
    { name: 'triangle', data: triangle(64, 120), volume: 60, loop: true },
    { name: 'kick', data: kick(), volume: 60, loop: false },
    { name: 'snare', data: snare(), volume: 44, loop: false },
    { name: 'hat', data: hat(), volume: 40, loop: false },
    { name: 'pulse 12', data: pulse(32, 0.125, 90), volume: 30, loop: true },
  ];
}

/** Battle: driving A minor at ~136 BPM, four patterns. */
function battle(): Uint8Array {
  const Am = ch('A-1', true);
  const F = ch('F-1', false);
  const C = ch('C-2', false);
  const G = ch('G-1', false);
  const E = ch('E-1', false);
  const sets: [Chord[], Record<number, string>, 'full' | 'break'][] = [
    [
      [Am, F, C, G],
      bars(
        { 0: 'A-2', 3: 'C-3', 6: 'E-3', 8: 'D-3', 10: 'C-3', 12: 'B-2', 14: 'C-3' },
        { 0: 'A-2', 6: 'F-2', 8: 'A-2', 10: 'C-3', 12: 'A-2' },
        { 0: 'G-2', 3: 'E-2', 6: 'G-2', 8: 'C-3', 12: 'E-3', 14: 'D-3' },
        { 0: 'D-3', 4: 'B-2', 8: 'G-2', 12: 'A-2', 14: 'B-2' },
      ),
      'full',
    ],
    [
      [Am, F, G, E],
      bars(
        { 0: 'E-3', 2: 'E-3', 4: 'D-3', 6: 'C-3', 8: 'D-3', 10: 'E-3', 12: 'A-3', 14: 'G-3' },
        { 0: 'F-3', 4: 'E-3', 6: 'C-3', 8: 'A-2', 12: 'C-3' },
        { 0: 'D-3', 2: 'D-3', 4: 'B-2', 6: 'G-2', 8: 'B-2', 10: 'D-3', 12: 'G-3', 14: 'F-3' },
        { 0: 'E-3', 6: 'G#2', 8: 'B-2', 12: 'E-3' },
      ),
      'full',
    ],
    [
      [F, G, Am, Am],
      bars({ 0: 'C-3' }, { 0: 'D-3' }, { 0: 'E-3', 12: 'C-3' }, { 0: 'A-2' }),
      'break',
    ],
    [
      [F, G, E, Am],
      bars(
        { 0: 'A-2', 2: 'C-3', 4: 'F-3', 6: 'E-3', 8: 'C-3', 10: 'A-2', 12: 'C-3', 14: 'D-3' },
        { 0: 'B-2', 2: 'D-3', 4: 'G-3', 6: 'F-3', 8: 'D-3', 10: 'B-2', 12: 'D-3', 14: 'E-3' },
        { 0: 'G#2', 2: 'B-2', 4: 'E-3', 6: 'G#3', 8: 'B-3', 12: 'G#3', 14: 'E-3' },
        { 0: 'A-3', 8: 'E-3', 12: 'C-3', 14: 'B-2' },
      ),
      'full',
    ],
  ];
  const patterns = sets.map(([chords, lead, kind]) => {
    const p = emptyPattern();
    if (kind === 'full') {
      voice(p, 0, S.bass, bassLine(chords, [0, 3, 6, 8, 11, 14]), 0x04);
      stabs(p, 1, S.chord, chords, [2, 6, 10, 14]);
      voice(p, 2, S.lead, lead, 0x01);
      drums(p, 3, [0, 8, 10], [4, 12], [2, 6, 14]);
    } else {
      voice(p, 0, S.bass, bassLine(chords, [0, 8]), 0x01);
      arpBed(p, 1, S.thin, chords);
      voice(p, 2, S.lead, lead, 0, (r) => (lead[r] ? undefined : { fx: FX.vib, param: 0x43 }));
      drums(p, 3, [0], [], [8]);
    }
    // tempo on the very first row: speed 6, 136 BPM
    return p;
  });
  patterns[0]![0]![3] = { ...patterns[0]![0]![3], fx: 0xf, param: 6 };
  patterns[0]![1]![3] = { fx: 0xf, param: 136 };
  return writeMod('mudders battle', samples(), patterns, [0, 1, 0, 2, 3, 1]);
}

/** Title: an unhurried arpeggio bed in A minor at ~100 BPM, two patterns. */
function title(): Uint8Array {
  const Am = ch('A-1', true);
  const F = ch('F-1', false);
  const C = ch('C-2', false);
  const G = ch('G-1', false);
  const Dm = ch('D-2', true);
  const sets: [Chord[], Record<number, string>][] = [
    [
      [Am, F, C, G],
      bars({ 0: 'E-3' }, { 0: 'C-3', 8: 'A-2' }, { 0: 'G-2', 8: 'E-3' }, { 0: 'D-3' }),
    ],
    [
      [Am, Dm, F, G],
      bars({ 0: 'C-3', 8: 'E-3' }, { 0: 'F-3' }, { 0: 'E-3', 8: 'C-3' }, { 0: 'B-2' }),
    ],
  ];
  const patterns = sets.map(([chords, lead]) => {
    const p = emptyPattern();
    voice(p, 0, S.bass, bassLine(chords, [0, 8]), 0x01);
    arpBed(p, 1, S.thin, chords);
    voice(p, 2, S.lead, lead, 0, (r) => (lead[r] ? undefined : { fx: FX.vib, param: 0x32 }));
    drums(p, 3, [], [], [4, 12]);
    return p;
  });
  patterns[0]![0]![3] = { fx: 0xf, param: 8 };
  patterns[0]![1]![3] = { fx: 0xf, param: 100 };
  return writeMod('mudders title', samples(), patterns, [0, 1, 0, 1]);
}

const out: [string, Uint8Array][] = [
  [resolve(AUDIO, 'music-battle/battle.mod'), battle()],
  [resolve(AUDIO, 'music-title/title.mod'), title()],
];
for (const [path, bytes] of out) {
  writeFileSync(path, bytes);
  console.log(`${path}: ${bytes.length} bytes`);
}
