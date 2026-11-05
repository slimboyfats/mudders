import { chromium, type Browser } from 'playwright';

/**
 * Chromium flags that force software WebGL2 via SwiftShader, so rendering works in GPU-less
 * cloud containers and CI (REQUIREMENTS §2d). Output is the same with or without a GPU.
 */
export const SWIFTSHADER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export function launchHeadless(): Promise<Browser> {
  return chromium.launch({ headless: true, args: SWIFTSHADER_ARGS });
}
