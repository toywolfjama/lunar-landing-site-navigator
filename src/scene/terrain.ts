/* Ground around the landing site, in a local frame (x east, y up, z south, metres; the group is scaled to km).
   Inside 1 km of the site: NASA LOLA 20 m heights where the app has them. Around it, out to 15 km: generated craters
   and rolling ground that fade into the Moon sphere. Good enough to fly over, not a survey product. */
import * as THREE from "three";
import * as P from "../physics/lunarAstronomy";

const INNER = 1040; // m, half-size of the 20 m mesh (the LOLA patch is +-1050 m)
const APRON = 15000; // m, half-size of the generated ground
const R_M = P.R_MOON_KM * 1000;

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Ground {
  group: THREE.Group;
  heightAt: (x: number, y: number) => number; // m above the site datum
  normalAt: (x: number, y: number) => THREE.Vector3; // local frame
  lola: boolean;
  setSlopeColors: (on: boolean) => void;
  dispose: () => void;
}

export function buildGround(site: P.Site, lat: number, lon: number): Ground {
  const lola = site.terrain;
  const datum = P.siteDatumM(site);
  const rnd = rng(Math.floor((lat + 91) * 1000) * 7919 + Math.floor((lon + 361) * 1000));

  // generated ground: value noise plus craters
  const NG = 64;
  const grid = new Float32Array(NG * NG).map(() => rnd() * 2 - 1);
  const vnoise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const g = (i: number, j: number) => grid[(((j % NG) + NG) % NG) * NG + (((i % NG) + NG) % NG)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy;
  };
  const craters = Array.from({ length: 70 }, () => {
    const r = 40 + Math.pow(rnd(), 2.2) * 1800;
    return { x: (rnd() * 2 - 1) * APRON, y: (rnd() * 2 - 1) * APRON, r };
  });
  const gen = (x: number, y: number) => {
    let h = vnoise(x / 2600, y / 2600) * 38 + vnoise(x / 700 + 9, y / 700 + 3) * 9 + vnoise(x / 160 + 4, y / 160 + 7) * 2.2;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, y - c.y) / c.r;
      if (d > 1.6) continue;
      if (d < 1) h += -0.14 * c.r * (1 - d * d) + 0.035 * c.r; // bowl
      else h += 0.035 * c.r * Math.pow(1 - (d - 1) / 0.6, 2); // rim and ejecta
    }
    return h * (1 - smooth(APRON * 0.7, APRON, Math.max(Math.abs(x), Math.abs(y))));
  };
  const heightAt = (x: number, y: number) => {
    const g = gen(x, y);
    if (!lola || Math.abs(x) > INNER || Math.abs(y) > INNER) return g;
    const w = smooth(INNER - 160, INNER, Math.max(Math.abs(x), Math.abs(y)));
    return (P.patchElevationAt(site, x, y) - datum) * (1 - w) + g * w;
  };
  const normalAt = (x: number, y: number) => {
    const e = 5;
    const dx = (heightAt(x + e, y) - heightAt(x - e, y)) / (2 * e);
    const dy = (heightAt(x, y + e) - heightAt(x, y - e)) / (2 * e);
    return new THREE.Vector3(-dx, 1, dy).normalize(); // local z is south
  };

  const group = new THREE.Group();
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  const mesh = (half: number, step: number, curve: boolean, sink: (x: number, y: number) => number, skirt: number) => {
    const n = Math.round((2 * half) / step) + 1;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const base: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -half + i * step, y = half - j * step;
        let h = heightAt(x, y) - sink(x, y);
        if (curve) h -= (x * x + y * y) / (2 * R_M);
        pos.push(x, h, -y);
        const v = 0.47 + vnoise(x / 90 + 1, y / 90 + 5) * 0.05 + vnoise(x / 23, y / 23) * 0.03;
        base.push(v);
        col.push(v, v * 0.99, v * 0.97);
      }
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    if (skirt > 0) {
      // a short wall around the edge so no crack shows where two meshes meet
      const edge: number[] = [];
      for (let i = 0; i < n; i++) edge.push(i);
      for (let j = 1; j < n; j++) edge.push(j * n + n - 1);
      for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);
      for (let j = n - 2; j > 0; j--) edge.push(j * n);
      edge.push(0);
      const start = pos.length / 3;
      for (const k of edge) {
        pos.push(pos[k * 3], pos[k * 3 + 1] - skirt, pos[k * 3 + 2]);
        col.push(0.3, 0.3, 0.3);
        base.push(0.3);
      }
      for (let m = 0; m < edge.length - 1; m++) {
        const a = edge[m], b = edge[m + 1], c = start + m, d = start + m + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.userData.base = base;
    g.userData.gridCount = n * n;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const me = new THREE.Mesh(g, m);
    me.receiveShadow = true;
    geos.push(g);
    mats.push(m);
    group.add(me);
    return me;
  };

  const inner = mesh(INNER, 20, false, () => 0, 40);
  inner.castShadow = true;
  inner.name = "ground-inner";
  // under the 20 m mesh the coarse ground is pushed down out of sight; near the edge only slightly, so no trench shows
  const apron = mesh(APRON, 150, true, (x, y) => {
    const m = Math.max(Math.abs(x), Math.abs(y));
    return m < INNER - 160 ? 25 : m < INNER ? 3 : 0;
  }, 0);
  apron.name = "ground-apron";
  apron.receiveShadow = false; // the shadow map only covers the site; outside it, plain shading

  // slope colours on the 20 m mesh: green under 10 deg, amber to 15 deg, red above (LOLA sites only)
  const setSlopeColors = (on: boolean) => {
    const g = inner.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const col = g.getAttribute("color") as THREE.BufferAttribute;
    const base: number[] = g.userData.base;
    for (let k = 0; k < pos.count; k++) {
      const v = base[k];
      if (!on || !lola || k >= g.userData.gridCount) {
        col.setXYZ(k, v, v * 0.99, v * 0.97);
        continue;
      }
      const x = pos.getX(k), y = -pos.getZ(k);
      const nrm = normalAt(x, y);
      const sl = Math.acos(Math.min(1, nrm.y)) * (180 / Math.PI);
      const c = sl < 10 ? [0.29, 0.62, 0.36] : sl < 15 ? [0.85, 0.6, 0.18] : [0.8, 0.27, 0.27];
      col.setXYZ(k, v * 0.45 + c[0] * 0.55, v * 0.45 + c[1] * 0.55, v * 0.45 + c[2] * 0.55);
    }
    col.needsUpdate = true;
  };

  group.scale.setScalar(0.001); // metres -> km
  return {
    group,
    heightAt,
    normalAt,
    lola,
    setSlopeColors,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
