# Lunar Landing Site Navigator

NASA Space Apps Challenge entry. One question, one screen: **can a lander work at this site at this time?**

**Live demo:** `https://toywolfjama.github.io/lunar-landing-site-navigator/` (after enabling GitHub Pages)

## What it does

- **Earth and the Moon in 3D, at true scale** (sizes and distance), both lit by the real Sun. Earth is turned to its
  real sidereal angle and the Moon to its real libration. Drag to orbit, right-drag or Shift-drag to pan, scroll or
  pinch to zoom, or jump to **Earth**, **Earth + Moon** or **Moon**. A scale bar shows the distance on screen.
- **The radio path:** a line from Earth to the landing site, green when the site can see Earth and red when it can't,
  with the distance and the light-time.
- **Three checks and one verdict** for the chosen site and time:

| Check | Passes when | Data |
|---|---|---|
| Sunlight for power | The Sun's disc is at least half above the real terrain horizon | Ephemeris + LOLA horizon mask |
| Radio link to Earth | Earth is above the real terrain horizon (no relay assumed) | Ephemeris + LOLA horizon mask |
| Safe ground | The steepest 20 m facet in the 100 m landing area is under 10° | LOLA 20 m elevation model |

  Each check also gives the share of the next 30 days in sunlight and in view of Earth. The verdict is **Go** only
  when every check passes.
- **Sites:** four south-pole sites with LOLA terrain (Shackleton Connecting Ridge, Malapert Massif, Mons Mouton and
  the IM-2 Athena landing site), all 28 past soft landings, and **your own landings**: click anywhere on the Moon to
  land there, name it and save it (kept in your browser).
- **About and judging:** how the project meets each Space Apps judging criterion, the Artemis limits used, data
  sources, validation and limits.

## Space Apps judging criteria

Space Apps judges score every project on Impact, Creativity, Validity, Relevance and Presentation
([Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/)).

| Criterion | Judges ask | Where this project answers it |
|---|---|---|
| Impact | How much impact can it have? Big or little problem? Helps many or few? | Every lander needs power, radio and flat ground; IM-1 and IM-2 both tipped over. Anyone can check all three in seconds, free and offline. |
| Creativity | Novel, or incremental? | Earth and Moon in 3D at true scale, lit by the real Sun, with the radio path drawn to the site; land anywhere with one click. |
| Validity | Scientifically valid? Will it work in the real world? | Ephemeris checked against JPL Horizons, NASA LOLA terrain, published illumination check, IM-2 hindcast, stated limits. |
| Relevance | Responsive to the challenge, complete, feasible, usable? | One screen: pick a site and time, get three checks and a go/no-go using the Artemis limits below. One HTML file, no install. |
| Presentation | Does it tell the story of the challenge and the solution? | The opening picture: Earth, Moon, sunlight and the radio path turning red when blocked. Plain-language checks, one verdict. |

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

Open `index.html` in a browser. It is one self-contained file, needs no server and works offline.

## Source

| File | Purpose |
|---|---|
| `src/physics/lunarAstronomy.ts` | Ephemeris, Earth-Moon-Sun frames, local sky, horizon masks, slope. No UI code. |
| `src/physics/lolaData.ts` | LOLA terrain extract: elevation grids and precomputed horizon masks for the four south-pole sites. |
| `src/EarthMoon.tsx` | The 3D true-scale scene, the radio path, the three checks, the verdict and custom landings. |
| `src/landings.ts` | Every lunar soft landing, with coordinates, dates and notes. |
| `src/About.tsx` | Judging criteria, Artemis limits, data sources, validation and limits. |
| `src/App.tsx` | Page shell. |
| `src/styles.css` | Styles. |
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
- Landing coordinates: NASA NSSDCA and the LROC team's landing-site solutions; ISRO, CNSA, JAXA, Intuitive Machines
  and Firefly releases.
- Artemis landing limits: https://ntrs.nasa.gov/citations/20250009323

## Known limits

- Slope is measured over 20 m baselines; rocks and craters smaller than that are invisible.
- Only the four south-pole sites have LOLA terrain here. Everywhere else, including your own landings, the horizon is a
  smooth Moon and slope is unknown.
- Earth's orientation uses mean sidereal time without nutation; the radio check ignores ground-station position on
  Earth and assumes no relay.
- The textures are 1024 x 512 (Moon) and 2048 x 1024 (Earth), so close-ups are for orientation, not site analysis.

## Use of AI

This prototype's architecture, React components and data pipeline were generated with AI (Claude Fable 5.2,
Anthropic). The terrain is NASA LOLA data, not AI-generated. The top of `src/App.tsx` carries the same disclosure.
