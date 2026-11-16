# Lunar Landing Site Navigator

NASA Space Apps Challenge entry. Compare lunar south-pole landing sites and dates by what matters on the surface:
is the Sun above the local horizon (power), and is Earth above it (direct-to-Earth radio)?

**Live demo:** `https://toywolfjama.github.io/lunar-landing-site-navigator/` (after enabling GitHub Pages)

## What it does

One question, one screen: **can a lander work at this site at this time?**

The app opens on Earth and the Moon side by side, both lit by the real Sun for the chosen time. A line runs from Earth
to the landing site: green and moving when the site can see Earth (radio path open), red and dashed when Earth is
below the site's horizon. Sizes and distance are not to scale; directions, rotation and lighting are.

Pick a site (the four south-pole sites with LOLA terrain, or any of the 28 past soft landings) and a time, and the
panel gives three checks and one verdict:

| Check | Rule | Source |
|---|---|---|
| Sunlight for power | Sun's disc at least half above the real terrain horizon | Ephemeris + LOLA horizon mask |
| Radio link to Earth | Earth above the real terrain horizon (no relay assumed) | Ephemeris + LOLA horizon mask |
| Safe ground | Steepest 20 m facet in the 100 m landing area under 10° | LOLA 20 m elevation model |

Each check also gives the share of the next 30 days in sunlight and in view of Earth. The verdict is **Go** only when
all three pass. Earth is turned to its real sidereal angle and the Moon to its real libration, from the same Meeus
series the planner uses.

Every criterion Space Apps judges on (Impact, Creativity, Validity, Relevance, Presentation) is linked from the bottom
of the panel to the **Space Apps rubric** sheet, which says how the project answers it.

**Advanced tools** (one click away) keep the full depth: a Moon globe of every landing, the Mission Planner and the
Lander Game.

The **Mission Planner**:

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
- Advanced sections: **Moon globe**, **Mission Planner** (the analysis tool) and **Lander Game**, a physics landing simulator flown over
  a real LOLA terrain cross-section with lunar gravity, limited fuel and touchdown limits on speed, tilt and slope.
- Lander configuration: set your own array size, power load, battery and safe-slope limit.
- Share links: one click produces a link that reopens the same site, position, date and lander settings.
- Bring your own terrain: select NASA's `LDEM_80S_20M.IMG` (and optionally `LDEM_75S_240M.IMG`) and the app builds
  the horizon masks for any site south of 80.3 deg S in the browser.
- Explorer text in English, Spanish and French (machine translated).
- Thermal check: a simple lander temperature model with heaters shows whether the vehicle stays above its survival
  limit through each eclipse.
- Relay option: see how a relay orbiter would change each site's communications.
- Flight Engineer mode (raw telemetry) and Explorer mode (plain-English explanations).
- Tries a live JPL Horizons feed for the chosen date and falls back to the built-in engine if the call is blocked.
- Three survival gauges (battery, comms link, solar efficiency), a guided tour and a 15-second "crisis triage" game
  with a 5-nudge fuel budget and a 14-day survival test.

## Space Apps judging criteria

Space Apps judges score every project on Impact, Creativity, Validity, Relevance and Presentation (Space Apps Judging
& Awards Guide; the same five appear in the 2025 project submission guide). The in-app **Space Apps rubric** maps each
one to a feature you can open directly:

| Criterion | Judges ask | Where this project answers it |
|---|---|---|
| Impact | How much impact can it have? Big or little problem? Helps many or few? | Every lander needs power, radio and flat ground; IM-1 and IM-2 both tipped over. Anyone can check all three in seconds, free and offline. |
| Creativity | Novel, or incremental? | Earth and Moon in one view, lit by the real Sun, with the radio path drawn to the site; a terrain planner and playable landing behind it. |
| Validity | Scientifically valid? Will it work in the real world? | Horizons match within 0.06 deg, Earth rotation within 0.1 deg, published illumination check, IM-2 hindcast, stated limits. |
| Relevance | Responsive to the challenge, complete, feasible, usable? | One screen: pick a site and time, get three checks and a go/no-go using the Artemis limits below. One HTML file, no install. |
| Presentation | Does it tell the story of the challenge and the solution? | The opening picture tells it: Earth, Moon, sunlight and the radio path turning red when blocked. Plain-language checks, one verdict, guided tour. |

Artemis landing constraints used, from NASA's Artemis overview at the 2025 International Space Apps Challenge
(NTRS 20250009323): land within 6 deg of the south pole; slope under 10 deg across a 100 m landing area; direct-to-Earth
communication with no relay assumed; lighting near the pole changes constantly.

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
| `src/App.tsx` | React user interface (sections, Mission Planner). |
| `src/EarthMoon.tsx` | Opening screen: Earth and Moon scene, radio path, the three checks and the verdict. |
| `src/MoonGlobe.tsx` | Moon globe: WebGL sphere lit by the ephemeris Sun, landing markers, list and time slider. |
| `src/landings.ts` | Every lunar soft landing, with coordinates, dates and notes. |
| `src/Rubric.tsx` | Space Apps judging criteria and how the project answers them. |
| `assets/moon_lroc_1k.jpg` | NASA LRO LROC colour map from the NASA SVS CGI Moon Kit (public domain). |
| `assets/earth_bluemarble_2k.jpg` | NASA Blue Marble Earth colour map (public domain), resized to 2048 x 1024. |
| `src/Lander.tsx` | Landing simulator game. |
| `src/i18n.ts` | Explorer-mode text in English, Spanish and French. |
| `src/styles.css` | Styles. |
| `build.mjs` | Inlines the bundle and styles into `index.html`. |

Rebuild (requires [Bun](https://bun.sh) and Node):

```
bun install
bun run build
```

`build.mjs` inlines the bundle, the styles and the Earth and Moon textures (`assets/`) into `index.html`.

## Data sources

- Moon texture: NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC colour mosaic with polar fill):
  https://svs.gsfc.nasa.gov/4720
- Earth texture: NASA Visible Earth, Blue Marble (public domain), as bundled in the MIT-licensed
  `earth-visualization` npm package: https://visibleearth.nasa.gov/collection/1484/blue-marble
- Landing coordinates: NASA NSSDCA mission pages and the LROC team's landing-site solutions; ISRO, CNSA, JAXA,
  Intuitive Machines and Firefly releases.
- Space Apps judging criteria: https://www.spaceappschallenge.org/resources/judging-awards-guide
- Artemis landing constraints: https://ntrs.nasa.gov/citations/20250009323
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
- The thermal model is a single lumped node with illustrative values; the relay option assumes continuous coverage.
- Lander power and radio figures (480 W array, 140 W load, 3.6 kWh battery, S-band link) are illustrative assumptions.
- Chandrayaan-3, Apollo 11, every other globe landing opened in the planner, and custom coordinates use a
  smooth-sphere horizon (no terrain loaded).
- The Earth-Moon view is not to scale (the Moon is drawn larger and much closer). Earth's orientation uses mean
  sidereal time without nutation, and the camera's "up" is ecliptic north.
- The globe texture is 1024 x 512 (about 10 km per pixel), so it is for orientation, not site analysis; the globe's
  Sun and Earth elevations ignore terrain.

## Use of AI

This prototype's architecture, React components and data pipeline were generated with AI (Claude Fable 5.2,
Anthropic). The terrain is NASA LOLA data, not AI-generated. The app footer and the top of `src/App.tsx` carry the
same disclosure.
