import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatWorld } from '../../../src/testing';

describe('material.rammed-earth', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('material.rammed-earth')).toBe(true);
  });

  it('is static and holds a span, unlike loose dirt', () => {
    const w = flatWorld();
    const cell = w.mats.cellOf('material.rammed-earth');
    const dirt = w.mats.cellOf('material.dirt');
    expect(w.mats.settle[cell]).not.toBe(w.mats.settle[dirt]);
    expect(w.mats.span[cell]).toBe(20);
  });
});
