/** Phone or tablet: on-screen controls instead of mouse and keyboard (set on <html> before first paint). */
export const IS_TOUCH = document.documentElement.classList.contains('touch');

/**
 * Rendering and population settings. Phones get a lighter city (fewer vehicles and people, nearer
 * draw distances hidden by thicker haze, cheaper shadows, lower resolution) so the frame rate holds;
 * desktop starts at full quality and steps down by itself on slower machines.
 */
export const QUALITY = IS_TOUCH
  ? {
      /** Starting resolution (× CSS pixels); it adapts between the min and max from the frame rate. */
      pixelRatio: 1.5,
      maxPixelRatio: 2,
      /** Never below this: any lower and the picture turns to mush. */
      minPixelRatio: 1,
      /** Averaging slower than this frame time (s): lower the resolution a step. */
      slowFrame: 1 / 40,
      /** Averaging faster than this: there's headroom, so sharpen a step. */
      fastFrame: 1 / 56,
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
      pixelRatio: 2,
      maxPixelRatio: 2,
      /** Old desktops with 1× screens can drop a little below native before shadows are cut. */
      minPixelRatio: 0.75,
      /** Monitors refresh at 60 Hz or more, so anything averaging under ~48 FPS is struggling. */
      slowFrame: 1 / 48,
      fastFrame: 1 / 57,
      /** MSAA on top of a 2× (retina) buffer costs a lot for little gain. */
      antialias: devicePixelRatio < 1.5,
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
