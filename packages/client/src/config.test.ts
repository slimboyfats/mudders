import { describe, expect, it } from 'vitest';
import { resolveSignalUrl, shareOrigin } from './config';

describe('resolveSignalUrl', () => {
  it('defaults to the page origin, proxied at /signal', () => {
    expect(resolveSignalUrl(undefined, '', 'http://192.168.1.20:5173')).toBe(
      'http://192.168.1.20:5173/signal',
    );
    expect(resolveSignalUrl('  ', '', 'http://localhost:5173/')).toBe(
      'http://localhost:5173/signal',
    );
  });

  it('falls back to the local dev server without an origin', () => {
    expect(resolveSignalUrl(undefined)).toBe('http://localhost:8787');
    expect(resolveSignalUrl(undefined, '', 'file://')).toBe('http://localhost:8787');
  });

  it('prefers VITE_SIGNAL_URL and strips trailing slashes', () => {
    expect(resolveSignalUrl('https://lobby.example/', '', 'http://192.168.1.20:5173')).toBe(
      'https://lobby.example',
    );
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

describe('shareOrigin', () => {
  const loc = (hostname: string, port = '5173') => ({
    protocol: 'http:',
    hostname,
    port,
    origin: `http://${hostname}${port ? `:${port}` : ''}`,
  });

  it('swaps a loopback host for the LAN address', () => {
    expect(shareOrigin(loc('localhost'), ['192.168.1.20'])).toBe('http://192.168.1.20:5173');
    expect(shareOrigin(loc('127.0.0.1'), ['10.0.0.5'])).toBe('http://10.0.0.5:5173');
  });

  it('keeps a non-loopback host, or loopback when no LAN address is known', () => {
    expect(shareOrigin(loc('192.168.1.20'), ['10.0.0.5'])).toBe('http://192.168.1.20:5173');
    expect(shareOrigin(loc('localhost'), [])).toBe('http://localhost:5173');
    expect(shareOrigin(loc('mudders.example', ''), ['10.0.0.5'])).toBe('http://mudders.example');
  });
});
