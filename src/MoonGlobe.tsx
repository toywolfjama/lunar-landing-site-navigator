/* The Moon as a globe: NASA LRO colour map on a sphere, lit by the real Sun for the chosen time, with every
   landing site on it. WebGL draws the sphere (one full-screen quad, ray-cast per pixel); a 2D canvas on top draws
   the graticule, the Artemis zone, markers and labels with exactly the same orthographic projection. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as P from "./physics/lunarAstronomy";
import { LANDINGS, KIND_LABEL, Kind, Landing } from "./landings";

// NASA LRO LROC colour map (CGI Moon Kit, 1024 x 512), inlined as a data URL by build.mjs
const moonTex: string = (globalThis as any).MOON_TEX || "assets/moon_lroc_1k.jpg";
const DAY = 86400000;
const D2R = Math.PI / 180;
const KIND_RGB: Record<Kind, string> = { crewed: "245,245,247", robotic: "96,150,230", pole: "245,165,36" };
const ARTEMIS_LAT = -84; // Artemis III: land within 6 deg of the south pole
type Filter = "all" | Kind;

interface View { lon: number; lat: number; zoom: number }
interface Sky { sunEl: number; earthEl: number }

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const norm180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtDay = (iso: string) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const fmtLat = (x: number) => Math.abs(x).toFixed(2) + "°" + (x >= 0 ? "N" : "S");
const fmtLon = (x: number) => Math.abs(norm180(x)).toFixed(2) + "°" + (norm180(x) >= 0 ? "E" : "W");

function basis(v: View) {
  const l = v.lon * D2R, p = v.lat * D2R;
  const f = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const e = [-Math.sin(l), Math.cos(l), 0];
  const n = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  return { e, n, f };
}
function unit(lat: number, lon: number) {
  const a = lat * D2R, o = lon * D2R;
  return [Math.cos(a) * Math.cos(o), Math.cos(a) * Math.sin(o), Math.sin(a)];
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision highp float;
uniform vec2 uC;uniform float uR;uniform vec3 uE,uN,uF,uSun;uniform sampler2D uT;
void main(){
  vec2 p=(gl_FragCoord.xy-uC)/uR;float r=length(p);
  if(r>1.0){gl_FragColor=vec4(0.);return;}
  float z=sqrt(max(0.,1.-r*r));vec3 b=normalize(p.x*uE+p.y*uN+z*uF);
  float lat=asin(clamp(b.z,-1.,1.));float lon=atan(b.y,b.x);
  vec3 c=texture2D(uT,vec2(lon/6.2831853+.5,.5-lat/3.1415927)).rgb;
  float d=dot(b,uSun);
  float day=smoothstep(-.012,.05,d)*(.5+.5*sqrt(max(d,0.)));
  vec3 col=c*(.075+.925*day)*vec3(1.,.995,.985);
  col*=.92+.08*z;
  float a=clamp((1.-r)*uR*1.5,0.,1.);
  gl_FragColor=vec4(col*a,a);
}`;

export function MoonGlobe(props: { baseMs: number; onPlan: (l: Landing) => void; onFly: (l: Landing) => void }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ lon: 15, lat: 8, zoom: 1 });
  const anim = useRef<{ from: View; to: View; t0: number; ms: number } | null>(null);
  const idleSince = useRef(performance.now());
  const dirty = useRef(true);
  const hoverRef = useRef<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(0);
  const [glOk, setGlOk] = useState(true);
  const [spin, setSpin] = useState(!reduced());
  const t = props.baseMs + days * DAY;

  const eph = useMemo(() => P.ephemeris(t), [t]);
  const sky = useMemo(() => {
    const m: Record<string, Sky> = {};
    for (const l of LANDINGS) {
      const site: P.Site = { id: "globe-" + l.id, name: l.name, short: l.name, lat: l.lat, lon: P.norm360(l.lon), terrain: false, note: "" };
      const s = P.localSky(site, t);
      m[l.id] = { sunEl: s.sunEl, earthEl: s.earthEl };
    }
    return m;
  }, [t]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return LANDINGS.filter((l) => (filter === "all" || l.kind === filter) &&
      (!s || (l.name + " " + l.mission + " " + l.agency + " " + l.region).toLowerCase().includes(s)));
  }, [filter, q]);
  const shownIds = useMemo(() => new Set(shown.map((l) => l.id)), [shown]);
  const sel = LANDINGS.find((l) => l.id === selId) || null;

  // everything the draw loop reads, kept current without restarting the loop
  const live = useRef({ eph, shownIds, selId, hover, spin });
  live.current = { eph, shownIds, selId, hover, spin };
  useEffect(() => { dirty.current = true; }, [eph, shownIds, selId, hover, spin]);

  const flyTo = (lat: number, lon: number, zoom: number) => {
    const from = { ...view.current };
    const to = { lon: from.lon + norm180(lon - from.lon), lat, zoom };
    anim.current = { from, to, t0: performance.now(), ms: reduced() ? 1 : 1100 };
    idleSince.current = performance.now();
  };
  const select = (l: Landing | null, fly = true) => {
    setSelId(l ? l.id : null);
    if (l && fly) flyTo(Math.max(-89, Math.min(89, l.lat)), l.lon, l.lat < -75 ? 2.6 : 2.0);
  };

  /* ---------------- render loop ---------------- */
  useEffect(() => {
    const cv = glRef.current!, ov = ovRef.current!, wrap = wrapRef.current!;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    const ctx = ov.getContext("2d")!;
    let prog: WebGLProgram | null = null;
    let U: Record<string, WebGLUniformLocation | null> = {};
    let texReady = false;
    if (!gl) setGlOk(false);
    else {
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setGlOk(false); prog = null; }
      else {
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, "a");
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        for (const k of ["uC", "uR", "uE", "uN", "uF", "uSun", "uT"]) U[k] = gl.getUniformLocation(prog, k);
        const tex = gl.createTexture();
        const img = new Image();
        img.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          texReady = true;
          dirty.current = true;
          wrap.classList.add("ready");
        };
        img.src = moonTex;
      }
    }

    let W = 0, H = 0, dpr = 1;
    // the free area for the globe, between the header, the panel, the time bar and the buttons (CSS px)
    let lay = { l: 0, r: 0, t: 0, b: 0 };
    const measure = () => {
      const root = wrap.parentElement!;
      const box = wrap.getBoundingClientRect();
      const hdr = document.querySelector(".top")?.getBoundingClientRect();
      const pan = root.querySelector(".moon-panel")?.getBoundingClientRect();
      const tim = root.querySelector(".moon-time")?.getBoundingClientRect();
      const wide = W >= 900;
      const t = (hdr ? hdr.bottom - box.top : 70) + 12;
      if (wide) lay = { l: (pan ? pan.right - box.left : 0) + 16, r: W - 72, t, b: (tim ? tim.top - box.top : H) - 12 };
      else lay = { l: 8, r: W - 8, t, b: Math.min(pan ? pan.top - box.top : H, tim ? tim.top - box.top : H) - 10 };
    };
    const size = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      for (const c of [cv, ov]) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      measure();
      dirty.current = true;
    };
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    const panel = wrap.parentElement!.querySelector(".moon-panel");
    if (panel) ro.observe(panel);
    size();

    const geo = () => {
      const aw = Math.max(80, lay.r - lay.l), ah = Math.max(80, lay.b - lay.t);
      return { cx: lay.l + aw / 2, cy: lay.t + ah / 2, R: (Math.min(aw, ah) / 2) * 0.9 * view.current.zoom };
    };
    (wrap as any).__geo = geo;

    const project = (lat: number, lon: number, B: ReturnType<typeof basis>, g: ReturnType<typeof geo>) => {
      const u = unit(lat, lon);
      return { x: g.cx + dot(u, B.e) * g.R, y: g.cy - dot(u, B.n) * g.R, z: dot(u, B.f) };
    };
    (wrap as any).__project = (lat: number, lon: number) => project(lat, lon, basis(view.current), geo());

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current;
      const A = anim.current;
      if (A) {
        const k = Math.min(1, (now - A.t0) / A.ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        view.current = { lon: A.from.lon + (A.to.lon - A.from.lon) * e, lat: A.from.lat + (A.to.lat - A.from.lat) * e, zoom: A.from.zoom + (A.to.zoom - A.from.zoom) * e };
        if (k >= 1) anim.current = null;
        dirty.current = true;
      } else if (L.spin && !L.selId && now - idleSince.current > 2500) {
        view.current.lon += 0.06;
        dirty.current = true;
      }
      if (!dirty.current) return;
      dirty.current = false;
      const v = view.current;
      const g = geo();
      const B = basis(v);
      const sun = unit(L.eph.subSolarLat, L.eph.subSolarLon);

      if (gl && prog && texReady) {
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.uC, g.cx * dpr, (H - g.cy) * dpr);
        gl.uniform1f(U.uR, g.R * dpr);
        gl.uniform3fv(U.uE, B.e);
        gl.uniform3fv(U.uN, B.n);
        gl.uniform3fv(U.uF, B.f);
        gl.uniform3fv(U.uSun, sun);
        gl.uniform1i(U.uT, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!gl || !prog) {
        // fallback: a flat grey disc so the markers still have something to sit on
        ctx.fillStyle = "#3a3a3c";
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.R, 0, 7);
        ctx.fill();
      }
      // graticule every 30 deg, then the Artemis III zone ring
      const line = (pts: [number, number][], style: string, width: number, dash: number[] = []) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let pen = false;
        for (const [la, lo] of pts) {
          const p = project(la, lo, B, g);
          if (p.z > 0) {
            if (pen) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
            pen = true;
          } else pen = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const grid = "rgba(255,255,255,0.07)";
      for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 181 }, (_, i) => [la, i * 2 - 180] as [number, number]), grid, 1);
      for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 91 }, (_, i) => [i * 2 - 90, lo] as [number, number]), grid, 1);
      line(Array.from({ length: 181 }, (_, i) => [ARTEMIS_LAT, i * 2 - 180] as [number, number]), "rgba(245,165,36,0.75)", 1.4, [5, 4]);
      const ring = project(ARTEMIS_LAT, v.lon, B, g);
      if (ring.z > 0.05 && g.R > 160) {
        ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.fillStyle = "rgba(245,165,36,0.95)";
        ctx.textAlign = "center";
        ctx.fillText("Artemis III zone · within 6° of the pole", ring.x, ring.y - 8);
      }

      // the point with the Sun overhead, and the point with Earth overhead
      const glyph = (lat: number, lon: number, kind: "sun" | "earth") => {
        const p = project(lat, lon, B, g);
        if (p.z <= 0.02) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.z * 6);
        if (kind === "sun") {
          ctx.strokeStyle = "rgba(255,214,120,0.95)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, 7);
          ctx.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8);
            ctx.lineTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = "rgba(96,150,230,0.9)";
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5, 0, 7);
          ctx.fill();
          ctx.stroke();
        }
        ctx.font = "500 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(245,245,247,0.7)";
        ctx.fillText(kind === "sun" ? "Sun overhead" : "Earth overhead", p.x + 14, p.y + 4);
        ctx.restore();
      };
      glyph(L.eph.subSolarLat, L.eph.subSolarLon, "sun");
      glyph(L.eph.subEarthLat, L.eph.subEarthLon, "earth");

      // markers, back to front; labels for selected, hovered, and (when zoomed) everything that fits
      const pts = LANDINGS.filter((l) => L.shownIds.has(l.id))
        .map((l) => ({ l, ...project(l.lat, l.lon, B, g) }))
        .filter((p) => p.z > 0)
        .sort((a, b) => a.z - b.z);
      const taken: number[][] = [];
      const fits = (x: number, y: number, w: number) => {
        const r = [x - w / 2 - 3, y - 2, x + w / 2 + 3, y + 16];
        if (taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
        taken.push(r);
        return true;
      };
      ctx.font = "600 12px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      const labelled = new Set<string>();
      const order = [...pts].sort((a, b) => (b.l.id === L.selId ? 2 : b.l.id === L.hover ? 1 : 0) - (a.l.id === L.selId ? 2 : a.l.id === L.hover ? 1 : 0));
      for (const p of order) {
        const want = p.l.id === L.selId || p.l.id === L.hover || (g.R > 330 && p.z > 0.25);
        if (want && fits(p.x, p.y + 10, ctx.measureText(p.l.name).width)) labelled.add(p.l.id);
      }
      for (const p of pts) {
        const on = p.l.id === L.selId;
        const hv = p.l.id === L.hover;
        const rgb = KIND_RGB[p.l.kind];
        const fade = Math.min(1, p.z * 5);
        ctx.globalAlpha = fade;
        if (on) {
          ctx.strokeStyle = `rgba(${rgb},0.5)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, 7);
          ctx.stroke();
        }
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (p.l.kind === "crewed") {
          const s = on || hv ? 6.5 : 5;
          ctx.moveTo(p.x, p.y - s);
          ctx.lineTo(p.x + s, p.y);
          ctx.lineTo(p.x, p.y + s);
          ctx.lineTo(p.x - s, p.y);
          ctx.closePath();
        } else ctx.arc(p.x, p.y, on || hv ? 5.5 : 4, 0, 7);
        ctx.stroke();
        ctx.fill();
        if (labelled.has(p.l.id)) {
          ctx.shadowColor = "rgba(0,0,0,0.95)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = on ? "#fff" : "rgba(245,245,247,0.88)";
          ctx.fillText(p.l.name, p.x, p.y + 22);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }
      (wrap as any).__pts = pts.map((p) => ({ id: p.l.id, x: p.x, y: p.y }));
    };
    raf = requestAnimationFrame(frame);

    /* ---------------- pointer: drag to turn, wheel or pinch to zoom, click to pick ---------------- */
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch0 = 0, zoom0 = 1;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = ov.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) => {
      const pts: { id: string; x: number; y: number }[] = (wrap as any).__pts || [];
      let best: string | null = null, bd = 15 * 15;
      for (const p of pts) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p.id; }
      }
      return best;
    };
    const down = (e: PointerEvent) => {
      ov.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, local(e));
      moved = 0;
      anim.current = null;
      idleSince.current = performance.now();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = view.current.zoom;
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!ptrs.has(e.pointerId)) {
        const h = hit(p.x, p.y);
        if (h !== hoverRef.current) {
          hoverRef.current = h;
          setHover(h);
          ov.style.cursor = h ? "pointer" : "grab";
        }
        return;
      }
      const prev = ptrs.get(e.pointerId)!;
      ptrs.set(e.pointerId, p);
      idleSince.current = performance.now();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) view.current.zoom = Math.max(0.7, Math.min(8, (zoom0 * d) / pinch0));
        moved += 10;
        dirty.current = true;
        return;
      }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const R = geo().R;
      view.current.lon -= (dx / R) * (180 / Math.PI);
      view.current.lat = Math.max(-89, Math.min(89, view.current.lat + (dy / R) * (180 / Math.PI)));
      dirty.current = true;
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      const was = ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch0 = 0;
      if (was && moved < 5 && ptrs.size === 0) {
        const h = hit(p.x, p.y);
        if (h) (wrap as any).__pick?.(h);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      anim.current = null;
      idleSince.current = performance.now();
      view.current.zoom = Math.max(0.7, Math.min(8, view.current.zoom * Math.exp(-e.deltaY * 0.0015)));
      dirty.current = true;
    };
    ov.addEventListener("pointerdown", down);
    ov.addEventListener("pointermove", move);
    ov.addEventListener("pointerup", up);
    ov.addEventListener("pointercancel", up);
    ov.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ov.removeEventListener("pointerdown", down);
      ov.removeEventListener("pointermove", move);
      ov.removeEventListener("pointerup", up);
      ov.removeEventListener("pointercancel", up);
      ov.removeEventListener("wheel", wheel);
    };
  }, []);

  // click on a marker selects it (and keeps the list scrolled to it)
  useEffect(() => {
    (wrapRef.current as any).__pick = (id: string) => {
      const l = LANDINGS.find((x) => x.id === id);
      if (l) select(l, false);
      document.getElementById("lnd-" + id)?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    };
  });

  const zoomBy = (k: number) => {
    const v = view.current;
    anim.current = { from: { ...v }, to: { ...v, zoom: Math.max(0.7, Math.min(8, v.zoom * k)) }, t0: performance.now(), ms: reduced() ? 1 : 300 };
  };
  const counts = useMemo(() => {
    const c = { crewed: 0, robotic: 0, pole: 0 };
    for (const l of LANDINGS) c[l.kind]++;
    return c;
  }, []);

  const s = sel ? sky[sel.id] : null;
  const farSide = sel ? Math.abs(norm180(sel.lon)) > 100 : false;
  const poleKm = sel ? ((90 + sel.lat) * D2R * P.R_MOON_KM).toFixed(0) : "";
  const phase = (() => {
    const d = P.norm180(eph.subSolarLon - eph.subEarthLon);
    const lit = (1 + Math.cos(d * D2R)) / 2;
    return Math.round(lit * 100);
  })();

  return (
    <div className="moon-view">
      <div className="moon-stage" ref={wrapRef}>
        <canvas ref={glRef} aria-hidden="true" />
        <canvas
          ref={ovRef}
          className="moon-over"
          role="img"
          aria-label="Interactive Moon globe showing landing sites. Drag to turn, scroll or pinch to zoom, click a marker to select it. The same sites are listed in the panel."
        />
        {!glOk && <p className="moon-nogl">WebGL is off in this browser, so the Moon is drawn as a plain disc. The markers and list still work.</p>}
      </div>

      <aside className="moon-panel glass" aria-label="Landing sites">
        <div className="mp-head">
          <h2>Landings on the Moon</h2>
          <p>
            {counts.crewed} crewed · {counts.robotic} robotic · {counts.pole} south-pole candidates
          </p>
        </div>
        <label className="mp-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="sr">Search landings</span>
          <input type="search" placeholder="Search missions, agencies, regions" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Show">
          {(["all", "crewed", "robotic", "pole"] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f !== "all" && <i style={{ background: `rgb(${KIND_RGB[f as Kind]})` }} className={f === "crewed" ? "dia" : ""} />}
              {f === "all" ? "All" : f === "pole" ? "South pole" : KIND_LABEL[f as Kind]}
            </button>
          ))}
        </div>

        {sel && s && (
          <section className="mp-detail" aria-live="polite">
            <div className="mp-dt">
              <span className="kind" style={{ color: `rgb(${KIND_RGB[sel.kind]})` }}>{KIND_LABEL[sel.kind]}</span>
              <button className="x" aria-label="Close details" onClick={() => setSelId(null)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <h3>{sel.name}</h3>
            <p className="meta">
              {sel.agency}
              {sel.date && " · " + fmtDay(sel.date)}
            </p>
            <p className="meta">
              {sel.region} · {fmtLat(sel.lat)} {fmtLon(sel.lon)}
            </p>
            <p>{sel.note}</p>
            <dl className="conds">
              <div>
                <dt>Sun</dt>
                <dd className={s.sunEl > 0 ? "amber" : ""}>{s.sunEl > 0 ? `${s.sunEl.toFixed(1)}° above horizon` : `${(-s.sunEl).toFixed(1)}° below · night`}</dd>
              </div>
              <div>
                <dt>Earth</dt>
                <dd className={s.earthEl > 0 ? "blue" : ""}>
                  {s.earthEl > 0 ? `${s.earthEl.toFixed(1)}° above horizon` : farSide ? "Never in view · far side" : `${(-s.earthEl).toFixed(1)}° below horizon`}
                </dd>
              </div>
              <div>
                <dt>To south pole</dt>
                <dd>
                  {poleKm} km{" "}
                  {sel.lat <= ARTEMIS_LAT ? <span className="ok">· inside Artemis zone</span> : null}
                </dd>
              </div>
            </dl>
            <div className="mp-actions">
              <button className="btn primary" onClick={() => props.onPlan(sel)}>
                Open in Mission Planner
              </button>
              {sel.planner && ["shackleton", "malapert", "mouton", "athena"].includes(sel.planner) && (
                <button className="btn" onClick={() => props.onFly(sel)}>
                  Fly the lander here
                </button>
              )}
            </div>
          </section>
        )}

        <ul className="mp-list">
          {shown.map((l) => {
            const k = sky[l.id];
            return (
              <li key={l.id} id={"lnd-" + l.id}>
                <button
                  aria-pressed={l.id === selId}
                  onClick={() => select(l)}
                  onMouseEnter={() => setHover(l.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <i className={"dot" + (l.kind === "crewed" ? " dia" : "")} style={{ background: `rgb(${KIND_RGB[l.kind]})` }} />
                  <span className="nm">{l.name}</span>
                  <span className="yr">{l.date ? l.date.slice(0, 4) : "Target"}</span>
                  <span className="sub">
                    {l.agency} · {l.region}
                  </span>
                  <span className="st" aria-label={(k.sunEl > 0 ? "Daylight" : "Night") + (k.earthEl > 0 ? ", Earth in view" : ", Earth not in view")}>
                    <b className={k.sunEl > 0 ? "on sun" : ""}>{k.sunEl > 0 ? "Day" : "Night"}</b>
                    <b className={k.earthEl > 0 ? "on earth" : ""}>{k.earthEl > 0 ? "Earth up" : "No Earth"}</b>
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="empty">No landings match “{q}”.</li>}
        </ul>
      </aside>

      <div className="moon-time glass">
        <div className="mt-top">
          <span className="lbl">{days === 0 ? "Now" : (days > 0 ? "+" : "−") + Math.abs(days).toFixed(1) + " days"}</span>
          <span className="mono">{fmtUtc(t)}</span>
          <span className="lbl">{phase}% lit from Earth</span>
        </div>
        <input
          type="range"
          min={-15}
          max={15}
          step={0.25}
          value={days}
          aria-label="Shift time to watch sunlight move across the Moon, in days"
          onChange={(e) => setDays(parseFloat(e.target.value))}
        />
        <button className="btn small" disabled={days === 0} onClick={() => setDays(0)}>
          Now
        </button>
      </div>

      <div className="moon-ctl">
        <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button className="icon-btn" aria-label="Show the near side" title="Near side" onClick={() => { setSelId(null); flyTo(8, 15, 1); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c3 3 3 13 0 16" /></svg>
        </button>
        <button className="icon-btn" aria-label="Look at the south pole" title="South pole" onClick={() => flyTo(-78, 20, 2.4)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 20v-6M9 17l3 3 3-3" /></svg>
        </button>
        <button className="icon-btn" aria-pressed={spin} aria-label={spin ? "Stop turning" : "Turn slowly"} title="Auto-rotate" onClick={() => setSpin(!spin)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
        </button>
      </div>

      <div className="moon-legend glass" aria-hidden="true">
        <span><i className="dia" style={{ background: `rgb(${KIND_RGB.crewed})` }} />Crewed</span>
        <span><i style={{ background: `rgb(${KIND_RGB.robotic})` }} />Robotic</span>
        <span><i style={{ background: `rgb(${KIND_RGB.pole})` }} />South-pole candidate</span>
        <span><b className="ring" />Artemis III zone</span>
      </div>
    </div>
  );
}
