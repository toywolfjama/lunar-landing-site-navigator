/* Engineer mode: one dense sheet that says whether this spot, at this touchdown time, is a GO, and why. Every number
   comes from the same models as the rest of the app (ephemeris, LOLA horizons and slopes, the power, thermal and link
   models in lunarAstronomy); the lander figures are an illustrative small robotic lander, and are labelled as such. */
import { useMemo, useState } from "react";
import * as P from "./physics/lunarAstronomy";
import { Assessment, SLOPE_LIMIT, TIP_LIMIT, fmtHours, Cell } from "./checks";
import type { Landing } from "./landings";
import { PHASES } from "./scene/trajectory";

type Status = "go" | "caution" | "nogo";
const LABEL: Record<Status, string> = { go: "GO", caution: "CAUTION", nogo: "NO-GO" };

// illustrative reference lander (matches the 3D model and the power and thermal models)
const LANDER = { dryKg: 420, payloadKg: 80, ispS: 320, thrustN: 4400, legSpanM: 4.4 };
const DV = { loi: 0.85, doi: 0.02, pd: 1.88, reserve: 0.1 }; // km/s: capture to 100 km, DOI, powered descent with gravity losses, hover/divert
const C_KMS = 299792.458;
const MISSION_DAYS = 14;

function utc(ms: number) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
const f = (x: number, d = 1) => (isFinite(x) ? x.toFixed(d) : "—");

