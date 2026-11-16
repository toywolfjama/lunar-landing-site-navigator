/* Build NASA LOLA terrain for the curated landing sites that do not have it yet.
 *
 * For each site it fetches only the byte ranges it needs from the PDS Geosciences Node:
 *   LDEM_1024 tiles (1/1024 deg, about 30 m)  ->  +-3 km around the site: the 20 m patch, the 100 m grid, near horizon
 *   LDEM_128 (about 237 m)                     ->  +-25 km: middle-distance horizon
 *   LDEM_16 (about 1.9 km, whole file)         ->  out to 300 km: far horizon
 * and writes src/physics/lolaSites.ts with, per site:
 *   grid  21 x 21 heights (m above the 1737.4 km sphere), 100 m posting, row 0 = south
 *   base  height of the site centre (m above the 1737.4 km sphere)
 *   patch 106 x 106 heights (int16, 0.1 m units relative to base), 20 m posting, base64
 *   far   360 horizon elevations (int16, 0.01 deg) from the site centre, counting terrain beyond 1 km only, base64.
 *         The app adds the near horizon (inside the patch) for whichever 100 m cell you land on.
 *
 * Run: bun run scripts/build-terrain.ts [--validate]
 */
import fs from "node:fs";
import path from "node:path";
import { LANDINGS } from "../src/landings";

const BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/";
const CACHE = process.env.LOLA_CACHE || path.join(process.env.TMPDIR || "/tmp", "lola-cache");
const R = 1737400;
const DEG = Math.PI / 180;
const GRID_N = 21, PATCH_N = 106, PATCH_STEP = 20, PATCH_HALF = 1050, MAST = 2, N_AZ = 360;
const HAVE = new Set(["shackleton", "malapert", "mouton", "athena"]); // already in lolaData.ts (LDEM_80S_20M)

fs.mkdirSync(CACHE, { recursive: true });

async function range(file: string, start: number, end: number): Promise<Int16Array> {
  const key = path.join(CACHE, `${file}.${start}-${end}.bin`);
  if (fs.existsSync(key)) {
    const b = fs.readFileSync(key);
    return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  }
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(BASE + file, { headers: { Range: `bytes=${start}-${end}` } });
      if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength !== end - start + 1) throw new Error(`short read ${buf.byteLength}`);
      fs.writeFileSync(key, buf);
      return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    } catch (e) {
      if (tries >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (tries + 1)));
    }
  }
}

