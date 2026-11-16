# LunaPoint

Pick a spot on the Moon and a time. LunaPoint tells you if a lander there would have sunlight, a radio link to Earth and flat enough ground. Then you can watch it land.

**Try it:** https://toywolfjama.github.io/lunar-landing-site-navigator/

Made by Team MC (Connor B, Max K) for the 2026 NASA Space Apps Challenge.

## Why

Near the Moon's south pole the Sun barely clears the horizon. Moving a few hundred metres, or landing a few days later, can decide whether a lander gets power and can talk to Earth. Two recent landers (IM-1 and IM-2) also tipped over on rough ground. We wanted one page where anyone can check a site in seconds.

## How to use it

1. Pick a landing site from the list, or click anywhere on the Moon.
2. Set the touchdown time, or leave it on now.
3. Read the three checks: sunlight, radio link and slope. You get a go or no-go.
4. Press **Find the best spot** to move to the flattest sunlit spot nearby.
5. Press **Land here** to fly the mission from Earth to touchdown.

Other things to try:

- **Go / No-Go** (top right) opens a detailed sheet: battery and temperature over 14 days, radio during the descent, a mission timeline and better dates to land.
- **Compare** shows what happens to the same spot if the launch slips a week or more.
- **30-second demo** walks through all of it on its own.

## How it works

- We calculate where the Sun and Earth are in the sky from the site at any time.
- We trace the real horizon from the site using NASA's LOLA elevation data, so hills and crater rims block the Sun and Earth like they would in real life.
- Slope comes from the same data. We use NASA's Artemis limit of 10° over a 100 m area.

## Does it match reality?

- Our Sun and Earth positions match NASA JPL Horizons to within 0.06° on 16 test dates.
- Our sunniest spot on the Shackleton ridge is lit 90.9% of the time over 2027 and 2028. Published research gives 88.0% for the same ridge.
- Replaying the IM-2 landing (6 March 2025) shows sunlight, Earth in view and a 3.6° slope. IM-2 tipped in a crater smaller than the 20 m data can show, which is the main limit of this tool.

## Limits

- Earth and the Moon are not to scale, and the flight path is for show, not a real trajectory.
- Rocks and craters smaller than 20 m don't show up in the slope check.
- The radio check doesn't know where the ground station is on Earth.
- The lander's battery, fuel and radio numbers are for a sample lander, not a real one.

## Data

- [NASA LRO LOLA elevation data](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/): terrain, horizons and slope
- [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/): to check our Sun and Earth positions
- [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) and [Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble): Moon and Earth images
- [NASA Artemis overview (NTRS 20250009323)](https://ntrs.nasa.gov/citations/20250009323): the landing limits
- Landing site coordinates from NASA NSSDCA, the LROC team, ISRO, CNSA, JAXA, Intuitive Machines and Firefly

## Run it yourself

Open `index.html` in any browser. It's one file and works offline.

To rebuild from source you need [Bun](https://bun.sh):

```
bun install
bun run build
```

Built with TypeScript, React and three.js.

## AI use

We used AI (Claude, by Anthropic) to write most of the code and to draft this README, the slides and the project description. We chose the features, tested every version and decided what to change. The terrain is real NASA data, not AI-generated. The same note is at the top of `src/App.tsx`.
