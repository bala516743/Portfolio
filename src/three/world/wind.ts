import * as THREE from "three";

/**
 * Wind.
 *
 * Grass, leaves, flowers, flags and bunting all sway from the same clock
 * via a small patch injected into MeshStandardMaterial's vertex shader.
 * The sway is phase-shifted by world position, so a gust reads as one wave
 * crossing an island rather than every blade moving in lockstep — which is
 * the difference between "alive" and "animated".
 */

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

const WIND_CHUNK = /* glsl */ `
  #include <begin_vertex>
  {
    vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #ifdef USE_INSTANCING
      wPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif
    float phase = wPos.x * 0.33 + wPos.z * 0.27;
    // Stiffness rises from the root: the base never moves, the tip moves most.
    float h = clamp(transformed.y * uHeightScale, 0.0, 1.0);
    h = h * h;
    float s = sin(uTime * 1.35 + phase) * 0.6 + sin(uTime * 2.63 + phase * 1.7) * 0.4;
    float c = cos(uTime * 1.05 + phase * 1.2);
    transformed.x += s * uAmp * uWind * h;
    transformed.z += c * uAmp * 0.55 * uWind * h;
  }
`;

const cache = new Map<string, THREE.MeshStandardMaterial>();

type Opts = {
  /** How far the tip travels, in world units. */
  amp?: number;
  /** 1 / (local height of the object), so `h` normalises to 0..1. */
  heightScale?: number;
  roughness?: number;
  flat?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** For merged geometry that carries its part colours as vertex colours. */
  vertexColors?: boolean;
};

export function windMaterial(color: string, o: Opts = {}) {
  const key = color + JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;

  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.roughness ?? 0.82,
    metalness: 0,
    flatShading: o.flat ?? false,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    vertexColors: o.vertexColors ?? false,
    emissive: new THREE.Color(o.emissive ?? "#000000"),
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });

  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uAmp = { value: o.amp ?? 0.12 };
    shader.uniforms.uHeightScale = { value: o.heightScale ?? 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "uniform float uTime;\nuniform float uWind;\nuniform float uAmp;\nuniform float uHeightScale;\nvoid main() {"
      )
      .replace("#include <begin_vertex>", WIND_CHUNK);
  };
  // Materials with different onBeforeCompile need distinct cache keys or
  // three will reuse the wrong compiled program.
  m.customProgramCacheKey = () => key;

  cache.set(key, m);
  return m;
}

export function disposeWind() {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
