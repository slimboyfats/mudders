import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('flight.penetrator', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('flight.penetrator')).toBe(true);
  });

  it.todo('does what its description says');
});
