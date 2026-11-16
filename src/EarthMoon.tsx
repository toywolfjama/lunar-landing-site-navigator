/* Overview: Earth and the Moon in one scene, both lit by the real Sun, with the radio path from Earth to the chosen
   landing site. One question, three checks: is there sunlight for power, can the site see Earth for radio, and is
   the ground flat enough to land on. Sizes and distance are not to scale; directions and lighting are. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as P from "./physics/lunarAstronomy";
import { LANDINGS, Landing } from "./landings";

const DAY = 86400000;
const D2R = Math.PI / 180;
const C_KMS = 299792.458;
const ARTEMIS_LAT = -84;
const SLOPE_LIMIT = 10; // Artemis: under 10 deg across a 100 m landing area
const GREEN = "74,176,100", RED = "229,72,77", AMBER = "245,165,36";
const START_CELL: Record<string, { ix: number; iy: number }> = { shackleton: { ix: 10, iy: 3 } };
const TERRAIN_IDS = ["shackleton", "malapert", "mouton", "athena"];

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
  const s = l.planner ? P.SITES.find((x) => x.id === l.planner) : undefined;
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

export function EarthMoon(props: {
  onPlan: (l: Landing, t: number | null) => void;
  onFly: (l: Landing) => void;
  onRubric: () => void;
}) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState("shackleton");
  const [timeMode, setTimeMode] = useState<"now" | "set">("now");
  const [setMs, setSetMs] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    if (timeMode !== "now") return;
    const id = setInterval(() => setClock(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, [timeMode]);
  const t = timeMode === "now" ? clock : setMs;
  const sel = LANDINGS.find((l) => l.id === selId) || LANDINGS[0];
  const A = useMemo(() => assess(sel, t), [sel, t]);
  const F = useMemo(() => P.sceneFrames(t), [t]);
  const eph = useMemo(() => P.ephemeris(t), [t]);

  const live = useRef({ F, eph, sel, A });
  live.current = { F, eph, sel, A };
  const dirty = useRef(true);
  useEffect(() => { dirty.current = true; }, [F, eph, sel, A]);

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
      const pan = root.querySelector(".ov-panel")?.getBoundingClientRect();
      const t0 = (hdr ? hdr.bottom - box.top : 70) + 16;
      if (W >= 900) lay = { l: (pan ? pan.right - box.left : 0) + 24, r: W - 24, t: t0, b: H - 40 };
      else lay = { l: 8, r: W - 8, t: t0, b: (pan ? pan.top - box.top : H) - 28 };
    };
    const size = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      for (const c of [cv, ov]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      measure();
      dirty.current = true;
    };
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    size();

    let raf = 0;
    const t0 = performance.now();
    const still = reduced();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const animating = !still && live.current.A.linkOk; // the open radio path flows from Earth to the site
      if (!dirty.current && !animating) return;
      dirty.current = false;
      const { F, eph, sel, A } = live.current;

      // camera: side-on to the Earth-Moon line, turned 28 deg toward Earth so the Moon's near side shows; ecliptic north up
      const m = F.moonDir;
      let f0 = norm(cross([0, 0, 1], m));
      if (dot(f0, F.sunDir) < 0) f0 = f0.map((x) => -x);
      const a = 28 * D2R;
      const f = norm([f0[0] * Math.cos(a) - m[0] * Math.sin(a), f0[1] * Math.cos(a) - m[1] * Math.sin(a), f0[2] * Math.cos(a) - m[2] * Math.sin(a)]);
      const e = norm([m[0] - dot(m, f) * f[0], m[1] - dot(m, f) * f[1], m[2] - dot(m, f) * f[2]]);
      const n = cross(f, e);

      // layout: Earth left, Moon right, on one line (the Earth-Moon direction is exactly screen-right)
      const aw = Math.max(200, lay.r - lay.l), ah = Math.max(160, lay.b - lay.t);
      const rM = Math.max(34, Math.min(ah * 0.27, aw * 0.14));
      const rE = rM * 1.5;
      const cy = lay.t + ah * 0.5;
      const xE = lay.l + rE + aw * 0.04;
      const xM = lay.r - rM - aw * 0.05;

      if (gl && prog && loaded === 2) {
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const draw = (cx: number, R: number, M: number[][], sun: V3, key: string, earth: boolean) => {
          gl.uniform2f(U.uC, cx * dpr, (H - cy) * dpr);
          gl.uniform1f(U.uR, R * dpr);
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
        draw(xE, rE, F.eclToEarth, mul(F.eclToEarth, F.sunDir), "earth", true);
        draw(xM, rM, F.eclToMoon, unit(eph.subSolarLat, eph.subSolarLon), "moon", false);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!gl || !prog) {
        ctx.fillStyle = "#1d3b6e"; ctx.beginPath(); ctx.arc(xE, cy, rE, 0, 7); ctx.fill();
        ctx.fillStyle = "#5a5a5e"; ctx.beginPath(); ctx.arc(xM, cy, rM, 0, 7); ctx.fill();
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
      // a point on the Moon, in screen space
      const moonPt = (lat: number, lon: number) => {
        const v = mulT(F.eclToMoon, unit(lat, lon));
        return { x: xM + dot(v, e) * rM, y: cy - dot(v, n) * rM, z: dot(v, f) };
      };

      // Artemis III zone on the Moon
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

      // other landings, faint
      for (const l of LANDINGS) {
        if (l.id === sel.id) continue;
        const p = moonPt(l.lat, l.lon);
        if (p.z <= 0.05) continue;
        ctx.fillStyle = "rgba(245,245,247,0.55)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, 7);
        ctx.fill();
      }

      // the radio path: Earth's limb facing the Moon -> the landing site
      const site = moonPt(sel.lat, sel.lon);
      const ok = A.linkOk;
      const rgb = ok ? GREEN : RED;
      const ex = xE + rE, ey = cy;
      let tx = site.x, ty = site.y;
      if (site.z < 0) {
        // behind the Moon from this viewpoint: stop the line at the limb
        const dx = site.x - xM, dy = site.y - cy, d = Math.hypot(dx, dy) || 1;
        tx = xM + (dx / d) * rM;
        ty = cy + (dy / d) * rM;
      }
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = 2;
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
      if (!ok) {
        // a cross where the signal is blocked
        const bx = tx - (tx - ex) * 0.04, by = ty - (ty - ey) * 0.04;
        ctx.strokeStyle = `rgb(${RED})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by - 6); ctx.lineTo(bx + 6, by + 6);
        ctx.moveTo(bx + 6, by - 6); ctx.lineTo(bx - 6, by + 6);
        ctx.stroke();
      }
      // site marker
      ctx.globalAlpha = site.z > 0 ? 1 : 0.45;
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(site.x, site.y, 5.5, 0, 7);
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(site.x, site.y, 11, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // labels
      const km = F.moonKm;
      // labels sit in the gap between the two bodies, on the side of the line away from the site
      const mx = (xE + rE + xM - rM) / 2;
      const above = ty >= cy;
      const narrow = W < 600;
      if (!narrow) label(ok ? "Radio path open" : A.farSide ? "No path: the far side never faces Earth" : "No path: Earth is below the site's horizon", mx, above ? cy - 40 : cy + 30, `rgb(${rgb})`, 600, 13);
      const distTxt = `${Math.round(km).toLocaleString("en-US")} km  ·  ${(km / C_KMS).toFixed(2)} s each way at light speed`;
      if (!narrow) label(distTxt, mx, above ? cy - 20 : cy + 50, "rgba(245,245,247,0.8)", 500, 12);
      label("Earth", xE, cy + rE + 26);
      label("Moon", xM, cy + rM + 26);
      ctx.font = font(600, 12.5);
      const nw = ctx.measureText(sel.name).width;
      const right = site.x > xM ? site.x + 16 + nw < W - 8 : site.x - 16 - nw < 8;
      if (right) label(sel.name, site.x + 16, site.y + 4, "#fff", 600, 12.5, "left");
      else if (site.x - 16 - nw >= 8) label(sel.name, site.x - 16, site.y + 4, "#fff", 600, 12.5, "right");
      else label(sel.name, Math.min(W - 8 - nw / 2, Math.max(8 + nw / 2, site.x)), site.y + 24, "#fff", 600, 12.5);

      // where the sunlight comes from: a Sun glyph in the top band, with an arrow along the direction light travels
      const sx = dot(F.sunDir, e), sy = dot(F.sunDir, n), sl = Math.hypot(sx, sy);
      const gx = sl > 0.12 ? (lay.l + lay.r) / 2 + (sx / sl) * (lay.r - lay.l) * 0.32 : (lay.l + lay.r) / 2;
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
        const ux = -sx / sl, uy = sy / sl; // light travels away from the Sun
        const ax = gx + ux * 22, ay = gy + uy * 22, bx = gx + ux * 62, by = gy + uy * 62;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        const h = Math.atan2(by - ay, bx - ax);
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx - 8 * Math.cos(h - 0.45), by - 8 * Math.sin(h - 0.45));
        ctx.moveTo(bx, by); ctx.lineTo(bx - 8 * Math.cos(h + 0.45), by - 8 * Math.sin(h + 0.45));
        ctx.stroke();
      }
      label(sl > 0.12 ? "Sunlight" : dot(F.sunDir, f) > 0 ? "Sunlight from behind you" : "Sunlight from behind the scene", gx + (sx >= 0 ? 22 : -22), gy - 14, "rgba(255,214,120,0.95)", 600, 12, sx >= 0 ? "left" : "right");
      if (narrow) label(distTxt.replace(" at light speed", "") + "  ·  not to scale", (lay.l + lay.r) / 2, lay.b + 20, "rgba(245,245,247,0.55)", 400, 11);
      else label("Not to scale: the Moon is 3.7× smaller than Earth and about 30 Earth-widths away", (lay.l + lay.r) / 2, lay.b + 26, "rgba(245,245,247,0.4)", 400, 11.5);

      (wrap as any).__moon = { xM, cy, rM, pts: LANDINGS.map((l) => ({ id: l.id, ...moonPt(l.lat, l.lon) })) };
    };
    raf = requestAnimationFrame(frame);

    // click a dot on the Moon to pick that site
    const click = (ev: MouseEvent) => {
      const r = ov.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const mm = (wrap as any).__moon;
      if (!mm) return;
      let best: string | null = null, bd = 14 * 14;
      for (const p of mm.pts) {
        if (p.z <= 0.05) continue;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p.id; }
      }
      if (best) (wrap as any).__pick?.(best);
    };
    const hover = (ev: MouseEvent) => {
      const r = ov.getBoundingClientRect();
      const mm = (wrap as any).__moon;
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      ov.style.cursor = mm && mm.pts.some((p: any) => p.z > 0.05 && (p.x - x) ** 2 + (p.y - y) ** 2 < 196) ? "pointer" : "default";
    };
    ov.addEventListener("click", click);
    ov.addEventListener("mousemove", hover);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ov.removeEventListener("click", click);
      ov.removeEventListener("mousemove", hover);
    };
  }, []);
  useEffect(() => { (wrapRef.current as any).__pick = (id: string) => setSelId(id); });

  const poles = LANDINGS.filter((l) => l.planner && TERRAIN_IDS.includes(l.planner));
  const past = LANDINGS.filter((l) => !(l.planner && TERRAIN_IDS.includes(l.planner)));
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
      sub: A.slope ? `Average ${A.slope.mean.toFixed(1)}° over the 100 m landing area (LOLA)` : "Only the four south-pole sites carry LOLA terrain",
    },
  ];
  const failing = checks.filter((c) => c.tone === "bad" || c.tone === "warn").map((c) => c.why);
  const go = failing.length === 0;

  return (
    <div className="ov">
      <div className="ov-stage" ref={wrapRef}>
        <canvas ref={glRef} aria-hidden="true" />
        <canvas
          ref={ovRef}
          className="ov-over"
          role="img"
          aria-label={`Earth and the Moon. A line from Earth to ${sel.name} shows the radio path, which is ${A.linkOk ? "open" : "blocked"}. Click a dot on the Moon to pick another site.`}
        />
      </div>

      <aside className="ov-panel glass" aria-label="Landing check">
        <header className="ov-h">
          <h2>Can we land here?</h2>
          <p>Three checks for any site and time: sunlight, a view of Earth, flat ground.</p>
        </header>

        <div className="ov-pick">
          <label>
            <span>Landing site</span>
            <select value={selId} onChange={(e) => setSelId(e.target.value)}>
              <optgroup label="South-pole sites (LOLA terrain)">
                {poles.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
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
              : failing.join(" and ").replace(/^./, (c) => c.toUpperCase()) + ". Try another time, or move the lander in the detailed planner."}
          </span>
        </div>

        <div className="ov-actions">
          <button className="btn primary" onClick={() => props.onPlan(sel, timeMode === "set" ? t : null)}>
            Open detailed planner
          </button>
          {sel.planner && TERRAIN_IDS.includes(sel.planner) && (
            <button className="btn" onClick={() => props.onFly(sel)}>
              Fly the landing
            </button>
          )}
        </div>

        <footer className="ov-judge">
          <span>Built to the Space Apps judging criteria</span>
          <div>
            {["Impact", "Creativity", "Validity", "Relevance", "Presentation"].map((k) => (
              <button key={k} onClick={props.onRubric}>
                {k}
              </button>
            ))}
          </div>
        </footer>
      </aside>
    </div>
  );
}
