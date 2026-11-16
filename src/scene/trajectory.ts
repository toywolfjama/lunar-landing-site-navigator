/* The whole trip, Earth to touchdown, as one function of playback time. Phases follow a real robotic landing profile:
   trans-lunar coast, lunar orbit insertion, a 100 km orbit, descent orbit insertion, a coast down to 15 km, then the
   powered descent (braking burn, approach, terminal descent) and touchdown. The descent uses cubic Hermite curves
   between published Apollo-style gates; Earth's distance is not to scale, the Moon-side geometry is.
   Everything is in the Moon-centred scene frame, in km. */
import * as THREE from "three";

const MU = 4902.8; // lunar GM, km^3/s^2
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const herm = (p0: number, p1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};
const hermD = (p0: number, p1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u;
  return (6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * m0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * m1;
};

export interface Phase {
  name: string;
  short: string;
  color: string;
  anim: number; // seconds of playback at 1x
  real: number; // seconds of mission time
  burn: boolean;
}

export const PHASES: Phase[] = [
  { name: "Trans-lunar coast", short: "Coast", color: "#8fb3ff", anim: 9, real: 3 * 86400, burn: false },
  { name: "Lunar orbit insertion burn", short: "LOI", color: "#f5a524", anim: 2.5, real: 360, burn: true },
  { name: "Lunar orbit, 100 km", short: "Orbit", color: "#cfcfd4", anim: 7, real: 4200, burn: false },
  { name: "Descent orbit insertion burn", short: "DOI", color: "#f5a524", anim: 1.5, real: 30, burn: true },
  { name: "Coast down to 15 km", short: "To 15 km", color: "#cfcfd4", anim: 5, real: 3540, burn: false },
  { name: "Braking burn", short: "Braking", color: "#f5a524", anim: 13, real: 510, burn: true },
  { name: "Approach", short: "Approach", color: "#ff8a3d", anim: 8, real: 150, burn: true },
  { name: "Terminal descent", short: "Terminal", color: "#4ab064", anim: 9, real: 40, burn: true },
  { name: "Touchdown", short: "Touchdown", color: "#4ab064", anim: 3, real: 5, burn: false },
];
export const PHASE_START = PHASES.reduce<number[]>((a, p, i) => (a.push(i ? a[i - 1] + PHASES[i - 1].anim : 0), a), []);
export const TOTAL_ANIM = PHASE_START[PHASES.length - 1] + PHASES[PHASES.length - 1].anim;
export const DESCENT_START = PHASE_START[5];

export interface MissionInput {
  site: THREE.Vector3; // unit vector to the site, scene frame
  east: THREE.Vector3;
  north: THREE.Vector3;
  R: number; // radius of the local datum sphere, km
  earth: THREE.Vector3; // Earth centre in the scene (not to scale), km
  earthR: number;
  spot: { x: number; y: number }; // touchdown point, m east/north of the site
  heightAt: (x: number, y: number) => number; // m above datum, local
}

export interface Sample {
  pos: THREE.Vector3;
  vel: THREE.Vector3; // direction of motion (unit)
  quat: THREE.Quaternion;
  throttle: number;
  phase: number;
  u: number;
  altKm: number; // above the ground
  speedKms: number;
  vsKms: number; // vertical speed, + up
  distMoonKm: number; // real distance to the Moon's centre (coast only)
  remainS: number; // mission time to touchdown
}

export function buildMission(inp: MissionInput) {
  const { site: s, R, earth } = inp;
  // descent heading: horizontal, toward Earth (so the lander arrives over the near side), else east
  const eDir = earth.clone().normalize();
  let dh = eDir.clone().sub(s.clone().multiplyScalar(eDir.dot(s)));
  if (dh.length() < 0.05) dh = inp.east.clone();
  dh.normalize();
  const dhE = dh.dot(inp.east), dhN = dh.dot(inp.north);
  const P = (th: number, h: number) => s.clone().multiplyScalar(Math.cos(th)).add(dh.clone().multiplyScalar(Math.sin(th))).multiplyScalar(R + h);
  const T = (th: number) => s.clone().multiplyScalar(-Math.sin(th)).add(dh.clone().multiplyScalar(Math.cos(th))).normalize();

  const thPDI = -480 / R;
  const thDOI = thPDI - Math.PI;
  const thLOI = thDOI - 1.4 * Math.PI;
  const LOI_SPAN = 0.3, DOI_SPAN = 0.03;

  // trans-lunar coast: a cubic Bezier from just off Earth to the LOI point, arriving along the orbit
  const P3 = P(thLOI, 100);
  const toMoon = earth.clone().negate().normalize();
  const P0 = earth.clone().add(toMoon.clone().multiplyScalar(inp.earthR * 1.08));
  const D = P0.distanceTo(P3);
  const side = new THREE.Vector3().crossVectors(toMoon, s.clone().cross(dh)).normalize();
  const P1 = P0.clone().add(toMoon.clone().multiplyScalar(D * 0.35)).add(side.clone().multiplyScalar(D * 0.22));
  const P2 = P3.clone().sub(T(thLOI).multiplyScalar(D * 0.32));
  const bez = (u: number) => {
    const a = 1 - u;
    return P0.clone().multiplyScalar(a * a * a).add(P1.clone().multiplyScalar(3 * a * a * u)).add(P2.clone().multiplyScalar(3 * a * u * u)).add(P3.clone().multiplyScalar(u * u * u));
  };
  // keep the coast outside the Moon
  for (let it = 0; it < 12; it++) {
    let bad = false;
    for (let k = 0; k <= 60; k++) {
      const p = bez(k / 60);
      if (p.length() < R + 60) {
        P2.add(p.clone().normalize().multiplyScalar(R * 0.4));
        bad = true;
        break;
      }
    }
    if (!bad) break;
  }

  // powered descent gates (downrange x km, altitude h km, rates km/s)
  const G = [
    { x: -480, h: 15, vx: 1.69, vh: 0 }, // powered descent initiation
    { x: -7, h: 2.3, vx: 0.13, vh: -0.04 }, // high gate: pitch up, site in view
    { x: -0.03, h: 0.06, vx: 0.001, vh: -0.003 }, // low gate
    { x: 0, h: 0, vx: 0, vh: -0.001 }, // touchdown
  ];
  const ground = (xKm: number, w: number) => {
    const lx = xKm * 1000 * dhE + inp.spot.x * w, ly = xKm * 1000 * dhN + inp.spot.y * w;
    return Math.abs(lx) < 15000 && Math.abs(ly) < 15000 ? inp.heightAt(lx, ly) / 1000 : 0;
  };
  const offset = (w: number) => inp.east.clone().multiplyScalar((inp.spot.x * w) / 1000).add(inp.north.clone().multiplyScalar((inp.spot.y * w) / 1000));

  const orient = (up: THREE.Vector3, fwd: THREE.Vector3) => {
    const y = up.clone().normalize();
    let z = fwd.clone().sub(y.clone().multiplyScalar(fwd.dot(y)));
    if (z.length() < 1e-4) z = Math.abs(y.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };

  // the raw state in each phase, before attitude blending
  const raw = (ph: number, u: number) => {
    const pp = PHASES[ph];
    let pos: THREE.Vector3, vel: THREE.Vector3, up: THREE.Vector3, thr = 0, alt = 0, spd = 0, vs = 0, dist = 0;
    if (ph === 0) {
      pos = bez(u);
      const e = 1e-3;
      vel = bez(Math.min(1, u + e)).sub(bez(Math.max(0, u - e))).normalize();
      up = vel.clone();
      // real speeds along a trans-lunar trajectory: fast off Earth, slowest near the neutral point, faster at the Moon
      spd = u < 0.85 ? 10.8 - (10.8 - 0.9) * Math.pow(u / 0.85, 0.35) : 0.9 + (2.4 - 0.9) * ((u - 0.85) / 0.15) ** 2;
      dist = 384400 * (1 - u) + 1837 * u;
      alt = dist - 1737.4;
    } else if (ph <= 4) {
      const th = ph === 1 ? thLOI + LOI_SPAN * u : ph === 2 ? thLOI + LOI_SPAN + (thDOI - thLOI - LOI_SPAN) * u : ph === 3 ? thDOI + DOI_SPAN * u : thDOI + DOI_SPAN + (thPDI - thDOI - DOI_SPAN) * u;
      const h = ph <= 3 ? 100 - (ph === 3 ? 0 : 0) : 57.5 - 42.5 * Math.cos(th - thPDI);
      pos = P(th, h);
      vel = T(th);
      up = pp.burn ? vel.clone().negate() : pos.clone().normalize();
      thr = ph === 1 ? 1 : ph === 3 ? 0.6 : 0;
      const r = R + h, a = ph === 4 ? R + 57.5 : R + 100;
      spd = Math.sqrt(MU * (2 / r - 1 / a)) + (ph === 1 ? 0.8 * (1 - u) : 0);
      vs = ph === 4 ? (42.5 * Math.sin(th - thPDI) * (thPDI - thDOI)) / pp.real : 0;
      alt = h;
    } else if (ph <= 7) {
      const g0 = G[ph - 5], g1 = G[ph - 4], dur = pp.real;
      const x = herm(g0.x, g1.x, g0.vx * dur, g1.vx * dur, u);
      const h = herm(g0.h, g1.h, g0.vh * dur, g1.vh * dur, u);
      const vx = hermD(g0.x, g1.x, g0.vx * dur, g1.vx * dur, u) / dur;
      const vh = hermD(g0.h, g1.h, g0.vh * dur, g1.vh * dur, u) / dur;
      const w = ph === 5 ? 0 : ph === 6 ? smooth(u) * 0.6 : 0.6 + 0.4 * smooth(u);
      const gr = ground(x, w);
      pos = P(x / R, h + gr).add(offset(w));
      const radial = pos.clone().normalize();
      vel = T(x / R).multiplyScalar(vx).add(radial.clone().multiplyScalar(vh)).normalize();
      // thrust leans back against the motion, then comes upright
      const k = ph === 5 ? 0.12 + 0.43 * smooth(u) : ph === 6 ? 0.55 + 0.4 * smooth(u) : 0.95 + 0.05 * smooth(u * 2);
      up = T(x / R).negate().multiplyScalar(1 - k).add(radial.clone().multiplyScalar(k)).normalize();
      thr = ph === 5 ? 1 - 0.35 * u : ph === 6 ? 0.6 - 0.12 * u : 0.42 - 0.06 * u;
      spd = Math.hypot(vx, vh);
      vs = vh;
      alt = h;
    } else {
      const gr = ground(0, 1);
      pos = P(0, gr).add(offset(1));
      vel = pos.clone().normalize().negate();
      up = pos.clone().normalize();
      alt = 0;
    }
    return { pos, vel, up, thr, alt, spd, vs, dist };
  };

  const fwdOf = (r: { vel: THREE.Vector3 }) => r.vel;
  const sample = (tau: number): Sample => {
    const t = Math.max(0, Math.min(TOTAL_ANIM - 1e-6, tau));
    let ph = 0;
    while (ph < PHASES.length - 1 && t >= PHASE_START[ph + 1]) ph++;
    const u = (t - PHASE_START[ph]) / PHASES[ph].anim;
    const r = raw(ph, u);
    let q = orient(r.up, fwdOf(r));
    if (ph > 0 && u < 0.25) {
      const prev = raw(ph - 1, 1);
      q = orient(prev.up, fwdOf(prev)).slerp(q, smooth(u / 0.25));
    }
    let remain = 0;
    for (let i = ph; i < PHASES.length - 1; i++) remain += PHASES[i].real * (i === ph ? 1 - u : 1);
    return { pos: r.pos, vel: r.vel, quat: q, throttle: r.thr, phase: ph, u, altKm: r.alt, speedKms: r.spd, vsKms: r.vs, distMoonKm: r.dist, remainS: remain };
  };

  // the drawn path, with one colour per phase
  const path: { pts: number[]; cols: number[]; tau: number[] } = { pts: [], cols: [], tau: [] };
  const col = new THREE.Color();
  for (let ph = 0; ph < PHASES.length - 1; ph++) {
    const n = ph === 0 ? 260 : ph === 2 ? 160 : ph === 5 ? 220 : ph === 6 || ph === 7 ? 120 : 60;
    col.set(PHASES[ph].color);
    for (let i = 0; i <= n; i++) {
      if (ph > 0 && i === 0) continue;
      const tau = PHASE_START[ph] + (PHASES[ph].anim * i) / n;
      const p = raw(ph, i / n).pos;
      path.pts.push(p.x, p.y, p.z);
      path.cols.push(col.r, col.g, col.b);
      path.tau.push(tau);
    }
  }
  // the points where each phase begins, for labels
  const marks = PHASES.map((p, i) => ({ name: p.short, pos: raw(i, 0).pos }));
  return { sample, path, marks, heading: dh };
}
export type Mission = ReturnType<typeof buildMission>;
