export const COLS = 14;
export const ROWS = 9;
export const CELL = 72;
export const WORLD_W = COLS * CELL;
export const WORLD_H = ROWS * CELL;
export const START_GOLD = 175;
export const START_LIVES = 20;
export const SELL_REFUND = 0.6;
export const BEST_KEY = "ward-of-chicago-best";

export type TowerId = "harry" | "toot" | "bob" | "murphy" | "michael";
export type CreepId = "fledgling" | "ghoul" | "blackcourt" | "outsider";
export type TargetMode = "first" | "nearest" | "strongest";

export const TOWER_ORDER: TowerId[] = ["harry", "toot", "bob", "murphy", "michael"];

export const RANK_NAMES = ["", "Sworn", "Honed", "Warden"] as const;

export type TowerDef = {
  name: string;
  craft: string;
  blurb: string;
  special: string;
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
};

export const TOWERS: Record<TowerId, TowerDef> = {
  harry: {
    name: "Harry Dresden",
    craft: "Blasting Rod",
    blurb: "Force, focused down a rod. The reliable mile of this street.",
    special: "Balanced force",
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
  },
  toot: {
    name: "Toot-Toot",
    craft: "Za Lord's Guard",
    blurb: "Tiny sword, endless enthusiasm. Cheap, fast, and everywhere.",
    special: "Rapid and cheap",
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
  },
  bob: {
    name: "Bob the Skull",
    craft: "Spirit Fire",
    blurb: "He lectures them until their feet forget how to hurry.",
    special: "Slows the target",
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
  },
  murphy: {
    name: "Karrin Murphy",
    craft: "SI Carbine",
    blurb: "Long reach. The round does not care how thick the hide is.",
    special: "Long range, ignores armor",
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
  },
  michael: {
    name: "Michael Carpenter",
    craft: "Amoracchius",
    blurb: "A holy sword in the gap. It cleaves whatever is knotted together.",
    special: "Short cleave",
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

/** Spawn just off the left edge, then the street the creeps must walk. */
export const WAY_CELLS: { c: number; r: number }[] = [
  { c: -1, r: 0 },
  { c: 0, r: 0 },
  { c: 11, r: 0 },
  { c: 11, r: 2 },
  { c: 2, r: 2 },
  { c: 2, r: 4 },
  { c: 11, r: 4 },
  { c: 11, r: 6 },
  { c: 13, r: 6 },
];

export const PATH: boolean[][] = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => false),
);

function plotOrtho(c0: number, r0: number, c1: number, r1: number) {
  const sc = Math.sign(c1 - c0);
  const sr = Math.sign(r1 - r0);
  let c = c0;
  let r = r0;
  for (let n = 0; n < 64; n++) {
    if (c >= 0 && r >= 0 && c < COLS && r < ROWS) PATH[r][c] = true;
    if (c === c1 && r === r1) break;
    c += sc;
    r += sr;
  }
}

for (let i = 1; i < WAY_CELLS.length - 1; i++) {
  const a = WAY_CELLS[i];
  const b = WAY_CELLS[i + 1];
  plotOrtho(a.c, a.r, b.c, b.r);
}

export function cellCenter(c: number, r: number) {
  return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
}

let cachedPath: { x: number; y: number }[] | null = null;

export function waypointXY() {
  if (!cachedPath) cachedPath = WAY_CELLS.map((p) => cellCenter(p.c, p.r));
  return cachedPath;
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
};

export function combatStats(id: TowerId, rank: number): CombatStats {
  const def = TOWERS[id];
  const clamped = Math.min(3, Math.max(1, rank));
  const dmgMul = clamped === 1 ? 1 : clamped === 2 ? 1.45 : 2.15;
  const rateMul = clamped === 1 ? 1 : clamped === 2 ? 1.22 : 1.5;
  const rangeMul = clamped >= 3 ? 1.1 : 1;
  const slowMul = clamped === 1 ? 1 : clamped === 2 ? 1.12 : 1.28;
  return {
    damage: Math.round(def.damage * dmgMul),
    rate: Math.round(def.rate * rateMul * 100) / 100,
    range: Math.round(def.range * rangeMul * 100) / 100,
    splash: def.splash,
    slow: Math.round(def.slow * slowMul * 100) / 100,
    pierce: def.pierce,
    instant: def.instant,
    shotSpeed: def.shotSpeed,
  };
}

export function upgradeCost(id: TowerId, rank: number): number | null {
  if (rank >= 3) return null;
  const base = TOWERS[id].cost;
  return rank === 1 ? Math.round(base * 0.7) : Math.round(base * 1.15);
}
