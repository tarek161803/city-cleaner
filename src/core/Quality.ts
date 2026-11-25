/** Phone or tablet: on-screen controls instead of mouse and keyboard (set on <html> before first paint). */
export const IS_TOUCH = document.documentElement.classList.contains('touch');

/**
 * Rendering and population settings. Phones get a lighter city (fewer vehicles and people, nearer
 * draw distances hidden by thicker haze, cheaper shadows, lower resolution) so the frame rate holds;
 * desktop keeps the full version.
 */
export const QUALITY = IS_TOUCH
  ? {
      maxPixelRatio: 1,
      /** Still slow at this frame time (s) averaged over a few seconds: lower the resolution further. */
      slowFrame: 1 / 40,
      minPixelRatio: 0.6,
      antialias: false,
      softShadows: false,
      shadowMapSize: 1024,
      /** Share of the full fleet that is on the roads. */
      traffic: 0.55,
      pedestrians: 140,
      maxWalkers: 170,
      /** People are hidden and not animated beyond this distance. */
      personCull: 55,
      /** Vehicles and stalls are hidden beyond this distance (along either axis). */
      propCull: 105,
      fogNear: 30,
      fogFar: 140,
    }
  : {
      maxPixelRatio: 2,
      slowFrame: Infinity,
      minPixelRatio: 2,
      antialias: true,
      softShadows: true,
      shadowMapSize: 2048,
      traffic: 1,
      pedestrians: 260,
      maxWalkers: 300,
      personCull: 80,
      propCull: 150,
      fogNear: 45,
      fogFar: 230,
    };
