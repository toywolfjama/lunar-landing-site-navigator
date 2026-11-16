/* Ground around the landing site, in a local frame (x east, y up, z south, metres; the group is scaled to km).
   Inside 1 km of the site: NASA LOLA 20 m heights where the app has them. Around it, out to 15 km: generated craters
   and rolling ground that fade into the Moon sphere. Good enough to fly over, not a survey product. */
import * as THREE from "three";
import * as P from "../physics/lunarAstronomy";
import { addSurfaceDetail } from "./surfaceDetail";

const INNER = 1040; // m, half-size of the 20 m mesh (the LOLA patch is +-1050 m)
const APRON = 30000; // m, half-size of the generated ground
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
  setSpot: (x: number, y: number) => void; // centres the blast mark on the touchdown spot
  setBlast: (k: number) => void; // 0..1: the bright, swept ground the engine leaves around the touchdown point
  setFade: (k: number) => void; // 0..1: dithered fade-in as the camera comes down, so the site ground never pops in
  setAlbedo: (sample: (world: THREE.Vector3) => number) => void; // ground colour from the Moon map, so it blends in
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
    // relief fades out on a circle, well inside the square mesh, so no square outline shows against the sphere
    return h * (1 - smooth(APRON * 0.4, APRON * 0.8, Math.hypot(x, y)));
  };
  // LOLA inside the patch; outside it the patch's edge heights carry on and fade out over 4 km while the generated
  // craters fade in, so a ridge or slope continues naturally instead of ending in a wall
  // the patch's mean tilt (least squares over its 100 m grid); the ground outside continues it and levels off by 14 km,
  // so the 2 km patch never stands as a raised or sunken block
  let pa = 0, pb = 0, pc = 0;
  if (lola) {
    let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxz = 0, syz = 0;
    for (let j = -10; j <= 10; j++)
      for (let i = -10; i <= 10; i++) {
        const x = i * 100, y = j * 100, z = P.patchElevationAt(site, x, y) - datum;
        n++; sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxz += x * z; syz += y * z;
      }
    pb = (sxz - (sx * sz) / n) / (sxx - (sx * sx) / n);
    pc = (syz - (sy * sz) / n) / (syy - (sy * sy) / n);
    pa = (sz - pb * sx - pc * sy) / n;
  }
  const plane = (x: number, y: number) => pa + pb * x + pc * y;
  const coarse = (x: number, y: number) => {
    if (!lola) return gen(x, y);
    const cx = Math.max(-INNER, Math.min(INNER, x)), cy = Math.max(-INNER, Math.min(INNER, y));
    const L = P.patchElevationAt(site, cx, cy) - datum;
    const out = Math.hypot(x - cx, y - cy);
    if (out === 0) return L;
    const pl = plane(x, y) * (1 - smooth(1500, 14000, Math.hypot(x, y)));
    return pl + (L - plane(cx, cy)) * (1 - smooth(0, 1500, out)) + gen(x, y) * smooth(0, 400, out);
  };
  const heightAt = coarse;
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
    detail.push(addSurfaceDetail(m, new THREE.Vector3(), 1));
    const me = new THREE.Mesh(g, m);
    me.receiveShadow = true;
    geos.push(g);
    mats.push(m);
    group.add(me);
    return me;
  };

  const inner = mesh(INNER, 20, false, () => 0, 8);
  inner.castShadow = true;
  {
    const ig = inner.geometry as THREE.BufferGeometry;
    const pos = ig.getAttribute("position") as THREE.BufferAttribute;
    const c3 = ig.getAttribute("color") as THREE.BufferAttribute;
    const c4 = new Float32Array(pos.count * 4);
    for (let k = 0; k < pos.count; k++) {
      const e = Math.max(Math.abs(pos.getX(k)), Math.abs(pos.getZ(k)));
      c4.set([c3.getX(k), c3.getY(k), c3.getZ(k), k >= ig.userData.gridCount ? 0 : 1 - smooth(INNER - 150, INNER - 10, e)], k * 4);
    }
    ig.setAttribute("color", new THREE.BufferAttribute(c4, 4));
    (inner.material as THREE.MeshStandardMaterial).alphaHash = true;
  }
  inner.name = "ground-inner";
  // under the 20 m mesh the coarse ground is pushed down out of sight; near the edge only slightly, so no trench shows
  const apron = mesh(APRON, 250, true, (x, y) => {
    const m = Math.max(Math.abs(x), Math.abs(y));
    return m < INNER - 300 ? 25 : m < INNER ? 5 : 0;
  }, 0);
  // the outer ring of the apron dissolves into the Moon sphere (dithered alpha, no sorting), so there is no edge
  {
    const ag = apron.geometry as THREE.BufferGeometry;
    const pos = ag.getAttribute("position") as THREE.BufferAttribute;
    const c3 = ag.getAttribute("color") as THREE.BufferAttribute;
    const c4 = new Float32Array(pos.count * 4);
    for (let k = 0; k < pos.count; k++) {
      const r = Math.hypot(pos.getX(k), pos.getZ(k));
      c4.set([c3.getX(k), c3.getY(k), c3.getZ(k), 1 - smooth(APRON * 0.45, APRON * 0.92, r)], k * 4);
    }
    ag.setAttribute("color", new THREE.BufferAttribute(c4, 4));
    const am = apron.material as THREE.MeshStandardMaterial;
    am.alphaHash = true;
    am.needsUpdate = true;
  }

  apron.name = "ground-apron";
  apron.receiveShadow = false; // the shadow map only covers the site; outside it, plain shading

  // slope colours on the 20 m mesh: green under 10 deg, amber to 15 deg, red above (LOLA sites only)
  let slopeState = false;
  const setSlopeColors = (on: boolean) => { slopeState = on; slopeOn(inner, on); slopeOn(apron, false); };
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

  const m4 = new THREE.Matrix4();
  const setSpot = (sx: number, sy: number) => {
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
  // like the halos seen around real landers (Apollo, Chang'e, IM-1): a small scoured, slightly darker patch under the
  // engine and a broad, soft, irregular bright zone where the fine dust was blown off; no hard edge, no streaks
  const bc = document.createElement("canvas");
  bc.width = bc.height = 256;
  const bx = bc.getContext("2d")!;
  const bimg = bx.createImageData(256, 256);
  const lobes = Array.from({ length: 7 }, () => ({ a: rnd() * Math.PI * 2, k: 0.06 + rnd() * 0.1 }));
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 256; i++) {
      const dx = (i - 127.5) / 128, dy = (j - 127.5) / 128;
      const ang = Math.atan2(dy, dx);
      let edge = 0.78;
      for (const l of lobes) edge += l.k * Math.cos(ang - l.a) * 0.5;
      edge += (vnoise(i / 18, j / 18) - 0.5) * 0.12;
      const r = Math.hypot(dx, dy) / edge;
      const halo = Math.max(0, 1 - smooth(0.25, 1, r)) * (0.9 + (vnoise(i / 30 + 3, j / 30 + 9) - 0.5) * 0.12);
      const scour = 1 - smooth(0.05, 0.16, r);
      const v = 255 * (1 - 0.35 * scour);
      const o = (j * 256 + i) * 4;
      bimg.data[o] = v; bimg.data[o + 1] = v * 0.985; bimg.data[o + 2] = v * 0.96;
      bimg.data[o + 3] = 255 * Math.min(1, halo * 0.42 + scour * 0.35);
    }
  bx.putImageData(bimg, 0, 0);
  const blastTex = new THREE.CanvasTexture(bc);
  const BS = 24, BN = 25;
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
    blastMat.opacity = 0.75 * Math.max(0, Math.min(1, k));
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
    setAlbedo: (sample: (world: THREE.Vector3) => number) => {
      group.updateMatrixWorld(true);
      const w = new THREE.Vector3();
      for (const me of [inner, apron]) {
        const g = me.geometry as THREE.BufferGeometry;
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        const base: number[] = g.userData.base;
        for (let k = 0; k < pos.count; k++) {
          w.fromBufferAttribute(pos, k).applyMatrix4(group.matrixWorld);
          base[k] = sample(w); // the map's own albedo, exactly as the sphere shows it (skirt included)
        }
      }
      setSlopeColors(slopeState);
    },
    setFade: (k: number) => {
      const solid = k >= 0.999;
      for (const m of mats) {
        if (m === blastMat) continue;
        const sm = m as THREE.MeshStandardMaterial;
        const hash = !solid || sm === apron.material || sm === inner.material;
        if (sm.alphaHash !== hash) { sm.alphaHash = hash; sm.needsUpdate = true; }
        sm.opacity = k;
      }
      group.visible = k > 0.001;
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      blastTex.dispose();
    },
  };
}
