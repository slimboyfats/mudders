import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import type { HudState } from '../game/match';
import { midi, SONGS } from './snes/songs';
import { place } from './spatial';
import { musicTension } from './tension';

describe('live SNES-style songs', () => {
  it('reads note names', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('G#5')).toBe(80);
    expect(midi('Bb3')).toBe(58);
  });

  it('has a song for every audio item that asks for one, and only those', () => {
    const wanted = loadContent()
      .list('audio')
      .flatMap((a) => (a.live ? [a.live.song] : []))
      .sort();
    expect(Object.keys(SONGS).sort()).toEqual(wanted);
  });

  it('keeps every note inside its song, in a playable range, on all three layers', () => {
    for (const [name, make] of Object.entries(SONGS)) {
      const s = make();
      const layers = new Set<number>();
      for (const t of s.tracks) {
        layers.add(t.layer);
        for (const n of t.notes) {
          if (s.length > 0) expect(n.at, name).toBeLessThan(s.length);
          expect(n.len).toBeGreaterThan(0);
          expect(n.pitch).toBeGreaterThanOrEqual(midi('A1'));
          expect(n.pitch).toBeLessThanOrEqual(midi('C7'));
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        // notes in time order: the sequencer schedules each track front to back
        const ats = t.notes.map((n) => n.at);
        expect(ats).toEqual([...ats].sort((x, y) => x - y));
      }
      if (s.length > 0) expect([...layers].sort()).toEqual([0, 1, 2]);
    }
  });
});

type Tank = HudState['tanks'][number];
const tank = (health: number, alive = true): Tank =>
  ({ alive, health, maxHealth: 100 }) as unknown as Tank;
const hud = (tanks: Tank[], over: Partial<Pick<HudState, 'phase' | 'suddenDeath'>> = {}) => ({
  phase: 'aim' as const,
  suddenDeath: false,
  tanks,
  ...over,
});

describe('music tension', () => {
  it('is calm with healthy tanks, in the shop and after the match', () => {
    expect(musicTension(hud([tank(100), tank(80)]))).toBe(0);
    expect(musicTension(hud([tank(10), tank(80)], { phase: 'shop' }))).toBe(0);
    expect(musicTension(hud([tank(10), tank(80)], { phase: 'over' }))).toBe(0);
  });

  it('builds with a hurt tank, a duel of the last two, near death and sudden death', () => {
    expect(musicTension(hud([tank(50), tank(100)]))).toBe(1);
    expect(musicTension(hud([tank(100), tank(100), tank(0, false)]))).toBe(1);
    expect(musicTension(hud([tank(20), tank(100)]))).toBe(2);
    expect(musicTension(hud([tank(100), tank(100)], { suddenDeath: true }))).toBe(2);
  });
});

describe('sound in space', () => {
  const ear = { x: 400, y: 200, halfW: 200, halfH: 100 };

  it('pans by place on screen and leaves on-screen sounds clear and on time', () => {
    expect(place(400, 200, ear)).toMatchObject({ pan: 0, delay: 0, gain: 1 });
    const left = place(250, 200, ear);
    const right = place(550, 200, ear);
    expect(left.pan).toBeLessThan(-0.5);
    expect(right.pan).toBeCloseTo(-left.pan, 9);
    expect(right.delay).toBe(0);
    expect(right.cutoff).toBeGreaterThan(16000);
  });

  it('makes far off-screen sounds later, quieter and duller, the further the more', () => {
    const near = place(700, 200, ear);
    const far = place(1400, 200, ear);
    expect(near.delay).toBeGreaterThan(0);
    expect(far.delay).toBeGreaterThan(near.delay);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.gain).toBeLessThan(near.gain);
    expect(far.delay).toBeLessThanOrEqual(0.3);
  });

  it('leaves a sound centred without a listener', () => {
    expect(place(10, 10, null)).toMatchObject({ pan: 0, delay: 0, gain: 1 });
  });
});
