import { useEffect, useState } from 'react';
import { installState, isInstalled } from '../pwa';

/**
 * Full screen on phones. The Fullscreen API is Baseline for elements everywhere except iPhone
 * Safari, which only lets video go full screen; there the way to lose the browser bars is the
 * installed web app (Add to Home Screen), so the button opens that hint instead.
 */
export type FullscreenMode = 'api' | 'ios-hint' | 'none';

export function fullscreenMode(): FullscreenMode {
  // checked first: an element in full screen also matches (display-mode: fullscreen)
  if (document.fullscreenElement) return 'api';
  if (isInstalled()) return 'none';
  if (document.fullscreenEnabled) return 'api';
  return installState() === 'ios' ? 'ios-hint' : 'none';
}

export async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    return;
  }
  await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  // Android Chrome can hold landscape while full screen; elsewhere this rejects and that's fine
  const o = screen.orientation as ScreenOrientation & {
    lock?: (o: 'landscape') => Promise<void>;
  };
  await o.lock?.('landscape').catch(() => undefined);
}

export function useFullscreen(): { mode: FullscreenMode; on: boolean } {
  const [on, setOn] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const f = () => setOn(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  return { mode: fullscreenMode(), on };
}
