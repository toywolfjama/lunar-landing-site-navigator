/* Procedural surface detail for the Moon: small craters and mottled regolith, drawn in the shader on top of the
   texture (the sphere) and the site meshes. Both use the same world-space pattern, so the two meet without a seam.
   Each crater layer fades out once it is smaller than a few pixels, so distant views cost little and never shimmer. */
import * as THREE from "three";

const GLSL = /* glsl */ `
uniform vec3 uDetailOrigin;
varying vec3 vDetailP;
vec3 dHash(vec3 p) {
  vec3 q = fract(p * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}
float dNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = dHash(i).x, b = dHash(i + vec3(1, 0, 0)).x, c = dHash(i + vec3(0, 1, 0)).x, d = dHash(i + vec3(1, 1, 0)).x;
  float e = dHash(i + vec3(0, 0, 1)).x, g = dHash(i + vec3(1, 0, 1)).x, h = dHash(i + vec3(0, 1, 1)).x, k = dHash(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
// one layer of craters, one at most per cell, checked in the 2x2x2 cells that can reach p
vec2 dCraters(vec3 p, float seed) {
  vec3 base = floor(p + 0.15) - 1.0;
  float h = 0.0, alb = 0.0;
  for (int z = 0; z < 2; z++) for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec3 cell = base + vec3(x, y, z);
    vec3 r = dHash(cell + seed);
    if (r.z > 0.62) continue;
    float rad = 0.12 + 0.13 * r.x * r.x;
    vec3 c = cell + 0.25 + 0.5 * dHash(cell + seed + 17.0);
    float d = length(p - c) / rad;
    if (d < 1.0) { h += (d * d - 1.0) * 0.55 + 0.12; alb -= 0.05 * (1.0 - d * d); }
    else if (d < 1.6) { float t = 1.0 - (d - 1.0) / 0.6; h += 0.12 * t * t; alb += 0.06 * t * r.y; }
  }
  return vec2(h * 0.2, alb);
}
`;

export function addSurfaceDetail(material: THREE.Material, origin: THREE.Vector3, strength = 1) {
  const uOrigin = { value: origin.clone() };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDetailOrigin = uOrigin;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uDetailOrigin;\nvarying vec3 vDetailP;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvDetailP = (modelMatrix * vec4(transformed, 1.0)).xyz - uDetailOrigin;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float dFoot = length(fwidth(vDetailP)); // km per pixel here
        float dH = 0.0, dA = 0.0;
        // cell sizes in km: 24, 5, 1.1, 0.25, 0.06, 0.015
        float sc = 24.0;
        for (int i = 0; i < 6; i++) {
          float w = 1.0 - smoothstep(0.02 * sc, 0.08 * sc, dFoot);
          if (w > 0.0) {
            vec2 c = dCraters(vDetailP / sc, float(i) * 7.0);
            dH += c.x * sc * w;
            dA += c.y * w;
          }
          sc *= 0.235;
        }
        float mott = dNoise(vDetailP / 3.0) * 0.6 + dNoise(vDetailP / 0.4) * 0.4 * (1.0 - smoothstep(0.004, 0.02, dFoot));
        diffuseColor.rgb *= clamp(1.0 + (dA + (mott - 0.5) * 0.16) * ${strength.toFixed(2)}, 0.6, 1.4);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          // bump from the crater heights, using screen-space derivatives (as three.js does for bump maps)
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          float hX = dFdx(dH), hY = dFdy(dH);
          vec3 r1 = cross(sY, normal), r2 = cross(normal, sX);
          float det = dot(sX, r1) * (gl_FrontFacing ? 1.0 : -1.0);
          vec3 grad = sign(det) * (hX * r1 + hY * r2);
          normal = normalize(abs(det) * normal - grad * ${(0.8 * strength).toFixed(2)});
        }`
      );
  };
  material.customProgramCacheKey = () => "surface-detail-" + strength;
  material.needsUpdate = true;
  return { setOrigin: (v: THREE.Vector3) => uOrigin.value.copy(v) };
}
