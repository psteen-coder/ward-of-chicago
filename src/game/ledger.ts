import { TEAMS, TOWERS, type MapId, type TeamId, type TowerId, combatStats, type CombatStats } from "./balance";

const LEDGER_KEY = "ward-of-chicago-ledger";

export type TrainStat = "dmg" | "rate" | "range";

export type Train = { dmg: number; rate: number; range: number };

export type Ledger = {
  v: 1;
  favors: number;
  /** Next chapter index. Earlier chapters are cleared. */
  cleared: number;
  towers: TowerId[];
  courts: TeamId[];
  maps: MapId[];
  train: Partial<Record<TowerId, Train>>;
  deeds: string[];
};

export type Deed = { id: string; name: string; detail: string };

export const DEEDS: Deed[] = [
  { id: "first-ward", name: "The door held", detail: "Finish the first lesson on the gold dot." },
  { id: "hone", name: "Honed", detail: "Hone a defender in the field." },
  { id: "aim", name: "Chosen target", detail: "Aim a tower at First, Nearest, or Strongest." },
  { id: "offer", name: "The street's gift", detail: "Take a gift between nights." },
  { id: "ward", name: "The ward spent", detail: "A stoop ward takes a hit that would have reached the door." },
  { id: "sell", name: "Released", detail: "Sell a defender back to the night." },
  { id: "train", name: "Trained", detail: "Spend a favor to train a craft." },
  { id: "dawn", name: "Ten nights", detail: "Finish a Standard Night." },
  { id: "endless", name: "Past dawn", detail: "Finish night 12 of an Endless Night." },
  { id: "winter", name: "Winter broke", detail: "Break the Winter Court on this device." },
  { id: "red", name: "The vein closed", detail: "Break the Red Court on this device." },
  { id: "summer", name: "The wood went quiet", detail: "Break the Summer Court on this device." },
  { id: "case", name: "The case is closed", detail: "Finish the last chapter." },
];

const emptyTrain = (): Train => ({ dmg: 0, rate: 0, range: 0 });

function fresh(): Ledger {
  return {
    v: 1,
    favors: 0,
    cleared: 0,
    towers: ["harry"],
    courts: ["dresden"],
    maps: ["chicago"],
    train: {},
    deeds: [],
  };
}

let cache: Ledger | null = null;
const listeners = new Set<() => void>();
const serverBook = fresh();

export function subscribeLedger(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function serverLedger(): Ledger {
  return serverBook;
}

function isTower(value: unknown): value is TowerId {
  return typeof value === "string" && value in TOWERS;
}

function sanitize(raw: unknown): Ledger {
  const base = fresh();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<Ledger>;
  const towers = Array.isArray(data.towers) ? data.towers.filter(isTower) : base.towers;
  if (!towers.includes("harry")) towers.unshift("harry");
  const courts = Array.isArray(data.courts)
    ? data.courts.filter((id): id is TeamId => id === "dresden" || id === "red" || id === "winter" || id === "summer")
    : base.courts;
  if (!courts.includes("dresden")) courts.unshift("dresden");
  const maps = Array.isArray(data.maps)
    ? data.maps.filter((id): id is MapId => id === "chicago" || id === "mansion" || id === "forest" || id === "tundra")
    : base.maps;
  if (!maps.includes("chicago")) maps.unshift("chicago");
  const train: Ledger["train"] = {};
  if (data.train && typeof data.train === "object") {
    for (const [key, value] of Object.entries(data.train)) {
      if (!isTower(key) || !value) continue;
      const row = value as Partial<Train>;
      train[key] = {
        dmg: clampRank(row.dmg),
        rate: clampRank(row.rate),
        range: clampRank(row.range),
      };
    }
  }
  const known = new Set(DEEDS.map((deed) => deed.id));
  const deeds = Array.isArray(data.deeds) ? data.deeds.filter((id) => typeof id === "string" && known.has(id)) : [];
  return {
    v: 1,
    favors: Math.max(0, Math.floor(Number(data.favors) || 0)),
    cleared: Math.max(0, Math.floor(Number(data.cleared) || 0)),
    towers,
    courts,
    maps,
    train,
    deeds,
  };
}

function clampRank(value: unknown) {
  const n = Math.floor(Number(value) || 0);
  return Math.min(3, Math.max(0, n));
}

export function readLedger(): Ledger {
  if (cache) return cache;
  try {
    if (typeof localStorage === "undefined") {
      cache = fresh();
      return cache;
    }
    const raw = localStorage.getItem(LEDGER_KEY);
    cache = raw ? sanitize(JSON.parse(raw) as unknown) : fresh();
  } catch {
    cache = fresh();
  }
  return cache;
}

function write(book: Ledger) {
  cache = book;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LEDGER_KEY, JSON.stringify(book));
  } catch {
    /* private mode */
  }
  for (const listener of listeners) listener();
}

