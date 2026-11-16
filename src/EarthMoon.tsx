/* Overview: Earth and the Moon in one scene at true scale (sizes and distance), both lit by the real Sun, with the
   radio path from Earth to the chosen landing site. One question, three checks: is there sunlight for power, can the
   site see Earth for radio, and is the ground flat enough to land on. Click anywhere on the Moon to land there. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as P from "./physics/lunarAstronomy";
import { LANDINGS, Landing } from "./landings";

const DAY = 86400000;
const D2R = Math.PI / 180;
const C_KMS = 299792.458;
const ARTEMIS_LAT = -84;
const SLOPE_LIMIT = 10; // Artemis: under 10 deg across a 100 m landing area
const GREEN = "74,176,100", RED = "229,72,77", AMBER = "245,165,36";
const R_EARTH = 6371.0, R_MOON = P.R_MOON_KM;
const STORE = "llsn.customLandings.v1";
const START_CELL: Record<string, { ix: number; iy: number }> = { shackleton: { ix: 10, iy: 3 } };
const TERRAIN_IDS = ["shackleton", "malapert", "mouton", "athena"]; // the sites with LOLA terrain

type V3 = number[];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mul = (M: number[][], v: V3) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const mulT = (M: number[][], v: V3) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
const unit = (lat: number, lon: number) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtLat = (x: number) => Math.abs(x).toFixed(2) + "°" + (x >= 0 ? "N" : "S");
const fmtLon = (x: number) => { const y = P.norm180(x); return Math.abs(y).toFixed(2) + "°" + (y >= 0 ? "E" : "W"); };

/* ---------------- the three checks for one site and time ---------------- */

export function siteFor(l: Landing): P.Site {
  const s = l.site ? P.SITES.find((x) => x.id === l.site) : undefined;
  return s || { id: "ov-" + l.id, name: l.name, short: l.name, lat: l.lat, lon: P.norm360(l.lon), terrain: false, note: "" };
}

function assess(l: Landing, t: number) {
  const site = siteFor(l);
  const cell = START_CELL[site.id] || { ix: 10, iy: 10 };
  const prof = P.horizonProfile(site, cell.ix, cell.iy);
  const now = P.stateAt(site, prof, P.DEFAULT_POWER, t);
  let lit = 0, link = 0;
  const N = 120; // every 6 h for 30 days
  for (let i = 0; i < N; i++) {
    const s = P.stateAt(site, prof, P.DEFAULT_POWER, t + i * 6 * 3600000);
    if (s.sunFrac > 0.5) lit++;
    if (s.lock !== "BLACKOUT") link++;
  }
  let slope: { max: number; mean: number } | null = null;
  if (site.terrain) {
    const sl = P.surveySlope(site);
    const k = cell.iy * P.GRID_N + cell.ix;
    slope = { max: sl.max[k], mean: sl.mean[k] };
  }
  // far side: Earth never rises in 30 days, away from the poles (at the poles longitude says little)
  const farSide = link === 0 && Math.abs(l.lat) < 75 && Math.abs(P.norm180(l.lon)) > 95;
  const sunOk = now.sunFrac > 0.5;
  const linkOk = now.lock !== "BLACKOUT";
  const groundOk = slope ? slope.max < SLOPE_LIMIT : null;
  return { site, now, litPct: (lit / N) * 100, linkPct: (link / N) * 100, slope, farSide, sunOk, linkOk, groundOk, inZone: l.lat <= ARTEMIS_LAT };
}

/* ---------------- WebGL: two textured spheres ---------------- */

