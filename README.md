# Lunar Landing Site Navigator

NASA Space Apps Challenge entry. Compare lunar south-pole landing sites and dates by what matters on the surface:
is the Sun above the local horizon (power), and is Earth above it (direct-to-Earth radio)?

**Live demo:** `https://toywolfjama.github.io/lunar-landing-site-navigator/` (after enabling GitHub Pages)

## What it does

- Computes Sun and Earth azimuth/elevation at a site for any date (analytic ephemeris, checked against JPL Horizons
  to within 0.06 deg on 16 dates in Feb-May 2027).
- Uses real NASA LRO LOLA terrain (LDEM_80S_20M and LDEM_75S_240M) to build a horizon mask for 441 lander positions
  at each of four south-pole sites: Shackleton Connecting Ridge, Malapert Massif, Mons Mouton, and the IM-2 Athena
  landing site (a real CLPS landing, 6 March 2025).
- Simulates 30 days of sunlight, Earth link and battery charge, with time to next sunset / Earthset.
- Lets you nudge the lander in 100 m steps, slip the launch date by up to 30 days, and compare sites side by side.
- Landing window finder: scans the next 12 months for the best 14-day landing dates at the chosen position.
- Scenario comparison: pin site/position/date combinations and compare them side by side.
- Copyable plain-text site brief for handing a scenario to another team.
- One-click best-cell search, CSV export of the 30-day timeline, and a top-down polar view of sunlight and Earth direction.
- Landing-surface check: slope and roughness of every 100 m cell from the 20 m LOLA data, with a hazard overlay
  (flat up to 8 deg, caution to 15 deg, hazard above).
- Two sections: **Mission Planner** (the analysis tool) and **Lander Game**, a physics landing simulator flown over
  a real LOLA terrain cross-section with lunar gravity, limited fuel and touchdown limits on speed, tilt and slope.
- Flight Engineer mode (raw telemetry) and Explorer mode (plain-English explanations).
- Tries a live JPL Horizons feed for the chosen date and falls back to the built-in engine if the call is blocked.
- Three survival gauges (battery, comms link, solar efficiency), a guided tour and a 15-second "crisis triage" game
  with a 5-nudge fuel budget and a 14-day survival test.

## Validation

| Check | Result |
|---|---|
| Sun and Earth positions vs JPL Horizons (16 dates, Feb-May 2027) | Sub-Earth point within 0.04 deg, sub-solar point within 0.06 deg, range within 190 km |
| Illumination vs published LOLA modelling (Glaser et al. 2018) | Sunniest cell on the Shackleton ridge patch: 90.9% over 2027-2028 here, against 88.0% published maximum average at surface level on the same ridge |
| IM-2 Athena hindcast (6 March 2025, about 17:30 UTC) | Tool reports Sun 2.5 deg up and unobstructed, Earth 12 deg clear, 3.6 deg slope. The lander tipped in a small crater below the 20 m data resolution |

## Run it

Open `index.html` in a browser. It is one self-contained file and needs no server. It works offline; with a
network it also tries the live JPL Horizons feed.

## Source

| File | Purpose |
|---|---|
| `src/physics/lunarAstronomy.ts` | Ephemeris, local sky geometry, power, link budget, timeline simulation. No UI code. |
| `src/physics/lolaData.ts` | LOLA terrain extract: elevation grids and precomputed horizon masks. |
| `src/App.tsx` | React user interface (Mission Planner). |
| `src/Lander.tsx` | Landing simulator game. |
| `src/styles.css` | Styles. |
| `build.mjs` | Inlines the bundle and styles into `index.html`. |

Rebuild (requires [Bun](https://bun.sh) and `bun add react react-dom`):

```
bun build src/main.tsx --outfile dist/main.js --minify --target browser --define process.env.NODE_ENV='"production"'
node build.mjs
```

## Data sources

- NASA PDS Geosciences Node, LRO LOLA gridded polar elevation models:
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
- JPL Horizons (validation reference): https://ssd.jpl.nasa.gov/horizons/
- LROC Quickmap: https://quickmap.lroc.im-ldi.com/ and NASA Moon Trek: https://trek.nasa.gov/moon/
- CSA Moon exploration: https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/

## Known limits

- Slope is measured over 20 m baselines; rocks and craters smaller than that are invisible. The 8 and 15 deg limits are
  illustrative, not any specific lander's tolerance.
- Horizon masks are sampled at 1 deg of azimuth with 20 m terrain near the lander; boulder-scale relief is absent.
- Physical libration, nutation and ground-station position on Earth are not modelled.
- Lander power and radio figures (480 W array, 140 W load, 3.6 kWh battery, S-band link) are illustrative assumptions.
- Chandrayaan-3, Apollo 11 and custom coordinates use a smooth-sphere horizon (no terrain loaded).

## Use of AI

This prototype's architecture, React components and data pipeline were generated with AI (Claude Fable 5.2,
Anthropic). The terrain is NASA LOLA data, not AI-generated. The app footer and the top of `src/App.tsx` carry the
same disclosure.
