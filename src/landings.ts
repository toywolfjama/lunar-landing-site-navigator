/* The one preset mission, and the shape of a landing site. Your own landings (click the Moon) use the same shape.
   Coordinates are selenographic: degrees north, degrees east. */

export type Kind = "crewed" | "robotic" | "pole" | "custom";

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
  { id: "shackleton", name: "Shackleton Connecting Ridge", mission: "Preset mission", agency: "Artemis III candidate region", date: "", lat: -89.45, lon: -137.4, kind: "pole",
    region: "Shackleton-de Gerlache ridge", note: "Narrow crest with some of the longest sunlight on the Moon, modelled with NASA LOLA terrain.", site: "shackleton" },
];

export const KIND_LABEL: Record<Kind, string> = { crewed: "Crewed", robotic: "Robotic", pole: "South-pole candidate", custom: "Your landing" };
