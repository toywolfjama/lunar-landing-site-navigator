# Lunar Landing Site Navigator

NASA Space Apps Challenge entry. Compare lunar south-pole landing sites and dates by what matters on the surface:
is the Sun above the local horizon (power), and is Earth above it (direct-to-Earth radio)?

**Live demo:** `https://toywolfjama.github.io/lunar-landing-site-navigator/` (after enabling GitHub Pages)

## What it does

- Computes Sun and Earth azimuth/elevation at a site for any date (analytic ephemeris, checked against JPL Horizons
  to within 0.06 deg on 16 dates in Feb-May 2027).
- Uses real NASA LRO LOLA terrain (LDEM_80S_20M and LDEM_75S_240M) to build a horizon mask for 441 lander positions
  at each of three south-pole sites: Shackleton Connecting Ridge, Malapert Massif, Mons Mouton.
- Simulates 30 days of sunlight, Earth link and battery charge, with time to next sunset / Earthset.
- Lets you nudge the lander in 100 m steps, slip the launch date by up to 30 days, and compare sites side by side.
- Flight Engineer mode (raw telemetry) and Explorer mode (plain-English explanations).
- Guided tour and a 15-second "crisis triage" game for demos.

## Run it

Open `index.html` in a browser. It is one self-contained file and needs no server and no network.

## Source

| File | Purpose |
|---|---|
| `src/physics/lunarAstronomy.ts` | Ephemeris, local sky geometry, power, link budget, timeline simulation. No UI code. |
| `src/physics/lolaData.ts` | LOLA terrain extract: elevation grids and precomputed horizon masks. |
| `src/App.tsx` | React user interface. |
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

- Horizon masks are sampled at 1 deg of azimuth with 20 m terrain near the lander; boulder-scale relief is absent.
- Physical libration, nutation and ground-station position on Earth are not modelled.
- Lander power and radio figures (480 W array, 140 W load, 3.6 kWh battery, S-band link) are illustrative assumptions.
- Chandrayaan-3, Apollo 11 and custom coordinates use a smooth-sphere horizon (no terrain loaded).

## Use of AI

This project was built with the help of Claude (Anthropic), including code generation and data extraction.
