import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.snowfall', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('audio.snowfall')).toBe(true);
  });

  it.todo('does what its description says');
});