/** A band of whole rows from a simple-cylindrical LDEM. */
interface Win { ppd: number; maxLat: number; west: number; cols: number; r0: number; n: number; data: Int16Array; spanLon: number }
async function window(file: string, ppd: number, maxLat: number, west: number, spanLon: number, rowsTotal: number, latHi: number, latLo: number): Promise<Win> {
  const cols = Math.round(spanLon * ppd);
  const r0 = Math.max(0, Math.floor((maxLat - latHi) * ppd - 0.5) - 2);
  const r1 = Math.min(rowsTotal - 1, Math.ceil((maxLat - latLo) * ppd - 0.5) + 2);
  const data = await range(file, r0 * cols * 2, (r1 + 1) * cols * 2 - 1);
  return { ppd, maxLat, west, cols, r0, n: r1 - r0 + 1, data, spanLon };
}
function sample(w: Win, lat: number, lon: number): number {
  let dl = lon - w.west;
  dl = ((dl % 360) + 360) % 360;
  if (w.spanLon < 360 && dl > w.spanLon) return NaN;
  const fr = (w.maxLat - lat) * w.ppd - 0.5 - w.r0;
  let fc = dl * w.ppd - 0.5;
  if (fr < 0 || fr > w.n - 1) return NaN;
  if (w.spanLon >= 360) fc = ((fc % w.cols) + w.cols) % w.cols;
  else if (fc < 0 || fc > w.cols - 1) return NaN;
  const r = Math.min(w.n - 2, fr | 0), c = Math.floor(fc), p = fr - r, q = fc - c;
  const c1 = w.spanLon >= 360 ? (c + 1) % w.cols : Math.min(w.cols - 1, c + 1);
  const d = w.data, k0 = r * w.cols, k1 = (r + 1) * w.cols;
  return 0.5 * ((d[k0 + c] * (1 - q) + d[k0 + c1] * q) * (1 - p) + (d[k1 + c] * (1 - q) + d[k1 + c1] * q) * p);
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");
function tileName(bandLo: number, l0: number) {
  const lat = bandLo >= 0 ? `${pad(bandLo, 2)}n_${pad(bandLo + 15, 2)}n` : `${pad(-bandLo, 2)}s_${pad(-(bandLo + 15), 2)}s`;
  return `ldem_1024_${lat}_${pad(l0, 3)}_${pad(l0 + 30, 3)}.img`;
}

let L16: Win | null = null;

async function buildSite(id: string, lat: number, lon: number) {
  lon = ((lon % 360) + 360) % 360;
  // 1024 ppd tiles covering +-3 km
  const dLat = 3000 / R / DEG + 0.01;
  const dLon = Math.min(170, dLat / Math.max(0.05, Math.cos(lat * DEG)));
  const fine: Win[] = [];
  for (let b = Math.floor((lat - dLat) / 15) * 15; b <= lat + dLat; b += 15) {
    for (let l = Math.floor((lon - dLon) / 30) * 30; l <= lon + dLon; l += 30) {
      const l0 = ((l % 360) + 360) % 360;
      const hi = Math.min(b + 15, lat + dLat), lo = Math.max(b, lat - dLat);
      fine.push(await window(tileName(b, l0), 1024, b + 15, l0, 30, 15360, hi, lo));
    }
  }
  const mid = await window("ldem_128.img", 128, 90, 0, 360, 23040, Math.min(90, lat + 0.85), Math.max(-90, lat - 0.85));
  if (!L16) L16 = await window("ldem_16.img", 16, 90, 0, 360, 2880, 90, -90);

  const heightLL = (la: number, lo: number) => {
    for (const w of fine) {
      const h = sample(w, la, lo);
      if (h === h) return h;
    }
    const m = sample(mid, la, lo);
    if (m === m) return m;
    return sample(L16!, la, lo);
  };
  const height = (x: number, y: number, z: number) => heightLL(Math.asin(z) / DEG, Math.atan2(y, x) / DEG);

  const la = lat * DEG, lo = lon * DEG;
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const at = (E: number, N: number) => {
    const v = [u[0] + (E * e[0] + N * n[0]) / R, u[1] + (E * e[1] + N * n[1]) / R, u[2] + (E * e[2] + N * n[2]) / R];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  const grid: number[] = [];
  for (let iy = 0; iy < GRID_N; iy++)
    for (let ix = 0; ix < GRID_N; ix++) {
      const p = at((ix - 10) * 100, (iy - 10) * 100);
      grid.push(Math.round(height(p[0], p[1], p[2]) * 10) / 10);
    }
  // the patch is stored in 0.1 m steps relative to the site centre, so gentle mare slopes survive (0.5 m steps
  // over 20 m would round anything under 1.4 deg to zero)
  const base = Math.round(height(u[0], u[1], u[2]));
  const patch = new Int16Array(PATCH_N * PATCH_N);
  const patchM = new Float32Array(PATCH_N * PATCH_N);
  for (let r = 0; r < PATCH_N; r++)
    for (let c = 0; c < PATCH_N; c++) {
      const p = at(-PATCH_HALF + c * PATCH_STEP, -PATCH_HALF + r * PATCH_STEP);
      const h = height(p[0], p[1], p[2]);
      patchM[r * PATCH_N + c] = h;
      patch[r * PATCH_N + c] = Math.max(-32767, Math.min(32767, Math.round((h - base) * 10)));
    }

  // far horizon from the centre: terrain beyond 1 km (the app ray-casts the patch, out to 1.05 km, for the near part)
  const steps: number[] = [];
  for (let s = 1000; s < 300000; ) {
    s += s < 6000 ? 30 : s < 25000 ? 120 : 600;
    steps.push(s);
  }
  const cs = steps.map((s) => Math.cos(s / R)), sn = steps.map((s) => Math.sin(s / R));
  const r0 = R + height(u[0], u[1], u[2]) + MAST;
  const far = new Int16Array(N_AZ);
  for (let k = 0; k < N_AZ; k++) {
    const ca = Math.cos(k * DEG), sa = Math.sin(k * DEG);
    const d = [ca * n[0] + sa * e[0], ca * n[1] + sa * e[1], ca * n[2] + sa * e[2]];
    let mx = -1e9;
    for (let i = 0; i < steps.length; i++) {
      const h = height(u[0] * cs[i] + d[0] * sn[i], u[1] * cs[i] + d[1] * sn[i], u[2] * cs[i] + d[2] * sn[i]);
      if (h !== h) continue;
      const rp = R + h;
      const t = (rp * cs[i] - r0) / (rp * sn[i]);
      if (t > mx) mx = t;
    }
    far[k] = Math.round((Math.atan(mx) / DEG) * 100);
  }
  // full ray-cast from 20 m outward, the method the original LDEM_80S_20M data used (for --validate only)
  const fullCentre = () => {
    const st: number[] = [];
    for (let s2 = 0; s2 < 300000; ) { s2 += s2 < 1500 ? 20 : s2 < 6000 ? 60 : s2 < 40000 ? 120 : 400; st.push(s2); }
    const out = new Float32Array(N_AZ);
    for (let k = 0; k < N_AZ; k++) {
      const ca = Math.cos(k * DEG), sa = Math.sin(k * DEG);
      const d = [ca * n[0] + sa * e[0], ca * n[1] + sa * e[1], ca * n[2] + sa * e[2]];
      let mx = -1e9;
      for (const s2 of st) {
        const c2 = Math.cos(s2 / R), s3 = Math.sin(s2 / R);
        const h = height(u[0] * c2 + d[0] * s3, u[1] * c2 + d[1] * s3, u[2] * c2 + d[2] * s3);
        if (h !== h) continue;
        const rp = R + h, t = (rp * c2 - r0) / (rp * s3);
        if (t > mx) mx = t;
      }
      out[k] = Math.atan(mx) / DEG;
    }
    return out;
  };
  const b64 = (a: Int16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  return { id, grid, patch: patchM, far, fullCentre, json: { grid, base, patch: b64(patch), far: b64(far) } };
}

/** The near horizon the app computes from the patch (from 80 m out: closer in, 1-2 m of interpolation error on a slope
 *  swings the angle by degrees), for checking against the full LDEM_80S_20M masks. */
function nearProfile(patch: Float32Array, ix: number, iy: number, start = 80) {
  const hAt = (x: number, y: number) => {
    const fx = (x + PATCH_HALF) / PATCH_STEP, fy = (y + PATCH_HALF) / PATCH_STEP;
    const a = Math.max(0, Math.min(PATCH_N - 2, fx | 0)), b = Math.max(0, Math.min(PATCH_N - 2, fy | 0)), p = fx - a, q = fy - b;
    const k = b * PATCH_N + a;
    return (patch[k] * (1 - p) + patch[k + 1] * p) * (1 - q) + (patch[k + PATCH_N] * (1 - p) + patch[k + PATCH_N + 1] * p) * q;
  };
  const x0 = (ix - 10) * 100, y0 = (iy - 10) * 100, h0 = hAt(x0, y0) + MAST;
  const out = new Float32Array(N_AZ);
  for (let k = 0; k < N_AZ; k++) {
    const sa = Math.sin(k * DEG), ca = Math.cos(k * DEG);
    let mx = -90;
    for (let s = start; s <= 1500; s += 20) {
      const x = x0 + sa * s, y = y0 + ca * s;
      if (Math.abs(x) > PATCH_HALF - 1 || Math.abs(y) > PATCH_HALF - 1) break;
      const ang = Math.atan2(hAt(x, y) - h0, s) / DEG - (s / (2 * R)) / DEG;
      if (ang > mx) mx = ang;
    }
    out[k] = mx;
  }
  return out;
}

const validate = process.argv.includes("--validate");
if (validate) {
  // rebuild Malapert from the 30 m cylindrical tiles and compare with the 20 m polar data already in the app
  const { LOLA } = await import("../src/physics/lolaData");
  const dec = (s: string) => { const b = Buffer.from(s, "base64"); return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2); };
  for (const [id, lat, lon] of [["malapert", -86.0, 0.0], ["athena", -84.7906, 29.1957]] as [string, number, number][]) {
    const t = await buildSite(id, lat, lon);
    const ref = LOLA[id];
    const dg = t.grid.map((h, i) => Math.abs(h - ref.grid[i]));
    const refH = dec(ref.horizon);
    let dh = 0, worst = 0, signed = 0;
    const near = nearProfile(t.patch, 10, 10);
    for (let k = 0; k < N_AZ; k++) {
      const mine = Math.max(near[k], t.far[k] / 100);
      const theirs = refH[220 * N_AZ + k] / 100;
      dh += Math.abs(mine - theirs);
      signed += mine - theirs;
      worst = Math.max(worst, Math.abs(mine - theirs));
    }
    const full = t.fullCentre();
    let fd = 0, fs2 = 0;
    for (let k = 0; k < N_AZ; k++) { const th = refH[220 * N_AZ + k] / 100; fd += Math.abs(full[k] - th); fs2 += full[k] - th; }
    console.log(`${id}: full ray-cast vs reference: mean ${(fd / N_AZ).toFixed(2)} deg (signed ${(fs2 / N_AZ).toFixed(2)}); centre height mine ${t.grid[220]} ref ${ref.grid[220]}`);
    console.log(`${id}: grid height diff median ${dg.sort((a, b) => a - b)[220].toFixed(1)} m, max ${Math.max(...dg).toFixed(1)} m; centre horizon diff mean ${(dh / N_AZ).toFixed(2)} deg (signed ${(signed / N_AZ).toFixed(2)}), max ${worst.toFixed(2)} deg`);
  }
} else {
  const out: Record<string, any> = {};
  const todo = LANDINGS.filter((l) => !HAVE.has(l.id));
  for (const l of todo) {
    const t0 = Date.now();
    const t = await buildSite(l.id, l.lat, l.lon);
    out[l.id] = t.json;
    console.log(`${l.id.padEnd(14)} ${((Date.now() - t0) / 1000).toFixed(1)} s  centre ${t.grid[220]} m`);
  }
  const file = path.join(import.meta.dir, "../src/physics/lolaSites.ts");
  const header = `/**
 * NASA LRO LOLA terrain for the curated landing sites (generated by scripts/build-terrain.ts; do not edit).
 * Source: PDS Geosciences Node, LRO-L-LOLA-4-GDR simple-cylindrical LDEM_1024 tiles, LDEM_128 and LDEM_16.
 *  grid:  21 x 21 heights (m above the 1737.4 km sphere), 100 m posting, row 0 = south
 *  base:  height of the site centre (m above the 1737.4 km sphere)
 *  patch: 106 x 106 heights (int16, 0.1 m units relative to base), 20 m posting (resampled from about 30 m), base64
 *  far:   360 horizon elevations (int16, 0.01 deg) from the site centre, terrain beyond 1 km only, base64
 */
export const LOLA_SITES: Record<string, { grid: number[]; base: number; patch: string; far: string }> = `;
  fs.writeFileSync(file, header + JSON.stringify(out) + ";\n");
  console.log("wrote", file, (fs.statSync(file).size / 1024).toFixed(0), "KB");
}
