/* The whole app on one page: a 3D Earth and Moon (not to scale), the landing site on real terrain, a lander, the
   trajectory from Earth to touchdown with playback controls, and the three landing checks. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import * as P from "./physics/lunarAstronomy";
import { LANDINGS, Landing } from "./landings";
import { assess, siteFor, cellToM, mToCell, bestCell, SLOPE_LIMIT, TIP_LIMIT, TERRAIN_IDS, fmtHours } from "./checks";
import { Sky } from "./Sky";
import { buildGround, Ground } from "./scene/terrain";
import { addSurfaceDetail } from "./scene/surfaceDetail";
import { EngineerPanel } from "./Engineer";
import { buildLander, LanderModel } from "./scene/lander";
import { buildMission, Mission as MissionPath, PHASES, PHASE_START, TOTAL_ANIM } from "./scene/trajectory";
import { shot, ShotContext } from "./scene/cinema";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const DAY = 86400000;
const D2R = Math.PI / 180;
const R_MOON = P.R_MOON_KM;
const EARTH_R = 1.8 * R_MOON; // not to scale: Earth is really 3.7 times the Moon's radius
const EARTH_D = 13 * R_MOON; // not to scale: Earth is really 221 Moon radii away
const C_KMS = 299792.458;
const STORE = "llsn.customLandings.v1";
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
type View = "system" | "moon" | "site" | "cine" | "follow";

/* scene frame: selenographic (x to 0E 0N, y to 90E, z north) mapped to three.js with north up */
const toThree = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]);
const unit = (lat: number, lon: number) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtLat = (x: number) => Math.abs(x).toFixed(2) + "°" + (x >= 0 ? "N" : "S");
const fmtLon = (x: number) => { const y = P.norm180(x); return Math.abs(y).toFixed(2) + "°" + (y >= 0 ? "E" : "W"); };
const fmtClock = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return (d ? d + "d " : "") + p(h) + ":" + p(m) + ":" + p(x);
};
const fmtNum = (x: number, d = 0) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function loadCustoms(): Landing[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(v) ? v.filter((l) => l && typeof l.lat === "number" && typeof l.lon === "number").slice(0, 50) : [];
  } catch {
    return [];
  }
}
function saveCustoms(list: Landing[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* storage off: the landings still work for this visit */
  }
}
const customLanding = (id: string, name: string, lat: number, lon: number): Landing => ({
  id, name, mission: "Custom landing", agency: "You", date: "", lat, lon, kind: "custom", region: "Your site",
  note: "Your own landing site. No LOLA terrain here: the ground is generated and slope is unknown.",
});

interface Ui {
  tau: number;
  phase: number;
  alt: number;
  speed: number;
  vs: number;
  dist: number;
  remain: number;
}

