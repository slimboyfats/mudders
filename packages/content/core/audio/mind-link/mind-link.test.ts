import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.mind-link', () => {
  it('loads and plays on the Telepathy events', () => {
    const c = loadContent();
    expect(c.has('audio.mind-link')).toBe(true);
    const events = (c.get('audio', 'audio.mind-link').on ?? []).map((o) => o.event);
    expect(events).toEqual(['mindLink', 'mindTurn']);
  });
});
