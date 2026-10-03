import { MAPS, TEAMS, pathMask, type MapId, type TeamId, type TowerId, type WaveGroup, COLS, ROWS } from "./balance";
import { grantProgress, readLedger } from "./ledger";

export type CoachKind = "place" | "hone" | "aim" | "send";

export type CoachStep = {
  kind: CoachKind;
  text: string;
  tower?: TowerId;
};

export type Chapter = {
  title: string;
  kicker: string;
  blurb: string;
  map: MapId;
  team: TeamId;
  roster: TowerId[];
  waves: WaveGroup[][];
  coach: CoachStep[];
  teachOffer: boolean;
  favors: number;
  unlockTowers: TowerId[];
  unlockCourts: TeamId[];
  unlockMaps: MapId[];
  deed?: string;
  reward: string;
};

const fledgling = (count: number, interval: number): WaveGroup => ({ kind: "fledgling", count, interval });
const ghoul = (count: number, interval: number): WaveGroup => ({ kind: "ghoul", count, interval });
const black = (count: number, interval: number): WaveGroup => ({ kind: "blackcourt", count, interval });

export const CHAPTERS: Chapter[] = [
  {
    title: "The gold dot",
    kicker: "Lesson",
    blurb: "Harry, a sidewalk, and one short night. The street shows you where to stand.",
    map: "chicago",
    team: "dresden",
    roster: ["harry"],
    waves: [[fledgling(5, 1.15)]],
    coach: [
      { kind: "place", tower: "harry", text: "Tap Harry Dresden, then the pulsing gold dot beside the street." },
      { kind: "send", text: "Open the street. Nothing comes until you send the night." },
    ],
    teachOffer: false,
    favors: 1,
    unlockTowers: ["toot"],
    unlockCourts: [],
    unlockMaps: [],
    deed: "first-ward",
    reward: "Toot-Toot will take a corner for a dime. A favor is on the shelf.",
  },
  {
    title: "A tiny sword",
    kicker: "Lesson",
    blurb: "Cheap and fast. Post the pixie where the first ones come in.",
    map: "chicago",
    team: "dresden",
    roster: ["harry", "toot"],
    waves: [[fledgling(10, 0.7)]],
    coach: [
      { kind: "place", tower: "toot", text: "Toot-Toot is fifty coin. Post him on a gold dot, closer to the street than Harry." },
      { kind: "send", text: "Send the night when both of them can see the road." },
    ],
    teachOffer: false,
    favors: 1,
    unlockTowers: ["bob"],
    unlockCourts: [],
    unlockMaps: [],
    reward: "Bob the Skull will slow whatever he lectures.",
  },
  {
    title: "Hone the rod",
    kicker: "Lesson",
    blurb: "A ghoul hides a thicker hide. Hone a defender before you open the street.",
    map: "chicago",
    team: "dresden",
    roster: ["harry", "toot", "bob"],
    waves: [[fledgling(6, 0.75), ghoul(3, 1.1)]],
    coach: [
      { kind: "place", tower: "harry", text: "Post Harry, or anyone you can afford." },
      { kind: "hone", text: "Tap that defender, then Hone. Rank hits harder and fires faster." },
      { kind: "send", text: "The ghouls are slower. Send them in." },
    ],
    teachOffer: false,
    favors: 1,
    unlockTowers: ["murphy"],
    unlockCourts: [],
    unlockMaps: [],
    reward: "Karrin Murphy ignores armor from a long way off.",
  },
  {
    title: "Behind the small ones",
    kicker: "Lesson",
    blurb: "Trash in front, a thicker body behind. Aim decides who dies first.",
    map: "chicago",
    team: "dresden",
    roster: ["harry", "toot", "bob", "murphy"],
    waves: [[fledgling(12, 0.38), ghoul(2, 1.2)]],
    coach: [
      { kind: "place", tower: "harry", text: "Post a defender on the gold dot." },
      { kind: "aim", text: "Set that tower to Strong. It will pick the ghoul hiding behind the fledglings." },
      { kind: "send", text: "Send the night." },
    ],
    teachOffer: false,
    favors: 1,
    unlockTowers: ["michael"],
    unlockCourts: [],
    unlockMaps: [],
    reward: "Michael Carpenter cleaves up close. Dresden's street is fully sworn.",
  },
  {
    title: "The knight",
    kicker: "Chicago",
    blurb: "Two nights. Between them the street offers one gift. Michael belongs on a bend.",
    map: "chicago",
    team: "dresden",
    roster: ["harry", "toot", "bob", "murphy", "michael"],
    waves: [
      [ghoul(6, 0.85)],
      [fledgling(8, 0.45), ghoul(4, 0.9), black(2, 1.15)],
    ],
    coach: [
      { kind: "place", text: "Post Michael on a bend if you can pay him, or anyone you can afford." },
      { kind: "send", text: "Hold two nights. After the first, take the street's gift." },
    ],
    teachOffer: true,
    favors: 2,
    unlockTowers: ["thrall"],
    unlockCourts: ["red"],
    unlockMaps: ["mansion"],
    reward: "The south terrace is open. A Red Court thrall will serve the next chapter.",
  },
  {
    title: "South terrace",
    kicker: "Red Court",
    blurb: "You walk their marble. Thralls are cheap. A kill by the Blooded pays coin back.",
    map: "mansion",
    team: "red",
    roster: ["thrall", "blooded"],
    waves: [
      [fledgling(8, 0.65), ghoul(4, 0.9)],
      [ghoul(6, 0.7), black(3, 1.05)],
    ],
    coach: [
      { kind: "place", tower: "thrall", text: "Post a Thrall on a gold dot. The courtyard road is not the Chicago street." },
      { kind: "send", text: "Send the night. Spend what the kills give back." },
    ],
    teachOffer: true,
    favors: 2,
    unlockTowers: ["blooded", "emissary", "predator"],
    unlockCourts: [],
    unlockMaps: [],
    reward: "The Emissary and the Predator stay with the court.",
  },
  {
    title: "The tithe",
    kicker: "Red Court",
    blurb: "The full court, two harder nights, and a door that is no longer a lesson.",
    map: "mansion",
    team: "red",
    roster: ["thrall", "blooded", "emissary", "predator"],
    waves: [
      [ghoul(8, 0.7), black(3, 1)],
      [fledgling(10, 0.4), black(5, 0.95)],
    ],
    coach: [{ kind: "send", text: "This one does not hold your hand. Post whom you can pay, then send." }],
    teachOffer: true,
    favors: 2,
    unlockTowers: ["matron", "briar"],
    unlockCourts: ["summer"],
    unlockMaps: ["forest"],
    reward: "The Matron closes the Red Court. The old wood is next, and Briar is awake.",
  },
  {
    title: "The old wood",
    kicker: "Summer",
    blurb: "Poison and roots. Briar is cheap. The Stag and Bloom come onto the trail with you.",
    map: "forest",
    team: "summer",
    roster: ["briar", "stag", "bloom"],
    waves: [
      [fledgling(8, 0.6), ghoul(5, 0.85)],
      [ghoul(6, 0.65), black(4, 1)],
    ],
    coach: [
      { kind: "place", tower: "briar", text: "Post Briar. Summer's cheap craft bites and stays bitten." },
      { kind: "send", text: "Two nights on the switchback. Take the gift between them." },
    ],
    teachOffer: true,
    favors: 2,
    unlockTowers: ["stag", "bloom", "thornbow", "oakheart", "rime"],
    unlockCourts: ["winter"],
    unlockMaps: ["tundra"],
    reward: "Summer's roster is sworn. The pale road opens, and Rime comes with the cold.",
  },
  {
    title: "The pale road",
    kicker: "Winter",
    blurb: "The last chapter. Chill them, then break what the cold has already held.",
    map: "tundra",
    team: "winter",
    roster: ["rime", "huntsman", "glacier"],
    waves: [
      [ghoul(6, 0.8), black(3, 1.05)],
      [fledgling(8, 0.42), ghoul(6, 0.7), black(4, 0.9)],
    ],
    coach: [
      { kind: "place", tower: "rime", text: "Post Rime. Winter would rather hone one craft than spam the cheap push." },
      { kind: "send", text: "Hold the palace gate for two nights." },
    ],
    teachOffer: true,
    favors: 3,
    unlockTowers: ["huntsman", "glacier", "lance", "oath"],
    unlockCourts: [],
    unlockMaps: [],
    deed: "case",
    reward: "The case is closed. Every court, every road, and the rest of Winter are yours.",
  },
];

