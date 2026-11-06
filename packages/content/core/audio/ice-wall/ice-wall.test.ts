import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.ice-wall', () => {
  it('is a synth SFX that plays when an ice wall starts growing', () => {
    const a = loadContent().get('audio', 'audio.ice-wall');
    expect(a).toMatchObject({ bus: 'sfx', on: [{ event: 'iceWall' }] });
  });
});
