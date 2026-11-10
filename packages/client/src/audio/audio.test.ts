import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import type { EffectEvent, SynthVoice } from '@mudders/shared';
import { soundMap, soundsFor } from './sounds';
import { patchLength, radiusScale, UNIT, voiceGain, voicePitch } from './synth';

const ev = (type: string, params: Record<string, number> = {}, radius = 24): EffectEvent => ({
  type,
  tick: 0,
  x: 0,
  y: 0,
  radius,
  params,
});

describe('sound map', () => {
  const content = loadContent();
  const map = soundMap(content);
  const weapons = content.list('weapon').map((w) => w.id);

  it('picks the damage-type sound over the generic one', () => {
    expect(soundsFor(map, ev('flash', { dt: 0 }))).toEqual(['audio.boom']); // blast
    expect(soundsFor(map, ev('flash', { dt: 2 }))).toEqual(['audio.boom-heat']);
    expect(soundsFor(map, ev('flash', { dt: 3 }))).toEqual(['audio.freeze']);
    expect(soundsFor(map, ev('flash'))).toEqual(['audio.boom']);
  });

  it('plays each weapon its own fire sound, else the default shot', () => {
    expect(soundsFor(map, ev('muzzle', { weapon: weapons.indexOf('weapon.laser') }))).toEqual([
      'audio.fire-beam',
    ]);
    expect(soundsFor(map, ev('muzzle', { weapon: weapons.indexOf('weapon.missile') }))).toEqual([
      'audio.fire',
    ]);
  });

  it('ignores events nothing listens to', () => {
    expect(soundsFor(map, ev('burst'))).toEqual([]);
  });
});

describe('chip synth maths', () => {
  const v: SynthVoice = {
    wave: 'square',
    freq: 400,
    to: 100,
    delay: 0,
    attack: 0.01,
    hold: 0.1,
    release: 0.2,
    volume: 0.5,
    arpRate: 1 / 30,
  };

  it('sweeps pitch from start to end', () => {
    expect(voicePitch(v, 0, UNIT)).toBeCloseTo(400);
    expect(voicePitch(v, 0.31, UNIT)).toBeCloseTo(100);
  });

  it('envelope rises, holds, and falls to silence', () => {
    expect(voiceGain(v, 0.005, UNIT)).toBeCloseTo(0.25);
    expect(voiceGain(v, 0.05, UNIT)).toBe(0.5);
    expect(voiceGain(v, 0.2, UNIT)).toBeLessThan(0.5);
    expect(voiceGain(v, 0.4, UNIT)).toBe(0);
  });

  it('arpeggio steps by semitones', () => {
    const a = { ...v, to: 400, arp: [0, 12] };
    expect(voicePitch(a, 0, UNIT)).toBeCloseTo(400);
    expect(voicePitch(a, 0.04, UNIT)).toBeCloseTo(800);
  });

  it('bigger blasts are lower and longer', () => {
    const big = radiusScale(96, 24);
    const small = radiusScale(6, 24);
    expect(big.pitch).toBeLessThan(1);
    expect(big.time).toBeGreaterThan(1);
    expect(small.pitch).toBeGreaterThan(1);
    expect(patchLength([v], big)).toBeGreaterThan(patchLength([v], UNIT));
  });
});