export function chapterCount() {
  return CHAPTERS.length;
}

export function chapterAt(index: number): Chapter | null {
  return CHAPTERS[index] ?? null;
}

export function canPlayChapter(index: number) {
  return index >= 0 && index < CHAPTERS.length && index <= readLedger().cleared;
}

export function claimChapter(index: number): string {
  const chapter = CHAPTERS[index];
  if (!chapter) return "";
  const first = grantProgress({
    favors: chapter.favors,
    towers: chapter.unlockTowers,
    courts: chapter.unlockCourts,
    maps: chapter.unlockMaps,
    chapter: index,
    deed: chapter.deed,
  });
  return first ? chapter.reward : "You have walked this chapter before. Nothing new is sworn.";
}

export function storyBlurb(index: number, night: number): string {
  const chapter = CHAPTERS[index];
  const wave = chapter?.waves[night];
  if (!wave || wave.length === 0) return "";
  return wave
    .map((group) => {
      const name = group.kind === "fledgling" ? "fledglings" : group.kind === "ghoul" ? "ghouls" : group.kind === "blackcourt" ? "Black Court" : "Outsiders";
      return `${group.count} ${name}`;
    })
    .join(" · ");
}

/** A sidewalk square beside the first bit of road, for the lesson pulse. */
export function hintBesidePath(map: MapId): { c: number; r: number } | null {
  const mask = pathMask(map);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!mask[r]?.[c]) continue;
      const spots = [
        { c, r: r + 1 },
        { c, r: r - 1 },
        { c: c + 1, r },
        { c: c - 1, r },
      ];
      for (const spot of spots) {
        if (spot.c < 0 || spot.r < 0 || spot.c >= COLS || spot.r >= ROWS) continue;
        if (mask[spot.r]?.[spot.c]) continue;
        return spot;
      }
    }
  }
  return null;
}

export function chapterPlace(index: number) {
  const chapter = CHAPTERS[index];
  if (!chapter) return "";
  return `${TEAMS[chapter.team].name} · ${MAPS[chapter.map].place}`;
}
