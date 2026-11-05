import type { Renderer, RendererKind } from './types';

export * from './types';

/**
 * Renderers are loaded lazily (§2b) so a second implementation can be added without growing the
 * initial bundle.
 */
export async function loadRenderer(
  kind: RendererKind,
  mapWidth: number,
  mapHeight: number,
): Promise<Renderer> {
  switch (kind) {
    case 'pixel': {
      const { PixelRenderer } = await import('./pixel');
      return new PixelRenderer(mapWidth, mapHeight);
    }
  }
}
