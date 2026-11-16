/* The one information sheet: how the project meets each Space Apps judging criterion, the Artemis limits the checks
   use, where every number comes from, how it was validated, and what it cannot see.
   Criteria wording: Space Apps Judging & Awards Guide. Artemis limits: NASA's Artemis overview for the 2025
   International Space Apps Challenge (NTRS 20250009323). */
import React, { useEffect } from "react";

const CRITERIA: { k: string; q: string; a: string }[] = [
  {
    k: "Impact",
    q: "How much impact can this project have? Does it solve a big problem or a little problem? Will it inspire or help many, or a few?",
    a: "Every Moon lander needs sunlight for power, a line of sight to Earth for radio, and flat ground. IM-1 and IM-2 both tipped over near the south pole and ended their missions early. Anyone, from a mission team to a classroom, can check all three for any site and time in seconds, free and offline.",
  },
  {
    k: "Creativity",
    q: "How creative and innovative is the approach? Is it novel, or an incremental improvement on something that already exists?",
    a: "Earth and the Moon in 3D at true scale, lit by the real Sun, with the radio path drawn from Earth to the landing site. You can orbit around them, zoom from both worlds down to a single crater, and land anywhere with one click.",
  },
  {
    k: "Validity",
    q: "Is the solution scientifically valid? Will it do what it sets out to do? Can it work in the real world?",
    a: "Positions come from a published ephemeris checked against JPL Horizons, horizons and slopes from NASA LOLA elevation data, and the results were checked against published illumination and a real landing (see Validation below). Limits are stated, not hidden.",
  },
  {
    k: "Relevance",
    q: "Is the project responsive to the challenge? Is it a complete solution? Is it technically feasible? How usable or user friendly is it?",
    a: "One screen answers the site-selection question: pick a site and a time, get three checks and a go or no-go, using the Artemis limits below. It is complete and runs today as one HTML file, with no install and no account.",
  },
  {
    k: "Presentation",
    q: "How well did the team communicate the project? Did they tell the story of the challenge, the solution, and why it matters?",
    a: "The opening picture tells the story: Earth, the Moon, the sunlight, and the radio path between them, which turns red when it is blocked. Every check is written in plain language and ends in one verdict.",
  },
];

const ARTEMIS: [string, string][] = [
  ["Land within 6° of latitude of the south pole", "The dashed ring on the Moon; all four terrain sites sit inside it."],
  ["Slope under 10° across a 100 m landing area", "Safe ground: the steepest 20 m facet in the 100 m landing area must be under 10°."],
  ["Direct-to-Earth communication, no relay assumed", "Radio link: Earth must be above the real terrain horizon."],
  ["Lighting near the pole changes constantly", "Each check gives the share of the next 30 days in sunlight and in view of Earth."],
];

const SOURCES: [string, string, string][] = [
  ["Terrain, horizons and slopes", "NASA LRO LOLA polar elevation models (LDEM_80S_20M, LDEM_75S_240M)", "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"],
  ["Sun, Earth and Moon positions", "Meeus lunar and solar series, checked against JPL Horizons", "https://ssd.jpl.nasa.gov/horizons/"],
  ["Moon image", "NASA SVS CGI Moon Kit, LRO LROC colour map (public domain)", "https://svs.gsfc.nasa.gov/4720"],
  ["Earth image", "NASA Visible Earth, Blue Marble (public domain)", "https://visibleearth.nasa.gov/collection/1484/blue-marble"],
  ["Landing coordinates", "NASA NSSDCA and LROC landing-site solutions; ISRO, CNSA, JAXA, Intuitive Machines and Firefly", "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html"],
  ["Artemis landing limits", "NASA Artemis overview, 2025 International Space Apps Challenge", "https://ntrs.nasa.gov/citations/20250009323"],
];

const VALIDATION: string[] = [
  "Sun and Earth directions match JPL Horizons within 0.06° on 16 dates (February to May 2027).",
  "Earth's rotation puts the Sun overhead at the right place at the 2026 equinox and June solstice, within 0.1°.",
  "Sunniest spot on the Shackleton ridge: 90.9% of 2027-2028 in sunlight here, against 88.0% published for the same ridge (Glaser et al. 2018).",
  "IM-2 Athena, 6 March 2025 about 17:30 UTC: Sun 2.5° up, Earth in clear view, 3.6° slope. The crater it tipped into is smaller than the 20 m LOLA grid can show.",
];

const LIMITS: string[] = [
  "Rocks and craters smaller than 20 m are invisible to the slope check.",
  "Only the four south-pole sites have LOLA terrain here. Everywhere else, including your own landings, the horizon is a smooth Moon and slope is unknown.",
  "Earth's orientation uses mean sidereal time without nutation, and the radio check ignores ground-station position on Earth.",
];

export function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-h" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div>
            <span className="eyebrow">NASA International Space Apps Challenge</span>
            <h2 id="about-h">About and judging</h2>
          </div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>

        <ol className="crit">
          {CRITERIA.map((c, i) => (
            <li key={c.k}>
              <div className="crit-h">
                <span className="n">{i + 1}</span>
                <h3>{c.k}</h3>
              </div>
              <p className="q">“{c.q}”</p>
              <p>{c.a}</p>
            </li>
          ))}
        </ol>

        <section>
          <h3>Artemis landing limits used</h3>
          <table className="tbl">
            <tbody>
              {ARTEMIS.map(([a, b]) => (
                <tr key={a}>
                  <th scope="row">{a}</th>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Data sources</h3>
          <table className="tbl">
            <tbody>
              {SOURCES.map(([a, b, url]) => (
                <tr key={a}>
                  <th scope="row">{a}</th>
                  <td>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {b}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Validation</h3>
          <ul>
            {VALIDATION.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Limits</h3>
          <ul>
            {LIMITS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
