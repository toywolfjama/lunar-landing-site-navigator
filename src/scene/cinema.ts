/* Cinematic camera: one shot per moment of the mission, cut like a launch broadcast. Distances in km; the lander is
   about 0.004 km tall. Ground cameras sit beside the touchdown spot and zoom like a telephoto lens. */
import * as THREE from "three";
import type { Sample } from "./trajectory";

export interface ShotContext {
  earthPos: THREE.Vector3;
  siteUp: THREE.Vector3; // local vertical at the site
  spot: THREE.Vector3; // touchdown point on the ground
  groundCamFar: THREE.Vector3; // ~150 m from the spot, on the ground
  groundCamNear: THREE.Vector3; // ~35 m from the spot, low
  sideAtSite: THREE.Vector3; // horizontal, across the approach
  sunHoriz: THREE.Vector3; // horizontal direction toward the Sun at the site
  orbitN?: THREE.Vector3; // normal of the orbit plane: a side direction that never flips
  aspect?: number; // camera aspect, so wide shots also fit a phone
}

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  slow: number; // playback slow-down factor (1 = normal)
  id: string; // changes on every cut
}

export function shot(smp: Sample, ctx: ShotContext, _timeS: number): Shot {
  const p = smp.pos;
  const radial = p.clone().normalize();
  const fwd = smp.vel.clone().normalize();
  let side = ctx.orbitN ? ctx.orbitN.clone().negate() : new THREE.Vector3().crossVectors(fwd, radial);
  if (side.lengthSq() < 1e-6) side = ctx.sideAtSite.clone();
  side.normalize();
  const nearMoon = p.length() < 1737.4 + 600;
  const up = nearMoon ? radial.clone() : new THREE.Vector3(0, 1, 0);
  const at = (v: THREE.Vector3, ...parts: [THREE.Vector3, number][]) => parts.reduce((a, [d, k]) => a.add(d.clone().multiplyScalar(k)), v.clone());
  const { phase: ph, u } = smp;
  let s: Shot;

  if (ph === 0) {
    if (u < 0.2) {
      const mid = ctx.earthPos.clone().multiplyScalar(0.5);
      const dir = new THREE.Vector3().crossVectors(ctx.earthPos, new THREE.Vector3(0, 1, 0)).normalize().add(new THREE.Vector3(0, 0.4, 0)).normalize();
      const fit = 1.7 / Math.min(1, (ctx.aspect || 1.6) * 0.75);
      s = { pos: mid.clone().add(dir.multiplyScalar(ctx.earthPos.length() * fit)), target: mid, up: new THREE.Vector3(0, 1, 0), fov: 45, slow: 1, id: "0a" };
    } else if (u < 0.6) {
      const away = p.clone().sub(ctx.earthPos).normalize(); // camera ahead, Earth behind the lander
      s = { pos: at(p, [away, 0.016], [side, 0.006], [new THREE.Vector3(0, 1, 0), 0.003]), target: p, up: new THREE.Vector3(0, 1, 0), fov: 40, slow: 1, id: "0b" };
    } else {
      const back = p.clone().normalize(); // camera on the far side of the lander from the Moon
      s = { pos: at(p, [back, 0.016], [side, 0.007]), target: p, up: new THREE.Vector3(0, 1, 0), fov: 40, slow: 1, id: "0c" };
    }
  } else if (ph === 1 || ph === 3) {
    s = { pos: at(p, [side, 0.014], [radial, 0.003], [fwd, 0.005]), target: at(p, [fwd, -0.002]), up, fov: 42, slow: 1, id: "burn" + ph };
  } else if (ph === 2) {
    if (u < 0.55) s = { pos: at(p, [fwd, -0.018], [radial, 0.008]), target: at(p, [fwd, 0.012], [radial, -0.004]), up, fov: 50, slow: 1, id: "2a" };
    else s = { pos: at(p, [side, 0.022], [radial, -0.003], [fwd, 0.012]), target: p, up, fov: 42, slow: 1, id: "2b" };
  } else if (ph === 4) {
    s = { pos: at(p, [fwd, -0.02], [side, 0.007], [radial, -0.002]), target: p, up, fov: 42, slow: 1, id: "4" };
  } else if (ph === 5) {
    if (u < 0.45) s = { pos: at(p, [side, 0.018], [radial, 0.002]), target: p, up, fov: 40, slow: 1, id: "5a" };
    else s = { pos: at(p, [fwd, -0.03], [radial, 0.012]), target: at(p, [fwd, 0.02], [radial, -0.01]), up, fov: 50, slow: 1, id: "5b" };
  } else if (ph === 6 && u < 0.5) {
    // high chase, looking down past the lander at the ground it is heading for
    s = { pos: at(p, [fwd, -0.045], [radial, 0.018]), target: at(p, [fwd, 0.02], [radial, -0.025]), up, fov: 50, slow: 1, id: "6a" };
  } else if (ph === 6 || ph === 7) {
    // ground cameras: frame the lander and its touchdown spot together, so the ground is always in shot
    const cam = ph === 7 && u >= 0.55 ? ctx.groundCamNear : ctx.groundCamFar;
    const toL = p.clone().sub(cam).normalize(), toS = ctx.spot.clone().sub(cam).normalize();
    const span = (toL.angleTo(toS) * 180) / Math.PI;
    const target = cam.clone().add(toL.clone().add(toS).normalize());
    const fov = Math.max(ph === 7 && u >= 0.55 ? 22 : 10, Math.min(62, span * 1.7 + 6));
    const slow = ph === 7 && smp.altKm < 0.025 ? 0.35 : 1;
    s = { pos: cam.clone(), target, up: ctx.siteUp, fov, slow, id: cam === ctx.groundCamNear ? "near" : "far" };
  } else {
    // touchdown: a slow move around the landed lander
    const a = -0.6 + u * 0.8;
    const dir = ctx.sunHoriz.clone().applyAxisAngle(ctx.siteUp, a); // start on the sunlit side

    s = { pos: at(ctx.spot, [dir, 0.017], [ctx.siteUp, 0.005]), target: at(ctx.spot, [ctx.siteUp, 0.0018]), up: ctx.siteUp, fov: 45, slow: u < 0.45 ? 0.5 : 1, id: "td" };
  }
  return s;
}