export function EngineerPanel({ sel, t, cell, spot, A, onTime, onClose }: {
  sel: Landing;
  t: number;
  cell: Cell;
  spot: { x: number; y: number };
  A: Assessment;
  onTime: (ms: number) => void;
  onClose: () => void;
}) {
  const site = A.site;
  const prof = A.prof;
  const now = A.now;

  const sim = useMemo(() => P.simulateTimeline(site, prof, P.DEFAULT_POWER, t, MISSION_DAYS * 24, 1), [site.id, cell.ix, cell.iy, t]);

  // terrain: the landing ellipse (150 m radius) around the touchdown cell, and the nearest backup cell
  const terrain = useMemo(() => {
    if (!site.terrain) return null;
    const sl = P.surveySlope(site);
    const k = cell.iy * P.GRID_N + cell.ix;
    let inside = 0, ok = 0;
    for (let iy = 0; iy < P.GRID_N; iy++)
      for (let ix = 0; ix < P.GRID_N; ix++) {
        if (Math.hypot(ix - cell.ix, iy - cell.iy) * P.GRID_STEP_M > 150) continue;
        inside++;
        if (sl.max[iy * P.GRID_N + ix] < SLOPE_LIMIT) ok++;
      }
    const grid = P.surveyGrid(site, P.DEFAULT_POWER, t);
    let backup: { ix: number; iy: number; d: number } | null = null;
    for (let iy = 0; iy < P.GRID_N; iy++)
      for (let ix = 0; ix < P.GRID_N; ix++) {
        const j = iy * P.GRID_N + ix;
        if (ix === cell.ix && iy === cell.iy) continue;
        if (sl.max[j] >= SLOPE_LIMIT || grid[j].powerW < P.DEFAULT_POWER.loadW || grid[j].lock === "BLACKOUT") continue;
        const d = Math.hypot(ix - cell.ix, iy - cell.iy) * P.GRID_STEP_M;
        if (!backup || d < backup.d) backup = { ix, iy, d };
      }
    const elev = P.patchElevationAt(site, spot.x, spot.y);
    return { max: sl.max[k], mean: sl.mean[k], rough: sl.rough[k], ellipse: inside ? (100 * ok) / inside : 0, backup, elev };
  }, [site.id, cell.ix, cell.iy, t, spot.x, spot.y]);

  // the next 120 days of start dates at this exact spot
  const windows = useMemo(() => {
    const day0 = Math.floor(t / 86400000) * 86400000;
    const scan = P.scanYear(site, prof, day0, 120, MISSION_DAYS);
    const best = P.bestWindows(scan, 3, 14);
    return { scan, best, day0, todayScore: scan.score[0] };
  }, [site.id, cell.ix, cell.iy, Math.floor(t / 86400000)]);

  // descent: comms during powered descent (the last ~12 minutes), and the mission timeline back from touchdown
  const pdSec = PHASES[5].real + PHASES[6].real + PHASES[7].real + PHASES[8].real;
  const atPdi = useMemo(() => P.stateAt(site, prof, P.DEFAULT_POWER, t - pdSec * 1000), [site.id, cell.ix, cell.iy, t]);
  const events = useMemo(() => {
    const names = ["Trans-lunar injection", "Lunar orbit insertion", "Lunar orbit, 100 km", "Descent orbit insertion", "Coast toward 15 km perilune", "Powered descent initiation", "High gate", "Low gate", "Touchdown"];
    let at = t;
    const out: { name: string; ms: number }[] = [];
    for (let i = PHASES.length - 1; i >= 0; i--) {
      at -= PHASES[i].real * 1000;
      out.unshift({ name: names[i], ms: at });
    }
    out.push({ name: "Touchdown", ms: t });
    return out.filter((_, i) => i !== PHASES.length - 1);
  }, [t]);

  // propellant from the rocket equation, landed mass = dry + payload
  const dvTotal = DV.loi + DV.doi + DV.pd + DV.reserve;
  const landed = LANDER.dryKg + LANDER.payloadKg;
  const ve = (LANDER.ispS * 9.80665) / 1000;
  const wet = landed * Math.exp(dvTotal / ve);
  const prop = wet - landed;
  const pdProp = landed * Math.exp((DV.pd + DV.reserve) / ve) - landed;
  const twr = LANDER.thrustN / (landed * 1.62);

  const enduranceH = P.DEFAULT_POWER.batteryWh / (P.DEFAULT_POWER.loadW + P.THERMAL.heaterW);
  const lightS = now.earthRangeKm / C_KMS;
  const commsH = (sim.stats.commsPct / 100) * MISSION_DAYS * 24;
  const dataGB = (commsH * 3600 * 2e6) / 8 / 1e9;
  const shadow = now.sunEl > 0.2 ? 1 / Math.tan(now.sunEl * P.DEG) : Infinity;

  // GO / NO-GO rows
  const rows: { k: string; v: string; s: Status; why: string }[] = [];
  const sl = terrain?.max;
  rows.push(
    sl === undefined
      ? { k: "Terrain slope", v: "no LOLA data", s: "caution", why: "No 20 m terrain here; slope cannot be checked." }
      : { k: "Terrain slope", v: f(sl) + "° max / 100 m", s: sl < SLOPE_LIMIT ? "go" : sl < TIP_LIMIT ? "caution" : "nogo", why: `Limit ${SLOPE_LIMIT}° (Artemis), tip-over at ${TIP_LIMIT}°.` },
  );
  if (terrain) rows.push({ k: "Landing ellipse", v: f(terrain.ellipse, 0) + "% safe", s: terrain.ellipse >= 90 ? "go" : terrain.ellipse >= 60 ? "caution" : "nogo", why: "Share of the 150 m radius around the spot under the slope limit." });
  rows.push({ k: "Sun at touchdown", v: f(now.sunFrac * 100, 0) + "% of disc", s: now.sunFrac > 0.5 ? "go" : now.sunFrac > 0 ? "caution" : "nogo", why: "Arrays need sunlight from the first minute." });
  rows.push({
    k: "Hazard-camera lighting",
    v: now.sunEl > 0 ? f(now.sunEl) + "° Sun, 1 m rock casts " + (isFinite(shadow) ? f(shadow, 0) + " m" : "∞") : "dark",
    s: now.sunEl >= 7 && now.sunEl <= 45 ? "go" : now.sunEl > 1 ? "caution" : "nogo",
    why: "Optical hazard detection works best with the Sun 7–45° up; low Sun hides ground in long shadows.",
  });
  rows.push({ k: "Comms during descent", v: atPdi.lock === "BLACKOUT" ? "Earth below horizon" : f(atPdi.linkMarginDb) + " dB margin", s: atPdi.lock === "LOCK" ? "go" : atPdi.lock === "GRAZING" ? "caution" : "nogo", why: "Live telemetry from powered descent initiation to touchdown." });
  rows.push({ k: "Comms at touchdown", v: now.lock === "BLACKOUT" ? "Earth below horizon" : f(now.linkMarginDb) + " dB margin", s: now.lock === "LOCK" ? "go" : now.lock === "GRAZING" ? "caution" : "nogo", why: "Direct-to-Earth S-band; no relay assumed." });
  rows.push({ k: `Power, ${MISSION_DAYS} days`, v: "min battery " + f(sim.stats.minSoc * 100, 0) + "%", s: sim.stats.minSoc > 0.3 ? "go" : sim.stats.minSoc > 0 ? "caution" : "nogo", why: `${P.DEFAULT_POWER.arrayPeakW} W array, ${P.DEFAULT_POWER.batteryWh} Wh battery, ${P.DEFAULT_POWER.loadW} W load.` });
  rows.push({ k: "Longest night", v: fmtHours(sim.stats.longestNightH || 0), s: sim.stats.longestNightH <= enduranceH * 0.8 ? "go" : sim.stats.longestNightH <= enduranceH ? "caution" : "nogo", why: `Battery lasts about ${f(enduranceH)} h with heaters on.` });
  rows.push({ k: "Thermal survival", v: "min " + f(sim.stats.minTempC, 0) + " °C", s: sim.stats.frozenH > 0 ? "nogo" : sim.stats.minTempC < -20 ? "caution" : "go", why: `Survival limit ${P.THERMAL.survivalC} °C.` });
  rows.push({ k: `Earth contact, ${MISSION_DAYS} days`, v: f(sim.stats.commsPct, 0) + "% of the time", s: sim.stats.commsPct >= 70 ? "go" : sim.stats.commsPct >= 40 ? "caution" : "nogo", why: `Longest blackout ${fmtHours(sim.stats.longestBlackoutH || 0)}.` });

  const overall: Status = rows.some((r) => r.s === "nogo") ? "nogo" : rows.some((r) => r.s === "caution") ? "caution" : "go";
  const [copied, setCopied] = useState(false);

  const csv = () => {
    const head = [
      `# Engineer report: ${sel.name}, spot ${f(spot.x, 0)} m E ${f(spot.y, 0)} m N, touchdown ${utc(t)}`,
      `# Overall: ${LABEL[overall]}`,
      ...rows.map((r) => `# ${r.k}: ${LABEL[r.s]} (${r.v})`),
    ].join("\n");
    const blob = new Blob([head + "\n" + P.timelineCsv(site, sim)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `landing-${sel.id}-${new Date(t).toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = () => {
    const txt = [`${sel.name} · ${utc(t)} · ${LABEL[overall]}`, ...rows.map((r) => `${LABEL[r.s].padEnd(8)} ${r.k}: ${r.v}`)].join("\n");
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <aside className="eng glass" aria-label="Engineer mode: landing readiness">
      <div className="eng-head">
        <div>
          <h2>Landing readiness</h2>
          <p>{sel.name} · {utc(t)}</p>
        </div>
        <button className="eng-x" onClick={onClose} aria-label="Close engineer mode">×</button>
      </div>

      <div className={"eng-verdict " + overall}>
        <b>{LABEL[overall]}</b>
        <span>
          {overall === "go" ? "Every check passes for this spot and time." : `${rows.filter((r) => r.s === "nogo").length} no-go, ${rows.filter((r) => r.s === "caution").length} caution.`}
        </span>
      </div>

      <table className="eng-go">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} title={r.why}>
              <td><span className={"pill " + r.s}>{LABEL[r.s]}</span></td>
              <th>{r.k}</th>
              <td className="v">{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h3>Touchdown point</h3>
        <dl className="eng-dl">
          <dt>Site</dt><dd>{f(sel.lat, 3)}°, {f(P.norm180(sel.lon), 3)}°</dd>
          <dt>Spot offset</dt><dd>{f(spot.x, 0)} m E, {f(spot.y, 0)} m N</dd>
          {terrain && <><dt>Elevation</dt><dd>{f(terrain.elev, 0)} m (LOLA datum)</dd></>}
          {terrain && <><dt>Slope, mean / max</dt><dd>{f(terrain.mean)}° / {f(terrain.max)}°</dd></>}
          {terrain && <><dt>Roughness</dt><dd>{f(terrain.rough, 2)} m RMS</dd></>}
          {terrain && <><dt>Backup spot</dt><dd>{terrain.backup ? `${f(terrain.backup.d, 0)} m away, safe and lit` : "none in the 2 km patch"}</dd></>}
          <dt>Artemis zone</dt><dd>{A.inZone ? "Yes (south of 84° S)" : "No"}</dd>
        </dl>
      </section>

      <section>
        <h3>Sun and power</h3>
        <dl className="eng-dl">
          <dt>Sun az / el</dt><dd>{f(now.sunAz)}° / {f(now.sunEl, 2)}°</dd>
          <dt>Terrain horizon toward Sun</dt><dd>{f(now.sunHorizon, 2)}°</dd>
          <dt>Array output</dt><dd>{f(now.powerW, 0)} W of {P.DEFAULT_POWER.arrayPeakW} W</dd>
          <dt>Net power at touchdown</dt><dd className={now.powerW >= P.DEFAULT_POWER.loadW ? "ok" : "bad"}>{now.powerW - P.DEFAULT_POWER.loadW >= 0 ? "+" : ""}{f(now.powerW - P.DEFAULT_POWER.loadW, 0)} W</dd>
          <dt>Mean power, {MISSION_DAYS} d</dt><dd>{f(sim.stats.meanPowerW, 0)} W</dd>
          <dt>Sunlit, {MISSION_DAYS} d</dt><dd>{f(sim.stats.sunPct, 0)}%</dd>
          <dt>Next {A.sunEvent.up ? "sunset" : "sunrise"}</dt><dd>{A.sunEvent.hours === null ? "none in 30 days" : "in " + fmtHours(A.sunEvent.hours)}</dd>
        </dl>
      </section>

      <section>
        <h3>Communications</h3>
        <dl className="eng-dl">
          <dt>Earth az / el</dt><dd>{f(now.earthAz)}° / {f(now.earthEl, 2)}°</dd>
          <dt>Clearance over terrain</dt><dd>{f(now.earthClearance, 2)}°</dd>
          <dt>Range / light time</dt><dd>{f(now.earthRangeKm, 0)} km / {f(lightS, 2)} s</dd>
          <dt>Path loss (S-band)</dt><dd>{f(now.fsplDb)} dB</dd>
          <dt>Link margin, 2 Mbps</dt><dd>{f(now.linkMarginDb)} dB</dd>
          <dt>Next {A.earthEvent.up ? "Earthset" : "Earthrise"}</dt><dd>{A.earthEvent.hours === null ? "none in 30 days" : "in " + fmtHours(A.earthEvent.hours)}</dd>
          <dt>Downlink, {MISSION_DAYS} d</dt><dd>about {f(dataGB, 0)} GB</dd>
        </dl>
      </section>

      <section>
        <h3>Mission timeline</h3>
        <ol className="eng-tl">
          {events.map((e) => (
            <li key={e.name}><span>{e.name}</span><time>{utc(e.ms)}</time></li>
          ))}
        </ol>
        <p className="eng-note">Powered descent lasts {Math.round(pdSec / 60)} min; launch must be about {Math.round(PHASES.reduce((s, p) => s + p.real, 0) / 86400 * 10) / 10} days before touchdown.</p>
      </section>

      <section>
        <h3>Propulsion budget <small>illustrative lander</small></h3>
        <dl className="eng-dl">
          <dt>Δv: LOI / DOI / descent / reserve</dt><dd>{DV.loi} / {DV.doi} / {DV.pd} / {DV.reserve} km/s</dd>
          <dt>Total Δv</dt><dd>{f(dvTotal, 2)} km/s</dd>
          <dt>Landed mass (dry + payload)</dt><dd>{landed} kg</dd>
          <dt>Propellant at TLI (Isp {LANDER.ispS} s)</dt><dd>{f(prop, 0)} kg</dd>
          <dt>Of which powered descent</dt><dd>{f(pdProp, 0)} kg</dd>
          <dt>Thrust / weight at landing, full throttle</dt><dd>{f(twr, 2)} (lunar g)</dd>
        </dl>
      </section>

      <section>
        <h3>Better dates at this spot</h3>
        <p className="eng-note">Score for a {MISSION_DAYS}-day surface mission starting that day (sunlight, Earth in view, long nights penalised). Today: {f(windows.todayScore, 0)}.</p>
        <ul className="eng-win">
          {windows.best.map((d) => (
            <li key={d}>
              <span>{new Date(windows.day0 + d * 86400000).toISOString().slice(0, 10)}</span>
              <span>score {f(windows.scan.score[d], 0)}</span>
              <span>Sun {f(windows.scan.sunPct[d], 0)}% · Earth {f(windows.scan.earthPct[d], 0)}%</span>
              <button className="btn small" onClick={() => onTime(windows.day0 + d * 86400000 + (t % 86400000))}>Use</button>
            </li>
          ))}
        </ul>
      </section>

      <div className="eng-actions">
        <button className="btn small" onClick={csv}>Download report (CSV)</button>
        <button className="btn small" onClick={copy}>{copied ? "Copied" : "Copy summary"}</button>
      </div>
      <p className="eng-note">Ephemeris, horizons and slopes: NASA LOLA and analytic lunar theory, as in the rest of the app. Lander mass, power, thermal and radio figures describe an illustrative small lander, not a specific vehicle.</p>
    </aside>
  );
}
