/* Ground around the landing site, in a local frame (x east, y up, z south, metres; the group is scaled to km).
   Inside 1 km of the site: NASA LOLA 20 m heights where the app has them. Around it, out to 15 km: generated craters
   and rolling ground that fade into the Moon sphere. Good enough to fly over, not a survey product. */
import * as THREE from "three";
import * as P from "../physics/lunarAstronomy";
import { addSurfaceDetail } from "./surfaceDetail";

const INNER = 1040; // m, half-size of the 20 m mesh (the LOLA patch is +-1050 m)
const APRON = 30000; // m, half-size of the generated ground
const PAD = 170; // m, half-size of the fine 2 m mesh around the site, with small craters and rocks
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
  setSpot: (x: number, y: number) => void; // clears rocks from under the lander and centres the blast mark
  setBlast: (k: number) => void; // 0..1: the bright, swept ground the engine leaves around the touchdown point
  setDetailOrigin: (v: THREE.Vector3) => void; // shared origin for the shader detail, so it lines up with the sphere
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
  const craters = Array.from({ length: 220 }, () => {
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
    return h * (1 - smooth(APRON * 0.75, APRON, Math.max(Math.abs(x), Math.abs(y))));
  };
  // metre-scale detail near the site: small fresh craters and lumpy regolith, gone by the edge of the fine mesh
  const small = Array.from({ length: 320 }, () => {
    const r = 0.8 + Math.pow(rnd(), 2.8) * 16;
    return { x: (rnd() * 2 - 1) * PAD, y: (rnd() * 2 - 1) * PAD, r };
  });
  const fine = (x: number, y: number) => {
    const fade = 1 - smooth(PAD * 0.7, PAD * 0.95, Math.max(Math.abs(x), Math.abs(y)));
    if (fade <= 0) return 0;
    let h = vnoise(x / 9 + 11, y / 9 + 2) * 0.35 + vnoise(x / 3 + 5, y / 3 + 8) * 0.08;
    for (const c of small) {
      const d = Math.hypot(x - c.x, y - c.y) / c.r;
      if (d > 1.5) continue;
      if (d < 1) h += -0.16 * c.r * (1 - d * d) + 0.03 * c.r;
      else h += 0.03 * c.r * Math.pow(1 - (d - 1) / 0.5, 2);
    }
    return h * fade;
  };
  // LOLA inside the patch; outside it the patch's edge heights carry on and fade out over 4 km while the generated
  // craters fade in, so a ridge or slope continues naturally instead of ending in a wall
  const coarse = (x: number, y: number) => {
    if (!lola) return gen(x, y);
    const cx = Math.max(-INNER, Math.min(INNER, x)), cy = Math.max(-INNER, Math.min(INNER, y));
    const L = P.patchElevationAt(site, cx, cy) - datum;
    const out = Math.hypot(x - cx, y - cy);
    if (out === 0) return L;
    return L * (1 - smooth(0, 4000, out)) + gen(x, y) * smooth(0, 400, out);
  };
  const heightAt = (x: number, y: number) => coarse(x, y) + fine(x, y);
  // the slope a lander feels comes from the measured ground, not the decorative small craters
  const normalAt = (x: number, y: number) => {
    const e = 5;
    const dx = (coarse(x + e, y) - coarse(x - e, y)) / (2 * e);
    const dy = (coarse(x, y + e) - coarse(x, y - e)) / (2 * e);
    return new THREE.Vector3(-dx, 1, dy).normalize(); // local z is south
  };

  const group = new THREE.Group();
  const detail: { setOrigin: (v: THREE.Vector3) => void }[] = [];
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
    detail.push(addSurfaceDetail(m, new THREE.Vector3(), 1.6));
    const me = new THREE.Mesh(g, m);
    me.receiveShadow = true;
    geos.push(g);
    mats.push(m);
    group.add(me);
    return me;
  };

  const pad = mesh(PAD, 2, false, () => 0, 3);
  pad.name = "ground-pad";
  const inner = mesh(INNER, 20, false, (x, y) => (Math.max(Math.abs(x), Math.abs(y)) < PAD - 25 ? 3 : 0), 8);
  inner.castShadow = true;
  inner.name = "ground-inner";
  // under the 20 m mesh the coarse ground is pushed down out of sight; near the edge only slightly, so no trench shows
  const apron = mesh(APRON, 250, true, (x, y) => {
    const m = Math.max(Math.abs(x), Math.abs(y));
    return m < INNER - 160 ? 25 : m < INNER ? 3 : 0;
  }, 0);

  apron.name = "ground-apron";
  apron.receiveShadow = false; // the shadow map only covers the site; outside it, plain shading

  // slope colours on the 20 m mesh: green under 10 deg, amber to 15 deg, red above (LOLA sites only)
  const setSlopeColors = (on: boolean) => { for (const me of [inner, pad]) slopeOn(me, on); };
  const slopeOn = (me: THREE.Mesh, on: boolean) => {
    const g = me.geometry as THREE.BufferGeometry;
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

  // rocks: one instanced mesh, a few hundred stones near the site and some boulders further out
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = rockGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(0.8 + rnd() * 0.35);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.95, metalness: 0, flatShading: true });
  geos.push(rockGeo);
  mats.push(rockMat);
  const NR = 900;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, NR);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = "rocks";
  const rockData = Array.from({ length: NR }, (_, i) => {
    const far = i > 780;
    const a = rnd() * Math.PI * 2, d = far ? 150 + rnd() * 850 : Math.pow(rnd(), 0.8) * 165;
    const sz = far ? 0.8 + Math.pow(rnd(), 3) * 3 : 0.1 + Math.pow(rnd(), 3) * 1.3;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, sz, sy: 0.45 + rnd() * 0.4, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)) };
  });
  group.add(rocks);
  const m4 = new THREE.Matrix4();
  const setSpot = (sx: number, sy: number) => {
    rockData.forEach((r, i) => {
      const clear = Math.hypot(r.x - sx, r.y - sy) < 6 + r.sz * 2;
      const sz = clear ? 0 : r.sz;
      m4.compose(new THREE.Vector3(r.x, heightAt(r.x, r.y) + sz * r.sy * 0.35, -r.y), r.q, new THREE.Vector3(sz, sz * r.sy, sz));
      rocks.setMatrixAt(i, m4);
    });
    rocks.instanceMatrix.needsUpdate = true;
    // blast mark: a small draped grid around the spot
    const bp = blastGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const lx = blastBase[i * 2], ly = blastBase[i * 2 + 1];
      bp.setXYZ(i, sx + lx, heightAt(sx + lx, sy + ly) + 0.06, -(sy + ly));
    }
    bp.needsUpdate = true;
    blastGeo.computeBoundingSphere();
  };
  // the blast mark: brighter, swept-clean ground with faint radial streaks (soft canvas texture, additive-free)
  const bc = document.createElement("canvas");
  bc.width = bc.height = 128;
  const bx = bc.getContext("2d")!;
  const grd = bx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.35)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  bx.fillStyle = grd;
  bx.fillRect(0, 0, 128, 128);
  const blastTex = new THREE.CanvasTexture(bc);
  const BS = 16, BN = 21;
  const blastGeo = new THREE.PlaneGeometry(BS * 2, BS * 2, BN - 1, BN - 1);
  const blastBase: number[] = [];
  {
    const p = blastGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) blastBase.push(p.getX(i), p.getY(i));
  }
  const blastMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, map: blastTex, transparent: true, opacity: 0, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const blast = new THREE.Mesh(blastGeo, blastMat);
  blast.receiveShadow = true;
  blast.visible = false;
  blast.renderOrder = 1;
  group.add(blast);
  geos.push(blastGeo);
  mats.push(blastMat);
  const setBlast = (k: number) => {
    blastMat.opacity = 0.6 * Math.max(0, Math.min(1, k));
    blast.visible = k > 0.01;
  };
  setSpot(0, 0);

  group.scale.setScalar(0.001); // metres -> km
  return {
    group,
    heightAt,
    normalAt,
    lola,
    setSlopeColors,
    setSpot,
    setBlast,
    setDetailOrigin: (v: THREE.Vector3) => detail.forEach((d) => d.setOrigin(v)),
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      blastTex.dispose();
    },
  };
}
