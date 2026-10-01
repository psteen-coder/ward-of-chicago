export const COLS = 14;
export const ROWS = 9;
export const CELL = 72;
/** Room above the top lane so creep health bars are not clipped. */
export const TOP_PAD = 52;
export const WORLD_W = COLS * CELL;
export const WORLD_H = ROWS * CELL + TOP_PAD;
export const START_GOLD = 175;
export const START_LIVES = 20;
export const SELL_REFUND = 0.6;
export const BEST_KEY = "ward-of-chicago-best";
export const BESTS_KEY = "ward-of-chicago-bests";
export const SAVE_KEY = "ward-of-chicago-save";

export type MapId = "chicago" | "mansion" | "forest" | "tundra";

export type MapDef = {
  id: MapId;
  name: string;
  place: string;
  blurb: string;
  art: string;
  lane: string;
  laneDark: string;
  ward: string;
  dash: string;
  wash: string;
  weather: "rain" | "embers" | "motes" | "snow";
};

export const MAP_ORDER: MapId[] = ["chicago", "mansion", "forest", "tundra"];

export const MAPS: Record<MapId, MapDef> = {
  chicago: {
    id: "chicago",
    name: "Ward of Chicago",
    place: "The warded street",
    blurb: "Rain on the sidewalks. The boarding house is the last door that still holds.",
    art: "/game/map.png",
    lane: "#3a332a",
    laneDark: "#14110e",
    ward: "rgba(126,176,200,0.22)",
    dash: "rgba(224,177,90,0.55)",
    wash: "rgba(8,10,16,0.34)",
    weather: "rain",
  },
  mansion: {
    id: "mansion",
    name: "Red Court Mansion",
    place: "The blood courtyard",
    blurb: "Crimson marble. Enter by the south terrace and circle the courtyard to the inner door.",
    art: "/game/mansion.jpg",
    lane: "#4a2428",
    laneDark: "#1a0c10",
    ward: "rgba(180,64,72,0.28)",
    dash: "rgba(224,177,90,0.5)",
    wash: "rgba(16,6,8,0.38)",
    weather: "embers",
  },
  forest: {
    id: "forest",
    name: "Enchanted Forest",
    place: "The old wood",
    blurb: "A switchback trail from the high wood down to a shrine that does not like visitors.",
    art: "/game/forest.jpg",
    lane: "#2a3828",
    laneDark: "#10160e",
    ward: "rgba(126,176,120,0.24)",
    dash: "rgba(214,196,120,0.5)",
    wash: "rgba(6,12,8,0.36)",
    weather: "motes",
  },
  tundra: {
    id: "tundra",
    name: "Winter Court",
    place: "The pale tundra",
    blurb: "A long ice road that doubles back, and a palace gate that does not forgive warmth.",
    art: "/game/tundra.jpg",
    lane: "#3a4a58",
    laneDark: "#121820",
    ward: "rgba(186,214,230,0.28)",
    dash: "rgba(214,230,240,0.55)",
    wash: "rgba(8,12,18,0.32)",
    weather: "snow",
  },
};

export function emptyBests(): Record<MapId, number> {
  return { chicago: 0, mansion: 0, forest: 0, tundra: 0 };
}

export type TeamId = "dresden" | "red" | "winter" | "summer";
export type TowerId =
  | "harry"
  | "toot"
  | "bob"
  | "murphy"
  | "michael"
  | "thrall"
  | "blooded"
  | "emissary"
  | "predator"
  | "matron"
  | "rime"
  | "huntsman"
  | "glacier"
  | "lance"
  | "oath"
  | "briar"
  | "stag"
  | "bloom"
  | "thornbow"
  | "oakheart";
export type CreepId = "fledgling" | "ghoul" | "blackcourt" | "outsider";
export type TargetMode = "first" | "nearest" | "strongest";

export const TEAM_ORDER: TeamId[] = ["dresden", "red", "winter", "summer"];

export type TeamDef = {
  id: TeamId;
  name: string;
  blurb: string;
  units: TowerId[];
};

