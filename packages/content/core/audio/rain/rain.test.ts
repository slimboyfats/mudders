import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.rain', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('audio.rain')).toBe(true);
  });

  it.todo('does what its description says');
});
