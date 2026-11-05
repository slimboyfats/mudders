/**
 * `--device` presets (§2d): landscape CSS viewport and device pixel ratio of the reference phones
 * (§8a). The canvas fills the viewport; the DOM HUD is not part of a renderer capture (see
 * `pnpm play:smoke` for full-page phone screenshots with the HUD).
 */
export interface Device {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export const DEVICES: Record<string, Device> = {
  s23plus: { cssWidth: 832, cssHeight: 384, dpr: 2.8125 },
  iphone14: { cssWidth: 844, cssHeight: 390, dpr: 3 },
};