export const TEAMS: Record<TeamId, TeamDef> = {
  dresden: {
    id: "dresden",
    name: "Dresden",
    blurb: "Force, a tiny sword, a lecturing skull, a carbine, and a holy blade.",
    units: ["harry", "toot", "bob", "murphy", "michael"],
  },
  red: {
    id: "red",
    name: "Red Court",
    blurb: "Open a vein. Bleed ignores hide, and a kill pays a tithe in coin.",
    units: ["thrall", "blooded", "emissary", "predator", "matron"],
  },
  winter: {
    id: "winter",
    name: "Winter Court",
    blurb: "Chill them, still them, then break what the cold has already held.",
    units: ["rime", "huntsman", "glacier", "lance", "oath"],
  },
  summer: {
    id: "summer",
    name: "Summer Court",
    blurb: "Poison, roots, and a quake. The ground keeps whatever it catches.",
    units: ["briar", "stag", "bloom", "thornbow", "oakheart"],
  },
};

export function isTeamId(value: unknown): value is TeamId {
  return typeof value === "string" && TEAM_ORDER.includes(value as TeamId);
}

export const TOWER_ORDER: TowerId[] = TEAMS.dresden.units;

export const RANK_NAMES = ["", "Sworn", "Honed", "Warden"] as const;

export type TowerDef = {
  name: string;
  craft: string;
  blurb: string;
  special: string;
  team: TeamId;
  cost: number;
  range: number;
  damage: number;
  rate: number;
  splash: number;
  slow: number;
  pierce: boolean;
  instant: boolean;
  shotSpeed: number;
  color: string;
  scale: number;
  swatch: string;
  /** Damage per second. Ignores armor. */
  dot: number;
  dotTime: number;
  /** Full stop, in seconds. */
  stun: number;
  /** Extra coin on a killing blow. */
  siphon: number;
  /** Bonus damage fraction against a chilled or frozen target. */
  shatter: number;
};

