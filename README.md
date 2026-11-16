# Lunar Landing Site Navigator

NASA Space Apps Challenge entry. Everything is on one page: check a landing site, then fly a lander there.

**Live demo:** `https://toywolfjama.github.io/lunar-landing-site-navigator/` (after enabling GitHub Pages)

## What it does

- **Earth and the Moon in 3D** (not to scale), both lit by the real Sun for the chosen time. Earth is turned to its
  real sidereal angle and the Moon to its real libration. Drag to orbit, scroll or pinch to zoom, right-drag to pan,
  or jump to **Earth & Moon**, **Moon**, **Landing site**, **Cinematic** or **Chase**.
- **The landing site up close:** NASA LOLA 20 m terrain around the preset site, with generated craters and ground
  out to 15 km. Click the ground to move the touchdown spot; turn on slope colours to see where it is safe.
- **One preset mission** to the Shackleton Connecting Ridge (0.55° from the south pole), plus **your own landings**:
  click anywhere on the Moon to land there, name it and save it (kept in your browser).
- **Three checks and a verdict** for the touchdown time and spot:

| Check | Passes when | Data |
|---|---|---|
| Sunlight for power | The Sun's disc is at least half above the real terrain horizon | Ephemeris + LOLA horizon mask |
| Radio link to Earth | Earth is above the real terrain horizon (no relay assumed) | Ephemeris + LOLA horizon mask |
| Safe ground | The steepest 20 m facet in the 100 m landing cell is under 10° | LOLA 20 m elevation model |

- **Land here:** a 3D lander flies the whole trip, Earth to touchdown, as a cinematic sequence of shots: trans-lunar
  coast, lunar orbit insertion, 100 km orbit, descent orbit insertion, coast to 15 km, braking burn, approach,
  terminal descent and touchdown (slow motion near the ground). Play, pause, 0.25x to 8x speed, scrub, or jump to any
  phase; altitude, speed and vertical speed are shown live. On ground steeper than 15° the lander tips over. After
  touchdown its dish turns to Earth if Earth is in view.
- **About and judging:** how the project meets each Space Apps judging criterion, the Artemis limits used, data
  sources, validation and limits.

## Space Apps judging criteria

Space Apps judges score every project on Impact, Creativity, Validity, Relevance and Presentation
([Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/)).

| Criterion | Judges ask | Where this project answers it |
|---|---|---|
| Impact | How much impact can it have? Big or little problem? Helps many or few? | Every lander needs power, radio and flat ground; IM-1 and IM-2 both tipped over. Anyone can check all three and watch the landing, free and offline. |
| Creativity | Novel, or incremental? | From Earth and the Moon down to NASA terrain on one page, with a cinematic landing you can speed up, slow down and scrub. |
| Validity | Scientifically valid? Will it work in the real world? | Ephemeris checked against JPL Horizons, NASA LOLA terrain, published illumination check, IM-2 hindcast, stated limits. |
| Relevance | Responsive to the challenge, complete, feasible, usable? | Pick a time and spot, get three checks and a go/no-go using the Artemis limits, press Land. One HTML file, no install. |
| Presentation | Does it tell the story of the challenge and the solution? | The landing tells it: broadcast-style shots from Earth departure to a slow-motion touchdown, with live telemetry. |

Artemis landing limits used, from NASA's Artemis overview at the 2025 International Space Apps Challenge
(NTRS 20250009323): land within 6° of the south pole; slope under 10° across a 100 m landing area; direct-to-Earth
communication with no relay assumed; lighting near the pole changes constantly.

## Validation

| Check | Result |
|---|---|
| Sun and Earth positions vs JPL Horizons (16 dates, Feb-May 2027) | Sub-Earth point within 0.04°, sub-solar point within 0.06°, range within 190 km |
| Earth's rotation (2026 March equinox 14:46 UTC, June solstice 12:00 UTC) | Sub-solar point on Earth within 0.1° of the expected latitude and longitude |
| Illumination vs published LOLA modelling (Glaser et al. 2018) | Sunniest spot on the Shackleton ridge: 90.9% of 2027-2028 here, against 88.0% published for the same ridge |
| IM-2 Athena hindcast (6 March 2025, about 17:30 UTC) | Sun 2.5° up and unobstructed, Earth 12° clear, 3.6° slope. The lander tipped in a crater smaller than the 20 m data can show |

## Run it

Open `index.html` in a browser with WebGL. It is one self-contained file, needs no server and works offline.

## Source

| File | Purpose |
|---|---|
| `src/physics/lunarAstronomy.ts` | Ephemeris, Earth-Moon-Sun frames, local sky, horizon masks, slope. No UI code. |
| `src/physics/lolaData.ts` | LOLA terrain extract: elevation grids and precomputed horizon masks. |
| `src/checks.ts` | The three landing checks for a site, touchdown cell and time. |
| `src/Mission.tsx` | The page: 3D scene, camera views, playback, panel and checks. |
| `src/scene/terrain.ts` | Ground around the site: LOLA 20 m mesh plus generated surroundings. |
| `src/scene/lander.ts` | The 3D lander: body, legs, engine, panels, dish, plume, dust and landing lights. |
| `src/scene/trajectory.ts` | The trip from Earth to touchdown, phase by phase. |
| `src/scene/cinema.ts` | The cinematic camera: one shot per moment of the mission. |
| `src/landings.ts` | The preset mission and the shape of a landing site. |
| `src/About.tsx` | Judging criteria, Artemis limits, data sources, validation and limits. |
| `assets/` | NASA Moon (LRO LROC) and Earth (Blue Marble) colour maps, public domain. |
| `build.mjs` | Inlines the bundle, styles and textures into `index.html`. |

Rebuild (requires [Bun](https://bun.sh) and Node):

```
bun install
bun run build
```

## Data sources

- NASA PDS Geosciences Node, LRO LOLA gridded polar elevation models (LDEM_80S_20M, LDEM_75S_240M):
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
- JPL Horizons (validation reference): https://ssd.jpl.nasa.gov/horizons/
- Moon image: NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC colour map): https://svs.gsfc.nasa.gov/4720
- Earth image: NASA Visible Earth, Blue Marble, as bundled in the MIT-licensed `earth-visualization` npm package:
  https://visibleearth.nasa.gov/collection/1484/blue-marble
- Artemis landing limits: https://ntrs.nasa.gov/citations/20250009323
- Libraries: three.js (MIT) and React (MIT).

## Known limits

- Earth and the Moon are not drawn to scale, and the trajectory is an illustrative profile with Apollo-style gates,
  not a flight-dynamics solution.
- Slope is measured over 20 m baselines; rocks and craters smaller than that are invisible.
- Only the preset site uses LOLA terrain. For your own landings the horizon is a smooth Moon, slope is unknown and the
  ground shown is generated.
- Earth's orientation uses mean sidereal time without nutation; the radio check ignores ground-station position on
  Earth and assumes no relay.

## Use of AI

This prototype's architecture, React components and data pipeline were generated with AI (Claude Fable 5.2,
Anthropic). The terrain is NASA LOLA data, not AI-generated. The top of `src/App.tsx` carries the same disclosure.
