/* A small robotic lander in the style of the current commercial ones (about 4 m tall, 4.4 m across the feet).
   Built in metres with +y up and the origin on the plane of the footpads, so placing it on the ground is one step. */
import * as THREE from "three";

export interface LanderModel {
  group: THREE.Group;
  setThrottle: (t: number, timeS: number) => void;
  pointAntenna: (dirLocal: THREE.Vector3 | null) => void;
  setDust: (heightM: number, throttle: number, timeS: number) => void;
  setLamps: (heightM: number) => void;
  dispose: () => void;
}

export function buildLander(): LanderModel {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m);

  // crinkled multi-layer insulation: a noise texture used as a bump map
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const cx = cv.getContext("2d")!;
  const img = cx.createImageData(256, 256);
  let sd = 3;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 256 * 256; i++) {
    const v = 110 + rnd() * 60;
    img.data.set([v, v, v, 255], i * 4);
  }
  cx.putImageData(img, 0, 0);
  for (let k = 0; k < 160; k++) {
    cx.strokeStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},0.18)`;
    cx.lineWidth = 1 + rnd() * 3;
    cx.beginPath();
    cx.moveTo(rnd() * 256, rnd() * 256);
    cx.lineTo(rnd() * 256, rnd() * 256);
    cx.stroke();
  }
  const crinkle = new THREE.CanvasTexture(cv);
  crinkle.wrapS = crinkle.wrapT = THREE.RepeatWrapping;
  crinkle.repeat.set(2, 1);
  const gold = mat(new THREE.MeshStandardMaterial({ color: 0xc89b2c, metalness: 0.9, roughness: 0.3, flatShading: true, bumpMap: crinkle, bumpScale: 2.5 }));
  const silver = mat(new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 0.75, roughness: 0.3 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.5 }));
  const white = mat(new THREE.MeshStandardMaterial({ color: 0xe9e9ec, metalness: 0.1, roughness: 0.55 }));
  const cell = mat(new THREE.MeshStandardMaterial({ color: 0x14254a, metalness: 0.5, roughness: 0.25, emissive: 0x050a18 }));
  const strut = mat(new THREE.MeshStandardMaterial({ color: 0xb8b8bd, metalness: 0.85, roughness: 0.35 }));

  const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(keep(g), m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    group.add(me);
    return me;
  };

  // body: an octagonal prism wrapped in gold foil, with decks top and bottom
  add(new THREE.CylinderGeometry(1.3, 1.3, 1.5, 8), gold, 0, 1.95);
  add(new THREE.CylinderGeometry(1.36, 1.36, 0.1, 8), silver, 0, 2.75);
  add(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 8), dark, 0, 1.17);
  // propellant tanks on the top deck
  add(new THREE.SphereGeometry(0.42, 20, 14), white, 0.55, 3.15, 0.2);
  add(new THREE.SphereGeometry(0.42, 20, 14), white, -0.55, 3.15, -0.2);
  // body-mounted solar panels on two faces
  for (const s of [1, -1]) {
    const p = add(new THREE.BoxGeometry(0.05, 1.25, 1.0), cell, s * 1.22, 1.95, 0);
    p.rotation.y = 0;
    const frame = add(new THREE.BoxGeometry(0.03, 1.32, 1.07), silver, s * 1.205, 1.95, 0);
    frame.castShadow = false;
  }
  // main engine
  const bell = new THREE.LatheGeometry(
    Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return new THREE.Vector2(0.14 + 0.32 * Math.pow(t, 0.7), 1.1 - t * 0.62);
    }),
    28
  );
  const bellMat = mat(new THREE.MeshStandardMaterial({ color: 0x3c3c40, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide, emissive: 0xff7a2a, emissiveIntensity: 0 }));
  add(bell, bellMat);
  // reaction-control thruster pods at four corners
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 2;
    add(new THREE.BoxGeometry(0.18, 0.18, 0.18), dark, Math.cos(a) * 1.32, 2.55, Math.sin(a) * 1.32);
  }
  // landing legs: a main strut and a brace to each footpad
  const strutBetween = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, 10);
    const me = add(g, strut);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  };
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    const foot = new THREE.Vector3(c * 2.2, 0.12, s * 2.2);
    strutBetween(new THREE.Vector3(c * 1.15, 1.5, s * 1.15), foot, 0.06);
    strutBetween(new THREE.Vector3(c * 1.0, 1.15, s * 1.0), new THREE.Vector3(c * 1.75, 0.55, s * 1.75), 0.04);
    add(new THREE.CylinderGeometry(0.32, 0.36, 0.1, 18), strut, foot.x, 0.05, foot.z);
  }
  // high-gain antenna on a mast; the dish group turns to face Earth after landing
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), strut, -0.2, 3.15, 0.75);
  const antenna = new THREE.Group();
  antenna.position.set(-0.2, 3.55, 0.75);
  const dish = new THREE.Mesh(
    keep(new THREE.LatheGeometry(Array.from({ length: 10 }, (_, i) => new THREE.Vector2((i / 9) * 0.5, ((i / 9) * 0.5) ** 2 * 0.9)), 28)),
    mat(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }))
  );
  dish.castShadow = true;
  const feed = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6)), strut);
  feed.position.y = 0.16;
  antenna.add(dish, feed);
  group.add(antenna);

  // engine plume: two additive cones, faint as plumes are in vacuum
  const plume = new THREE.Group();
  const outer = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.75, 1, 24, 1, true)),
    mat(new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  );
  const core = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.3, 1, 18, 1, true)),
    mat(new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  );
  outer.rotation.x = Math.PI; // point down
  core.rotation.x = Math.PI;
  plume.add(outer, core);
  plume.position.y = 0.48;
  group.add(plume);
  // lights: the scene works in km, so intensities are scaled by 1e-6 (inverse square in km)
  const glow = new THREE.PointLight(0xffc890, 0, 0.08, 2);
  glow.position.y = -0.5;
  group.add(glow);
  const lamp = new THREE.SpotLight(0xf4f6ff, 0, 0.2, 0.62, 0.55, 2);
  lamp.position.set(0, 1.05, 0);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, -20, 0);
  group.add(lamp, lampTarget);
  lamp.target = lampTarget;
  for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), mat(new THREE.MeshBasicMaterial({ color: 0xffffff })), sx * 0.75, 1.1, 0.75);

  // dust kicked up near the ground
  const N = 260;
  const dustGeo = keep(new THREE.BufferGeometry());
  const dustPos = new Float32Array(N * 3);
  const seeds = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2 + Math.random() * 0.2, s: 0.5 + Math.random(), p: Math.random() }));
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = mat(new THREE.PointsMaterial({ color: 0xbdb6a8, size: 0.00018, transparent: true, opacity: 0, depthWrite: false })); // size in world units (km): about 18 cm
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const setThrottle = (t: number, timeS: number) => {
    const on = t > 0.02;
    plume.visible = on;
    if (on) {
      const flick = 1 + Math.sin(timeS * 61) * 0.05 + Math.sin(timeS * 37) * 0.04;
      const len = (1.2 + t * 3.2) * flick;
      outer.scale.set(0.7 + t * 0.6, len, 0.7 + t * 0.6);
      outer.position.y = -len / 2;
      core.scale.set(1, len * 0.55, 1);
      core.position.y = (-len * 0.55) / 2;
    }
    glow.intensity = on ? 2.5e-5 * t : 0;
    bellMat.emissiveIntensity = on ? 0.6 + t * 0.8 : 0;
  };
  const pointAntenna = (dir: THREE.Vector3 | null) => {
    const d = dir && dir.y > -0.2 ? dir.clone().normalize() : new THREE.Vector3(0.3, 1, 0).normalize();
    antenna.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  };
  const setLamps = (h: number) => {
    lamp.intensity = h < 400 ? 6e-5 : 0;
  };
  const setDust = (h: number, t: number, timeS: number) => {
    const k = t > 0.05 ? Math.max(0, 1 - h / 30) : 0;
    dustMat.opacity = 0.55 * k;
    dust.visible = k > 0.01;
    if (!dust.visible) return;
    for (let i = 0; i < N; i++) {
      const sd = seeds[i];
      const ph = (sd.p + timeS * 0.6 * sd.s) % 1;
      const r = 1.5 + ph * (6 + 10 * t);
      dustPos[i * 3] = Math.cos(sd.a) * r;
      dustPos[i * 3 + 1] = -h + 0.1 + Math.sin(ph * Math.PI) * 0.6 * sd.s;
      dustPos[i * 3 + 2] = Math.sin(sd.a) * r;
    }
    dustGeo.getAttribute("position").needsUpdate = true;
  };
  setThrottle(0, 0);
  pointAntenna(null);
  return { group, setThrottle, pointAntenna, setDust, setLamps, dispose: () => (geos.forEach((g) => g.dispose()), mats.forEach((m) => m.dispose())) };
}