export function courtOpen(id: TeamId) {
  return readLedger().courts.includes(id);
}

export function mapOpen(id: MapId) {
  return readLedger().maps.includes(id);
}

export function towerOpen(id: TowerId) {
  return readLedger().towers.includes(id);
}

export function openRoster(team: TeamId): TowerId[] {
  const book = readLedger();
  const list = TEAMS[team].units.filter((id) => book.towers.includes(id));
  return list.length ? list : ["harry"];
}

export function trainOf(kind: TowerId): Train {
  return readLedger().train[kind] ?? emptyTrain();
}

/** Training sits on top of the field rank. It does not change the printed tower. */
export function trainedStats(kind: TowerId, rank: number): CombatStats {
  const base = combatStats(kind, rank);
  const train = trainOf(kind);
  return {
    ...base,
    damage: Math.max(1, Math.round(base.damage * (1 + 0.08 * train.dmg))),
    rate: Math.round(base.rate * (1 + 0.08 * train.rate) * 100) / 100,
    range: Math.round(base.range * (1 + 0.06 * train.range) * 100) / 100,
    dot: Math.round(base.dot * (1 + 0.08 * train.dmg) * 10) / 10,
  };
}

export function trainCost(rank: number): number | null {
  if (rank >= 3) return null;
  return rank + 1;
}

export function spendTrain(kind: TowerId, stat: TrainStat): string | null {
  const book = readLedger();
  if (!book.towers.includes(kind)) return "That craft is still shut.";
  const row = book.train[kind] ?? emptyTrain();
  const cost = trainCost(row[stat]);
  if (cost == null) return "That lesson is finished.";
  if (book.favors < cost) return "Not enough favors.";
  const next: Train = { ...row, [stat]: row[stat] + 1 };
  write({
    ...book,
    favors: book.favors - cost,
    train: { ...book.train, [kind]: next },
  });
  noteDeed("train");
  return null;
}

export function noteDeed(id: string): boolean {
  const book = readLedger();
  if (book.deeds.includes(id)) return false;
  if (!DEEDS.some((deed) => deed.id === id)) return false;
  write({ ...book, deeds: [...book.deeds, id] });
  return true;
}

export function grantProgress(reward: {
  favors: number;
  towers: TowerId[];
  courts: TeamId[];
  maps: MapId[];
  chapter: number;
  deed?: string;
}): boolean {
  const book = readLedger();
  const first = book.cleared <= reward.chapter;
  if (!first) return false;
  const towers = [...book.towers];
  for (const id of reward.towers) if (!towers.includes(id)) towers.push(id);
  const courts = [...book.courts];
  for (const id of reward.courts) if (!courts.includes(id)) courts.push(id);
  const maps = [...book.maps];
  for (const id of reward.maps) if (!maps.includes(id)) maps.push(id);
  const deeds = reward.deed && !book.deeds.includes(reward.deed) ? [...book.deeds, reward.deed] : book.deeds;
  write({
    ...book,
    favors: book.favors + reward.favors,
    cleared: reward.chapter + 1,
    towers,
    courts,
    maps,
    deeds,
  });
  return true;
}