export const TOWERS: Record<TowerId, TowerDef> = {
  harry: {
    name: "Harry Dresden",
    craft: "Blasting Rod",
    blurb: "Force, focused down a rod. The reliable mile of this street.",
    special: "Balanced force",
    team: "dresden",
    cost: 80,
    range: 2.65,
    damage: 20,
    rate: 1.05,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 520,
    color: "#e0b15a",
    scale: 1.15,
    swatch: "bg-primary",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  toot: {
    name: "Toot-Toot",
    craft: "Za Lord's Guard",
    blurb: "Tiny sword, endless enthusiasm. Cheap, fast, and everywhere.",
    special: "Rapid and cheap",
    team: "dresden",
    cost: 50,
    range: 2.15,
    damage: 7,
    rate: 2.7,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 380,
    color: "#7eb0c8",
    scale: 1,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  bob: {
    name: "Bob the Skull",
    craft: "Spirit Fire",
    blurb: "He lectures them until their feet forget how to hurry.",
    special: "Slows the target",
    team: "dresden",
    cost: 115,
    range: 2.85,
    damage: 12,
    rate: 1.2,
    splash: 0,
    slow: 1.7,
    pierce: false,
    instant: false,
    shotSpeed: 340,
    color: "#e0b15a",
    scale: 0.95,
    swatch: "bg-primary",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  murphy: {
    name: "Karrin Murphy",
    craft: "SI Carbine",
    blurb: "Long reach. The round does not care how thick the hide is.",
    special: "Long range, ignores armor",
    team: "dresden",
    cost: 155,
    range: 4.35,
    damage: 52,
    rate: 0.48,
    splash: 0,
    slow: 0,
    pierce: true,
    instant: false,
    shotSpeed: 1040,
    color: "#f3ecdf",
    scale: 1.12,
    swatch: "bg-fg",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  michael: {
    name: "Michael Carpenter",
    craft: "Amoracchius",
    blurb: "A holy sword in the gap. It cleaves whatever is knotted together.",
    special: "Short cleave",
    team: "dresden",
    cost: 175,
    range: 1.7,
    damage: 36,
    rate: 0.7,
    splash: 1.15,
    slow: 0,
    pierce: false,
    instant: true,
    shotSpeed: 0,
    color: "#f3ecdf",
    scale: 1.18,
    swatch: "bg-fg",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  thrall: {
    name: "Thrall",
    craft: "Pack Bite",
    blurb: "Cheap, frantic, and always hungry. The bite keeps weeping after they pass.",
    special: "Rapid. A short bleed",
    team: "red",
    cost: 50,
    range: 2.05,
    damage: 5,
    rate: 3,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 420,
    color: "#c4514d",
    scale: 1,
    swatch: "bg-danger",
    dot: 5,
    dotTime: 2,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  blooded: {
    name: "The Blooded",
    craft: "Blood Tithe",
    blurb: "A measured strike. When they finish something, the court takes a coin.",
    special: "Balanced. Extra coin on a kill",
    team: "red",
    cost: 80,
    range: 2.6,
    damage: 16,
    rate: 1.05,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 500,
    color: "#c4514d",
    scale: 1.12,
    swatch: "bg-danger",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 3,
    shatter: 0,
  },
  emissary: {
    name: "Emissary",
    craft: "Crimson Hold",
    blurb: "They raise a hand and the street forgets how to hurry, then the vein opens.",
    special: "Holds them. Bleed ignores armor",
    team: "red",
    cost: 115,
    range: 2.75,
    damage: 8,
    rate: 1,
    splash: 0,
    slow: 2.1,
    pierce: false,
    instant: false,
    shotSpeed: 360,
    color: "#d46560",
    scale: 1.1,
    swatch: "bg-danger",
    dot: 12,
    dotTime: 3,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  predator: {
    name: "Predator",
    craft: "Vein Lance",
    blurb: "A long throw. Hide does not matter, and the wound keeps paying.",
    special: "Long range, ignores armor, bleeds",
    team: "red",
    cost: 155,
    range: 4.25,
    damage: 34,
    rate: 0.46,
    splash: 0,
    slow: 0,
    pierce: true,
    instant: false,
    shotSpeed: 980,
    color: "#e0b15a",
    scale: 1.14,
    swatch: "bg-danger",
    dot: 10,
    dotTime: 2.4,
    stun: 0,
    siphon: 4,
    shatter: 0,
  },
  matron: {
    name: "Matron",
    craft: "Court Feast",
    blurb: "A short, ugly hospitality. Everyone in the knot starts to bleed.",
    special: "Short cleave that bleeds",
    team: "red",
    cost: 175,
    range: 1.7,
    damage: 28,
    rate: 0.66,
    splash: 1.05,
    slow: 0,
    pierce: false,
    instant: true,
    shotSpeed: 0,
    color: "#c4514d",
    scale: 1.2,
    swatch: "bg-danger",
    dot: 8,
    dotTime: 2.6,
    stun: 0,
    siphon: 4,
    shatter: 0,
  },
  rime: {
    name: "Rime",
    craft: "Needle Frost",
    blurb: "A handful of ice, thrown fast. Not much of a wound. Enough of a chill.",
    special: "Rapid light chill",
    team: "winter",
    cost: 50,
    range: 2.1,
    damage: 6,
    rate: 2.7,
    splash: 0,
    slow: 0.8,
    pierce: false,
    instant: false,
    shotSpeed: 460,
    color: "#9ec7d8",
    scale: 1,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  huntsman: {
    name: "Huntsman",
    craft: "Stillness",
    blurb: "One clean shot that tells the body to stop. The pause is the weapon.",
    special: "Briefly freezes the target",
    team: "winter",
    cost: 80,
    range: 2.55,
    damage: 17,
    rate: 0.95,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 540,
    color: "#d5e6f0",
    scale: 1.12,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0.32,
    siphon: 0,
    shatter: 0,
  },
  glacier: {
    name: "Glacier",
    craft: "Deep Chill",
    blurb: "They do not hurry anyone to death. They make the walk take all night.",
    special: "A long, heavy chill",
    team: "winter",
    cost: 115,
    range: 2.9,
    damage: 8,
    rate: 1.1,
    splash: 0,
    slow: 2.6,
    pierce: false,
    instant: false,
    shotSpeed: 320,
    color: "#7eb0c8",
    scale: 1.08,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  lance: {
    name: "Glass Lance",
    craft: "Shatterglass",
    blurb: "A long shard. It is merely sharp until the target is already cold.",
    special: "Long range. Bonus versus chilled",
    team: "winter",
    cost: 155,
    range: 4.4,
    damage: 40,
    rate: 0.48,
    splash: 0,
    slow: 0,
    pierce: true,
    instant: false,
    shotSpeed: 1100,
    color: "#f3ecdf",
    scale: 1.14,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0.55,
  },
  oath: {
    name: "Pale Knight",
    craft: "Oath Frost",
    blurb: "A short white arc. What it touches stops, including the ones beside it.",
    special: "Short cleave that freezes",
    team: "winter",
    cost: 175,
    range: 1.65,
    damage: 30,
    rate: 0.68,
    splash: 1,
    slow: 0,
    pierce: false,
    instant: true,
    shotSpeed: 0,
    color: "#d5e6f0",
    scale: 1.18,
    swatch: "bg-ward",
    dot: 0,
    dotTime: 0,
    stun: 0.48,
    siphon: 0,
    shatter: 0,
  },
  briar: {
    name: "Briar",
    craft: "Weeping Thorn",
    blurb: "A thicket with opinions. The scratch is small. The sap is not.",
    special: "Rapid. A long weak poison",
    team: "summer",
    cost: 50,
    range: 2.05,
    damage: 6,
    rate: 2.8,
    splash: 0,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 400,
    color: "#7f9a62",
    scale: 1,
    swatch: "bg-leaf",
    dot: 4,
    dotTime: 3.6,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  stag: {
    name: "The Stag",
    craft: "Rooted Path",
    blurb: "Antlers, bark, and a hoof that tells the road to hold still.",
    special: "Roots the target in place",
    team: "summer",
    cost: 80,
    range: 2.6,
    damage: 18,
    rate: 1,
    splash: 0,
    slow: 1.7,
    pierce: false,
    instant: false,
    shotSpeed: 480,
    color: "#c4a15a",
    scale: 1.16,
    swatch: "bg-leaf",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  bloom: {
    name: "Bloom",
    craft: "Pollen Cloud",
    blurb: "Pretty, until the whole knot is breathing it. The sickness lingers.",
    special: "Splash poison that ignores armor",
    team: "summer",
    cost: 115,
    range: 2.7,
    damage: 7,
    rate: 0.85,
    splash: 1.2,
    slow: 0,
    pierce: false,
    instant: false,
    shotSpeed: 300,
    color: "#d4c07a",
    scale: 1.08,
    swatch: "bg-leaf",
    dot: 11,
    dotTime: 4,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  thornbow: {
    name: "Thornbow",
    craft: "Heartwood Shot",
    blurb: "A long thorn from a living bow. Bark and hide are the same to it.",
    special: "Long range, ignores armor, poisons",
    team: "summer",
    cost: 155,
    range: 4.45,
    damage: 36,
    rate: 0.48,
    splash: 0,
    slow: 0,
    pierce: true,
    instant: false,
    shotSpeed: 1000,
    color: "#7f9a62",
    scale: 1.12,
    swatch: "bg-leaf",
    dot: 8,
    dotTime: 4,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
  oakheart: {
    name: "Oakheart",
    craft: "Ground Quake",
    blurb: "The oak answers once, close. The knot stumbles, and the street shakes.",
    special: "Short quake. Splash and a root",
    team: "summer",
    cost: 175,
    range: 1.7,
    damage: 32,
    rate: 0.64,
    splash: 1.1,
    slow: 1.25,
    pierce: false,
    instant: true,
    shotSpeed: 0,
    color: "#8d6b45",
    scale: 1.22,
    swatch: "bg-leaf",
    dot: 0,
    dotTime: 0,
    stun: 0,
    siphon: 0,
    shatter: 0,
  },
};

export type CreepDef = {
  name: string;
  plural: string;
  hp: number;
  speed: number;
  gold: number;
  armor: number;
  leak: number;
  radius: number;
  scale: number;
  color: string;
  /** 1 if the painting faces right, -1 if it faces left. */
  artFace: number;
};

export const CREEPS: Record<CreepId, CreepDef> = {
  fledgling: {
    name: "Red Court fledgling",
    plural: "Red Court fledglings",
    hp: 64,
    speed: 1.4,
    gold: 7,
    armor: 0,
    leak: 1,
    radius: 16,
    scale: 1,
    color: "#c4514d",
    artFace: 1,
  },
  ghoul: {
    name: "ghoul",
    plural: "ghouls",
    hp: 130,
    speed: 0.84,
    gold: 13,
    armor: 3,
    leak: 1,
    radius: 18,
    scale: 1.08,
    color: "#8ea37a",
    artFace: -1,
  },
  blackcourt: {
    name: "Black Court vampire",
    plural: "Black Court vampires",
    hp: 250,
    speed: 0.58,
    gold: 22,
    armor: 8,
    leak: 2,
    radius: 18,
    scale: 1.12,
    color: "#f3ecdf",
    artFace: -1,
  },
  outsider: {
    name: "Outsider",
    plural: "Outsiders",
    hp: 2100,
    speed: 0.36,
    gold: 100,
    armor: 12,
    leak: 8,
    radius: 26,
    scale: 1.5,
    color: "#7eb0c8",
    artFace: 1,
  },
};

export type WaveGroup = { kind: CreepId; count: number; interval: number };

export const WAVES: WaveGroup[][] = [
  [{ kind: "fledgling", count: 8, interval: 0.9 }],
  [{ kind: "fledgling", count: 12, interval: 0.7 }],
  [
    { kind: "fledgling", count: 6, interval: 0.7 },
    { kind: "ghoul", count: 4, interval: 1.05 },
  ],
  [{ kind: "ghoul", count: 10, interval: 0.85 }],
  [
    { kind: "fledgling", count: 10, interval: 0.42 },
    { kind: "ghoul", count: 6, interval: 0.9 },
  ],
  [{ kind: "blackcourt", count: 6, interval: 1.15 }],
  [
    { kind: "ghoul", count: 8, interval: 0.7 },
    { kind: "blackcourt", count: 5, interval: 1.1 },
  ],
  [
    { kind: "fledgling", count: 16, interval: 0.32 },
    { kind: "blackcourt", count: 4, interval: 1.2 },
  ],
  [
    { kind: "ghoul", count: 8, interval: 0.6 },
    { kind: "blackcourt", count: 8, interval: 0.85 },
  ],
  [
    { kind: "fledgling", count: 8, interval: 0.45 },
    { kind: "outsider", count: 1, interval: 1.4 },
    { kind: "blackcourt", count: 4, interval: 0.9 },
  ],
];

export const BASE = { c: 13, r: 6 };

type Cell = { c: number; r: number };

/** Each ground is a different road. Lengths stay near the Chicago street so the nights still fit. */
export const ROUTES: Record<MapId, Cell[]> = {
  chicago: [
    { c: -1, r: 0 },
    { c: 0, r: 0 },
    { c: 11, r: 0 },
    { c: 11, r: 2 },
    { c: 2, r: 2 },
    { c: 2, r: 4 },
    { c: 11, r: 4 },
    { c: 11, r: 6 },
    { c: 13, r: 6 },
  ],
  mansion: [
    { c: 2, r: 9 },
    { c: 2, r: 8 },
    { c: 12, r: 8 },
    { c: 12, r: 1 },
    { c: 2, r: 1 },
    { c: 2, r: 5 },
    { c: 7, r: 5 },
    { c: 7, r: 3 },
  ],
  forest: [
    { c: 13, r: -1 },
    { c: 13, r: 0 },
    { c: 5, r: 0 },
    { c: 5, r: 3 },
    { c: 12, r: 3 },
    { c: 12, r: 5 },
    { c: 2, r: 5 },
    { c: 2, r: 7 },
    { c: 6, r: 7 },
  ],
  tundra: [
    { c: -1, r: 7 },
    { c: 0, r: 7 },
    { c: 13, r: 7 },
    { c: 13, r: 3 },
    { c: 3, r: 3 },
    { c: 3, r: 1 },
    { c: 10, r: 1 },
    { c: 10, r: 0 },
  ],
};

function emptyMask() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
}

function plotOnto(mask: boolean[][], c0: number, r0: number, c1: number, r1: number) {
  const sc = Math.sign(c1 - c0);
  const sr = Math.sign(r1 - r0);
  let c = c0;
  let r = r0;
  for (let n = 0; n < 64; n++) {
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) mask[r][c] = true;
    if (c === c1 && r === r1) break;
    if (sc === 0 && sr === 0) break;
    c += sc;
    r += sr;
  }
}

function maskFor(cells: Cell[]) {
  const mask = emptyMask();
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    plotOnto(mask, a.c, a.r, b.c, b.r);
  }
  return mask;
}

export const PATHS: Record<MapId, boolean[][]> = {
  chicago: maskFor(ROUTES.chicago),
  mansion: maskFor(ROUTES.mansion),
  forest: maskFor(ROUTES.forest),
  tundra: maskFor(ROUTES.tundra),
};

export function pathMask(map: MapId) {
  return PATHS[map];
}

export function cellCenter(c: number, r: number) {
  return { x: (c + 0.5) * CELL, y: TOP_PAD + (r + 0.5) * CELL };
}

const WAYPOINTS: Record<MapId, { x: number; y: number }[]> = {
  chicago: ROUTES.chicago.map((p) => cellCenter(p.c, p.r)),
  mansion: ROUTES.mansion.map((p) => cellCenter(p.c, p.r)),
  forest: ROUTES.forest.map((p) => cellCenter(p.c, p.r)),
  tundra: ROUTES.tundra.map((p) => cellCenter(p.c, p.r)),
};

export function waypointXY(map: MapId) {
  return WAYPOINTS[map];
}

export function baseCell(map: MapId) {
  const cells = ROUTES[map];
  return cells[cells.length - 1];
}

export function describeWave(index: number): string {
  const wave = WAVES[index];
  if (!wave) return "Dawn";
  return wave
    .map((group) => {
      const def = CREEPS[group.kind];
      return `${group.count} ${group.count === 1 ? def.name : def.plural}`;
    })
    .join(" · ");
}

export type CombatStats = {
  damage: number;
  rate: number;
  range: number;
  splash: number;
  slow: number;
  pierce: boolean;
  instant: boolean;
  shotSpeed: number;
  dot: number;
  dotTime: number;
  stun: number;
  siphon: number;
  shatter: number;
};

export function combatStats(id: TowerId, rank: number): CombatStats {
  const def = TOWERS[id];
  const clamped = Math.min(3, Math.max(1, rank));
  const dmgMul = clamped === 1 ? 1 : clamped === 2 ? 1.45 : 2.15;
  const rateMul = clamped === 1 ? 1 : clamped === 2 ? 1.22 : 1.5;
  const rangeMul = clamped >= 3 ? 1.1 : 1;
  const slowMul = clamped === 1 ? 1 : clamped === 2 ? 1.12 : 1.28;
  const siphon = def.siphon <= 0 ? 0 : def.siphon + (clamped === 1 ? 0 : clamped === 2 ? 1 : 2);
  return {
    damage: Math.round(def.damage * dmgMul),
    rate: Math.round(def.rate * rateMul * 100) / 100,
    range: Math.round(def.range * rangeMul * 100) / 100,
    splash: def.splash,
    slow: Math.round(def.slow * slowMul * 100) / 100,
    pierce: def.pierce,
    instant: def.instant,
    shotSpeed: def.shotSpeed,
    dot: Math.round(def.dot * dmgMul * 10) / 10,
    dotTime: def.dotTime,
    stun: Math.round(def.stun * slowMul * 100) / 100,
    siphon,
    shatter: def.shatter,
  };
}

export function upgradeCost(id: TowerId, rank: number): number | null {
  if (rank >= 3) return null;
  const base = TOWERS[id].cost;
  return rank === 1 ? Math.round(base * 0.7) : Math.round(base * 1.15);
}
