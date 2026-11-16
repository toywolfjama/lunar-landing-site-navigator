/**
 * lunarAstronomy.ts
 * Pure TypeScript physics module for the Lunar Landing Site Navigator. No UI dependencies, no network access.
 *
 *  - Sun and Earth directions: analytic ephemeris (truncated Meeus "Astronomical Algorithms" ch. 25, 47, 53,
 *    a reduction of ELP-2000/82). Checked against JPL Horizons (target 301, quantities 14, 15, 20) on 16 dates,
 *    Feb to May 2027: sub-Earth and sub-solar points agree within 0.06 deg, range within 190 km.
 *    Physical libration and nutation are neglected.
 *  - Terrain and horizon masks: NASA LRO LOLA polar elevation models, precomputed in lolaData.ts.
 */

import { LOLA } from "./lolaData";

export const DEG = Math.PI / 180;
export const R_MOON_KM = 1737.4;
export const R_EARTH_KM = 6378.14;
export const R_SUN_KM = 695700;
export const AU_KM = 149597870.7;
export const T_SYN_DAYS = 29.530589;
export const LUNAR_INCLINATION_DEG = 1.54242; // lunar equator to ecliptic

export const GRID_N = 21;
export const GRID_STEP_M = 100;
export const GRID_HALF_M = 1000;
export const N_AZ = 360; // horizon profile resolution: 1 deg
export const MAST_HEIGHT_M = 2; // solar array / antenna height above ground

/* ------------------------------------------------------------------ */
/* Sites                                                               */
/* ------------------------------------------------------------------ */

export interface Site {
  id: string;
  name: string;
  short: string;
  lat: number; // degrees, negative south
  lon: number; // degrees east
  terrain: boolean; // true: LOLA terrain and horizon mask; false: smooth-sphere horizon
  note: string;
}

export const SITES: Site[] = [
  { id: "shackleton", name: "Shackleton Connecting Ridge", short: "Shackleton Ridge", lat: -89.45, lon: 222.6, terrain: true,
    note: "Narrow crest between Shackleton and de Gerlache craters, in the Artemis III candidate region." },
  { id: "malapert", name: "Malapert Massif", short: "Malapert Massif", lat: -86.0, lon: 0.0, terrain: true,
    note: "High nearside massif on the 0° meridian, facing Earth." },
  { id: "mouton", name: "Mons Mouton", short: "Mons Mouton", lat: -84.6, lon: 31.0, terrain: true,
    note: "Broad flat-topped mountain, a target region for CLPS deliveries." },
  { id: "athena", name: "IM-2 Athena landing site", short: "IM-2 Athena", lat: -84.7906, lon: 29.1957, terrain: true,
    note: "Intuitive Machines IM-2, a NASA CLPS delivery, touched down here on 6 March 2025 about 250 m from its target and came to rest on its side in a crater." },
  { id: "chandrayaan3", name: "Chandrayaan-3 · Shiv Shakti", short: "Chandrayaan-3", lat: -69.373, lon: 32.319, terrain: false,
    note: "ISRO landing site, August 2023. No terrain loaded: horizon is a smooth sphere." },
  { id: "apollo11", name: "Apollo 11 · Tranquility Base", short: "Apollo 11", lat: 0.674, lon: 23.473, terrain: false,
    note: "First crewed landing, July 1969. Near the equator the Sun rises high and Earth stays overhead. No terrain loaded." },
];