const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision highp float;
uniform vec2 uC;uniform float uR;uniform vec3 uE,uN,uF,uSun;uniform sampler2D uT;uniform float uEarth;
void main(){
  vec2 p=(gl_FragCoord.xy-uC)/uR;float r=length(p);
  if(r>1.0){
    if(uEarth<.5||r>1.06){gl_FragColor=vec4(0.);return;}
    vec3 nb=normalize(p.x*uE+p.y*uN);float l=smoothstep(-.25,.3,dot(nb,uSun));
    float g=pow(1.-(r-1.)/.06,2.)*.55*l;gl_FragColor=vec4(vec3(.35,.6,1.)*g,g);return;
  }
  float z=sqrt(max(0.,1.-r*r));vec3 b=normalize(p.x*uE+p.y*uN+z*uF);
  float lat=asin(clamp(b.z,-1.,1.));float lon=atan(b.y,b.x);
  vec3 c=texture2D(uT,vec2(lon/6.2831853+.5,.5-lat/3.1415927)).rgb;
  float d=dot(b,uSun);
  vec3 col;
  if(uEarth>.5){
    c=c*1.15+vec3(.0,.03,.09)*(1.-smoothstep(.0,.25,c.r+c.g));
    float day=smoothstep(-.06,.08,d)*(.25+.75*max(d,0.));
    col=c*(.035+.965*day)+vec3(.3,.5,1.)*pow(1.-z,3.)*.45*smoothstep(-.1,.2,d);
  }else{
    float day=smoothstep(-.012,.05,d)*(.5+.5*sqrt(max(d,0.)));
    col=c*(.06+.94*day);
  }
  float a=clamp((1.-r)*uR*1.5,0.,1.);
  gl_FragColor=vec4(col*a,a);
}`;

type Preset = "earth" | "both" | "moon";
type Cam = { T: V3; s: number; yaw: number; pitch: number }; // look-at point (km), pixels per km, orbit angles (rad)
const rot = (v: V3, k: V3, a: number): V3 => {
  // Rodrigues rotation of v about unit axis k
  const c = Math.cos(a), sn = Math.sin(a), kv = dot(k, v), x = cross(k, v);
  return [v[0] * c + x[0] * sn + k[0] * kv * (1 - c), v[1] * c + x[1] * sn + k[1] * kv * (1 - c), v[2] * c + x[2] * sn + k[2] * kv * (1 - c)];
};

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
    /* private window or storage off: the landings still work for this visit */
  }
}
function customLanding(id: string, name: string, lat: number, lon: number): Landing {
  return {
    id, name, mission: "Custom landing", agency: "You", date: "", lat, lon, kind: "custom", region: "Your site",
    note: "Your own landing site. No terrain is loaded here, so the horizon is a smooth Moon and slope is unknown.",
  };
}

export function EarthMoon(props: { onAbout: () => void }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState("shackleton");
  const [customs, setCustoms] = useState<Landing[]>(loadCustoms);
  const [draft, setDraft] = useState<Landing | null>(null);
  const [preset, setPreset] = useState<Preset | null>("both");
  const [timeMode, setTimeMode] = useState<"now" | "set">("now");
  const [setMs, setSetMs] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    if (timeMode !== "now") return;
    const id = setInterval(() => setClock(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, [timeMode]);
  useEffect(() => saveCustoms(customs), [customs]);
  const t = timeMode === "now" ? clock : setMs;
  const all = useMemo(() => [...LANDINGS, ...customs, ...(draft ? [draft] : [])], [customs, draft]);
  const sel = all.find((l) => l.id === selId) || LANDINGS[0];
  const A = useMemo(() => assess(sel, t), [sel, t]);
  const F = useMemo(() => P.sceneFrames(t), [t]);
  const eph = useMemo(() => P.ephemeris(t), [t]);

  const live = useRef({ F, eph, sel, A, all });
  live.current = { F, eph, sel, A, all };
  const dirty = useRef(true);
  useEffect(() => { dirty.current = true; }, [F, eph, sel, A, all]);
  const goRef = useRef<(p: Preset) => void>(() => {});

  // land anywhere: a click on the Moon moves your custom lander, or starts a new one
  const landAt = (lat: number, lon: number) => {
    const la = Math.round(lat * 1000) / 1000, lo = Math.round(P.norm180(lon) * 1000) / 1000;
    if (sel.kind === "custom") {
      if (sel.id === "draft") setDraft({ ...sel, lat: la, lon: lo });
      else setCustoms((c) => c.map((x) => (x.id === sel.id ? { ...x, lat: la, lon: lo } : x)));
    } else {
      setDraft(customLanding("draft", "My landing", la, lo));
      setSelId("draft");
    }
  };
  const landRef = useRef(landAt);
  landRef.current = landAt;

  useEffect(() => {
    const cv = glRef.current!, ov = ovRef.current!, wrap = wrapRef.current!;
    const ctx = ov.getContext("2d")!;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    let prog: WebGLProgram | null = null;
    const U: Record<string, WebGLUniformLocation | null> = {};
    const tex: Record<string, WebGLTexture | null> = {};
    let loaded = 0;
    if (gl) {
      const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null;
      else {
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, "a");
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        for (const k of ["uC", "uR", "uE", "uN", "uF", "uSun", "uT", "uEarth"]) U[k] = gl.getUniformLocation(prog, k);
        const load = (key: string, src: string) => {
          const tx = gl.createTexture();
          tex[key] = tx;
          const img = new Image();
          img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tx);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            loaded++;
            dirty.current = true;
            if (loaded === 2) wrap.classList.add("ready");
          };
          img.src = src;
        };
        load("moon", (globalThis as any).MOON_TEX || "assets/moon_lroc_1k.jpg");
        load("earth", (globalThis as any).EARTH_TEX || "assets/earth_bluemarble_2k.jpg");
      }
    }

    let W = 0, H = 0, dpr = 1;
    let lay = { l: 0, r: 0, t: 0, b: 0 };
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const root = wrap.parentElement!;
      const hdr = document.querySelector(".top")?.getBoundingClientRect();
      const bar = root.querySelector(".ov-views")?.getBoundingClientRect();
      const pan = root.querySelector(".ov-panel")?.getBoundingClientRect();
      const t0 = Math.max(hdr ? hdr.bottom - box.top : 70, bar ? bar.bottom - box.top : 0) + 12;
      if (W >= 900) lay = { l: (pan ? pan.right - box.left : 0) + 16, r: W - 16, t: t0, b: H - 44 };
      else lay = { l: 8, r: W - 8, t: t0, b: (pan ? pan.top - box.top : H) - 30 };
    };

    // the 3D camera: orthographic, looking at a point T, turned by yaw and pitch from the default side-on view
    let cam: Cam = { T: [0, 0, 0], s: 0.002, yaw: 0, pitch: 0 };
    let mode: Preset | null = "both";
    let anim: { from: Cam; to: Cam; t0: number; ms: number } | null = null;
    const base = () => {
      const { F } = live.current;
      const m = F.moonDir;
      let f0 = norm(cross([0, 0, 1], m));
      if (dot(f0, F.sunDir) < 0) f0 = f0.map((x) => -x);
      const a = 28 * D2R; // turned toward Earth so the Moon's near side shows
      const f = norm([f0[0] * Math.cos(a) - m[0] * Math.sin(a), f0[1] * Math.cos(a) - m[1] * Math.sin(a), f0[2] * Math.cos(a) - m[2] * Math.sin(a)]);
      const e = norm([m[0] - dot(m, f) * f[0], m[1] - dot(m, f) * f[1], m[2] - dot(m, f) * f[2]]);
      const n = cross(f, e);
      return { f, e, n, moon: m.map((x) => x * F.moonKm) as V3 };
    };
    const view = (c: Cam) => {
      const b0 = base();
      const e1 = rot(b0.e, b0.n, c.yaw), f1 = rot(b0.f, b0.n, c.yaw);
      const f = rot(f1, e1, c.pitch), n = rot(b0.n, e1, c.pitch);
      return { e: e1, n, f, moon: b0.moon };
    };
    const target = (p: Preset): Cam => {
      const b0 = base();
      const aw = Math.max(200, lay.r - lay.l), ah = Math.max(160, lay.b - lay.t);
      const sep = dot(b0.moon, b0.e);
      if (p === "both") return { T: b0.moon.map((x) => x / 2) as V3, s: (aw * 0.86) / (sep + R_EARTH + R_MOON), yaw: 0, pitch: 0 };
      if (p === "earth") return { T: [0, 0, 0], s: (Math.min(aw, ah) * 0.38) / R_EARTH, yaw: 0, pitch: 0 };
      return { T: b0.moon, s: (Math.min(aw, ah) * 0.4) / R_MOON, yaw: 0, pitch: 0 };
    };
    const go = (p: Preset) => {
      mode = p;
      anim = { from: { ...cam }, to: target(p), t0: performance.now(), ms: reduced() ? 1 : 1400 };
    };
    goRef.current = (p: Preset) => { setPreset(p); go(p); };
    const freeCam = () => { mode = null; anim = null; setPreset(null); dirty.current = true; };

    const size = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      for (const c of [cv, ov]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      measure();
      if (mode) cam = target(mode);
      dirty.current = true;
    };
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    size();
    cam = target("both");

    let raf = 0;
    const t0 = performance.now();
    const still = reduced();
    let lastMoon = { x: 0, y: 0, r: 0 };
    let pts: { id: string; x: number; y: number; z: number }[] = [];
    let basisNow = view(cam);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (anim) {
        const k = Math.min(1, (now - anim.t0) / anim.ms);
        const q = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const ls = Math.log(anim.from.s) + (Math.log(anim.to.s) - Math.log(anim.from.s)) * q;
        const L = (u: number, v: number) => u + (v - u) * q;
        cam = { T: [0, 1, 2].map((i) => L(anim!.from.T[i], anim!.to.T[i])) as V3, s: Math.exp(ls), yaw: L(anim.from.yaw, anim.to.yaw), pitch: L(anim.from.pitch, anim.to.pitch) };
        if (k >= 1) anim = null;
        dirty.current = true;
      }
      const animating = !still && live.current.A.linkOk;
      if (!dirty.current && !animating) return;
      dirty.current = false;
      const { F, eph, sel, A, all } = live.current;
      const g = view(cam);
      basisNow = g;
      const { e, n, f } = g;
      const acx = (lay.l + lay.r) / 2, acy = (lay.t + lay.b) / 2;
      const S = (Pk: V3) => {
        const d = [Pk[0] - cam.T[0], Pk[1] - cam.T[1], Pk[2] - cam.T[2]];
        return { x: acx + dot(d, e) * cam.s, y: acy - dot(d, n) * cam.s, z: dot(d, f) };
      };
      const sE = S([0, 0, 0]), sM = S(g.moon);
      const xE = sE.x, yE = sE.y, rE = R_EARTH * cam.s;
      const xM = sM.x, yM = sM.y, rM = R_MOON * cam.s;
      lastMoon = { x: xM, y: yM, r: rM };

      if (gl && prog && loaded === 2) {
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const draw = (cx: number, cy: number, R: number, M: number[][], sun: V3, key: string, earth: boolean) => {
          if (cx + R * 1.1 < 0 || cx - R * 1.1 > W || cy + R * 1.1 < 0 || cy - R * 1.1 > H) return;
          gl.uniform2f(U.uC, cx * dpr, (H - cy) * dpr);
          gl.uniform1f(U.uR, Math.max(0.6, R) * dpr);
          gl.uniform3fv(U.uE, mul(M, e));
          gl.uniform3fv(U.uN, mul(M, n));
          gl.uniform3fv(U.uF, mul(M, f));
          gl.uniform3fv(U.uSun, norm(sun));
          gl.uniform1f(U.uEarth, earth ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex[key]);
          gl.uniform1i(U.uT, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        // farther body first, so the nearer one covers it when they line up
        const dE = () => draw(xE, yE, rE, F.eclToEarth, mul(F.eclToEarth, F.sunDir), "earth", true);
        const dM = () => draw(xM, yM, rM, F.eclToMoon, unit(eph.subSolarLat, eph.subSolarLon), "moon", false);
        if (sE.z < sM.z) { dE(); dM(); } else { dM(); dE(); }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!gl || !prog) {
        ctx.fillStyle = "#1d3b6e"; ctx.beginPath(); ctx.arc(xE, yE, Math.max(1, rE), 0, 7); ctx.fill();
        ctx.fillStyle = "#5a5a5e"; ctx.beginPath(); ctx.arc(xM, yM, Math.max(1, rM), 0, 7); ctx.fill();
      }
      const font = (w: number, s: number) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const label = (txt: string, x: number, y: number, color = "rgba(245,245,247,0.92)", w = 600, s = 13, align: CanvasTextAlign = "center") => {
        ctx.font = font(w, s);
        ctx.textAlign = align;
        ctx.shadowColor = "rgba(0,0,0,0.95)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = color;
        ctx.fillText(txt, x, y);
        ctx.shadowBlur = 0;
      };
      const moonPt = (lat: number, lon: number) => {
        const v = mulT(F.eclToMoon, unit(lat, lon));
        return { x: xM + dot(v, e) * rM, y: yM - dot(v, n) * rM, z: dot(v, f) };
      };
      const detail = rM > 40;

      if (detail) {
        // Artemis III zone
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = `rgba(${AMBER},0.8)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let pen = false;
        for (let lo = -180; lo <= 180; lo += 3) {
          const p = moonPt(ARTEMIS_LAT, lo);
          if (p.z > 0) { if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      pts = all.map((l) => ({ id: l.id, ...moonPt(l.lat, l.lon) }));
      if (detail)
        for (const l of all) {
          if (l.id === sel.id) continue;
          const p = moonPt(l.lat, l.lon);
          if (p.z <= 0.05) continue;
          ctx.fillStyle = l.kind === "custom" ? `rgba(${GREEN},0.9)` : "rgba(245,245,247,0.55)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, l.kind === "custom" ? 3 : 2, 0, 7);
          ctx.fill();
        }

      // the radio path: Earth's surface toward the site -> the site
      const site = moonPt(sel.lat, sel.lon);
      const ok = A.linkOk;
      const rgb = ok ? GREEN : RED;
      let tx = rM > 12 ? site.x : xM, ty = rM > 12 ? site.y : yM;
      if (rM > 12 && site.z < 0) {
        const dx = site.x - xM, dy = site.y - yM, d = Math.hypot(dx, dy) || 1;
        tx = xM + (dx / d) * rM;
        ty = yM + (dy / d) * rM;
      }
      const ddx = tx - xE, ddy = ty - yE, dd = Math.hypot(ddx, ddy) || 1;
      const ex = xE + (ddx / dd) * rE, ey = yE + (ddy / dd) * rE;
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = rM > 12 ? 2 : 1.5;
      if (!ok) ctx.setLineDash([7, 6]);
      else if (!still) {
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -((now - t0) / 40) % 18;
      }
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      const siteOn = site.x > -20 && site.x < W + 20 && site.y > -20 && site.y < H + 20;
      if (rM > 12 && siteOn) {
        if (!ok) {
          const bx = tx - (ddx / dd) * 14, by = ty - (ddy / dd) * 14;
          ctx.strokeStyle = `rgb(${RED})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(bx - 6, by - 6); ctx.lineTo(bx + 6, by + 6);
          ctx.moveTo(bx + 6, by - 6); ctx.lineTo(bx - 6, by + 6);
          ctx.stroke();
        }
        ctx.globalAlpha = site.z > 0 ? 1 : 0.45;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (sel.kind === "custom") {
          // your lander: a small triangle
          ctx.moveTo(site.x, site.y - 8); ctx.lineTo(site.x + 7, site.y + 5); ctx.lineTo(site.x - 7, site.y + 5); ctx.closePath();
        } else ctx.arc(site.x, site.y, 5.5, 0, 7);
        ctx.stroke();
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb},0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(site.x, site.y, 12, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = font(600, 12.5);
        const nw = ctx.measureText(sel.name).width;
        // right of the marker if it fits, otherwise underneath (the left side is where the radio line arrives)
        if (site.x + 18 + nw < W - 8) label(sel.name, site.x + 18, site.y + 4, "#fff", 600, 12.5, "left");
        else label(sel.name, Math.max(8 + nw / 2, Math.min(W - 8 - nw / 2, site.x)), site.y + 28, "#fff", 600, 12.5);
      }

      // status of the path, beside the visible part of the line
      const clip = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
      const vx0 = clip(ex, lay.l, lay.r), vx1 = clip(tx, lay.l, lay.r);
      const lx = (vx0 + vx1) / 2;
      const ly = ey + ((ty - ey) * (lx - ex)) / (tx - ex || 1);
      const km = F.moonKm;
      const narrow = W < 600;
      if (lx > lay.l + 40 && lx < lay.r - 40 && ly > lay.t + 40 && ly < lay.b) {
        const t1 = ok ? "Radio path open" : narrow ? "No radio path" : A.farSide ? "No path: the far side never faces Earth" : "No path: Earth is below the site's horizon";
        const t2 = `${Math.round(km).toLocaleString("en-US")} km · ${(km / C_KMS).toFixed(2)} s each way`;
        ctx.font = font(600, 13);
        const half = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) / 2 + 6;
        const cx2 = Math.max(lay.l + half, Math.min(lay.r - half, lx));
        label(t1, cx2, ly - 36, `rgb(${rgb})`, 600, narrow ? 12 : 13);
        label(t2, cx2, ly - 18, "rgba(245,245,247,0.8)", 500, narrow ? 11 : 12);
      }

      // names of the bodies, and arrows to whichever is off screen
      const bodyLabel = (name: string, x: number, y: number, r: number) => {
        const on = x > lay.l - r && x < lay.r + r && y > lay.t - r && y < lay.b + r;
        if (on) {
          // above the body: south-pole sites (the usual case) are labelled underneath
          label(name, x, Math.max(lay.t + 12, y - r - 12), "rgba(245,245,247,0.92)", 600, r > 14 ? 13 : 12.5);
          return;
        }
        const cx = clip(x, lay.l + 34, lay.r - 34), cy = clip(y, lay.t + 14, lay.b - 14);
        const left = x < lay.l;
        label((left ? "← " : "") + name + (left ? "" : " →"), cx, cy + 4, "rgba(245,245,247,0.85)", 600, 12.5, left ? "left" : "right");
      };
      bodyLabel("Earth", xE, yE, rE);
      bodyLabel("Moon", xM, yM, rM);

      // where the sunlight comes from
      const sx = dot(F.sunDir, e), sy = dot(F.sunDir, n), sl = Math.hypot(sx, sy);
      const gx = sl > 0.12 ? acx + (sx / sl) * (lay.r - lay.l) * 0.36 : acx;
      const gy = lay.t + 22;
      ctx.strokeStyle = "rgba(255,214,120,0.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(gx, gy, 7, 0, 7); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const q = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(q) * 10, gy + Math.sin(q) * 10);
        ctx.lineTo(gx + Math.cos(q) * 14, gy + Math.sin(q) * 14);
        ctx.stroke();
      }
      if (sl > 0.12) {
        const ux = -sx / sl, uy = sy / sl;
        const ax = gx + ux * 22, ay = gy + uy * 22, bx = gx + ux * 62, by = gy + uy * 62;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        const h = Math.atan2(by - ay, bx - ax);
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx - 8 * Math.cos(h - 0.45), by - 8 * Math.sin(h - 0.45));
        ctx.moveTo(bx, by); ctx.lineTo(bx - 8 * Math.cos(h + 0.45), by - 8 * Math.sin(h + 0.45));
        ctx.stroke();
      }
      const sunTxt = sl > 0.12 ? "Sunlight" : dot(F.sunDir, f) > 0 ? "Sunlight from behind you" : "Sunlight from behind the scene";
      if (narrow) label(sunTxt, gx, gy + 30, "rgba(255,214,120,0.95)", 600, 11.5);
      else label(sunTxt, gx + (sx >= 0 ? 22 : -22), gy - 14, "rgba(255,214,120,0.95)", 600, 12, sx >= 0 ? "left" : "right");

      // scale bar: true scale, so one bar works for everything on screen
      const want = 120 / cam.s;
      const p10 = Math.pow(10, Math.floor(Math.log10(want)));
      const L = [1, 2, 5, 10].map((k) => k * p10).reduce((b, c) => (Math.abs(c * cam.s - 120) < Math.abs(b * cam.s - 120) ? c : b));
      const bw = L * cam.s, bx0 = lay.l + 8, by0 = lay.b + 24;
      ctx.strokeStyle = "rgba(245,245,247,0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx0, by0 - 5); ctx.lineTo(bx0, by0); ctx.lineTo(bx0 + bw, by0); ctx.lineTo(bx0 + bw, by0 - 5);
      ctx.stroke();
      label(`${L.toLocaleString("en-US")} km`, bx0 + bw + 8, by0 + 4, "rgba(245,245,247,0.75)", 500, 11.5, "left");
      if (!narrow) label("True scale: sizes and distance", lay.r - 4, by0 + 4, "rgba(245,245,247,0.45)", 400, 11.5, "right");
    };
    raf = requestAnimationFrame(frame);

    /* pointer: drag to pan, wheel or pinch to zoom, click a dot to pick it, click the Moon to land there */
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch0 = 0, s0 = 1;
    const local = (ev: PointerEvent | WheelEvent) => {
      const r = ov.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const zoomAt = (x: number, y: number, k: number) => {
      const acx = (lay.l + lay.r) / 2, acy = (lay.t + lay.b) / 2;
      const { e, n, moon } = view(cam);
      const sep = Math.hypot(moon[0], moon[1], moon[2]);
      const lo = ((lay.r - lay.l) * 0.4) / (sep + R_EARTH + R_MOON), hi = (Math.min(lay.r - lay.l, lay.b - lay.t) * 4) / R_MOON;
      const s2 = Math.max(lo, Math.min(hi, cam.s * k));
      const ux = (x - acx) * (1 / cam.s - 1 / s2), uy = (y - acy) * (1 / cam.s - 1 / s2);
      cam = { ...cam, s: s2, T: [0, 1, 2].map((i) => cam.T[i] + e[i] * ux - n[i] * uy) as V3 };
      freeCam();
    };
    const hit = (x: number, y: number) => {
      if (lastMoon.r <= 40) return null;
      let best: string | null = null, bd = 14 * 14;
      for (const p of pts) {
        if (p.z <= 0.05) continue;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p.id; }
      }
      return best;
    };
    const onMoon = (x: number, y: number) => {
      const { x: mx, y: my, r } = lastMoon;
      const px = (x - mx) / r, py = -(y - my) / r, rr = px * px + py * py;
      if (r < 20 || rr >= 1) return null;
      const pz = Math.sqrt(1 - rr);
      const { e, n, f } = basisNow;
      const v = [px * e[0] + py * n[0] + pz * f[0], px * e[1] + py * n[1] + pz * f[1], px * e[2] + py * n[2] + pz * f[2]];
      const b = mul(live.current.F.eclToMoon, v);
      return { lat: Math.asin(Math.max(-1, Math.min(1, b[2]))) / D2R, lon: Math.atan2(b[1], b[0]) / D2R };
    };
    let panning = false;
    const down = (ev: PointerEvent) => {
      ov.setPointerCapture(ev.pointerId);
      panning = ev.button === 2 || ev.shiftKey;
      ptrs.set(ev.pointerId, local(ev));
      moved = 0;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        s0 = cam.s;
      }
    };
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!ptrs.has(ev.pointerId)) {
        ov.style.cursor = hit(p.x, p.y) || onMoon(p.x, p.y) ? "crosshair" : "grab";
        return;
      }
      const prev = ptrs.get(ev.pointerId)!;
      ptrs.set(ev.pointerId, p);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (s0 * d) / pinch0 / cam.s);
        moved += 10;
        return;
      }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        if (panning) {
          const { e, n } = view(cam);
          cam = { ...cam, T: [0, 1, 2].map((i) => cam.T[i] - (e[i] * dx) / cam.s + (n[i] * dy) / cam.s) as V3 };
        } else {
          // orbit around the look-at point
          cam = { ...cam, yaw: cam.yaw - dx * 0.006, pitch: Math.max(-1.45, Math.min(1.45, cam.pitch + dy * 0.006)) };
        }
        freeCam();
      }
    };
    const up = (ev: PointerEvent) => {
      const p = local(ev);
      const was = ptrs.has(ev.pointerId);
      ptrs.delete(ev.pointerId);
      if (ptrs.size < 2) pinch0 = 0;
      if (!was || moved >= 5 || ptrs.size) return;
      const h = hit(p.x, p.y);
      if (h) { (wrap as any).__pick?.(h); return; }
      const ll = onMoon(p.x, p.y);
      if (ll) landRef.current(ll.lat, ll.lon);
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = local(ev);
      zoomAt(p.x, p.y, Math.exp(-ev.deltaY * 0.0015));
    };
    ov.addEventListener("pointerdown", down);
    ov.addEventListener("pointermove", move);
    ov.addEventListener("pointerup", up);
    ov.addEventListener("pointercancel", up);
    ov.addEventListener("wheel", wheel, { passive: false });
    const noMenu = (ev: Event) => ev.preventDefault();
    ov.addEventListener("contextmenu", noMenu);
    return () => {
      ov.removeEventListener("contextmenu", noMenu);
      cancelAnimationFrame(raf);
      ro.disconnect();
      ov.removeEventListener("pointerdown", down);
      ov.removeEventListener("pointermove", move);
      ov.removeEventListener("pointerup", up);
      ov.removeEventListener("pointercancel", up);
      ov.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => { (wrapRef.current as any).__pick = (id: string) => setSelId(id); });

  const pickSite = (id: string) => {
    if (id === "__new") {
      setDraft(customLanding("draft", "My landing", -85.0, 20.0));
      setSelId("draft");
    } else setSelId(id);
    goRef.current("moon");
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

  const poles = LANDINGS.filter((l) => l.site && TERRAIN_IDS.includes(l.site));
  const past = LANDINGS.filter((l) => !(l.site && TERRAIN_IDS.includes(l.site)));
  const mine = [...customs, ...(draft ? [draft] : [])];
  const n = A.now;
  const checks: { k: string; why: string; tone: "ok" | "bad" | "warn" | "na"; head: string; sub: string }[] = [
    {
      k: "Sunlight for power",
      why: "no sunlight",
      tone: A.sunOk ? "ok" : "bad",
      head: A.sunOk
        ? `Sun is up, ${n.sunEl.toFixed(1)}° above the horizon`
        : n.sunEl > 0 ? "Sun is up but hidden behind terrain" : `Sun is down, ${(-n.sunEl).toFixed(1)}° below the horizon`,
      sub: `In sunlight ${A.litPct.toFixed(0)}% of the next 30 days`,
    },
    {
      k: "Radio link to Earth",
      why: "no line of sight to Earth",
      tone: A.linkOk ? "ok" : "bad",
      head: A.linkOk
        ? `Earth is ${n.earthClearance.toFixed(1)}° above the horizon`
        : A.farSide ? "Earth is never visible from the far side" : n.earthEl > 0 ? "Earth is blocked by terrain" : "Earth is below the horizon",
      sub: `Earth in view ${A.linkPct.toFixed(0)}% of the next 30 days`,
    },
    {
      k: "Safe ground",
      why: "ground too steep",
      tone: A.slope ? (A.slope.max < SLOPE_LIMIT ? "ok" : A.slope.max < 15 ? "warn" : "bad") : "na",
      head: A.slope ? `Steepest slope ${A.slope.max.toFixed(1)}° (limit ${SLOPE_LIMIT}°)` : "No terrain data for this site",
      sub: A.slope
        ? `Average ${A.slope.mean.toFixed(1)}° over the 100 m landing area (LOLA)`
        : "Only the four south-pole sites carry LOLA terrain in this app",
    },
  ];
  const failing = checks.filter((c) => c.tone === "bad" || c.tone === "warn").map((c) => c.why);
  const go = failing.length === 0;
  const custom = sel.kind === "custom";

  return (
    <div className="ov">
      <div className="ov-stage" ref={wrapRef}>
        <canvas ref={glRef} aria-hidden="true" />
        <canvas
          ref={ovRef}
          className="ov-over"
          role="img"
          aria-label={`Earth and the Moon at true scale. A line from Earth to ${sel.name} shows the radio path, which is ${A.linkOk ? "open" : "blocked"}. Drag to orbit in 3D, right-drag or shift-drag to pan, scroll or pinch to zoom, click the Moon to land anywhere.`}
        />
      </div>

      <div className="ov-views glass" role="group" aria-label="View">
        {([["earth", "Earth"], ["both", "Earth + Moon"], ["moon", "Moon"]] as [Preset, string][]).map(([p, label]) => (
          <button key={p} aria-pressed={preset === p} onClick={() => goRef.current(p)}>
            {label}
          </button>
        ))}
        <span className="hint">Drag to orbit · right-drag to pan · scroll to zoom · click the Moon to land</span>
      </div>

      <aside className="ov-panel glass" aria-label="Landing check">
        <header className="ov-h">
          <h2>Can we land here?</h2>
          <p>Pick a site, or click anywhere on the Moon to land there. Three checks: sunlight, a view of Earth, flat ground.</p>
        </header>

        <div className="ov-pick">
          <label>
            <span>Landing site</span>
            <select value={sel.id} onChange={(e) => pickSite(e.target.value)}>
              <optgroup label="South-pole sites (LOLA terrain)">
                {poles.map((l) => (
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
                    {l.name}
                    {l.date ? ` (${l.date.slice(0, 4)})` : ""}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {custom && (
            <div className="ov-custom">
              <label className="full">
                <span>Name</span>
                <input value={sel.name} maxLength={40} onChange={(e) => editSel({ name: e.target.value || "My landing" })} />
              </label>
              <label>
                <span>Latitude (°N)</span>
                <input type="number" step="0.01" min={-90} max={90} value={sel.lat}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) editSel({ lat: Math.max(-90, Math.min(90, v)) }); }} />
              </label>
              <label>
                <span>Longitude (°E)</span>
                <input type="number" step="0.01" min={-180} max={180} value={sel.lon}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) editSel({ lon: P.norm180(v) }); }} />
              </label>
              <p className="full hint">Click anywhere on the Moon to move your lander.</p>
              <div className="full ov-custom-actions">
                {sel.id === "draft" && (
                  <button className="btn small" onClick={saveDraft}>
                    Save landing
                  </button>
                )}
                <button className="btn small" onClick={removeSel}>
                  {sel.id === "draft" ? "Discard" : "Delete"}
                </button>
              </div>
            </div>
          )}

          <label>
            <span>Time (UTC)</span>
            <div className="ov-time">
              <input
                type="datetime-local"
                value={new Date(t).toISOString().slice(0, 16)}
                min="2020-01-01T00:00"
                max="2045-12-31T23:59"
                onChange={(e) => {
                  const v = Date.parse(e.target.value + ":00Z");
                  if (!isNaN(v)) { setSetMs(v); setTimeMode("set"); }
                }}
              />
              <button className="btn small" aria-pressed={timeMode === "now"} onClick={() => setTimeMode("now")}>
                Now
              </button>
            </div>
          </label>
          <div className="ov-steps" role="group" aria-label="Step time">
            {[-7, -1, 1, 7].map((d) => (
              <button key={d} className="btn small" onClick={() => { setSetMs(t + d * DAY); setTimeMode("set"); }}>
                {d > 0 ? "+" : "−"}{Math.abs(d)} {Math.abs(d) === 1 ? "day" : "days"}
              </button>
            ))}
          </div>
        </div>

        <p className="ov-where">
          {sel.region} · {fmtLat(sel.lat)} {fmtLon(sel.lon)}
          {A.inZone ? <span className="zone">Inside the Artemis III zone</span> : null}
        </p>

        <ul className="ov-checks">
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

        <div className={"ov-verdict " + (go ? "ok" : "bad")} role="status">
          <b>{go ? "Go" : "No-go right now"}</b>
          <span>
            {go
              ? A.slope ? "Power, radio and safe ground at this time." : "Power and radio at this time. Slope is unknown without terrain data."
              : failing.join(" and ").replace(/^./, (c) => c.toUpperCase()) + ". Try another time or another site."}
          </span>
        </div>

        <footer className="ov-judge">
          <span>How this meets the Space Apps judging criteria</span>
          <div>
            {["Impact", "Creativity", "Validity", "Relevance", "Presentation"].map((k) => (
              <button key={k} onClick={props.onAbout}>
                {k}
              </button>
            ))}
          </div>
        </footer>
      </aside>
    </div>
  );
}
