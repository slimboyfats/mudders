import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.psi-wave', () => {
  it('loads and plays on the Telepathy events', () => {
    const c = loadContent();
    expect(c.has('audio.psi-wave')).toBe(true);
    const events = (c.get('audio', 'audio.psi-wave').on ?? []).map((o) => o.event);
    expect(events).toEqual(['psiWave']);
  });
});