export function customSite(lat: number, lon: number): Site {
  return { id: "custom", name: "Custom coordinates", short: "Custom site", lat: clamp(lat, -90, 90), lon: norm360(lon), terrain: false,
    note: "Your own coordinates. No terrain loaded: horizon is a smooth sphere." };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function norm360(x: number): number {
  const y = x % 360;
  return y < 0 ? y + 360 : y;
}

export function norm180(x: number): number {
  const y = norm360(x);
  return y > 180 ? y - 360 : y;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/* ------------------------------------------------------------------ */
/* Analytic ephemeris                                                  */
/* ------------------------------------------------------------------ */

export interface Ephemeris {
  subSolarLon: number; // selenographic, deg east (-180..180)
  subSolarLat: number;
  subEarthLon: number; // optical libration in longitude
  subEarthLat: number; // optical libration in latitude
  earthDistKm: number;
  sunDistKm: number;
}

// Periodic terms: [D, M, M', F, coefficient]
const LON_TERMS: number[][] = [
  [0, 0, 1, 0, 6.288774], [2, 0, -1, 0, 1.274027], [2, 0, 0, 0, 0.658314],
  [0, 0, 2, 0, 0.213618], [0, 1, 0, 0, -0.185116], [0, 0, 0, 2, -0.114332],
  [2, 0, -2, 0, 0.058793], [2, -1, -1, 0, 0.057066], [2, 0, 1, 0, 0.053322],
  [2, -1, 0, 0, 0.045758], [0, 1, -1, 0, -0.040923], [1, 0, 0, 0, -0.03472],
  [0, 1, 1, 0, -0.030383], [2, 0, 0, -2, 0.015327], [0, 0, 1, 2, -0.012528],
  [0, 0, 1, -2, 0.01098], [4, 0, -1, 0, 0.010675], [0, 0, 3, 0, 0.010034],
  [4, 0, -2, 0, 0.008548], [2, 1, -1, 0, -0.007888], [2, 1, 0, 0, -0.006766],
  [1, 0, -1, 0, -0.005163], [1, 1, 0, 0, 0.004987], [2, -1, 1, 0, 0.004036],
];
const LAT_TERMS: number[][] = [
  [0, 0, 0, 1, 5.128122], [0, 0, 1, 1, 0.280602], [0, 0, 1, -1, 0.277693],
  [2, 0, 0, -1, 0.173237], [2, 0, -1, 1, 0.055413], [2, 0, -1, -1, 0.046271],
  [2, 0, 0, 1, 0.032573], [0, 0, 2, 1, 0.017198], [2, 0, 1, -1, 0.009266],
  [0, 0, 2, -1, 0.008822], [2, -1, 0, -1, 0.008216], [2, 0, -2, -1, 0.004324],
  [2, 0, 1, 1, 0.0042],
];
const DIST_TERMS: number[][] = [
  [0, 0, 1, 0, -20905.355], [2, 0, -1, 0, -3699.111], [2, 0, 0, 0, -2955.968],
  [0, 0, 2, 0, -569.925], [0, 1, 0, 0, 48.888], [0, 0, 0, 2, -3.149],
  [2, 0, -2, 0, 246.158], [2, -1, -1, 0, -152.138], [2, 0, 1, 0, -170.733],
  [2, -1, 0, 0, -204.586], [0, 1, -1, 0, -129.62], [1, 0, 0, 0, 108.743],
  [0, 1, 1, 0, 104.755],
];

function selenographic(lambdaDeg: number, betaDeg: number, omegaDeg: number, fDeg: number) {
  const I = LUNAR_INCLINATION_DEG * DEG;
  const W = (lambdaDeg - omegaDeg) * DEG;
  const b = betaDeg * DEG;
  const A = Math.atan2(
    Math.sin(W) * Math.cos(b) * Math.cos(I) - Math.sin(b) * Math.sin(I),
    Math.cos(W) * Math.cos(b)
  );
  const lon = norm180(A / DEG - fDeg);
  const lat = Math.asin(-Math.sin(W) * Math.cos(b) * Math.sin(I) - Math.sin(b) * Math.cos(I)) / DEG;
  return { lon, lat };
}

export function ephemeris(unixMs: number): Ephemeris {
  const jd = unixMs / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;

  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * DEG;
  const M = (357.5291092 + 35999.0502909 * T) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG;
  const Fdeg = 93.272095 + 483202.0175233 * T;
  const F = Fdeg * DEG;
  const Omega = 125.0445479 - 1934.1362891 * T;

  let sl = 0;
  for (const t of LON_TERMS) sl += t[4] * Math.sin(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
  let sb = 0;
  for (const t of LAT_TERMS) sb += t[4] * Math.sin(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
  let sr = 0;
  for (const t of DIST_TERMS) sr += t[4] * Math.cos(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);

  const lambda = Lp + sl;
  const beta = sb;
  const earthDistKm = 385000.56 + sr;

  // Sun (geocentric, ecliptic of date)
  const L0 = 280.46646 + 36000.76983 * T;
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const lambdaSun = L0 + C;
  const e = 0.016708634 - 0.000042037 * T;
  const nu = M + C * DEG;
  const sunDistKm = ((1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu))) * AU_KM;

  // Selenographic position of Earth (optical libration) and Sun
  const earth = selenographic(lambda, beta, Omega, Fdeg);
  const ratio = earthDistKm / sunDistKm;
  const lambdaH = lambdaSun + 180 + ratio * 57.296 * Math.cos(beta * DEG) * Math.sin((lambdaSun - lambda) * DEG);
  const betaH = ratio * beta;
  const sun = selenographic(lambdaH, betaH, Omega, Fdeg);

  const out: Ephemeris = {
    subSolarLon: sun.lon,
    subSolarLat: sun.lat,
    subEarthLon: earth.lon,
    subEarthLat: earth.lat,
    earthDistKm,
    sunDistKm,
  };
  // Live JPL Horizons table, when one has been loaded for this time range, replaces the analytic values.
  const tb = liveTable;
  if (tb && unixMs >= tb.t0 && unixMs <= tb.t0 + (tb.n - 1) * tb.stepMs) {
    const f = (unixMs - tb.t0) / tb.stepMs;
    const i = Math.min(tb.n - 2, Math.floor(f));
    const w = f - i;
    const a = i * 5;
    const b = a + 5;
    const r = tb.rows;
    out.subEarthLon = norm180(r[a] + norm180(r[b] - r[a]) * w);
    out.subEarthLat = r[a + 1] + (r[b + 1] - r[a + 1]) * w;
    out.subSolarLon = norm180(r[a + 2] + norm180(r[b + 2] - r[a + 2]) * w);
    out.subSolarLat = r[a + 3] + (r[b + 3] - r[a + 3]) * w;
    out.earthDistKm = r[a + 4] + (r[b + 4] - r[a + 4]) * w;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Earth-Moon-Sun frames for the overview scene                        */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];
type M3 = [V3, V3, V3]; // rows: body = M * ecliptic

export interface SceneFrames {
  moonDir: V3; // geocentric unit vector to the Moon, ecliptic of date
  sunDir: V3; // geocentric unit vector to the Sun
  moonKm: number; // Earth-Moon centre distance
  eclToMoon: M3; // ecliptic -> selenographic (x to 0E 0N, z to the lunar north pole)
  eclToEarth: M3; // ecliptic -> Earth-fixed (x to 0E 0N, z to the north pole), using mean sidereal time
  subLunarLat: number; // where on Earth the Moon is overhead
  subLunarLon: number;
}

/**
 * Same Meeus series as ephemeris(), returned as rotation matrices so that Earth, the Moon and the Sun can be drawn
 * in one frame: Earth turned to its real sidereal angle, the Moon turned to its real libration.
 */
export function sceneFrames(unixMs: number): SceneFrames {
  const jd = unixMs / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * DEG;
  const M = (357.5291092 + 35999.0502909 * T) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG;
  const Fdeg = 93.272095 + 483202.0175233 * T;
  const F = Fdeg * DEG;
  const Omega = 125.0445479 - 1934.1362891 * T;
  let sl = 0, sb = 0, sr = 0;
  for (const t of LON_TERMS) sl += t[4] * Math.sin(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
  for (const t of LAT_TERMS) sb += t[4] * Math.sin(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
  for (const t of DIST_TERMS) sr += t[4] * Math.cos(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
  const lambda = Lp + sl;
  const beta = sb;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const lambdaSun = 280.46646 + 36000.76983 * T + C;

  const sph = (lonDeg: number, latDeg: number): V3 => unit(lonDeg, latDeg);
  const moonDir = sph(lambda, beta);
  const sunDir = sph(lambdaSun, 0);

  // ecliptic -> selenographic: selenographic(lambda, beta) gives the Moon-fixed coordinates of the point facing the
  // direction opposite to (lambda, beta), so feed it the reversed direction of each ecliptic axis.
  const toMoon = (v: V3): V3 => {
    const r = Math.hypot(v[0], v[1]);
    const lo = Math.atan2(-v[1], -v[0]) / DEG;
    const la = Math.atan2(-v[2], r) / DEG;
    const s = selenographic(lo, la, Omega, Fdeg);
    return sph(s.lon, s.lat);
  };
  const cx = toMoon([1, 0, 0]), cy = toMoon([0, 1, 0]), cz = toMoon([0, 0, 1]);
  const eclToMoon: M3 = [
    [cx[0], cy[0], cz[0]],
    [cx[1], cy[1], cz[1]],
    [cx[2], cy[2], cz[2]],
  ];

  // ecliptic -> equatorial (obliquity) -> Earth-fixed (Greenwich mean sidereal time)
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) * DEG;
  const ce = Math.cos(eps), se = Math.sin(eps), cg = Math.cos(gmst), sg = Math.sin(gmst);
  // equatorial = Rx(-eps) * ecliptic ; earth = Rz(-gmst) * equatorial
  const E: M3 = [
    [1, 0, 0],
    [0, ce, -se],
    [0, se, ce],
  ];
  const R: M3 = [
    [cg, sg, 0],
    [-sg, cg, 0],
    [0, 0, 1],
  ];
  const eclToEarth = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[i][0] * E[0][j] + R[i][1] * E[1][j] + R[i][2] * E[2][j])) as M3;
  const sub = [0, 1, 2].map((i) => eclToEarth[i][0] * moonDir[0] + eclToEarth[i][1] * moonDir[1] + eclToEarth[i][2] * moonDir[2]);
  return {
    moonDir,
    sunDir,
    moonKm: 385000.56 + sr,
    eclToMoon,
    eclToEarth,
    subLunarLat: Math.asin(sub[2]) / DEG,
    subLunarLon: Math.atan2(sub[1], sub[0]) / DEG,
  };
}

/* Live ephemeris table (JPL Horizons observer quantities 14, 15, 20 for the Moon, geocentric). */
export interface EphemerisTable {
  t0: number;
  stepMs: number;
  n: number;
  rows: Float64Array; // n x [subEarthLon, subEarthLat, subSolarLon, subSolarLat, earthDistKm]
}
let liveTable: EphemerisTable | null = null;
export function setEphemerisTable(t: EphemerisTable | null): void {
  liveTable = t;
}

export function horizonsUrl(startMs: number, days: number): string {
  const d = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  const q: Record<string, string> = {
    format: "text", COMMAND: "'301'", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'500@399'",
    START_TIME: `'${d(startMs)}'`, STOP_TIME: `'${d(startMs + days * 86400000)}'`, STEP_SIZE: "'1 h'", QUANTITIES: "'14,15,20'", CSV_FORMAT: "'YES'",
  };
  return "https://ssd.jpl.nasa.gov/api/horizons.api?" + Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
}

/** Parse a Horizons CSV response (hourly rows starting at startMs). Returns null if it does not look right. */
export function parseHorizons(text: string, startMs: number): EphemerisTable | null {
  const a = text.indexOf("$$SOE");
  const b = text.indexOf("$$EOE");
  if (a < 0 || b < a) return null;
  const lines = text.slice(a + 5, b).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 48) return null;
  const rows = new Float64Array(lines.length * 5);
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].split(",");
    const v = [parseFloat(c[3]), parseFloat(c[4]), parseFloat(c[5]), parseFloat(c[6]), parseFloat(c[7]) * AU_KM];
    if (v.some((x) => !isFinite(x))) return null;
    rows.set(v, i * 5);
  }
  return { t0: startMs, stepMs: 3600000, n: lines.length, rows };
}

/* ------------------------------------------------------------------ */
/* Local sky (azimuth from true local north, clockwise through east)   */
/* ------------------------------------------------------------------ */

export interface Sky {
  sunAz: number;
  sunEl: number;
  sunRadius: number; // angular radius, deg
  earthAz: number;
  earthEl: number;
  earthRadius: number; // angular radius, deg (about 0.95)
  earthRangeKm: number;
  eph: Ephemeris;
}

function unit(lonDeg: number, latDeg: number): [number, number, number] {
  const lo = lonDeg * DEG;
  const la = latDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function toAzEl(site: Site, v: [number, number, number]) {
  const lo = site.lon * DEG;
  const la = site.lat * DEG;
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const r = Math.hypot(v[0], v[1], v[2]);
  const ve = v[0] * e[0] + v[1] * e[1];
  const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  const vu = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return { az: norm360(Math.atan2(ve, vn) / DEG), el: Math.asin(vu / r) / DEG, range: r };
}

export function localSky(site: Site, unixMs: number): Sky {
  const eph = ephemeris(unixMs);
  const rs = R_MOON_KM + siteDatumM(site) / 1000;
  const s = unit(site.lon, site.lat);
  const sv: [number, number, number] = [s[0] * rs, s[1] * rs, s[2] * rs];

  const su = unit(eph.subSolarLon, eph.subSolarLat);
  const sun = toAzEl(site, [
    su[0] * eph.sunDistKm - sv[0],
    su[1] * eph.sunDistKm - sv[1],
    su[2] * eph.sunDistKm - sv[2],
  ]);
  const eu = unit(eph.subEarthLon, eph.subEarthLat);
  const earth = toAzEl(site, [
    eu[0] * eph.earthDistKm - sv[0],
    eu[1] * eph.earthDistKm - sv[1],
    eu[2] * eph.earthDistKm - sv[2],
  ]);

  return {
    sunAz: sun.az,
    sunEl: sun.el,
    sunRadius: Math.asin(R_SUN_KM / sun.range) / DEG,
    earthAz: earth.az,
    earthEl: earth.el,
    earthRadius: Math.asin(R_EARTH_KM / earth.range) / DEG,
    earthRangeKm: earth.range,
    eph,
  };
}

/* ------------------------------------------------------------------ */
/* LOLA terrain and horizon masks                                      */
/* ------------------------------------------------------------------ */

const PATCH_N = 106;
const PATCH_STEP_M = 20;
const PATCH_HALF_M = 1050;

function decodeInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

export interface TerrainData {
  grid: number[]; // 441 heights, m
  patch: Int16Array; // 106 x 106, 0.5 m units
  horizon: Int16Array; // 441 x 360, 0.01 deg
}
const runtimeTerrain = new Map<string, TerrainData>();
const matrixCache = new Map<string, number[][]>();
const patchCache = new Map<string, Int16Array>();
const horizonCache = new Map<string, Int16Array>();
const profileCache = new Map<string, Float32Array>();

/** 21 x 21 heights in metres above the 1737.4 km sphere. Z[iy][ix], iy = 0 is the south row. */
export function buildElevationMatrix(site: Site): number[][] {
  const hit = matrixCache.get(site.id);
  if (hit) return hit;
  const Z: number[][] = [];
  const src = site.terrain ? (runtimeTerrain.get(site.id)?.grid ?? LOLA[site.id].grid) : null;
  for (let iy = 0; iy < GRID_N; iy++) {
    const row: number[] = [];
    for (let ix = 0; ix < GRID_N; ix++) row.push(src ? src[iy * GRID_N + ix] : 0);
    Z.push(row);
  }
  matrixCache.set(site.id, Z);
  return Z;
}

/** Height of the grid centre above the reference sphere, metres. */
export function siteDatumM(site: Site): number {
  return site.terrain ? (runtimeTerrain.get(site.id)?.grid ?? LOLA[site.id].grid)[220] : 0;
}

/** 20 m LOLA height (m) at x east, y north of the grid centre. Used for the map image. */
export function patchElevationAt(site: Site, x: number, y: number): number {
  if (!site.terrain) return 0;
  let p = patchCache.get(site.id);
  if (!p) {
    p = runtimeTerrain.get(site.id)?.patch ?? decodeInt16(LOLA[site.id].patch);
    patchCache.set(site.id, p);
  }
  const gx = clamp((x + PATCH_HALF_M) / PATCH_STEP_M, 0, PATCH_N - 1.001);
  const gy = clamp((y + PATCH_HALF_M) / PATCH_STEP_M, 0, PATCH_N - 1.001);
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const k = iy * PATCH_N + ix;
  return 0.5 * ((p[k] * (1 - fx) + p[k + 1] * fx) * (1 - fy) + (p[k + PATCH_N] * (1 - fx) + p[k + PATCH_N + 1] * fx) * fy);
}

const FLAT = new Float32Array(N_AZ);

/** Horizon elevation (deg) for each 1 deg of azimuth, seen 2 m above grid cell (ix, iy). */
export function horizonProfile(site: Site, ix: number, iy: number): Float32Array {
  if (!site.terrain) return FLAT;
  const key = site.id + ":" + ix + ":" + iy;
  const hit = profileCache.get(key);
  if (hit) return hit;
  let all = horizonCache.get(site.id);
  if (!all) {
    all = runtimeTerrain.get(site.id)?.horizon ?? decodeInt16(LOLA[site.id].horizon);
    horizonCache.set(site.id, all);
  }
  const prof = new Float32Array(N_AZ);
  const o = (iy * GRID_N + ix) * N_AZ;
  for (let a = 0; a < N_AZ; a++) prof[a] = all[o + a] / 100;
  profileCache.set(key, prof);
  return prof;
}

export function horizonAt(profile: Float32Array, azDeg: number): number {
  const p = (norm360(azDeg) / 360) * N_AZ;
  const i = Math.floor(p) % N_AZ;
  const f = p - Math.floor(p);
  return profile[i] * (1 - f) + profile[(i + 1) % N_AZ] * f;
}

/** Fraction (0..1) of a disc of angular radius r whose centre sits `clearance` deg above the horizon. */
export function discFraction(clearance: number, r: number): number {
  const h = clearance / r;
  if (h >= 1) return 1;
  if (h <= -1) return 0;
  return 1 - (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI;
}

/* ------------------------------------------------------------------ */
/* Power, comms and state                                              */
/* ------------------------------------------------------------------ */

export type Tracking = "vertical" | "horizontal";

export interface PowerConfig {
  arrayPeakW: number;
  arrayHealth: number; // 0..1
  loadW: number;
  batteryWh: number;
  tracking: Tracking;
  relay?: boolean; // a relay orbiter covers Earth blackouts (assumes continuous coverage)
}

export const DEFAULT_POWER: PowerConfig = {
  arrayPeakW: 480,
  arrayHealth: 1,
  loadW: 140,
  batteryWh: 3600,
  tracking: "vertical",
};

const SIGMA = 5.670374e-8;
/** Illustrative single-node thermal model of a small insulated lander. */
export const THERMAL = {
  heatCapacityJK: 2.0e5, // about 400 kg at 500 J/kg/K
  radiatorM2: 1.0, // effective emissivity x area
  solarAbsorbedW: 250, // absorbed sunlight when fully lit
  sinkLitK: 220, // effective surroundings when sunlit (warm ground in view)
  sinkDarkK: 100, // effective surroundings in shadow
  heaterW: 100,
  heaterOnK: 253.15, // heaters on below -20 C
  survivalC: -40, // electronics and battery survival limit
};

export type LockState = "LOCK" | "GRAZING" | "BLACKOUT" | "RELAY";

export interface State {
  t: number;
  sunAz: number;
  sunEl: number;
  sunHorizon: number;
  sunFrac: number;
  cosEff: number; // geometric incidence efficiency of the chosen array
  powerW: number;
  earthAz: number;
  earthEl: number;
  earthHorizon: number;
  earthClearance: number; // Earth centre above local horizon, deg
  earthRadius: number;
  earthRangeKm: number;
  lock: LockState;
  linkMarginDb: number; // -Infinity in blackout
  fsplDb: number;
}

/** Illustrative S-band downlink: 10 W, 12 dBi lander antenna, 34 m class ground station, 2 Mbps. */
export function linkBudget(rangeKm: number, clearance: number, earthRadius: number) {
  const fMHz = 2250;
  const fspl = 20 * Math.log10(rangeKm) + 20 * Math.log10(fMHz) + 32.45;
  const eirp = 10 + 12; // dBW
  const gOverT = 40; // dB/K
  const cn0 = eirp - fspl + gOverT + 228.6;
  const ebn0 = cn0 - 10 * Math.log10(2e6);
  const required = 4.5 + 3; // coding threshold + implementation losses
  // Low grazing angles add multipath fading off the lunar surface.
  const grazing = clamp(1 - (clearance - earthRadius) / 3, 0, 1) * 6;
  const margin = clearance <= 0 ? -Infinity : ebn0 - required - grazing;
  return { fspl, margin };
}

export function evaluate(sky: Sky, profile: Float32Array, power: PowerConfig, t: number): State {
  const sunHorizon = horizonAt(profile, sky.sunAz);
  const sunFrac = discFraction(sky.sunEl - sunHorizon, sky.sunRadius);
  const cosEff =
    power.tracking === "horizontal" ? Math.max(0, Math.sin(sky.sunEl * DEG)) : Math.max(0, Math.cos(sky.sunEl * DEG));
  const powerW = power.arrayPeakW * power.arrayHealth * sunFrac * cosEff;
  const earthHorizon = horizonAt(profile, sky.earthAz);
  const earthClearance = sky.earthEl - earthHorizon;
  const lock: LockState = earthClearance <= 0 ? (power.relay ? "RELAY" : "BLACKOUT") : earthClearance < sky.earthRadius ? "GRAZING" : "LOCK";
  const lb = linkBudget(sky.earthRangeKm, earthClearance, sky.earthRadius);
  return {
    t,
    sunAz: sky.sunAz,
    sunEl: sky.sunEl,
    sunHorizon,
    sunFrac,
    cosEff,
    powerW,
    earthAz: sky.earthAz,
    earthEl: sky.earthEl,
    earthHorizon,
    earthClearance,
    earthRadius: sky.earthRadius,
    earthRangeKm: sky.earthRangeKm,
    lock,
    linkMarginDb: lb.margin,
    fsplDb: lb.fspl,
  };
}

export function stateAt(site: Site, profile: Float32Array, power: PowerConfig, t: number): State {
  return evaluate(localSky(site, t), profile, power, t);
}

export interface TimelineSample extends State {
  soc: number; // battery state of charge 0..1
  tempC: number; // lander bulk temperature
  heaterW: number;
}

export interface TimelineStats {
  sunPct: number;
  commsPct: number;
  longestNightH: number;
  longestBlackoutH: number;
  minSoc: number;
  minTempC: number;
  frozenH: number; // hours below the survival temperature
  meanPowerW: number;
}

export interface Timeline {
  samples: TimelineSample[];
  stepH: number;
  stats: TimelineStats;
}

/** Forward simulation from startMs. Battery starts full. */
export function simulateTimeline(
  site: Site,
  profile: Float32Array,
  power: PowerConfig,
  startMs: number,
  hours = 720,
  stepH = 1
): Timeline {
  const samples: TimelineSample[] = [];
  let soc = 1;
  let lit = 0;
  let comms = 0;
  let night = 0;
  let longestNight = 0;
  let black = 0;
  let longestBlack = 0;
  let minSoc = 1;
  let tempK = 293;
  let minTempC = 20;
  let frozenH = 0;
  let pSum = 0;
  const n = Math.round(hours / stepH);
  for (let i = 0; i <= n; i++) {
    const t = startMs + i * stepH * 3600000;
    const st = stateAt(site, profile, power, t);
    // Thermal node: heaters switch on below the setpoint and draw from the same bus as the electronics.
    const heaterW = tempK < THERMAL.heaterOnK ? THERMAL.heaterW : 0;
    const demand = power.loadW + heaterW;
    let dissipated = demand;
    if (i > 0) {
      const next = soc + ((st.powerW - demand) * stepH) / power.batteryWh;
      if (next <= 0 && st.powerW < demand) dissipated = st.powerW; // battery flat: only what the array supplies
      soc = clamp(next, 0, 1);
      const sink = THERMAL.sinkDarkK + (THERMAL.sinkLitK - THERMAL.sinkDarkK) * st.sunFrac;
      const sub = Math.max(1, Math.round(stepH * 4));
      for (let k = 0; k < sub; k++) {
        const q = THERMAL.solarAbsorbedW * st.sunFrac + dissipated - SIGMA * THERMAL.radiatorM2 * (tempK ** 4 - sink ** 4);
        tempK += (q * ((stepH * 3600) / sub)) / THERMAL.heatCapacityJK;
      }
    }
    const tempC = tempK - 273.15;
    if (tempC < minTempC) minTempC = tempC;
    if (tempC < THERMAL.survivalC) frozenH += stepH;
    if (st.sunFrac > 0.02) {
      lit++;
      night = 0;
    } else {
      night += stepH;
      if (night > longestNight) longestNight = night;
    }
    if (st.lock !== "BLACKOUT") {
      comms++;
      black = 0;
    } else {
      black += stepH;
      if (black > longestBlack) longestBlack = black;
    }
    if (soc < minSoc) minSoc = soc;
    pSum += st.powerW;
    samples.push({ ...st, soc, tempC, heaterW });
  }
  return {
    samples,
    stepH,
    stats: {
      sunPct: (100 * lit) / (n + 1),
      commsPct: (100 * comms) / (n + 1),
      longestNightH: longestNight,
      longestBlackoutH: longestBlack,
      minSoc,
      minTempC,
      frozenH,
      meanPowerW: pSum / (n + 1),
    },
  };
}

export interface NextEvent {
  active: boolean; // Sun up / Earth visible right now
  hours: number | null; // hours until that flips; null if no change within the search window
}

/** Forward-simulate up to 720 h to find the next sunset/sunrise or Earthset/Earthrise. */
export function nextEvent(site: Site, profile: Float32Array, fromMs: number, body: "sun" | "earth", windowH = 720): NextEvent {
  const test = (t: number) => {
    const sky = localSky(site, t);
    return body === "sun"
      ? sky.sunEl + sky.sunRadius > horizonAt(profile, sky.sunAz)
      : sky.earthEl > horizonAt(profile, sky.earthAz);
  };
  const active = test(fromMs);
  const step = 0.25;
  for (let h = step; h <= windowH; h += step) {
    if (test(fromMs + h * 3600000) !== active) {
      let lo = h - step;
      let hi = h;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (test(fromMs + mid * 3600000) === active) lo = mid;
        else hi = mid;
      }
      return { active, hours: hi };
    }
  }
  return { active, hours: null };
}

/* ------------------------------------------------------------------ */
/* Whole-grid survey                                                   */
/* ------------------------------------------------------------------ */

export interface CellStatus {
  sunFrac: number;
  powerW: number;
  clearance: number;
  lock: LockState;
}

/** Status of all 441 cells at one instant. Index = iy * 21 + ix. */
export function surveyGrid(site: Site, power: PowerConfig, t: number): CellStatus[] {
  const sky = localSky(site, t);
  const out: CellStatus[] = [];
  for (let iy = 0; iy < GRID_N; iy++)
    for (let ix = 0; ix < GRID_N; ix++) {
      const st = evaluate(sky, horizonProfile(site, ix, iy), power, t);
      out.push({ sunFrac: st.sunFrac, powerW: st.powerW, clearance: st.earthClearance, lock: st.lock });
    }
  return out;
}

/** Percentage of the next `hours` each cell spends sunlit. Index = iy * 21 + ix. */
export function surveyIllumination(site: Site, startMs: number, hours = 720, stepH = 3): Float32Array {
  const n = Math.round(hours / stepH);
  const skies: Sky[] = [];
  for (let i = 0; i <= n; i++) skies.push(localSky(site, startMs + i * stepH * 3600000));
  const out = new Float32Array(GRID_N * GRID_N);
  for (let iy = 0; iy < GRID_N; iy++)
    for (let ix = 0; ix < GRID_N; ix++) {
      const prof = horizonProfile(site, ix, iy);
      let lit = 0;
      for (const s of skies) if (s.sunEl + s.sunRadius * 0.9 > horizonAt(prof, s.sunAz)) lit++;
      out[iy * GRID_N + ix] = (100 * lit) / skies.length;
    }
  return out;
}

export interface Requirement {
  minPowerW: number;
  minClearance: number; // deg of Earth-centre clearance needed
}

export function meets(c: CellStatus, req: Requirement): boolean {
  return c.powerW >= req.minPowerW && c.clearance >= req.minClearance;
}

/** Nearest cell that satisfies the requirement, or null. */
export function nearestHaven(grid: CellStatus[], ix: number, iy: number, req: Requirement) {
  let best: { ix: number; iy: number; dist: number } | null = null;
  for (let y = 0; y < GRID_N; y++)
    for (let x = 0; x < GRID_N; x++) {
      if (!meets(grid[y * GRID_N + x], req)) continue;
      const dist = Math.hypot(x - ix, y - iy) * GRID_STEP_M;
      if (!best || dist < best.dist) best = { ix: x, iy: y, dist };
    }
  return best;
}

export function seasonLabel(subSolarLat: number): string {
  if (subSolarLat < -0.5) return "South-polar summer";
  if (subSolarLat > 0.5) return "South-polar winter";
  return "Near equinox";
}

/** Per-cell outlook over a window: longest continuous eclipse (h) and share of time Earth is in view (%). */
export function surveyWindow(site: Site, startMs: number, hours = 336) {
  const skies: Sky[] = [];
  for (let i = 0; i <= hours; i++) skies.push(localSky(site, startMs + i * 3600000));
  const maxEclipseH = new Float32Array(GRID_N * GRID_N);
  const earthPct = new Float32Array(GRID_N * GRID_N);
  for (let iy = 0; iy < GRID_N; iy++)
    for (let ix = 0; ix < GRID_N; ix++) {
      const prof = horizonProfile(site, ix, iy);
      let run = 0;
      let longest = 0;
      let vis = 0;
      for (const s of skies) {
        if (s.sunEl + s.sunRadius * 0.9 > horizonAt(prof, s.sunAz)) run = 0;
        else if (++run > longest) longest = run;
        if (s.earthEl > horizonAt(prof, s.earthAz)) vis++;
      }
      maxEclipseH[iy * GRID_N + ix] = longest;
      earthPct[iy * GRID_N + ix] = (100 * vis) / skies.length;
    }
  return { maxEclipseH, earthPct };
}

export interface YearScan {
  days: number;
  missionDays: number;
  sunPct: Float32Array; // per start day: share of the mission sunlit
  earthPct: Float32Array; // per start day: share of the mission with Earth in view
  nightH: Float32Array; // per start day: longest continuous eclipse during the mission, hours
  score: Float32Array; // 0..100, higher is better
}

/** For every start day in the next `days`, how a surface mission of `missionDays` would fare at this position. */
export function scanYear(site: Site, profile: Float32Array, startMs: number, days = 365, missionDays = 14): YearScan {
  const n = (days + missionDays) * 24 + 1;
  const lit = new Uint8Array(n);
  const vis = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = localSky(site, startMs + i * 3600000);
    lit[i] = s.sunEl + s.sunRadius * 0.9 > horizonAt(profile, s.sunAz) ? 1 : 0;
    vis[i] = s.earthEl > horizonAt(profile, s.earthAz) ? 1 : 0;
  }
  const w = missionDays * 24;
  const sunPct = new Float32Array(days);
  const earthPct = new Float32Array(days);
  const nightH = new Float32Array(days);
  const score = new Float32Array(days);
  for (let d = 0; d < days; d++) {
    let a = 0;
    let b = 0;
    let run = 0;
    let longest = 0;
    for (let i = d * 24; i < d * 24 + w; i++) {
      a += lit[i];
      b += vis[i];
      if (lit[i]) run = 0;
      else if (++run > longest) longest = run;
    }
    sunPct[d] = (100 * a) / w;
    earthPct[d] = (100 * b) / w;
    nightH[d] = longest;
    score[d] = Math.max(0, 0.5 * sunPct[d] + 0.5 * earthPct[d] - Math.max(0, longest - 24) * 0.6);
  }
  return { days, missionDays, sunPct, earthPct, nightH, score };
}

/** Best non-overlapping start days from a year scan. */
export function bestWindows(scan: YearScan, count = 3, minGapDays = 20): number[] {
  const picks: number[] = [];
  const order = Array.from({ length: scan.days }, (_, i) => i).sort((a, b) => scan.score[b] - scan.score[a]);
  for (const d of order) {
    if (picks.every((p) => Math.abs(p - d) >= minGapDays)) picks.push(d);
    if (picks.length >= count) break;
  }
  return picks;
}

/** CSV export of a simulated timeline. */
export function timelineCsv(site: Site, tl: Timeline): string {
  const rows = ["utc,sun_az_deg,sun_el_deg,sun_horizon_deg,sun_disc_visible,array_power_w,battery_soc,earth_az_deg,earth_el_deg,earth_horizon_deg,earth_clearance_deg,link_state,link_margin_db,lander_temp_c,heater_w"];
  for (const s of tl.samples)
    rows.push([
      new Date(s.t).toISOString(), s.sunAz.toFixed(3), s.sunEl.toFixed(3), s.sunHorizon.toFixed(2), s.sunFrac.toFixed(3), s.powerW.toFixed(1), s.soc.toFixed(3),
      s.earthAz.toFixed(3), s.earthEl.toFixed(3), s.earthHorizon.toFixed(2), s.earthClearance.toFixed(3), s.lock, isFinite(s.linkMarginDb) ? s.linkMarginDb.toFixed(1) : "", s.tempC.toFixed(1), s.heaterW.toFixed(0),
    ].join(","));
  return "# " + site.name + " lat " + site.lat + " lon " + site.lon + "\n" + rows.join("\n") + "\n";
}

export const SLOPE_SAFE_DEG = 8;
export const SLOPE_LIMIT_DEG = 15;
const slopeCache = new Map<string, { mean: Float32Array; max: Float32Array; rough: Float32Array }>();

/**
 * Surface slope per 100 m cell from the 20 m LOLA patch: mean and steepest of the 25 facets (20 m baseline)
 * inside the cell, plus roughness (RMS height about the cell's best-fit plane, metres).
 */
export function surveySlope(site: Site) {
  const hit = slopeCache.get(site.id);
  if (hit) return hit;
  const n = GRID_N * GRID_N;
  const out = { mean: new Float32Array(n), max: new Float32Array(n), rough: new Float32Array(n) };
  if (site.terrain) {
    const z = (i: number, j: number) => patchElevationAt(site, -PATCH_HALF_M + i * PATCH_STEP_M, -PATCH_HALF_M + j * PATCH_STEP_M);
    for (let iy = 0; iy < GRID_N; iy++)
      for (let ix = 0; ix < GRID_N; ix++) {
        let sum = 0;
        let mx = 0;
        let sgx = 0;
        let sgy = 0;
        for (let j = iy * 5; j < iy * 5 + 5; j++)
          for (let i = ix * 5; i < ix * 5 + 5; i++) {
            const gx = (z(i + 1, j) + z(i + 1, j + 1) - z(i, j) - z(i, j + 1)) / (2 * PATCH_STEP_M);
            const gy = (z(i, j + 1) + z(i + 1, j + 1) - z(i, j) - z(i + 1, j)) / (2 * PATCH_STEP_M);
            const sl = Math.atan(Math.hypot(gx, gy)) / DEG;
            sum += sl;
            sgx += gx;
            sgy += gy;
            if (sl > mx) mx = sl;
          }
        const mgx = sgx / 25;
        const mgy = sgy / 25;
        let zm = 0;
        for (let j = iy * 5; j <= iy * 5 + 5; j++) for (let i = ix * 5; i <= ix * 5 + 5; i++) zm += z(i, j);
        zm /= 36;
        let ss = 0;
        for (let j = iy * 5; j <= iy * 5 + 5; j++)
          for (let i = ix * 5; i <= ix * 5 + 5; i++) {
            const d = z(i, j) - zm - mgx * (i - ix * 5 - 2.5) * PATCH_STEP_M - mgy * (j - iy * 5 - 2.5) * PATCH_STEP_M;
            ss += d * d;
          }
        const k = iy * GRID_N + ix;
        out.mean[k] = sum / 25;
        out.max[k] = mx;
        out.rough[k] = Math.sqrt(ss / 36);
      }
  }
  slopeCache.set(site.id, out);
  return out;
}

/** Drop every cached product for a site id (used when custom terrain is loaded or removed). */
export function clearSiteCaches(id: string): void {
  matrixCache.delete(id);
  patchCache.delete(id);
  horizonCache.delete(id);
  slopeCache.delete(id);
  for (const k of Array.from(profileCache.keys())) if (k.startsWith(id + ":")) profileCache.delete(k);
}

export function registerTerrain(id: string, data: TerrainData | null): void {
  clearSiteCaches(id);
  if (data) runtimeTerrain.set(id, data);
  else runtimeTerrain.delete(id);
}

/* ------------------------------------------------------------------ */
/* Build terrain for any polar site from the user's own LOLA files     */
/* ------------------------------------------------------------------ */

const LDEM20_N = 30400; // LDEM_80S_20M.IMG: 30400 x 30400 int16, 20 m, polar stereographic
const LDEM240_N = 3812; // LDEM_75S_240M.IMG: 3812 x 3812 int16, 240 m
export const LDEM20_BYTES = LDEM20_N * LDEM20_N * 2;
export const LDEM240_BYTES = LDEM240_N * LDEM240_N * 2;

/**
 * Same extraction as the built-in sites: 21 x 21 grid, 20 m patch and a 360-azimuth horizon mask for all 441
 * cells, ray-cast over the curved Moon. `fine` is LDEM_80S_20M.IMG (required); `coarse` is LDEM_75S_240M.IMG
 * (optional: without it the horizon only sees terrain within about 2.5 km).
 */
export async function buildTerrainFromLola(
  fine: Blob,
  coarse: Blob | null,
  lat: number,
  lon: number,
  onProgress: (fraction: number) => void
): Promise<TerrainData> {
  if (fine.size !== LDEM20_BYTES) throw new Error("The 20 m file must be LDEM_80S_20M.IMG (1,848,320,000 bytes).");
  if (coarse && coarse.size !== LDEM240_BYTES) throw new Error("The 240 m file must be LDEM_75S_240M.IMG (29,062,688 bytes).");
  if (lat > -80.3) throw new Error("The site must be south of 80.3°S to sit inside LDEM_80S_20M.");
  const R = 1737400;
  const b240 = coarse ? new Int16Array(await coarse.arrayBuffer()) : null;
  const la = lat * DEG;
  const lo = lon * DEG;
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const sc0 = (2 * R) / (1 - u[2]);
  const ci = (sc0 * u[1]) / 20 + 15199.5;
  const cj = 15199.5 - (sc0 * u[0]) / 20;
  const HW = 130;
  const W = 2 * HW + 1;
  const i0 = Math.round(ci) - HW;
  const j0 = Math.round(cj) - HW;
  if (i0 < 0 || j0 < 0 || i0 + W > LDEM20_N || j0 + W > LDEM20_N) throw new Error("The site is too close to the edge of the 20 m map.");
  const rowBytes = LDEM20_N * 2;
  const rows = new Int16Array(await fine.slice(j0 * rowBytes, (j0 + W) * rowBytes).arrayBuffer());
  const hi = new Int16Array(W * W);
  for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) hi[r * W + c] = rows[r * LDEM20_N + i0 + c];

  const height = (ux: number, uy: number, uz: number): number => {
    const sc = (2 * R) / (1 - uz);
    const x = sc * uy;
    const y = sc * ux;
    let fi = x / 20 + 15199.5 - i0;
    let fj = 15199.5 - y / 20 - j0;
    if (fi >= 0 && fj >= 0 && fi < W - 1 && fj < W - 1) {
      const a = fi | 0, b = fj | 0, p = fi - a, q = fj - b, k = b * W + a;
      return 0.5 * ((hi[k] * (1 - p) + hi[k + 1] * p) * (1 - q) + (hi[k + W] * (1 - p) + hi[k + W + 1] * p) * q);
    }
    if (!b240) return NaN;
    fi = x / 240 + 1905.5;
    fj = 1905.5 - y / 240;
    if (!(fi >= 0 && fj >= 0 && fi < LDEM240_N - 1 && fj < LDEM240_N - 1)) return NaN;
    const a = fi | 0, b = fj | 0, p = fi - a, q = fj - b, k = b * LDEM240_N + a;
    return 0.5 * ((b240[k] * (1 - p) + b240[k + 1] * p) * (1 - q) + (b240[k + LDEM240_N] * (1 - p) + b240[k + LDEM240_N + 1] * p) * q);
  };
  const at = (E: number, Nn: number) => {
    const v = [u[0] + (E * e[0] + Nn * n[0]) / R, u[1] + (E * e[1] + Nn * n[1]) / R, u[2] + (E * e[2] + Nn * n[2]) / R];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const steps: number[] = [];
  for (let s = 0; s < 300000; ) {
    s += s < 1500 ? 20 : s < 6000 ? 60 : s < 40000 ? 120 : 400;
    steps.push(s);
  }
  const cs = steps.map((s) => Math.cos(s / R));
  const sn = steps.map((s) => Math.sin(s / R));

  const grid: number[] = [];
  for (let iy = 0; iy < GRID_N; iy++)
    for (let ix = 0; ix < GRID_N; ix++) {
      const p = at((ix - 10) * 100, (iy - 10) * 100);
      grid.push(Math.round(height(p[0], p[1], p[2]) * 10) / 10);
    }
  const patch = new Int16Array(PATCH_N * PATCH_N);
  for (let r = 0; r < PATCH_N; r++)
    for (let c = 0; c < PATCH_N; c++) {
      const p = at(-PATCH_HALF_M + c * PATCH_STEP_M, -PATCH_HALF_M + r * PATCH_STEP_M);
      patch[r * PATCH_N + c] = Math.round(height(p[0], p[1], p[2]) * 2);
    }
  const horizon = new Int16Array(GRID_N * GRID_N * N_AZ);
  for (let iy = 0; iy < GRID_N; iy++) {
    onProgress(iy / GRID_N);
    await new Promise((r) => setTimeout(r, 0));
    for (let ix = 0; ix < GRID_N; ix++) {
      const u0 = at((ix - 10) * 100, (iy - 10) * 100);
      const r0 = R + height(u0[0], u0[1], u0[2]) + MAST_HEIGHT_M;
      for (let k = 0; k < N_AZ; k++) {
        const ca = Math.cos(k * DEG);
        const sa = Math.sin(k * DEG);
        let d = [ca * n[0] + sa * e[0], ca * n[1] + sa * e[1], ca * n[2] + sa * e[2]];
        const dp = d[0] * u0[0] + d[1] * u0[1] + d[2] * u0[2];
        d = [d[0] - dp * u0[0], d[1] - dp * u0[1], d[2] - dp * u0[2]];
        const dl = Math.hypot(d[0], d[1], d[2]);
        d = [d[0] / dl, d[1] / dl, d[2] / dl];
        let mx = -1e9;
        for (let i = 0; i < steps.length; i++) {
          const c = cs[i];
          const s = sn[i];
          const h = height(u0[0] * c + d[0] * s, u0[1] * c + d[1] * s, u0[2] * c + d[2] * s);
          if (h !== h) break;
          const rp = R + h;
          const t = (rp * c - r0) / (rp * s);
          if (t > mx) mx = t;
        }
        horizon[(iy * GRID_N + ix) * N_AZ + k] = Math.round((Math.atan(mx) / DEG) * 100);
      }
    }
  }
  onProgress(1);
  return { grid, patch, horizon };
}
