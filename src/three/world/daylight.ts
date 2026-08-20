import * as THREE from "three";

/**
 * The day/night value, shared by every system that cares about it.
 *
 * Kept as a plain mutable object rather than store state because the sky
 * shader, the fog, three lights, every window in Experience City and every
 * lamp in the museum all read it *every frame*. Routing that through React
 * would mean a full tree re-render for a value that is mid-transition for
 * two full seconds.
 */
export const dayMix = {
  /** 0 = full day, 1 = full night. Always eased, never snapped. */
  night: 0,
};

/** Colour ramps, sampled by the world lighting rig. */
export const DAY = {
  sun: new THREE.Color("#FFF0D0"),
  sunIntensity: 2.5,
  ambient: new THREE.Color("#CFE7FF"),
  ambientIntensity: 0.62,
  hemiSky: new THREE.Color("#BFE4FF"),
  // A bright ground bounce: these islands are seen from underneath more
  // than from above, and their keels need light coming back up at them.
  hemiGround: new THREE.Color("#C4B48E"),
  hemiIntensity: 1.05,
  fog: new THREE.Color("#CFE8F5"),
  fogNear: 130,
  fogFar: 620,
};

export const NIGHT = {
  sun: new THREE.Color("#8FA8E0"),
  sunIntensity: 0.55,
  ambient: new THREE.Color("#31408A"),
  ambientIntensity: 0.38,
  hemiSky: new THREE.Color("#2A3672"),
  hemiGround: new THREE.Color("#141A33"),
  hemiIntensity: 0.5,
  fog: new THREE.Color("#141C3D"),
  fogNear: 100,
  fogFar: 520,
};

/** Convenience: is it dark enough for lamps and windows to be lit? */
export const lampLevel = () => THREE.MathUtils.smoothstep(dayMix.night, 0.12, 0.75);
