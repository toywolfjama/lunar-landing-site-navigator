/* Curated landing sites: the preset mission (Shackleton ridge), the other south-pole sites modelled with NASA LOLA
   terrain, every past soft landing, and a planned CLPS target. Your own landings (click the Moon) use the same shape.
   Coordinates are selenographic (degrees north, degrees east) from the mission teams' published landing-site solutions
   (NASA NSSDCA, LROC, ISRO, CNSA, JAXA, Intuitive Machines, Firefly); several are rounded to 0.01 deg. */

export type Kind = "crewed" | "robotic" | "pole" | "future" | "custom";

export interface Landing {
  id: string;
  name: string;
  mission: string;
  agency: string;
  date: string; // ISO, UTC touchdown day
  lat: number;
  lon: number;
  kind: Kind;
  region: string;
  note: string;
  site?: string; // P.SITES id when the physics module already models this site
}

export const LANDINGS: Landing[] = [
  { id: "luna9", name: "Luna 9", mission: "Luna 9", agency: "USSR", date: "1966-02-03", lat: 7.08, lon: -64.37, kind: "robotic",
    region: "Oceanus Procellarum", note: "First soft landing on any world beyond Earth, and the first photographs from the lunar surface." },
  { id: "surveyor1", name: "Surveyor 1", mission: "Surveyor 1", agency: "NASA", date: "1966-06-02", lat: -2.47, lon: -43.34, kind: "robotic",
    region: "Flamsteed P", note: "First US soft landing. Showed the regolith could carry a lander, clearing the way for Apollo." },
  { id: "luna13", name: "Luna 13", mission: "Luna 13", agency: "USSR", date: "1966-12-24", lat: 18.87, lon: -62.05, kind: "robotic",
    region: "Oceanus Procellarum", note: "Second soft landing. Pushed a penetrometer into the soil to measure how firm it was." },
  { id: "surveyor3", name: "Surveyor 3", mission: "Surveyor 3", agency: "NASA", date: "1967-04-20", lat: -3.02, lon: -23.42, kind: "robotic",
    region: "Oceanus Procellarum", note: "Bounced twice on landing. Apollo 12 set down 180 m away and brought its camera back to Earth." },
  { id: "surveyor5", name: "Surveyor 5", mission: "Surveyor 5", agency: "NASA", date: "1967-09-11", lat: 1.41, lon: 23.18, kind: "robotic",
    region: "Mare Tranquillitatis", note: "First chemical analysis of lunar soil, 25 km from where Apollo 11 later landed." },
  { id: "surveyor6", name: "Surveyor 6", mission: "Surveyor 6", agency: "NASA", date: "1967-11-10", lat: 0.47, lon: -1.43, kind: "robotic",
    region: "Sinus Medii", note: "First lift-off from the Moon: it fired its engines and hopped 2.5 m to a new spot." },
  { id: "surveyor7", name: "Surveyor 7", mission: "Surveyor 7", agency: "NASA", date: "1968-01-10", lat: -40.98, lon: -11.51, kind: "robotic",
    region: "Tycho ejecta", note: "The only Surveyor sent to the rough highlands, on the rim of the young crater Tycho." },
  { id: "apollo11", name: "Apollo 11", mission: "Apollo 11 · Tranquility Base", agency: "NASA", date: "1969-07-20", lat: 0.6741, lon: 23.4730, kind: "crewed",
    region: "Mare Tranquillitatis", note: "Armstrong and Aldrin, the first people on the Moon. Landed long, past a boulder field, with about 25 s of fuel margin.", site: "apollo11" },
  { id: "apollo12", name: "Apollo 12", mission: "Apollo 12", agency: "NASA", date: "1969-11-19", lat: -3.0124, lon: -23.4216, kind: "crewed",
    region: "Oceanus Procellarum", note: "First pinpoint landing: Conrad and Bean set down within walking distance of Surveyor 3." },
  { id: "apollo14", name: "Apollo 14", mission: "Apollo 14", agency: "NASA", date: "1971-02-05", lat: -3.6453, lon: -17.4714, kind: "crewed",
    region: "Fra Mauro", note: "Shepard and Mitchell sampled the Imbrium basin ejecta originally targeted by Apollo 13." },
  { id: "apollo15", name: "Apollo 15", mission: "Apollo 15", agency: "NASA", date: "1971-07-30", lat: 26.1322, lon: 3.6339, kind: "crewed",
    region: "Hadley-Apennine", note: "First Lunar Roving Vehicle. Landed on a 10 deg slope beside Hadley Rille, one leg in a small crater." },
  { id: "apollo16", name: "Apollo 16", mission: "Apollo 16", agency: "NASA", date: "1972-04-21", lat: -8.9730, lon: 15.5002, kind: "crewed",
    region: "Descartes Highlands", note: "The only Apollo landing in the central highlands." },
  { id: "apollo17", name: "Apollo 17", mission: "Apollo 17", agency: "NASA", date: "1972-12-11", lat: 20.1908, lon: 30.7717, kind: "crewed",
    region: "Taurus-Littrow", note: "Cernan and Schmitt, the last crew on the Moon so far. Schmitt was the only geologist to walk there." },
  { id: "luna16", name: "Luna 16", mission: "Luna 16", agency: "USSR", date: "1970-09-20", lat: -0.51, lon: 56.36, kind: "robotic",
    region: "Mare Fecunditatis", note: "First robotic sample return: 101 g of soil." },
  { id: "luna17", name: "Luna 17 · Lunokhod 1", mission: "Luna 17", agency: "USSR", date: "1970-11-17", lat: 38.24, lon: -35.0, kind: "robotic",
    region: "Mare Imbrium", note: "Delivered Lunokhod 1, the first rover on another world. It drove 10.5 km." },
  { id: "luna20", name: "Luna 20", mission: "Luna 20", agency: "USSR", date: "1972-02-21", lat: 3.79, lon: 56.62, kind: "robotic",
    region: "Apollonius highlands", note: "Highland sample return, 120 km from Luna 16." },
  { id: "luna21", name: "Luna 21 · Lunokhod 2", mission: "Luna 21", agency: "USSR", date: "1973-01-15", lat: 25.85, lon: 30.45, kind: "robotic",
    region: "Le Monnier crater", note: "Lunokhod 2 drove 39 km, a record that stood for 41 years." },
  { id: "luna23", name: "Luna 23", mission: "Luna 23", agency: "USSR", date: "1974-11-06", lat: 12.68, lon: 62.28, kind: "robotic",
    region: "Mare Crisium", note: "Tipped over on rough ground and its drill was damaged, so no sample came back. Luna 24 landed nearby two years later." },
  { id: "luna24", name: "Luna 24", mission: "Luna 24", agency: "USSR", date: "1976-08-18", lat: 12.71, lon: 62.21, kind: "robotic",
    region: "Mare Crisium", note: "Last landing for 37 years. Drilled a 2 m core." },
  { id: "change3", name: "Chang'e 3 · Yutu", mission: "Chang'e 3", agency: "CNSA", date: "2013-12-14", lat: 44.12, lon: -19.51, kind: "robotic",
    region: "Mare Imbrium", note: "China's first landing; used hazard-avoidance hover to pick its touchdown point." },
  { id: "change4", name: "Chang'e 4 · Yutu-2", mission: "Chang'e 4", agency: "CNSA", date: "2019-01-03", lat: -45.44, lon: 177.60, kind: "robotic",
    region: "Von Kármán crater (far side)", note: "First landing on the far side. Earth is never in view, so all contact goes through the Queqiao relay." },
  { id: "change5", name: "Chang'e 5", mission: "Chang'e 5", agency: "CNSA", date: "2020-12-01", lat: 43.06, lon: -51.92, kind: "robotic",
    region: "Mons Rümker", note: "Returned 1.73 kg of the youngest basalts sampled so far." },
  { id: "chandrayaan3", name: "Chandrayaan-3 · Vikram", mission: "Chandrayaan-3", agency: "ISRO", date: "2023-08-23", lat: -69.373, lon: 32.319, kind: "robotic",
    region: "Shiv Shakti point", note: "Southernmost landing until IM-1, and India's first. Pragyan rover measured sulphur in the soil.", site: "chandrayaan3" },
  { id: "slim", name: "SLIM", mission: "SLIM", agency: "JAXA", date: "2024-01-19", lat: -13.316, lon: 25.251, kind: "robotic",
    region: "Shioli crater", note: "Vision-based navigation brought it to about 10 m of its aim point before an engine failed; it landed 55 m away, nose down." },
  { id: "im1", name: "IM-1 Odysseus", mission: "IM-1", agency: "Intuitive Machines / NASA CLPS", date: "2024-02-22", lat: -80.13, lon: 1.44, kind: "robotic",
    region: "Malapert A", note: "First commercial landing. A laser rangefinder was left safed, it came in fast and tipped onto its side." },
  { id: "change6", name: "Chang'e 6", mission: "Chang'e 6", agency: "CNSA", date: "2024-06-01", lat: -41.64, lon: -153.99, kind: "robotic",
    region: "Apollo basin (far side)", note: "First sample return from the far side, through the Queqiao-2 relay." },
  { id: "blueghost", name: "Blue Ghost M1", mission: "Blue Ghost Mission 1", agency: "Firefly / NASA CLPS", date: "2025-03-02", lat: 18.56, lon: 61.81, kind: "robotic",
    region: "Mons Latreille, Mare Crisium", note: "First fully successful commercial landing: upright, and operated through a full lunar day." },
  { id: "athena", name: "IM-2 Athena", mission: "IM-2", agency: "Intuitive Machines / NASA CLPS", date: "2025-03-06", lat: -84.7906, lon: 29.1957, kind: "robotic",
    region: "Mons Mouton", note: "Southernmost landing so far. Touched down about 250 m off target and came to rest on its side in a crater.", site: "athena" },
  { id: "shackleton", name: "Shackleton Connecting Ridge", mission: "Preset mission", agency: "Artemis III candidate region", date: "", lat: -89.45, lon: -137.4, kind: "pole",
    region: "Shackleton-de Gerlache ridge", note: "Narrow crest with some of the longest sunlight on the Moon, modelled with NASA LOLA terrain. The preset mission.", site: "shackleton" },
  { id: "malapert", name: "Malapert Massif", mission: "Candidate site", agency: "Artemis III region", date: "", lat: -86.0, lon: 0.0, kind: "pole",
    region: "Malapert Massif", note: "High nearside massif facing Earth, good for direct-to-Earth radio. Modelled here with LOLA terrain.", site: "malapert" },
  { id: "mouton", name: "Mons Mouton", mission: "Candidate site", agency: "Artemis III region", date: "", lat: -84.6, lon: 31.0, kind: "pole",
    region: "Mons Mouton plateau", note: "Broad flat-topped mountain targeted by CLPS deliveries. Modelled here with LOLA terrain.", site: "mouton" },
  { id: "im3", name: "IM-3 (planned)", mission: "IM-3", agency: "Intuitive Machines / NASA CLPS", date: "", lat: 7.5, lon: -59.0, kind: "future",
    region: "Reiner Gamma", note: "Planned CLPS landing at the Reiner Gamma lunar swirl, to study its magnetic anomaly. Coordinates are approximate." },
];

export const KIND_LABEL: Record<Kind, string> = { crewed: "Crewed", robotic: "Robotic", pole: "South-pole candidate", future: "Planned", custom: "Your landing" };

// chronological, with the not-yet-landed sites last
LANDINGS.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
