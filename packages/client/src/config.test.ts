import { describe, expect, it } from 'vitest';
import { resolveSignalUrl } from './config';

describe('resolveSignalUrl', () => {
  it('defaults to the local dev server', () => {
    expect(resolveSignalUrl(undefined)).toBe('http://localhost:8787');
    expect(resolveSignalUrl('  ')).toBe('http://localhost:8787');
  });

  it('strips trailing slashes', () => {
    expect(resolveSignalUrl('https://lobby.example/')).toBe('https://lobby.example');
  });
});