export function Mission({ engineer = false, onEngineer }: { engineer?: boolean; onEngineer?: (v: boolean) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState("shackleton");
  const [customs, setCustoms] = useState<Landing[]>(loadCustoms);
  const [draft, setDraft] = useState<Landing | null>(null);
  const [spots, setSpots] = useState<Record<string, { x: number; y: number }>>({});
  const [timeMode, setTimeMode] = useState<"now" | "set">("now");
  const [setMs, setSetMs] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const [view, setView] = useState<View>("system");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [slopeColors, setSlopeColors] = useState(false);
  const [result, setResult] = useState(false);
  const [ui, setUi] = useState<Ui>({ tau: TOTAL_ANIM, phase: PHASES.length - 1, alt: 0, speed: 0, vs: 0, dist: 0, remain: 0 });
  const [glOk, setGlOk] = useState(true);
  const [slowMo, setSlowMo] = useState(false);
  const [drawer, setDrawer] = useState<"sky" | "compare" | null>(() => (typeof window !== "undefined" && window.innerWidth < 900 ? null : "sky"));
  const [pins, setPins] = useState<{ key: string; landing: Landing; t: number; spot: { x: number; y: number } }[]>([]);
  useEffect(() => {
    if (timeMode !== "now") return;
    // Entering "now" mode jumps to the current minute at once, then keeps up with the clock.
    const tick = () => setClock(Math.floor(Date.now() / 60000) * 60000);
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [timeMode]);
  useEffect(() => saveCustoms(customs), [customs]);

  const t = timeMode === "now" ? clock : setMs;
  const all = useMemo(() => [...LANDINGS, ...customs, ...(draft ? [draft] : [])], [customs, draft]);
  const sel = all.find((l) => l.id === selId) || LANDINGS[0];
  const site = useMemo(() => siteFor(sel), [sel.id, sel.lat, sel.lon]);
  const lolaSite = site.terrain;
  const spot = spots[sel.id] || (lolaSite ? cellToM(bestCell(site)) : { x: 0, y: 0 });
  const cell = mToCell(spot.x, spot.y);
  const A = useMemo(() => assess(sel, t, cell), [sel, t, cell.ix, cell.iy]);

  // everything the render loop needs, kept current without restarting it
  const S = useRef<any>({});
  const live = useRef({ playing, speed, view, A, sel, all, slopeColors });
  live.current = { playing, speed, view, A, sel, all, slopeColors };
  const api = useRef({
    pick: (_id: string) => {},
    landAt: (_lat: number, _lon: number) => {},
    moveSpot: (_x: number, _y: number) => {},
    ended: () => {},
    takeCamera: () => {},
    zoom: (_k: number) => {},
  });
  api.current.pick = (id) => setSelId(id);
  api.current.landAt = (lat, lon) => {
    const la = Math.round(lat * 1000) / 1000, lo = Math.round(P.norm180(lon) * 1000) / 1000;
    if (sel.kind === "custom") {
      if (sel.id === "draft") setDraft({ ...sel, lat: la, lon: lo });
      else setCustoms((c) => c.map((x) => (x.id === sel.id ? { ...x, lat: la, lon: lo } : x)));
    } else {
      setDraft(customLanding("draft", "My landing", la, lo));
      setSelId("draft");
    }
  };
  api.current.moveSpot = (x, y) => {
    const lim = 1000;
    let nx = Math.max(-lim, Math.min(lim, x)), ny = Math.max(-lim, Math.min(lim, y));
    if (lolaSite) {
      const c = mToCell(nx, ny);
      ({ x: nx, y: ny } = cellToM(c));
    }
    setSpots((m) => ({ ...m, [sel.id]: { x: nx, y: ny } }));
  };
  api.current.takeCamera = () => {
    const st = S.current;
    // keep the current distance as the starting zoom, so nothing jumps
    const smp = st.mission?.sample(st.tau);
    const auto = smp ? st.followDist(smp) : 1;
    const d = st.camera.position.distanceTo(st.landerHold.position);
    st.followZoom = live.current.view === "cine" ? Math.max(0.002, Math.min(60, d / auto)) : 1;
    if (live.current.view !== "cine") {
      // coming from another view: start from a pleasant angle above and behind
      const up = st.landerHold.position.clone().normalize();
      st.camera.position.copy(st.landerHold.position).add(up.multiplyScalar(auto * 0.6)).add(st.sunDir.clone().multiplyScalar(auto * 0.8));
    }
    st.controls.target.copy(st.landerHold.position);
    st.fly = null;
    setView("follow");
  };
  api.current.zoom = (k: number) => {
    const st = S.current;
    st.followZoom = Math.max(0.002, Math.min(60, (st.followZoom || 1) * k));
  };
  api.current.ended = () => {
    setPlaying(false);
    setResult(true);
  };

  /* ---------------- one-time scene setup ---------------- */
  useEffect(() => {
    const host = hostRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    } catch {
      setGlOk(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = "labels";
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.0005, 3e6);
    camera.position.set(0, 8000, 60000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.004;
    controls.maxDistance = 400000;
    controls.zoomSpeed = 1.2;

    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      sp.push(r * Math.cos(a) * 1.5e6, z * 1.5e6, r * Math.sin(a) * 1.5e6);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd8d8e0, size: 1.3, sizeAttenuation: false }));
    scene.add(stars);

    // Moon and Earth
    const loader = new THREE.TextureLoader();
    const moonTex = loader.load((globalThis as any).MOON_TEX || "assets/moon_lroc_1k.jpg");
    const earthTex = loader.load((globalThis as any).EARTH_TEX || "assets/earth_bluemarble_2k.jpg");
    moonTex.colorSpace = earthTex.colorSpace = THREE.SRGBColorSpace;
    moonTex.anisotropy = earthTex.anisotropy = 8;
    const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1, metalness: 0 });
    const moonDetail = addSurfaceDetail(moonMat, new THREE.Vector3());
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), moonMat);
    moon.name = "moon";
    moon.receiveShadow = false;
    scene.add(moon);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 48), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.75, metalness: 0 }));
    scene.add(earth);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.06, 64, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { sun: { value: new THREE.Vector3(1, 0, 0) } },
        vertexShader: `varying vec3 vN; varying vec3 vW;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vW;
          #include <logdepthbuf_pars_fragment>
          void main(){
            #include <logdepthbuf_fragment>
            vec3 v = normalize(cameraPosition - vW); float rim = pow(1. - abs(dot(v, vN)), 3.);
            float lit = smoothstep(-.3, .4, dot(vN, sun)); gl_FragColor = vec4(vec3(.35,.6,1.) * rim * lit * 1.4, rim * lit); }`,
      })
    );
    earth.add(atmo);

    // light: the Sun, a hint of earthshine, and very little ambient
    const sun = new THREE.DirectionalLight(0xfff6ea, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.0004;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -1.4; sc.right = 1.4; sc.top = 1.4; sc.bottom = -1.4; sc.near = 0.1; sc.far = 400;
    scene.add(sun, sun.target);
    const earthshine = new THREE.DirectionalLight(0x9db8ff, 0.08);
    scene.add(earthshine, earthshine.target);
    // a little fill so detail in shadow still reads (the real Moon has almost none)
    scene.add(new THREE.AmbientLight(0xffffff, 0.07));
    const fill = new THREE.HemisphereLight(0xcfd8ff, 0x1a1712, 0.12);
    scene.add(fill);

    // the Sun itself: a bright disc with a soft glow, always far beyond everything along the real Sun direction
    const sunTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const x = c.getContext("2d")!;
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.08, "rgba(255,252,240,1)");
      g.addColorStop(0.11, "rgba(255,236,190,0.75)");
      g.addColorStop(0.3, "rgba(255,200,120,0.18)");
      g.addColorStop(1, "rgba(255,170,80,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sunSprite.renderOrder = -1;
    scene.add(sunSprite);

    // labels
    const mkLabel = (text: string, cls: string) => {
      const d = document.createElement("div");
      d.className = "lbl " + cls;
      d.textContent = text;
      const o = new CSS2DObject(d);
      return o;
    };
    const earthLabel = mkLabel("Earth", "body");
    earth.add(earthLabel);
    earthLabel.position.set(0, -EARTH_R * 1.2, 0);
    const moonLabel = mkLabel("Moon", "body");
    scene.add(moonLabel);
    const landerLabel = mkLabel("Lander", "lander");
    scene.add(landerLabel);

    // lander
    const lander: LanderModel = buildLander();
    const landerHold = new THREE.Group();
    lander.group.scale.setScalar(0.001);
    landerHold.add(lander.group);
    scene.add(landerHold);

    // touchdown target ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.4, 48), new THREE.MeshBasicMaterial({ color: 0x4ab064, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;

    // trajectory lines and the radio path
    const lineMats: LineMaterial[] = [];
    const mkLine = (width: number, opacity: number, dashed = false) => {
      const m = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, opacity, dashed, dashSize: 600, gapSize: 400, worldUnits: false });
      lineMats.push(m);
      return m;
    };
    const pathAll = new Line2(new LineGeometry(), mkLine(1.6, 0.28));
    const pathDone = new Line2(new LineGeometry(), mkLine(3, 0.95));
    const radio = new Line2(new LineGeometry(), mkLine(2, 0.9, true));
    for (const l of [pathAll, pathDone, radio]) { l.frustumCulled = false; scene.add(l); }

    // landing-site dots on the Moon
    const dots = new Map<string, CSS2DObject>();
    const dotLayer = new THREE.Group();
    scene.add(dotLayer);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    S.current = { moonDetail, sunSprite, composer, renderer, labels, scene, camera, controls, moon, earth, atmo, sun, earthshine, lander, landerHold, ring, pathAll, pathDone, radio, lineMats, dots, dotLayer, earthLabel, moonLabel, landerLabel, mkLabel, phaseLabels: [] as CSS2DObject[] };

    const resize = () => {
      const r = host.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      renderer.domElement.style.width = r.width + "px";
      renderer.domElement.style.height = r.height + "px";
      labels.setSize(r.width, r.height);
      composer.setSize(r.width, r.height);
      camera.aspect = r.width / Math.max(1, r.height);
      // centre the picture in the space the panels leave free
      const wide = r.width >= 900;
      const panel = wide ? 388 : 0;
      const bottom = wide ? 0 : r.height * 0.44 + 16;
      camera.setViewOffset(r.width, r.height, -panel / 2, (bottom - (wide ? 40 : 60)) / 2 * 1, r.width, r.height);
      S.current.viewOffset = { panel, bottom };
      camera.updateProjectionMatrix();
      for (const m of lineMats) m.resolution.set(r.width, r.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    /* clicks: a dot picks a site, the ground moves the touchdown spot, anywhere else on the Moon lands there */
    const ray = new THREE.Raycaster();
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      // grabbing the view during the cinematic hands the camera to you, still following the lander
      if (live.current.view === "cine") api.current.takeCamera();
    };
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      downAt = null;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const st = S.current;
      if (st.ground) {
        const inner = st.ground.group.getObjectByName("ground-inner");
        const hit = inner && ray.intersectObject(inner, false)[0];
        if (hit) {
          const loc = st.ground.group.worldToLocal(hit.point.clone());
          api.current.moveSpot(loc.x, -loc.z);
          return;
        }
        const ap = st.ground.group.getObjectByName("ground-apron");
        if (ap && ray.intersectObject(ap, false)[0]) return; // on the generated ground: ignore
      }
      const mh = ray.intersectObject(moon, false)[0];
      if (mh) {
        const p = mh.point.clone().normalize();
        api.current.landAt(Math.asin(p.y) / D2R, Math.atan2(-p.z, p.x) / D2R);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    const onWheel = (e: WheelEvent) => {
      if (live.current.view !== "follow") return;
      e.preventDefault();
      api.current.zoom(Math.exp(e.deltaY * 0.0015));
    };
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch0 > 0 && live.current.view === "follow") {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        api.current.zoom(pinch0 / d);
        pinch0 = d;
      }
    };
    const onTouchUp = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("pointerdown", onTouchDown);
    renderer.domElement.addEventListener("pointermove", onTouchMove);
    renderer.domElement.addEventListener("pointerup", onTouchUp);
    renderer.domElement.addEventListener("pointercancel", onTouchUp);
    renderer.domElement.addEventListener("pointerup", onUp);

    /* ---------------- render loop ---------------- */
    let raf = 0, last = performance.now(), lastUi = 0;
    const tmp = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = S.current;
      const L = live.current;
      const mission: MissionPath | undefined = st.mission;
      if (!mission) return;
      const ts = now / 1000;
      let smp = mission.sample(st.tau);
      if (st.shotCtx) st.shotCtx.aspect = camera.aspect;
      const cineShot = L.view === "cine" ? shot(smp, st.shotCtx as ShotContext, ts) : null;
      if (!cineShot) st.camId = undefined;
      const slowWant = cineShot ? cineShot.slow : 1;
      // ease in and out of slow motion instead of snapping the playback rate
      st.slowS = st.slowS === undefined ? slowWant : st.slowS + (slowWant - st.slowS) * (1 - Math.exp(-dt * 4));
      const slow = st.slowS as number;
      if ((slowWant < 1) !== st.slow) { st.slow = slowWant < 1; setSlowMo(slowWant < 1); }
      const tauBefore = st.tau;
      if (L.playing) {
        st.tau = Math.min(TOTAL_ANIM, st.tau + dt * L.speed * slow);
        if (st.tau >= TOTAL_ANIM) api.current.ended();
        smp = mission.sample(st.tau);
      }
      // lander pose; on touchdown it settles onto the ground, or tips over on a steep spot
      landerHold.position.copy(smp.pos);
      if (smp.phase === PHASES.length - 1) {
        const k = Math.min(1, smp.u * 1.6);
        const qn = st.groundQuat as THREE.Quaternion;
        const q = smp.quat.clone().slerp(qn, Math.min(1, k * 2.5));
        if (L.A.tips) {
          // fall over the downhill footpad
          const ang = 1.35 * Math.min(1, Math.max(0, (smp.u - 0.2) / 0.6)) ** 2;
          const tip = new THREE.Quaternion().setFromAxisAngle(st.tipAxis, ang);
          q.premultiply(tip);
          const pivot = smp.pos.clone().add(st.downhill.clone().multiplyScalar(0.0022));
          landerHold.position.copy(pivot).add(smp.pos.clone().sub(pivot).applyQuaternion(tip));
        }
        st.qWant = q;
      } else st.qWant = smp.quat;
      // follow the planned attitude through a short low-pass, so the turns read as smooth thruster-driven slews;
      // jumps (scrubbing, restarts) snap straight to it
      {
        const want = st.qWant as THREE.Quaternion;
        const jumped = !L.playing || Math.abs(st.tau - tauBefore) > 0.5 || !st.qShown;
        if (jumped) st.qShown = want.clone();
        else (st.qShown as THREE.Quaternion).slerp(want, 1 - Math.exp(-dt * 7));
        const prevQ = st.qPrev as THREE.Quaternion | undefined;
        const rate = prevQ && dt > 0 ? prevQ.angleTo(st.qShown) / dt : 0; // rad/s
        st.qPrev = (st.qShown as THREE.Quaternion).clone();
        landerHold.quaternion.copy(st.qShown);
        lander.setRcs(jumped || smp.phase === PHASES.length - 1 ? 0 : rate, ts);
      }
      lander.setThrottle(st.tau >= TOTAL_ANIM ? 0 : smp.throttle, ts);
      lander.setDust(smp.altKm * 1000, smp.throttle, ts);
      // the engine sweeps the ground bright in the last few metres; it stays once landed
      if (st.ground) st.ground.setBlast(st.tau >= TOTAL_ANIM - 0.01 || smp.phase === PHASES.length - 1 ? 1 : smp.phase === PHASES.length - 2 ? Math.max(0, 1 - (smp.altKm * 1000) / 25) : 0);
      lander.setLamps(st.tau >= TOTAL_ANIM - 0.01 ? 1e9 : smp.altKm * 1000);
      // keep a sharp shadow under the lander while it is near the site
      const nearPad = smp.pos.distanceTo(st.siteP) < 4;
      const box = nearPad ? 0.06 : 1.4;
      const sc = st.sun.shadow.camera as THREE.OrthographicCamera;
      const centre = nearPad ? smp.pos : st.siteP;
      st.sun.target.position.copy(centre);
      st.sun.position.copy(centre).add(st.sunDir.clone().multiplyScalar(nearPad ? 20 : 200));
      st.sun.target.updateMatrixWorld();
      if (sc.right !== box) { sc.left = -box; sc.right = box; sc.top = box; sc.bottom = -box; sc.far = nearPad ? 60 : 400; sc.updateProjectionMatrix(); }
      if (st.tau >= TOTAL_ANIM - 0.01 && !L.A.tips) {
        const toE = st.earthPos.clone().sub(smp.pos).normalize();
        const local = toE.applyQuaternion(landerHold.quaternion.clone().invert());
        lander.pointAntenna(L.A.linkOk ? local : null);
      } else lander.pointAntenna(null);

      // travelled part of the path
      const idx = st.pathTau.findIndex((x: number) => x > st.tau);
      const n = idx < 0 ? st.pathTau.length : idx;
      (pathDone.geometry as any).instanceCount = Math.max(0, n - 1);

      // camera
      const target = controls.target;
      controls.enabled = !cineShot;
      controls.enableZoom = L.view !== "follow"; // in chase, zoom scales the automatic framing instead
      if (cineShot) {
        const sh = shot(smp, st.shotCtx as ShotContext, ts);
        // cuts are instant; within a shot the camera eases toward its mark, relative to the lander, so it glides
        const cut = sh.id !== st.camId || !L.playing || Math.abs(st.tau - tauBefore) > 0.5 || !st.camOff;
        const kc = 1 - Math.exp(-dt * 5);
        const off = sh.pos.clone().sub(smp.pos), toff = sh.target.clone().sub(smp.pos);
        if (cut) {
          st.camId = sh.id; st.camOff = off; st.camTOff = toff; st.camUp = sh.up.clone(); st.camFov = sh.fov;
        } else {
          (st.camOff as THREE.Vector3).lerp(off, kc);
          (st.camTOff as THREE.Vector3).lerp(toff, kc);
          (st.camUp as THREE.Vector3).lerp(sh.up, kc).normalize();
          st.camFov += (sh.fov - st.camFov) * kc;
        }
        camera.position.copy(smp.pos).add(st.camOff);
        target.copy(smp.pos).add(st.camTOff);
        camera.up.copy(st.camUp);
        camera.lookAt(target);
        if (Math.abs(camera.fov - st.camFov) > 0.01) camera.fov = st.camFov;
        st.nearSite = undefined; // re-derive "up" when the cinematic ends
      } else if (camera.fov !== 45) camera.fov = 45;
      if (cineShot) {
        // no controls update: the shot sets the camera
      } else if (L.view === "follow") {
        // locked on the lander: the camera moves with it, keeps the angle you orbit to, and frames each phase
        // automatically; scroll, pinch or the +/- buttons zoom on top of that framing
        const shift = tmp.copy(smp.pos).sub(target);
        target.copy(smp.pos);
        camera.position.add(shift);
        const want = Math.max(0.007, st.followDist(smp) * st.followZoom); // never closer than 7 m
        const d = Math.max(1e-6, camera.position.distanceTo(target));
        const nd = Math.exp(Math.log(d) + (Math.log(want) - Math.log(d)) * Math.min(1, dt * 3));
        const dir = camera.position.clone().sub(target).normalize();
        camera.position.copy(target).add(dir.multiplyScalar(nd));
      } else if (st.fly) {
        const f = st.fly;
        const k = Math.min(1, (now - f.t0) / f.ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        target.copy(f.fromT).lerp(f.toT, e);
        const dist = Math.exp(Math.log(f.fromD) + (Math.log(f.toD) - Math.log(f.fromD)) * e);
        const dir = f.fromDir.clone().lerp(f.toDir, e).normalize();
        camera.position.copy(target).add(dir.multiplyScalar(dist));
        if (k >= 1) st.fly = null;
      }
      // keep the camera above the ground
      const minR = st.R + 0.0015;
      const rr = camera.position.length();
      if (!cineShot && rr < minR + 0.002 && camera.position.distanceTo(st.siteP) < 20) camera.position.multiplyScalar((minR + 0.002) / rr);
      // near the site "up" is the local vertical (the south pole would otherwise be upside down); far away it is north
      const nearSite = camera.position.distanceTo(st.siteP) < 300;
      if (!cineShot && nearSite !== st.nearSite) {
        st.nearSite = nearSite;
        camera.up.copy(nearSite ? st.up : new THREE.Vector3(0, 1, 0));
        (controls as any)._quat.setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
        (controls as any)._quatInverse.copy((controls as any)._quat).invert();
      }
      if (!cineShot) {
        controls.maxPolarAngle = nearSite && camera.position.distanceTo(st.siteP) < 30 ? Math.PI / 2 - 0.03 : Math.PI;
        controls.update();
      }
      const camD = camera.position.distanceTo(target);
      camera.near = Math.max(0.0003, camD * 0.002);
      camera.updateProjectionMatrix();

      // labels: show what is useful at this zoom
      const camR = camera.position.distanceTo(st.siteP);
      landerLabel.position.copy(smp.pos);
      landerLabel.visible = !cineShot && camera.position.distanceTo(smp.pos) > 3 && (L.playing || st.tau < TOTAL_ANIM - 0.01 || camR < 2500);
      moonLabel.position.set(0, -st.R * 1.15, 0);
      moonLabel.visible = !cineShot && camR > 3000;
      (st.phaseLabels as CSS2DObject[]).forEach((o: any) => {
        const dd = camera.position.distanceTo(o.position);
        o.visible = !cineShot && (o.userData.near ? dd < 900 && dd > 1 : camR > 800 && camR < 9000);
      });
      const camDir = camera.position.clone();
      for (const [id, o] of dots as Map<string, CSS2DObject>) {
        const pos = o.position;
        const facing = pos.clone().normalize().dot(camDir.clone().sub(pos).normalize()) > 0.05;
        const far = camR > 120;
        o.visible = !cineShot && facing && (far || id === L.sel.id) && camR < 90000 && camR > 30;
      }
      for (const m of lineMats) m.resolution.set(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
      if (st.ground) st.ground.group.visible = camR < 2500;
      ring.visible = !cineShot && !L.playing && camR < 30;
      // the Sun sits 1,000,000 km out along the true Sun direction from wherever the camera is
      if (st.sunDir) {
        const D = 1e6;
        st.sunSprite.position.copy(camera.position).add(st.sunDir.clone().multiplyScalar(D));
        st.sunSprite.scale.setScalar(D * 0.16); // the disc is about 0.5 deg across; the rest is glow
      }
      earthLabel.visible = !cineShot;
      st.radio.visible = !cineShot;
      pathAll.visible = pathDone.visible = !cineShot || cineShot.id === "0a";
      (st.composer as EffectComposer).render();
      labels.render(scene, camera);

      if (now - lastUi > 90) {
        lastUi = now;
        setUi({ tau: st.tau, phase: smp.phase, alt: smp.altKm, speed: smp.speedKms, vs: smp.vsKms, dist: smp.distMoonKm, remain: smp.remainS });
      }
    };
    S.current.tau = TOTAL_ANIM;
    S.current.followZoom = 1;
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onTouchDown);
      renderer.domElement.removeEventListener("pointermove", onTouchMove);
      renderer.domElement.removeEventListener("pointerup", onTouchUp);
      renderer.domElement.removeEventListener("pointercancel", onTouchUp);
      controls.dispose();
      S.current.ground?.dispose();
      lander.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, []);

  /* ---------------- rebuild the site-dependent parts: ground, lighting, path, labels ---------------- */
  const siteKey = site.id + ":" + sel.lat.toFixed(4) + ":" + sel.lon.toFixed(4);
  useEffect(() => {
    const st = S.current;
    if (!st.scene) return;
    const eph = P.ephemeris(t);
    const F = P.sceneFrames(t);
    const datumKm = site.terrain ? P.siteDatumM(site) / 1000 : 0;
    const R = R_MOON + datumKm;
    st.R = R;
    st.moon.scale.setScalar(R - 0.12); // a little below the ground so the generated apron sits on top
    const s = toThree(unit(sel.lat, sel.lon)).normalize();
    const pole = new THREE.Vector3(0, 1, 0);
    let east = new THREE.Vector3().crossVectors(pole, s);
    if (east.length() < 1e-6) east = new THREE.Vector3(0, 0, -1);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(s, east).normalize();
    st.up = s.clone();
    st.siteP = s.clone().multiplyScalar(R);

    // ground
    if (st.groundKey !== siteKey) {
      if (st.ground) { st.scene.remove(st.ground.group); st.ground.dispose(); }
      const g: Ground = buildGround(site, sel.lat, sel.lon);
      g.group.position.copy(st.siteP);
      g.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, s, north.clone().negate()));
      g.group.updateMatrixWorld(true);
      st.scene.add(g.group);
      g.group.add(st.ring);
      st.ground = g;
      st.groundKey = siteKey;
      g.setSlopeColors(live.current.slopeColors);
      // only the lander casts shadows: at grazing Sun angles, 20 m terrain bumps would contradict the horizon check
      g.group.traverse((o: any) => { if (o.isMesh && o.name !== "rocks") o.castShadow = false; });
      g.setDetailOrigin(st.siteP);
      st.moonDetail.setOrigin(st.siteP);
    }
    const g: Ground = st.ground;
    st.ring.position.set(spot.x, g.heightAt(spot.x, spot.y) + 0.4, -spot.y);
    g.setSpot(spot.x, spot.y);
    (st.ring.material as THREE.MeshBasicMaterial).color.set(A.slope ? (A.slope.max < SLOPE_LIMIT ? 0x4ab064 : A.slope.max < TIP_LIMIT ? 0xf5a524 : 0xe5484d) : 0xf5f5f7);

    // Earth: direction from the Moon is real, distance and size are not; turned to its real rotation
    const eDir = toThree(unit(eph.subEarthLat, eph.subEarthLon)).normalize();
    st.earthPos = eDir.clone().multiplyScalar(EARTH_D);
    st.earth.position.copy(st.earthPos);
    const Mm = F.eclToMoon, Me = F.eclToEarth;
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Mm[i][0] * Me[j][0] + Mm[i][1] * Me[j][1] + Mm[i][2] * Me[j][2]));
    const Ax = (v: number[]) => [v[0], v[2], -v[1]];
    const cols = [0, 1, 2].map((k) => Ax([M[0][k], M[1][k], M[2][k]]));
    const c0 = new THREE.Vector3(...(cols[0] as [number, number, number]));
    const c1 = new THREE.Vector3(...(cols[2] as [number, number, number])); // earth-fixed z (north) -> local three y
    const c2 = new THREE.Vector3(...(cols[1] as [number, number, number])).negate(); // earth-fixed y -> local three -z
    st.earth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(c0, c1, c2));

    // Sun
    const sDir = toThree(unit(eph.subSolarLat, eph.subSolarLon)).normalize();
    st.sun.position.copy(st.siteP).add(sDir.clone().multiplyScalar(200));
    st.sun.target.position.copy(st.siteP);
    st.sun.target.updateMatrixWorld();
    (st.atmo.material as THREE.ShaderMaterial).uniforms.sun.value.copy(sDir);
    st.earthshine.position.copy(st.siteP).add(eDir.clone().multiplyScalar(200));
    st.earthshine.target.position.copy(st.siteP);
    st.earthshine.target.updateMatrixWorld();

    // mission path
    const mission = buildMission({ site: s, east, north, R, earth: st.earthPos, earthR: EARTH_R, spot, heightAt: g.heightAt });
    st.mission = mission;
    st.pathTau = mission.path.tau;
    (st.pathAll.geometry as LineGeometry).setPositions(mission.path.pts);
    (st.pathAll.geometry as LineGeometry).setColors(mission.path.cols);
    (st.pathDone.geometry as LineGeometry).setPositions(mission.path.pts);
    (st.pathDone.geometry as LineGeometry).setColors(mission.path.cols);
    st.pathAll.computeLineDistances();
    st.pathDone.computeLineDistances();
    // radio path: Earth to the touchdown spot
    const td = mission.sample(TOTAL_ANIM).pos;
    const e0 = st.earthPos.clone().add(td.clone().sub(st.earthPos).normalize().multiplyScalar(EARTH_R));
    const rc = new THREE.Color(A.linkOk ? 0x4ab064 : 0xe5484d);
    (st.radio.geometry as LineGeometry).setPositions([e0.x, e0.y, e0.z, td.x, td.y, td.z]);
    (st.radio.geometry as LineGeometry).setColors([rc.r, rc.g, rc.b, rc.r, rc.g, rc.b]);
    st.radio.computeLineDistances();

    // ground normal at the spot, and the axis it would tip about
    const nl = g.normalAt(spot.x, spot.y);
    const nW = nl.clone().applyQuaternion(g.group.quaternion).normalize();
    // same side axis as in flight (the orbit normal), so settling onto the ground never turns the lander round
    const fwd = mission.normal.clone();
    const zz = fwd.clone().sub(nW.clone().multiplyScalar(fwd.dot(nW))).normalize();
    const xx = new THREE.Vector3().crossVectors(nW, zz);
    st.groundQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, nW, zz));
    const downhill = new THREE.Vector3(nl.x, 0, nl.z).applyQuaternion(g.group.quaternion);
    st.downhill = downhill.lengthSq() > 1e-8 ? downhill.normalize() : east.clone();
    st.tipAxis = new THREE.Vector3().crossVectors(s, st.downhill).normalize(); // world axis to fall about

    // cinematic cameras: on the sunward side of the pad, so the lander is lit from behind the lens
    st.sunDir = sDir.clone();
    const qInv = g.group.quaternion.clone().invert();
    const sl = sDir.clone().applyQuaternion(qInv);
    let sh = new THREE.Vector2(sl.x, sl.z);
    if (sh.lengthSq() < 1e-6) sh = new THREE.Vector2(1, 0);
    sh.normalize();
    const perp = new THREE.Vector2(-sh.y, sh.x);
    const camAt = (dist: number, across: number, hgt: number) => {
      const x = spot.x + sh.x * dist + perp.x * across, zz = -spot.y + sh.y * dist + perp.y * across;
      return g.group.localToWorld(new THREE.Vector3(x, g.heightAt(x, -zz) + hgt, zz));
    };
    const spotW = g.group.localToWorld(new THREE.Vector3(spot.x, g.heightAt(spot.x, spot.y), -spot.y));
    st.shotCtx = {
      earthPos: st.earthPos,
      siteUp: s.clone(),
      spot: spotW,
      groundCamFar: camAt(150, 70, 2.5),
      groundCamNear: camAt(30, 14, 1.6),
      sideAtSite: new THREE.Vector3().crossVectors(mission.heading, s).normalize(),
      orbitN: mission.normal.clone(),
      sunHoriz: (() => { const h = sDir.clone().sub(s.clone().multiplyScalar(sDir.dot(s))); return h.lengthSq() > 1e-8 ? h.normalize() : east.clone(); })(),
    } as ShotContext;

    // follow distances by phase (km)
    st.followDist = (smp: any) => {
      // default chase framing: the lander fills a good part of the view; zoom out for context
      const ph = smp.phase, u = smp.u;
      const lg = (a: number, b: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u);
      if (ph === 0) return lg(30000, 0.4);
      if (ph <= 4) return 0.05;
      if (ph === 5) return lg(0.06, 0.08);
      if (ph === 6) return lg(0.08, 0.05);
      if (ph === 7) return lg(0.05, 0.03);
      return 0.025;
    };

    // phase labels along the path
    for (const o of st.phaseLabels as CSS2DObject[]) st.scene.remove(o);
    st.phaseLabels = mission.marks.slice(1, 8).map((m, i) => {
      const o = st.mkLabel(m.name, "phase");
      o.position.copy(m.pos);
      o.userData.near = i + 1 >= 6;
      st.scene.add(o);
      return o;
    });
  }, [siteKey, t, spot.x, spot.y, A.linkOk, A.slope?.max]);

  // site dots on the Moon
  useEffect(() => {
    const st = S.current;
    if (!st.scene) return;
    const R = st.R || R_MOON;
    for (const [, o] of st.dots as Map<string, CSS2DObject>) st.dotLayer.remove(o);
    st.dots.clear();
    for (const l of all) {
      const d = document.createElement("button");
      d.className = "dot " + l.kind + (l.id === sel.id ? " on" : "");
      d.title = l.name;
      d.setAttribute("aria-label", "Select " + l.name);
      d.onclick = (e) => { e.stopPropagation(); api.current.pick(l.id); };
      const o = new CSS2DObject(d);
      o.position.copy(toThree(unit(l.lat, l.lon)).normalize().multiplyScalar(R + 0.5));
      st.dotLayer.add(o);
      st.dots.set(l.id, o);
    }
  }, [all, sel.id, siteKey]);

  useEffect(() => { S.current.ground?.setSlopeColors(slopeColors); }, [slopeColors, siteKey]);
  useEffect(() => {
    document.body.classList.toggle("cine", view === "cine");
    return () => document.body.classList.remove("cine");
  }, [view]);

  /* camera moves */
  const flyTo = (v: View) => {
    setView(v);
    const st = S.current;
    if (!st.camera) return;
    if (v === "follow") return;
    const cam: THREE.PerspectiveCamera = st.camera;
    const fromT = st.controls.target.clone();
    const fromD = cam.position.distanceTo(fromT);
    const fromDir = cam.position.clone().sub(fromT).normalize();
    let toT: THREE.Vector3, toD: number, toDir: THREE.Vector3;
    const sDir = st.sun.position.clone().sub(st.siteP).normalize();
    if (v === "system") {
      toT = st.earthPos.clone().multiplyScalar(0.5);
      // fit both bodies across the free width of the screen
      const r = st.renderer.domElement.getBoundingClientRect();
      const freeW = Math.max(200, r.width - (S.current.viewOffset?.panel || 0)), freeH = Math.max(200, r.height - (S.current.viewOffset?.bottom || 0) - 140);
      const halfW = EARTH_D * 0.5 + EARTH_R * 1.4, tanV = Math.tan((22.5 * Math.PI) / 180);
      toD = Math.max(halfW / (tanV * (freeW / r.height)), (EARTH_R * 2.4) / (tanV * (freeH / r.height))) * 1.05;
      toDir = new THREE.Vector3().crossVectors(st.earthPos, new THREE.Vector3(0, 1, 0)).normalize().add(new THREE.Vector3(0, 0.45, 0)).normalize();
      if (toDir.dot(sDir) < 0) toDir = new THREE.Vector3(-toDir.x, toDir.y, -toDir.z);
    } else if (v === "moon") {
      toT = new THREE.Vector3();
      toD = R_MOON * 3.4;
      toDir = st.siteP.clone().normalize().add(st.earthPos.clone().normalize().multiplyScalar(0.6)).normalize();
    } else {
      toT = st.siteP.clone();
      toD = 2.6;
      // look across the site with the Sun just inside the frame (about 25 deg off centre): side light and a visible Sun
      const horiz = sDir.clone().sub(st.up.clone().multiplyScalar(sDir.dot(st.up))).normalize();
      const look = horiz.applyAxisAngle(st.up, 0.3);
      toDir = st.up.clone().multiplyScalar(0.32).add(look.multiplyScalar(-0.95)).normalize();
    }
    st.fly = { fromT, toT, fromD, toD, fromDir, toDir, t0: performance.now(), ms: reduced() ? 1 : 1600 };
  };
  useEffect(() => { const id = setTimeout(() => flyTo("system"), 50); return () => clearTimeout(id); }, []);
  useEffect(() => { if (view !== "follow" && view !== "system") flyTo(view); }, [siteKey]);

  const land = (from: number) => {
    const st = S.current;
    st.tau = from;
    st.fly = null;
    setResult(false);
    setPlaying(true);
    setView("cine");
  };

  const scrub = (tau: number) => {
    S.current.tau = tau;
    setResult(false);
    setUi((u) => ({ ...u, tau }));
  };

  const pickSite = (id: string) => {
    if (id === "__new") {
      setDraft(customLanding("draft", "My landing", -85.0, 20.0));
      setSelId("draft");
    } else setSelId(id);
    setPlaying(false);
    setResult(false);
    S.current.tau = TOTAL_ANIM;
    flyTo("site");
  };
  const saveDraft = () => {
    if (!draft) return;
    const id = "c" + Date.now().toString(36);
    setCustoms((c) => [...c, { ...draft, id }]);
    setDraft(null);
    setSelId(id);
  };
  const editSel = (patch: Partial<Landing>) => {
    if (sel.id === "draft") setDraft({ ...sel, ...patch });
    else setCustoms((c) => c.map((x) => (x.id === sel.id ? { ...x, ...patch } : x)));
  };
  const removeSel = () => {
    if (sel.id === "draft") setDraft(null);
    else setCustoms((c) => c.filter((x) => x.id !== sel.id));
    setSelId("shackleton");
  };

  const mine = [...customs, ...(draft ? [draft] : [])];
  const n = A.now;
  const poleSites = LANDINGS.filter((l) => l.site && TERRAIN_IDS.includes(l.site));
  const planned = LANDINGS.filter((l) => l.kind === "future");
  const past = LANDINGS.filter((l) => l.date && !(l.site && TERRAIN_IDS.includes(l.site)));
  const evText = (e: { up: boolean; hours: number | null }, sun: boolean) =>
    e.hours === null
      ? e.up ? (sun ? "No sunset in the next 30 days" : "No Earthset in the next 30 days") : sun ? "No sunrise in the next 30 days" : "Earth does not rise in the next 30 days"
      : (e.up ? (sun ? "Sunset in " : "Earthset in ") : sun ? "Sunrise in " : "Earthrise in ") + fmtHours(e.hours);
  const checks: { k: string; why: string; tone: "ok" | "bad" | "warn" | "na"; head: string; sub: string }[] = [
    {
      k: "Sunlight for power",
      why: "no sunlight",
      tone: A.sunOk ? "ok" : "bad",
      head: A.sunOk ? `Sun ${n.sunEl.toFixed(1)}° above the horizon` : n.sunEl > 0 ? "Sun hidden behind terrain" : `Sun ${(-n.sunEl).toFixed(1)}° below the horizon`,
      sub: `${evText(A.sunEvent, true)} · sunlit ${A.litPct.toFixed(0)}% of 30 days`,
    },
    {
      k: "Radio link to Earth",
      why: "no line of sight to Earth",
      tone: A.linkOk ? "ok" : "bad",
      head: A.linkOk ? `Earth ${n.earthClearance.toFixed(1)}° above the horizon` : A.farSide ? "Earth never visible (far side)" : n.earthEl > 0 ? "Earth blocked by terrain" : "Earth below the horizon",
      sub: `${evText(A.earthEvent, false)} · in view ${A.linkPct.toFixed(0)}% of 30 days`,
    },
    {
      k: "Safe ground",
      why: "ground too steep",
      tone: A.slope ? (A.slope.max < SLOPE_LIMIT ? "ok" : A.slope.max < TIP_LIMIT ? "warn" : "bad") : "na",
      head: A.slope ? `Steepest slope ${A.slope.max.toFixed(1)}° (limit ${SLOPE_LIMIT}°)` : "Slope unknown: no LOLA terrain here",
      sub: A.slope
        ? A.slope.smoothed
          ? "Smoothed: LOLA tracks are far apart this far from the pole, so treat this as a lower bound"
          : "Click the ground near the ring to move your touchdown spot"
        : "The ground you see here is generated, for the flight only",
    },
  ];
  const failing = checks.filter((c) => c.tone === "bad" || c.tone === "warn").map((c) => c.why);
  const rows = useMemo(
    () => pins.map((p) => ({ p, a: assess(p.landing, p.t, mToCell(p.spot.x, p.spot.y)) })),
    [pins]
  );
  const pin = (dt = 0) => {
    const key = sel.id + ":" + (t + dt) + ":" + spot.x + ":" + spot.y;
    setPins((ps) => (ps.some((x) => x.key === key) ? ps : [...ps, { key, landing: { ...sel }, t: t + dt, spot: { ...spot } }].slice(-12)));
    setDrawer("compare");
  };
  const loadPin = (p: { landing: Landing; t: number; spot: { x: number; y: number } }) => {
    if (!all.some((l) => l.id === p.landing.id)) setDraft({ ...p.landing, id: "draft" });
    setSelId(all.some((l) => l.id === p.landing.id) ? p.landing.id : "draft");
    setSpots((m) => ({ ...m, [p.landing.id]: p.spot }));
    setSetMs(p.t);
    setTimeMode("set");
  };
  const fmtSigned = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
  const fmtWhen = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  const go = failing.length === 0;
  const custom = sel.kind === "custom";
  const ph = PHASES[ui.phase];
  const atEnd = ui.tau >= TOTAL_ANIM - 0.01;
  const grad = PHASES.map((p, i) => `${p.color} ${(PHASE_START[i] / TOTAL_ANIM) * 100}% ${((PHASE_START[i] + p.anim) / TOTAL_ANIM) * 100}%`).join(", ");

  return (
    <div className={"ms" + (view === "cine" ? " cine" : "") + (engineer && view !== "cine" ? " eng-on" : "")}>
      {engineer && view !== "cine" && (
        <EngineerPanel sel={sel} t={t} cell={cell} spot={spot} A={A} onTime={(ms) => { setSetMs(ms); setTimeMode("set"); }} onClose={() => onEngineer?.(false)} />
      )}
      {view === "cine" && (
        <div className="cine-top">
          <span className="cine-title" style={{ color: ph.color }}>{ph.name}</span>
          {slowMo && <span className="cine-slow">Slow motion</span>}
          <button className="btn small" onClick={() => api.current.takeCamera()}>Exit cinematic</button>
        </div>
      )}
      <div className="ms-stage" ref={hostRef} aria-label="3D view of Earth, the Moon, the landing site and the lander. Drag to orbit, scroll or pinch to zoom, right-drag to pan. Click a dot to pick a site, click the Moon to land anywhere, click the ground to move the touchdown spot." role="img" />
      {!glOk && <p className="ms-nogl">This browser has WebGL turned off, so the 3D view cannot run. The landing checks still work.</p>}

      <div className="ms-views glass" role="group" aria-label="View">
        {([["system", "Earth & Moon"], ["moon", "Moon"], ["site", "Landing site"], ["cine", "Cinematic"], ["follow", "Chase"]] as [View, string][]).map(([v, l]) => (
          <button key={v} aria-pressed={view === v} onClick={() => (v === "cine" ? setView("cine") : v === "follow" ? api.current.takeCamera() : flyTo(v))}>
            {l}
          </button>
        ))}
      </div>

      <aside className="ms-panel glass" aria-label="Plan a landing">
        <header>
          <h2>Plan a landing</h2>
          <p>The preset mission flies to the Shackleton ridge. Pick another site, or click anywhere on the Moon.</p>
        </header>
        <label className="fld">
          <span>Landing site</span>
          <select value={sel.id} onChange={(e) => pickSite(e.target.value)}>
            <optgroup label="South-pole sites (NASA LOLA terrain)">
              {poleSites.map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.id === "shackleton" ? " (preset mission)" : ""}</option>
              ))}
            </optgroup>
            <optgroup label="Planned landings">
              {planned.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </optgroup>
            <optgroup label="Your landings">
              {mine.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.id === "draft" ? " (not saved)" : ""}
                </option>
              ))}
              <option value="__new">+ New custom landing</option>
            </optgroup>
            <optgroup label="Past landings">
              {past.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.date.slice(0, 4)})
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {custom && (
          <div className="ms-custom">
            <label className="full fld">
              <span>Name</span>
              <input value={sel.name} maxLength={40} onChange={(e) => editSel({ name: e.target.value || "My landing" })} />
            </label>
            <label className="fld">
              <span>Latitude °N</span>
              <input type="number" step="0.01" min={-90} max={90} value={sel.lat}
                onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) editSel({ lat: Math.max(-90, Math.min(90, v)) }); }} />
            </label>
            <label className="fld">
              <span>Longitude °E</span>
              <input type="number" step="0.01" min={-180} max={180} value={sel.lon}
                onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) editSel({ lon: P.norm180(v) }); }} />
            </label>
            <div className="full row">
              {sel.id === "draft" && <button className="btn small" onClick={saveDraft}>Save landing</button>}
              <button className="btn small" onClick={removeSel}>{sel.id === "draft" ? "Discard" : "Delete"}</button>
            </div>
          </div>
        )}

        <label className="fld">
          <span>Touchdown time (your time)</span>
          <div className="row">
            <input
              type="datetime-local"
              value={new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              min="2020-01-01T00:00"
              max="2045-12-31T23:59"
              onChange={(e) => {
                const v = new Date(e.target.value).getTime(); // the field is in the viewer's local time
                if (!isNaN(v)) { setSetMs(v); setTimeMode("set"); }
              }}
            />
            <button
              className="btn small"
              aria-pressed={timeMode === "now"}
              onClick={() => {
                setClock(Math.floor(Date.now() / 60000) * 60000);
                setTimeMode("now");
              }}
            >
              Now
            </button>
          </div>
          <small className="ms-local">
            {timeMode === "now" ? "Live now · " : ""}UTC {new Date(t).toISOString().slice(0, 16).replace("T", " ")}
          </small>
        </label>
        <div className="ms-steps" role="group" aria-label="Step time">
          {[-7, -1, 1, 7].map((d) => (
            <button key={d} className="btn small" onClick={() => { setSetMs(t + d * DAY); setTimeMode("set"); }}>
              {d > 0 ? "+" : "−"}{Math.abs(d)} {Math.abs(d) === 1 ? "day" : "days"}
            </button>
          ))}
        </div>

        <p className="ms-where">
          {sel.region} · {fmtLat(sel.lat)} {fmtLon(sel.lon)}
          {lolaSite && <> · spot {Math.round(spot.x)} m E, {Math.round(spot.y)} m N</>}
          {A.inZone && <span className="zone">Artemis III zone</span>}
        </p>

        <ul className="ms-checks">
          {checks.map((c) => (
            <li key={c.k} className={c.tone}>
              <i aria-hidden="true" />
              <div>
                <span className="k">{c.k}</span>
                <b>{c.head}</b>
                <span className="s">{c.sub}</span>
              </div>
            </li>
          ))}
        </ul>
        {lolaSite && (
          <label className="ms-toggle">
            <input type="checkbox" checked={slopeColors} onChange={(e) => setSlopeColors(e.target.checked)} />
            Colour the ground by slope
          </label>
        )}

        <div className={"ms-verdict " + (go ? "ok" : "bad")} role="status">
          <b>{go ? "Go for landing" : "No-go"}</b>
          <span>{go ? (A.slope ? "Power, radio and safe ground." : "Power and radio. Slope unknown.") : failing.join(" and ").replace(/^./, (c) => c.toUpperCase()) + "."}</span>
        </div>
        <button className="btn land" onClick={() => land(0)}>
          ▶ Land here
        </button>
        <div className="ms-cmp-add">
          <button className="btn small" onClick={() => pin(0)}>+ Add to comparison</button>
          <button className="btn small" onClick={() => { pin(0); for (const d of [7, 14, 21]) pin(d * DAY); }}>+ This site, next 3 weeks</button>
        </div>
      </aside>

      <div className={"ms-drawer" + (drawer ? " open" : "")}>
        <div className="dr-tabs" role="tablist" aria-label="Details">
          <button role="tab" aria-selected={drawer === "sky"} onClick={() => setDrawer(drawer === "sky" ? null : "sky")}>Sky from the site</button>
          <button role="tab" aria-selected={drawer === "compare"} onClick={() => setDrawer(drawer === "compare" ? null : "compare")}>
            Compare{pins.length ? ` (${pins.length})` : ""}
          </button>
          {drawer && <button className="dr-close" aria-label="Close details" onClick={() => setDrawer(null)}>Hide</button>}
        </div>
        {drawer === "sky" && <Sky A={A} t={t} />}
        {drawer === "compare" && (
          <div className="cmp">
            {rows.length === 0 ? (
              <p className="cmp-empty">Add the current site and time with “+ Add to comparison”, or “+ This site, next 3 weeks” to see how a launch slip changes things. Click a row to load it.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Touchdown (UTC)</th>
                    <th title="Sun centre above the real terrain horizon">Sun clear</th>
                    <th>Sunlit 30 d</th>
                    <th>Sun event</th>
                    <th title="Earth centre above the real terrain horizon">Earth clear</th>
                    <th>Earth 30 d</th>
                    <th>Earth event</th>
                    <th>Slope</th>
                    <th>Verdict</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, a }) => {
                    const ok = a.sunOk && a.linkOk && (a.slope ? a.slope.max < SLOPE_LIMIT : true);
                    const cur = p.landing.id === sel.id && p.t === t && p.spot.x === spot.x && p.spot.y === spot.y;
                    return (
                      <tr key={p.key} className={cur ? "cur" : ""} onClick={() => loadPin(p)}>
                        <td>{p.landing.name}</td>
                        <td>{fmtWhen(p.t)}</td>
                        <td className={a.sunOk ? "good" : "badc"}>{fmtSigned(a.now.sunEl - a.now.sunHorizon)}°</td>
                        <td>{a.litPct.toFixed(0)}%</td>
                        <td>{evText(a.sunEvent, true).replace(" in the next 30 days", "")}</td>
                        <td className={a.linkOk ? "good" : "badc"}>{fmtSigned(a.now.earthClearance)}°</td>
                        <td>{a.linkPct.toFixed(0)}%</td>
                        <td>{evText(a.earthEvent, false).replace(" in the next 30 days", "")}</td>
                        <td className={a.slope ? (a.slope.max < SLOPE_LIMIT ? "good" : "badc") : ""}>{a.slope ? a.slope.max.toFixed(1) + "°" : "unknown"}</td>
                        <td className={ok ? "good" : "badc"}>{ok ? "Go" : "No-go"}</td>
                        <td>
                          <button className="x" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setPins((ps) => ps.filter((x) => x.key !== p.key)); }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {rows.length > 0 && <button className="btn small" onClick={() => setPins([])}>Clear</button>}
          </div>
        )}
      </div>

      <div className="ms-player glass" role="group" aria-label="Landing playback">
        <div className="pl-row">
          <button className="pl-play" aria-label={playing ? "Pause" : "Play"} onClick={() => { if (atEnd && !playing) land(0); else setPlaying(!playing); }}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="pl-phase">
            <b style={{ color: ph.color }}>{ph.name}</b>
            <span>{atEnd || ui.phase === PHASES.length - 1 ? "On the surface" : "Touchdown in " + fmtClock(ui.remain)}</span>
          </div>
          <div className="pl-tele">
            {ui.phase === 0 ? (
              <span><em>To Moon</em> {fmtNum(ui.dist)} km</span>
            ) : (
              <span><em>Altitude</em> {ui.alt >= 10 ? fmtNum(ui.alt, 1) + " km" : fmtNum(ui.alt * 1000) + " m"}</span>
            )}
            <span><em>Speed</em> {ui.speed >= 1 ? fmtNum(ui.speed, 2) + " km/s" : fmtNum(ui.speed * 1000, ui.speed < 0.01 ? 1 : 0) + " m/s"}</span>
            {ui.phase >= 4 && <span><em>Vertical</em> {fmtNum(ui.vs * 1000, Math.abs(ui.vs) < 0.01 ? 1 : 0)} m/s</span>}
          </div>
          {view === "follow" && (
            <div className="pl-zoom" role="group" aria-label="Chase camera zoom">
              <button aria-label="Zoom in" onClick={() => api.current.zoom(1 / 1.6)}>+</button>
              <button aria-label="Zoom out" onClick={() => api.current.zoom(1.6)}>−</button>
            </div>
          )}
          <div className="pl-speed" role="group" aria-label="Playback speed">
            {SPEEDS.map((x) => (
              <button key={x} aria-pressed={speed === x} onClick={() => setSpeed(x)}>
                {x === 0.25 ? "¼" : x === 0.5 ? "½" : x}×
              </button>
            ))}
          </div>
        </div>
        <div className="pl-track">
          <input
            type="range"
            min={0}
            max={TOTAL_ANIM}
            step={0.01}
            value={ui.tau}
            aria-label="Mission timeline"
            style={{ background: `linear-gradient(90deg, ${grad})` }}
            onChange={(e) => scrub(parseFloat(e.target.value))}
          />
          <div className="pl-marks">
            {PHASES.slice(0, -1).map((p, i) => (
              <button key={p.short} style={{ left: (PHASE_START[i] / TOTAL_ANIM) * 100 + "%" }} onClick={() => { scrub(PHASE_START[i] + 0.001); if (view !== "cine" && view !== "follow") setView("cine"); }}>
                {p.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <div className={"ms-result glass " + (A.tips ? "bad" : "ok")} role="status">
          <b>{A.tips ? "Tipped over" : "Touchdown"}</b>
          <span>
            {A.tips
              ? `The ground here is ${A.slope!.max.toFixed(1)}° steep. Pick a flatter spot (try the slope colours).`
              : A.slope
              ? `Upright on ${A.slope.max.toFixed(1)}° ground. ${A.sunOk ? "Panels in sunlight" : "In darkness"}, ${A.linkOk ? "dish locked on Earth" : "no view of Earth"}.`
              : `Landed. ${A.sunOk ? "Panels in sunlight" : "In darkness"}, ${A.linkOk ? "dish locked on Earth" : "no view of Earth"}.`}
            {" "}Radio delay {((A.now.earthRangeKm || 384400) / C_KMS).toFixed(2)} s.
          </span>
          <button className="btn small" onClick={() => { setResult(false); if (view === "cine") api.current.takeCamera(); }}>OK</button>
        </div>
      )}
    </div>
  );
}
