import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.music-title', () => {
  it('is a licensed 4-channel ProTracker module next to its manifest', () => {
    const a = loadContent().get('audio', 'audio.music-title');
    expect(a.licence.spdx).toBe('CC0-1.0');
    const bytes = readFileSync(new URL(`./${a.module!.file}`, import.meta.url));
    expect(String.fromCharCode(...bytes.subarray(1080, 1084))).toBe('M.K.');
    // a song length and at least one pattern
    expect(bytes[950]).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(1084 + 1024);
  });
});
