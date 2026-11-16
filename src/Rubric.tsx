/* NASA Space Apps judging rubric, and how this project answers each criterion.
   Criteria wording: Space Apps Judging & Awards Guide (the same five criteria are used in the 2025 submission guide).
   Artemis constraints: NASA's Artemis overview for the 2025 International Space Apps Challenge (NTRS 20250009323). */
import React, { useEffect } from "react";

export type RubricTarget = "moon" | "planner" | "game" | "tour" | "provenance";

const CRITERIA: { k: string; q: string; a: string[]; go: RubricTarget; goLabel: string }[] = [
  {
    k: "Impact",
    q: "How much impact can this project have? Does it solve a big problem or a little problem? Will it inspire or help many, or a few?",
    a: [
      "At the south pole a few hundred metres decide whether a lander has sunlight and a radio link. IM-1 and IM-2 both tipped over on rough ground and ended their missions early.",
      "Anyone, from a mission team to a classroom, can check power, Earth contact and slope for any site and date in seconds, offline, in English, Spanish or French.",
    ],
    go: "moon",
    goLabel: "See every landing on the Moon",
  },
  {
    k: "Creativity",
    q: "How creative and innovative is the approach? Is it novel, or an incremental improvement on something that already exists?",
    a: [
      "One tool goes from a live globe of every landing, down to a 100 m nudge map on real LOLA terrain with a horizon mask for each cell, and then into a playable landing on the same terrain.",
      "A 15-second site-triage game turns the planning rules into something people remember.",
    ],
    go: "game",
    goLabel: "Fly the lander",
  },
  {
    k: "Validity",
    q: "Is the solution scientifically valid? Will it do what it sets out to do? Can it work in the real world?",
    a: [
      "Sun and Earth positions match JPL Horizons within 0.06° on 16 dates, and the app pulls the live Horizons feed when it can.",
      "Sunniest cell on the Shackleton ridge: 90.9% here against 88.0% published (Glaser et al. 2018).",
      "IM-2 Athena hindcast for landing day: Sun 2.5° up, Earth in clear view, 3.6° slope. The crater it tipped in is smaller than the 20 m LOLA grid can show.",
      "Limits are stated, not hidden: rocks and craters under 20 m are invisible to the slope check.",
    ],
    go: "provenance",
    goLabel: "Open the data and validation notes",
  },
  {
    k: "Relevance",
    q: "Is the project responsive to the challenge? Is it a complete solution? Is it technically feasible? How usable or user friendly is it?",
    a: [
      "It answers the site-selection questions with the Artemis constraints below: near the pole, flat enough, in sunlight, and in sight of Earth with no relay assumed.",
      "Complete and runnable today: one HTML file, no install, no account, and it works offline.",
    ],
    go: "planner",
    goLabel: "Open the Mission Planner",
  },
  {
    k: "Presentation",
    q: "How well did the team communicate the project? Did they tell the story of the challenge, the solution, and why it matters?",
    a: [
      "The Moon globe sets the scene, the commander's briefing frames the problem, and a 60-second guided tour shows the four findings judges need.",
      "Explorer mode explains every number in plain language; a copyable site brief and share links hand a scenario to someone else.",
    ],
    go: "tour",
    goLabel: "Start the 60-second tour",
  },
];

const ARTEMIS: [string, string][] = [
  ["Land within 6° of latitude of the south pole", "The dashed ring on the Moon globe; all four terrain sites sit inside it."],
  ["Slope under 10° across a 100 m landing area", "Every 100 m cell is graded from 20 m LOLA slopes. The default safe limit is 8°, and you can change it."],
  ["Direct-to-Earth communication, no relay assumed", "Earth line of sight against the real horizon for each cell, with a relay orbiter as an optional what-if."],
  ["Lighting near the pole changes constantly", "30-day sunlight and battery timeline, plus a 12-month landing-window finder."],
];

const SUBMIT: string[] = [
  "Answer one of the official challenges. Projects in the open “create your own” challenge are not eligible for global judging.",
  "Register every team member on the project page (1 to 6 people).",
  "Fill in every required field of the project page, in English. A demo video may be in another language if it has English subtitles.",
  "List every external resource, including open-source code, data, text and images, in the References field. Use no copyrighted material without permission.",
  "Submit before the deadline for your local event.",
];

const AWARDS: [string, string][] = [
  ["Best Use of Data", "makes space data accessible: LRO LOLA terrain, LROC imagery, JPL Horizons."],
  ["Best Use of Science", "the most valid use of science: validated against Horizons, published illumination and a real landing."],
  ["Best Mission Concept", "the most plausible concept and design: a planning aid built on Artemis constraints."],
  ["Art & Technology", "combines technical and creative skill: globe, simulator and game on one data set."],
];

export function Rubric({ onClose, go }: { onClose: () => void; go: (t: RubricTarget) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal rubric" role="dialog" aria-modal="true" aria-labelledby="rub-h" onClick={(e) => e.stopPropagation()}>
        <div className="rub-top">
          <div>
            <span className="eyebrow">NASA International Space Apps Challenge</span>
            <h2 id="rub-h">How judges score this project</h2>
          </div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dim">
          Local, global and executive judges score every project on the same five criteria. Below is each criterion in the judges' own
          words, and where this project answers it.
        </p>

        <ol className="crit">
          {CRITERIA.map((c, i) => (
            <li key={c.k}>
              <div className="crit-h">
                <span className="n">{i + 1}</span>
                <h3>{c.k}</h3>
              </div>
              <p className="q">“{c.q}”</p>
              <ul>
                {c.a.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
              <button className="btn small" onClick={() => go(c.go)}>
                {c.goLabel} →
              </button>
            </li>
          ))}
        </ol>

        <section>
          <h3>Artemis landing constraints used</h3>
          <p className="dim">From NASA's Artemis overview given at the 2025 International Space Apps Challenge.</p>
          <table className="rub-table">
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
          <h3>Awards this project is built for</h3>
          <ul className="awards">
            {AWARDS.map(([a, b]) => (
              <li key={a}>
                <b>{a}</b>: {b}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Before you submit</h3>
          <ul className="checklist">
            {SUBMIT.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
