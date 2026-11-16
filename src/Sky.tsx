/* The sky from the landing spot: a 360-degree panorama of the terrain horizon (NASA LOLA, or the smooth Moon where
   there is no terrain), the paths of the Sun and Earth over the next 30 days, and where each is now. No atmosphere,
   so the horizon is just the terrain and the curve of the Moon. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as P from "./physics/lunarAstronomy";
import { fmtHours, type Assessment } from "./checks";

const SUN = "#f5a524", EARTH = "#6aa2f0", GROUND = "#2a2a2e";
const DIRS: [number, string][] = [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"], [360, "N"]];

export function Sky({ A, t }: { A: Assessment; t: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const site = A.site;
    const sun: { az: number; el: number; up: boolean }[] = [];
    const earth: { az: number; el: number; up: boolean }[] = [];
    for (let h = 0; h <= 720; h += 2) {
      const s = P.localSky(site, t + h * 3600000);
      sun.push({ az: s.sunAz, el: s.sunEl, up: s.sunEl > P.horizonAt(A.prof, s.sunAz) });
      earth.push({ az: s.earthAz, el: s.earthEl, up: s.earthEl > P.horizonAt(A.prof, s.earthAz) });
    }
    const now = P.localSky(site, t);
    let hMin = Infinity, hMax = -Infinity;
    for (let a = 0; a < 360; a++) { hMin = Math.min(hMin, A.prof[a]); hMax = Math.max(hMax, A.prof[a]); }
    const els = [...sun, ...earth].map((p) => p.el).filter((e) => e > -15);
    let lo = Math.min(hMin - 1, -2, now.earthEl - 1.5, now.sunEl - 1.5);
    let hi = Math.max(hMax + 1, 4, Math.min(90, Math.max(...els) + 1.5));
    lo = Math.max(lo, -12);
    if (hi - lo < 6) hi = lo + 6;
    return { sun, earth, now, lo, hi };
  }, [A.site, A.prof, t]);

  const H = W < 500 ? 140 : 190, padL = 34, padR = 10, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = (az: number) => padL + (az / 360) * iw;
  const y = (el: number) => padT + ((data.hi - Math.max(data.lo, Math.min(data.hi, el))) / (data.hi - data.lo)) * ih;
  const step = data.hi - data.lo > 40 ? 15 : data.hi - data.lo > 14 ? 5 : data.hi - data.lo > 7 ? 2 : 1;

  // the horizon as a filled silhouette
  let ground = `M${x(0)},${y(data.lo)}`;
  for (let a = 0; a <= 360; a++) ground += `L${x(a)},${y(A.prof[a % 360])}`;
  ground += `L${x(360)},${y(data.lo)}Z`;

  // a path split into visible / hidden runs, breaking where it wraps around north
  const runs = (pts: { az: number; el: number; up: boolean }[]) => {
    const out: { d: string; up: boolean }[] = [];
    let cur: { d: string; up: boolean } | null = null;
    let prev: { az: number } | null = null;
    for (const p of pts) {
      const wrap = prev && Math.abs(p.az - prev.az) > 180;
      if (!cur || cur.up !== p.up || wrap) {
        cur = { d: `M${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`, up: p.up };
        out.push(cur);
      } else cur.d += `L${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`;
      prev = p;
    }
    return out;
  };
  const sunRuns = runs(data.sun), earthRuns = runs(data.earth);
  const pxPerDeg = ih / (data.hi - data.lo);
  const disc = (el: number, az: number, r: number, color: string, up: boolean, label: string) => (
    <g>
      <circle cx={x(az)} cy={y(el)} r={Math.max(4, r * pxPerDeg)} fill={color} opacity={up ? 1 : 0.35} stroke="#000" strokeWidth={1} />
      <text x={x(az) + 8} y={y(el) - 7} fill={color} fontSize={11.5} fontWeight={600} opacity={up ? 1 : 0.6}>
        {label}
      </text>
    </g>
  );
  const ev = (e: { up: boolean; hours: number | null }, body: "Sun" | "Earth") => {
    if (e.hours === null) return e.up ? "up for all of the next 30 days" : "does not rise in the next 30 days";
    return `${e.up ? (body === "Sun" ? "sets" : "Earthset") : body === "Sun" ? "rises" : "Earthrise"} in ${fmtHours(e.hours)}`;
  };

  return (
    <div className="sky" ref={box}>
      <div className="sky-head">
        <span>
          <i style={{ background: SUN }} /> Sun {A.now.sunEl >= 0 ? "+" : ""}
          {A.now.sunEl.toFixed(1)}° · {ev(A.sunEvent, "Sun")}
        </span>
        <span>
          <i style={{ background: EARTH }} /> Earth {A.now.earthEl >= 0 ? "+" : ""}
          {A.now.earthEl.toFixed(1)}° · {ev(A.earthEvent, "Earth")}
        </span>
        <span className="sky-note">{A.site.terrain ? "Horizon: NASA LOLA terrain" : "Horizon: smooth Moon (no terrain data)"} · paths: next 30 days</span>
      </div>
      <svg width={W} height={H} role="img" aria-label={`Sky panorama. Sun ${A.now.sunEl.toFixed(1)} degrees, Earth ${A.now.earthEl.toFixed(1)} degrees above the flat horizon.`}>
        {Array.from({ length: Math.floor((data.hi - data.lo) / step) + 1 }, (_, i) => Math.ceil(data.lo / step) * step + i * step)
          .filter((v) => v <= data.hi)
          .map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#555" : "#222"} strokeWidth={1} />
              <text x={padL - 5} y={y(v) + 4} textAnchor="end" fill="#777" fontSize={10}>
                {v}°
              </text>
            </g>
          ))}
        {sunRuns.map((r, i) => <path key={"s" + i} d={r.d} fill="none" stroke={SUN} strokeWidth={r.up ? 1.8 : 1.2} strokeDasharray={r.up ? undefined : "3 4"} opacity={r.up ? 0.9 : 0.35} />)}
        {earthRuns.map((r, i) => <path key={"e" + i} d={r.d} fill="none" stroke={EARTH} strokeWidth={r.up ? 1.8 : 1.2} strokeDasharray={r.up ? undefined : "3 4"} opacity={r.up ? 0.9 : 0.35} />)}
        <path d={ground} fill={GROUND} fillOpacity={0.82} stroke="#8a8a90" strokeWidth={1} />
        {disc(data.now.earthEl, data.now.earthAz, data.now.earthRadius, EARTH, A.linkOk, "Earth")}
        {disc(data.now.sunEl, data.now.sunAz, data.now.sunRadius, SUN, A.sunOk, "Sun")}
        {DIRS.map(([a, l]) => (
          <text key={a + l} x={Math.min(W - padR - 6, Math.max(padL + 6, x(a)))} y={H - 6} textAnchor="middle" fill="#888" fontSize={10.5}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}
