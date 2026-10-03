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
  /** True after deeds already on the shelf have paid their favors once. */
  deedGrant: boolean;
  /** 1 paid the first deed table. 2 paid the current table. */
  favorScale: number;
};

export type Deed = { id: string; name: string; detail: string; favors: number };

export const DEEDS: Deed[] = [
  { id: "first-ward", name: "The door held", detail: "Finish the first lesson on the gold dot.", favors: 3 },
  { id: "hone", name: "Honed", detail: "Hone a defender in the field.", favors: 3 },
  { id: "aim", name: "Chosen target", detail: "Aim a tower at First, Nearest, or Strongest.", favors: 3 },
  { id: "offer", name: "The street's gift", detail: "Take a gift between nights.", favors: 3 },
  { id: "ward", name: "The ward spent", detail: "A stoop ward takes a hit that would have reached the door.", favors: 3 },
  { id: "sell", name: "Released", detail: "Sell a defender back to the night.", favors: 3 },
  { id: "train", name: "Trained", detail: "Spend a favor to train a craft.", favors: 3 },
  { id: "dawn", name: "Ten nights", detail: "Finish a Standard Night.", favors: 5 },
  { id: "endless", name: "Past dawn", detail: "Finish night 12 of an Endless Night.", favors: 8 },
  { id: "winter", name: "Winter broke", detail: "Break the Winter Court on this device.", favors: 5 },
  { id: "red", name: "The vein closed", detail: "Break the Red Court on this device.", favors: 5 },
  { id: "summer", name: "The wood went quiet", detail: "Break the Summer Court on this device.", favors: 5 },
  { id: "case", name: "The case is closed", detail: "Finish the last chapter.", favors: 8 },
  { id: "clean-0", name: "Gold dot, sealed", detail: "Finish The gold dot with nothing at the door.", favors: 3 },
  { id: "clean-1", name: "Tiny sword, sealed", detail: "Finish A tiny sword with nothing at the door.", favors: 3 },
  { id: "clean-2", name: "Rod, sealed", detail: "Finish Hone the rod with nothing at the door.", favors: 3 },
  { id: "clean-3", name: "Small ones, sealed", detail: "Finish Behind the small ones with nothing at the door.", favors: 3 },
  { id: "clean-4", name: "Knight, sealed", detail: "Finish The knight with nothing at the door.", favors: 3 },
  { id: "clean-5", name: "Terrace, sealed", detail: "Finish South terrace with nothing at the door.", favors: 3 },
  { id: "clean-6", name: "Tithe, sealed", detail: "Finish The tithe with nothing at the door.", favors: 3 },
  { id: "clean-7", name: "Old wood, sealed", detail: "Finish The old wood with nothing at the door.", favors: 3 },
  { id: "clean-8", name: "Pale road, sealed", detail: "Finish The pale road with nothing at the door.", favors: 3 },
  { id: "clean-all", name: "Every chapter sealed", detail: "Finish every chapter with nothing at the door.", favors: 8 },
];

/** What the first deed payout already gave, so a raise does not pay that part twice. */
const DEED_PAID_V1: Record<string, number> = {
  "first-ward": 1,
  hone: 1,
  aim: 1,
  offer: 1,
  ward: 1,
  sell: 1,
  train: 1,
  dawn: 2,
  endless: 3,
  winter: 2,
  red: 2,
  summer: 2,
  case: 3,
};

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
    deedGrant: true,
    favorScale: 2,
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
    deedGrant: data.deedGrant === true,
    favorScale: Number.isFinite(data.favorScale)
      ? Math.max(0, Math.floor(Number(data.favorScale)))
      : data.deedGrant === true
        ? 1
        : 0,
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
    const hadSave = raw != null;
    cache = raw ? sanitize(JSON.parse(raw) as unknown) : fresh();
    cache = settleDeeds(cache, hadSave);
  } catch {
    cache = fresh();
  }
  return cache;
}

/** Deeds already unlocked pay the current table once. A raised table pays only the difference. */
function settleDeeds(book: Ledger, hadSave: boolean): Ledger {
  const scale = book.favorScale ?? (book.deedGrant ? 1 : 0);
  if (scale >= 2) return book;
  let bonus = 0;
  for (const id of book.deeds) {
    const already = scale >= 1 ? (DEED_PAID_V1[id] ?? 0) : 0;
    bonus += Math.max(0, deedFavor(id) - already);
  }
  const next = { ...book, favors: book.favors + bonus, deedGrant: true, favorScale: 2 };
  if (hadSave || bonus > 0) persist(next);
  else cache = next;
  return next;
}

export function grantFavor(count: number) {
  const n = Math.max(0, Math.floor(count));
  if (!n) return;
  const book = readLedger();
  write({ ...book, favors: book.favors + n });
}

function persist(book: Ledger) {
  cache = book;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LEDGER_KEY, JSON.stringify(book));
  } catch {
    /* private mode */
  }
}

function write(book: Ledger) {
  persist(book);
  for (const listener of listeners) listener();
}

export function deedFavor(id: string) {
  return DEEDS.find((deed) => deed.id === id)?.favors ?? 0;
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
  write({ ...book, deeds: [...book.deeds, id], favors: book.favors + deedFavor(id) });
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
  const deedNew = Boolean(reward.deed) && !book.deeds.includes(reward.deed as string);
  const deeds = deedNew ? [...book.deeds, reward.deed as string] : book.deeds;
  write({
    ...book,
    favors: book.favors + reward.favors + (deedNew ? deedFavor(reward.deed as string) : 0),
    cleared: reward.chapter + 1,
    towers,
    courts,
    maps,
    deeds,
  });
  return true;
}
