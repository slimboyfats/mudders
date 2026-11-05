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

describe('signal override', () => {
  it('accepts only loopback overrides from the page URL', () => {
    expect(resolveSignalUrl('https://lobby.example', '?signal=http://127.0.0.1:9000')).toBe(
      'http://127.0.0.1:9000',
    );
    expect(resolveSignalUrl('https://lobby.example', '?signal=https://evil.example')).toBe(
      'https://lobby.example',
    );
  });
});
