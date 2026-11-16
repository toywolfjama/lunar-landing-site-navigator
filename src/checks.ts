/* The three landing checks for one site, touchdown cell and time: sunlight for power, line of sight to Earth for
   radio, and flat ground. Horizons and slopes come from NASA LOLA terrain where the app has it. */
import * as P from "./physics/lunarAstronomy";
import type { Landing } from "./landings";

export const SLOPE_LIMIT = 10; // Artemis: under 10 deg across a 100 m landing area
export const TIP_LIMIT = 15; // steeper than this and a lander of this size tips over
export const ARTEMIS_LAT = -84;
export const TERRAIN_IDS = ["shackleton", "malapert", "mouton", "athena"]; // sites with LOLA terrain in lolaData

export type Cell = { ix: number; iy: number };
export const DEFAULT_CELL: Record<string, Cell> = { shackleton: { ix: 10, iy: 3 } };
export const cellToM = (c: Cell) => ({ x: -P.GRID_HALF_M + c.ix * P.GRID_STEP_M, y: -P.GRID_HALF_M + c.iy * P.GRID_STEP_M });
export const mToCell = (x: number, y: number): Cell => ({
  ix: Math.max(0, Math.min(P.GRID_N - 1, Math.round((x + P.GRID_HALF_M) / P.GRID_STEP_M))),
  iy: Math.max(0, Math.min(P.GRID_N - 1, Math.round((y + P.GRID_HALF_M) / P.GRID_STEP_M))),
});

export function siteFor(l: Landing): P.Site {
  const s = l.site ? P.SITES.find((x) => x.id === l.site) : undefined;
  return s || { id: "ov-" + l.id, name: l.name, short: l.name, lat: l.lat, lon: P.norm360(l.lon), terrain: false, note: "" };
}

/** Hours until the Sun's centre (or Earth's) crosses the terrain horizon, the same test the checks use.
 *  null if nothing changes within the window (polar summer, or Earth never rising on the far side). */
export function nextCrossing(site: P.Site, prof: Float32Array, t: number, body: "sun" | "earth", windowH = 720) {
  const up = (ms: number) => {
    const s = P.localSky(site, ms);
    return body === "sun" ? s.sunEl > P.horizonAt(prof, s.sunAz) : s.earthEl > P.horizonAt(prof, s.earthAz);
  };
  const now = up(t);
  const step = 0.5;
  for (let h = step; h <= windowH; h += step) {
    if (up(t + h * 3600000) !== now) {
      let lo = h - step, hi = h;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (up(t + mid * 3600000) === now) lo = mid;
        else hi = mid;
      }
      return { up: now, hours: hi as number | null };
    }
  }
  return { up: now, hours: null as number | null };
}

/** "3 d 4 h", "5 h 20 min", "12 min" */
export function fmtHours(h: number) {
  if (h >= 48) return `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
  if (h >= 1) return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  return `${Math.max(1, Math.round(h * 60))} min`;
}

export function assess(l: Landing, t: number, cell: Cell) {
  const site = siteFor(l);
  const c = site.terrain ? cell : { ix: 10, iy: 10 };
  const prof = P.horizonProfile(site, c.ix, c.iy);
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
    const k = c.iy * P.GRID_N + c.ix;
    slope = { max: sl.max[k], mean: sl.mean[k] };
  }
  const sunEvent = nextCrossing(site, prof, t, "sun");
  const earthEvent = nextCrossing(site, prof, t, "earth");
  // far side: Earth never rises in 30 days, away from the poles (at the poles longitude says little)
  const farSide = link === 0 && Math.abs(l.lat) < 75 && Math.abs(P.norm180(l.lon)) > 95;
  return {
    site,
    now,
    litPct: (lit / N) * 100,
    linkPct: (link / N) * 100,
    slope,
    farSide,
    sunOk: now.sunFrac > 0.5,
    linkOk: now.lock !== "BLACKOUT",
    groundOk: slope ? slope.max < SLOPE_LIMIT : null,
    tips: slope ? slope.max >= TIP_LIMIT : false,
    inZone: l.lat <= ARTEMIS_LAT,
    sunEvent,
    earthEvent,
    cell: c,
    prof,
  };
}
export type Assessment = ReturnType<typeof assess>;
