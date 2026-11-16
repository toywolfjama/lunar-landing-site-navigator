/* A short scene after touchdown: an astronaut climbs down a leg, walks out a few metres and plants a flag.
   Built in metres in the lander's frame (+y up, origin on the footpad plane), so it rides on the lander group.
   The flag is plain: the project's own mark, no national or agency emblem. Low-poly; a handful of draw calls. */
import * as THREE from "three";

export interface Crew {
  group: THREE.Group;
  /** seconds since the scene started; Infinity shows the final pose, a negative value hides everything */
  update: (t: number) => void;
  dispose: () => void;
}

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export function buildCrew(): Crew {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (mats.push(x), x);

  const suit = m(new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.85 }));
  const grey = m(new THREE.MeshStandardMaterial({ color: 0x9a9a9e, roughness: 0.7 }));
  const visor = m(new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.15 }));
  const pole = m(new THREE.MeshStandardMaterial({ color: 0xd0d0d4, metalness: 0.8, roughness: 0.3 }));
  const dark = m(new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.6 }));
  const metal = m(new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.3 }));
  const red = m(new THREE.MeshStandardMaterial({ color: 0xc8463c, roughness: 0.6 }));
  const blue = m(new THREE.MeshStandardMaterial({ color: 0x3a6fd0, roughness: 0.5, emissive: 0x0a1a40 }));

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(g(geo), mat);
    me.position.set(x, y, z);
    me.castShadow = true;
    parent.add(me);
    return me;
  };

  // astronaut, about 1.85 m tall, facing +z
  const body = new THREE.Group();
  group.add(body);
  // torso, hip bearing, chest control unit and a mission stripe on one arm
  mesh(new THREE.CapsuleGeometry(0.25, 0.48, 4, 14), suit, body, 0, 1.13, 0);
  mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), metal, body, 0, 0.88, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), grey, body, 0, 1.18, 0.25);
  mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), blue, body, -0.08, 1.21, 0.305);
  mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), red, body, 0.0, 1.21, 0.305);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8), metal, body, 0.09, 1.21, 0.31).rotation.x = Math.PI / 2;
  // life-support pack with a top unit, side hoses and a short antenna
  mesh(new THREE.BoxGeometry(0.48, 0.62, 0.26), grey, body, 0, 1.2, -0.29);
  mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), suit, body, 0, 1.56, -0.29);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), metal, body, 0.17, 1.76, -0.32);
  for (const sx of [-1, 1]) {
    const hose = mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 12, Math.PI), dark, body, sx * 0.18, 1.12, 0.1);
    hose.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }
  // helmet: neck ring, shell, gold visor, visor frame and two helmet lamps
  mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 20), metal, body, 0, 1.49, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.2, 20, 14), suit, body, 0, 1.66, 0);
  const v = mesh(new THREE.SphereGeometry(0.168, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), visor, body, 0, 1.67, 0.06);
  v.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.165, 0.014, 6, 24, Math.PI), metal, body, 0, 1.67, 0.06).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 10), metal, body, sx * 0.15, 1.78, 0.08).rotation.x = Math.PI / 2;
  // limbs with joint rings; gloves and boots
  const limb = (len: number, r: number, end: "glove" | "boot") => {
    const piv = new THREE.Group();
    mesh(new THREE.CapsuleGeometry(r, len, 3, 10), suit, piv, 0, -len / 2 - r, 0);
    mesh(new THREE.TorusGeometry(r * 1.02, r * 0.18, 6, 14), grey, piv, 0, -len / 2 - r, 0).rotation.x = Math.PI / 2;
    if (end === "glove") mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), dark, piv, 0, -len - r * 1.6, 0.01);
    else {
      mesh(new THREE.BoxGeometry(r * 2.3, r * 1.2, r * 3.4), grey, piv, 0, -len - r * 1.4, r * 0.6);
      mesh(new THREE.BoxGeometry(r * 2.4, r * 0.35, r * 3.5), dark, piv, 0, -len - r * 1.95, r * 0.6);
    }
    return piv;
  };
  const legL = limb(0.62, 0.1, "boot"), legR = limb(0.62, 0.1, "boot");
  legL.position.set(-0.12, 0.86, 0);
  legR.position.set(0.12, 0.86, 0);
  const armL = limb(0.5, 0.075, "glove"), armR = limb(0.5, 0.075, "glove");
  mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), red, armL, 0, -0.08, 0);
  armL.position.set(-0.3, 1.4, 0);
  armR.position.set(0.3, 1.4, 0);
  body.add(legL, legR, armL, armR);

  // flag: pole, top bar and a plain cloth with a simple Moon-and-point mark
  const flag = new THREE.Group();
  group.add(flag);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.0, 8), pole, flag, 0, 1.0, 0);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), pole, flag, 0.45, 1.95, 0).rotation.z = Math.PI / 2;
  const cv = document.createElement("canvas");
  cv.width = 192; cv.height = 128;
  const cx = cv.getContext("2d")!;
  cx.fillStyle = "#14161c"; cx.fillRect(0, 0, 192, 128);
  cx.fillStyle = "#e9e9ec"; cx.beginPath(); cx.arc(84, 64, 34, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = "#f5a524"; cx.beginPath(); cx.arc(102, 50, 9, 0, Math.PI * 2); cx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 1), m(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })), flag, 0.45, 1.65, 0);
  const clothPos = cloth.geometry.getAttribute("position") as THREE.BufferAttribute;
  const clothBase = Float32Array.from(clothPos.array as Float32Array);

  // path in the lander frame: down the +x leg, out to the flag spot, then a step back
  const hatch = new THREE.Vector3(1.25, 1.55, 0.35), legFoot = new THREE.Vector3(2.0, 0, 0.6), flagAt = new THREE.Vector3(4.6, 0, 2.2);
  const stand = flagAt.clone().add(new THREE.Vector3(-0.55, 0, -0.35));
  const back = flagAt.clone().add(new THREE.Vector3(-1.1, 0, -1.0));
  const face = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

  const update = (t: number) => {
    group.visible = t >= 0;
    if (t < 0) return;
    const T = Math.min(t, 14);
    let p = new THREE.Vector3(), yaw = 0, walk = 0, reach = 0, flagDrop = 1, flagShown = false;
    if (T < 0.6) { p.copy(hatch); yaw = face(hatch, legFoot); }
    else if (T < 3.0) { // climb down
      const k = smooth((T - 0.6) / 2.4);
      p.copy(hatch).lerp(legFoot, k);
      yaw = face(hatch, legFoot);
      walk = Math.sin(T * 6) * 0.25 * (1 - k);
    } else if (T < 6.2) { // walk out, carrying the flag
      const k = smooth((T - 3.0) / 3.2);
      p.copy(legFoot).lerp(stand, k);
      yaw = face(legFoot, stand);
      walk = Math.sin(T * 7) * 0.5 * Math.min(1, (T - 3.0) * 2, (6.2 - T) * 2);
      p.y += Math.abs(Math.sin(T * 7)) * 0.06; // low-gravity lope
      flagShown = true; flagDrop = -1;
    } else if (T < 8.4) { // plant the flag
      p.copy(stand);
      yaw = face(stand, flagAt);
      const k = smooth((T - 6.2) / 2.2);
      reach = 1;
      flagShown = true;
      flagDrop = k;
    } else { // step back and look
      const k = smooth((T - 8.4) / 2.0);
      p.copy(stand).lerp(back, k);
      yaw = face(stand, flagAt);
      walk = Math.sin(T * 6) * 0.35 * (1 - k) * Math.min(1, (T - 8.4) * 3);
      flagShown = true;
    }
    body.position.copy(p);
    body.rotation.y = yaw;
    legL.rotation.x = walk;
    legR.rotation.x = -walk;
    armL.rotation.x = -walk * 0.8 - reach * 1.2;
    armR.rotation.x = walk * 0.8 - reach * 1.2;

    flag.visible = flagShown;
    if (flagDrop < 0) {
      // carried: held upright beside the astronaut
      const side = new THREE.Vector3(0.38, 0, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      flag.position.copy(p).add(side).add(new THREE.Vector3(0, 0.5, 0));
    } else {
      flag.position.copy(flagAt).add(new THREE.Vector3(0, 0.45 * (1 - flagDrop), 0)); // pushed into the regolith
    }
    flag.rotation.y = 0.6;
    // a little sway while it is handled, then still (no air)
    const sway = flagShown && T < 9 ? Math.sin(T * 5) * 0.15 * (T < 8.4 ? 1 : 9 - T) : 0;
    for (let i = 0; i < clothPos.count; i++) {
      const x = clothBase[i * 3];
      clothPos.setZ(i, clothBase[i * 3 + 2] + sway * (x + 0.45) * 0.4);
    }
    clothPos.needsUpdate = true;
  };
  update(-1);
  return { group, update, dispose: () => { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); tex.dispose(); } };
}
