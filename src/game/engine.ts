import {
  BEST_KEY,
  BESTS_KEY,
  CELL,
  COLS,
  CREEPS,
  MAPS,
  MAP_ORDER,
  MARKS_KEY,
  MODES,
  NIGHT_COUNT,
  RANK_NAMES,
  ROWS,
  SAVE_KEY,
  SELL_REFUND,
  START_GOLD,
  START_LIVES,
  TOWERS,
  TEAMS,
  cellCenter,
  combatStats,
  describeWave,
  emptyBests,
  emptyMarks,
  formatClock,
  isModeId,
  isTeamId,
  pathMask,
  upgradeCost,
  waveAt,
  waveCreepCount,
  waypointXY,
  type CombatStats,
  type CreepId,
  type MapId,
  type Marks,
  type ModeId,
  type TargetMode,
  type TeamId,
  type TowerId,
} from "./balance";
import { noteDeed, openRoster, trainedStats } from "./ledger";
import {
  CHAPTERS,
  canPlayChapter,
  claimChapter,
  hintBesidePath,
  storyBlurb,
  type CoachStep,
} from "./story";

export type Phase = "menu" | "prep" | "combat" | "victory" | "defeat";

export type Tower = {
  id: number;
  kind: TowerId;
  c: number;
  r: number;
  rank: number;
  spent: number;
  cooldown: number;
  mode: TargetMode;
  angle: number;
  recoil: number;
};

export type Enemy = {
  id: number;
  kind: CreepId;
  x: number;
  y: number;
  wp: number;
  along: number;
  hp: number;
  maxHp: number;
  slow: number;
  stun: number;
  dot: number;
  dotT: number;
  siphon: number;
  dotHue: string;
  face: number;
  flash: number;
  alive: boolean;
  radius: number;
};

export type Projectile = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  ttl: number;
  damage: number;
  pierce: boolean;
  slow: number;
  splash: number;
  stun: number;
  dot: number;
  dotTime: number;
  siphon: number;
  shatter: number;
  color: string;
  targetId: number | null;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "ring";
};

export type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
};

type SpawnJob = { kind: CreepId; left: number; interval: number };

export type Game = {
  phase: Phase;
  gold: number;
  lives: number;
  slain: number;
  cleared: number;
  sent: number;
  paused: boolean;
  speed: 1 | 2;
  placing: TowerId | null;
  selected: number | null;
  hoverC: number;
  hoverR: number;
  banner: string;
  bannerSeq: number;
  bannerT: number;
  best: number;
  bests: Record<MapId, number>;
  marks: Marks;
  map: MapId;
  team: TeamId;
  mode: ModeId;
  /** Local battle. Skips story saves, bests, and the scripted night clear. */
  duel: boolean;
  /** Coin paid by kills this run, including siphon. Not starting coin, not sell refunds. */
  goldEarned: number;
  /** Lives the door has already paid. */
  livesLost: number;
  /** Simulated seconds for each night that fully cleared. */
  roundTimes: number[];
  /** Simulated combat seconds. Pause, prep, and 2× playback do not change it. */
  combatTime: number;
  /** combatTime at the start of the night now in the street. */
  roundMark: number;
  time: number;
  shake: number;
  flash: number;
  nextId: number;
  dirty: boolean;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  texts: FloatText[];
  spawnQueue: SpawnJob[];
  spawnAcc: number;
  events: string[];
  /** Story chapter index. Null on a free night or a duel. */
  story: number | null;
  coachAt: number;
  offerOpen: boolean;
  freeHone: boolean;
  stoopWard: boolean;
  /** Player streets use trained crafts. The rival's street does not. */
  applyTrain: boolean;
  /** When set, only these towers may be posted. */
  roster: TowerId[] | null;
  /** Free play and story lock the bar to what the case has sworn. */
  limitRoster: boolean;
  hint: { c: number; r: number } | null;
  epilogue: string;
};

export type Selection = {
  id: number;
  kind: TowerId;
  name: string;
  craft: string;
  blurb: string;
  special: string;
  rank: number;
  rankName: string;
  damage: number;
  rate: number;
  range: number;
  nextDamage: number | null;
  nextRate: number | null;
  nextRange: number | null;
  upgrade: number | null;
  sell: number;
  mode: TargetMode;
};

export type Hud = {
  phase: Phase;
  gold: number;
  lives: number;
  livesMax: number;
  slain: number;
  cleared: number;
  sent: number;
  total: number;
  remaining: number;
  nextBlurb: string;
  placing: TowerId | null;
  paused: boolean;
  speed: 1 | 2;
  banner: string;
  bannerSeq: number;
  best: number;
  bests: Record<MapId, number>;
  marks: Marks;
  map: MapId;
  mapName: string;
  mapPlace: string;
  team: TeamId;
  teamName: string;
  mode: ModeId;
  modeName: string;
  goldEarned: number;
  livesLost: number;
  roundTimes: number[];
  combatTime: number;
  /** Simulated seconds already spent on the night in the street. */
  nightClock: number;
  /** True when the current night has not been pushed onto roundTimes. */
  nightOpen: boolean;
  hasSave: boolean;
  saveName: string;
  savePlace: string;
  saveNight: number;
  saveTeam: string;
  saveMode: string;
  selected: Selection | null;
  story: number | null;
  storyTitle: string;
  coach: string;
  /** place, hone, and aim block the send button. */
  coachBlocks: boolean;
  offerOpen: boolean;
  offerLesson: boolean;
  freeHone: boolean;
  stoopWard: boolean;
  epilogue: string;
  roster: TowerId[];
};

export type PlaceResult = "ok" | "street" | "held" | "bounds" | "gold" | "closed";

const listeners = new Set<() => void>();
let quiet = 0;
let game: Game | null = null;

type SaveBrief = {
  map: MapId;
  name: string;
  place: string;
  sent: number;
  team: TeamId;
  teamName: string;
  mode: ModeId;
  modeName: string;
};
let saveBrief: SaveBrief | null = null;
let lastPersist = -999;

type SaveFile = {
  v: 1;
  map: MapId;
  team?: TeamId;
  phase: "prep" | "combat";
  gold: number;
  lives: number;
  slain: number;
  cleared: number;
  sent: number;
  paused: boolean;
  speed: 1 | 2;
  time: number;
  nextId: number;
  spawnAcc: number;
  towers: Tower[];
  enemies: Enemy[];
  spawnQueue: SpawnJob[];
  mode?: ModeId;
  goldEarned?: number;
  livesLost?: number;
  roundTimes?: number[];
  combatTime?: number;
  roundMark?: number;
  story?: number | null;
  coachAt?: number;
  offerOpen?: boolean;
  freeHone?: boolean;
  stoopWard?: boolean;
  roster?: TowerId[] | null;
};

export function createGame(): Game {
  return {
    phase: "menu",
    gold: START_GOLD,
    lives: START_LIVES,
    slain: 0,
    cleared: 0,
    sent: 0,
    paused: false,
    speed: 1,
    placing: null,
    selected: null,
    hoverC: -1,
    hoverR: -1,
    banner: "",
    bannerSeq: 0,
    bannerT: 0,
    best: 0,
    bests: emptyBests(),
    marks: emptyMarks(),
    map: "chicago",
    team: "dresden",
    mode: "standard",
    duel: false,
    goldEarned: 0,
    livesLost: 0,
    roundTimes: [],
    combatTime: 0,
    roundMark: 0,
    time: 0,
    shake: 0,
    flash: 0,
    nextId: 1,
    dirty: false,
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    texts: [],
    spawnQueue: [],
    spawnAcc: 0,
    events: [],
    story: null,
    coachAt: 0,
    offerOpen: false,
    freeHone: false,
    stoopWard: false,
    applyTrain: true,
    roster: null,
    limitRoster: true,
    hint: null,
    epilogue: "",
  };
}

function statsFor(g: Game, kind: TowerId, rank: number) {
  return g.applyTrain ? trainedStats(kind, rank) : combatStats(kind, rank);
}

export function playerRoster(g: Game): TowerId[] {
  if (!g.limitRoster) return (TEAMS[g.team] ?? TEAMS.dresden).units;
  if (g.roster && g.roster.length) return g.roster;
  return openRoster(g.team);
}

function coachStep(g: Game): CoachStep | null {
  if (g.story == null) return null;
  const steps = CHAPTERS[g.story]?.coach ?? [];
  return steps[g.coachAt] ?? null;
}

function syncHint(g: Game) {
  const step = coachStep(g);
  g.hint = step?.kind === "place" ? hintBesidePath(g.map) : null;
}

function advanceCoach(g: Game) {
  if (!coachStep(g)) return;
  g.coachAt += 1;
  const next = coachStep(g);
  if (next?.kind === "place" && next.tower) g.placing = next.tower;
  syncHint(g);
}

function nightCap(g: Game) {
  if (g.story != null) return CHAPTERS[g.story]?.waves.length ?? 1;
  return NIGHT_COUNT;
}

function nightWave(g: Game) {
  if (g.story != null) return CHAPTERS[g.story]?.waves[g.sent] ?? [];
  return waveAt(g.sent);
}

function selectionOf(g: Game): Selection | null {
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return null;
  const def = TOWERS[tower.kind];
  const now = statsFor(g, tower.kind, tower.rank);
  const next = tower.rank < 3 ? statsFor(g, tower.kind, tower.rank + 1) : null;
  return {
    id: tower.id,
    kind: tower.kind,
    name: def.name,
    craft: def.craft,
    blurb: def.blurb,
    special: def.special,
    rank: tower.rank,
    rankName: RANK_NAMES[tower.rank] ?? "Sworn",
    damage: now.damage,
    rate: now.rate,
    range: now.range,
    nextDamage: next ? next.damage : null,
    nextRate: next ? next.rate : null,
    nextRange: next && next.range !== now.range ? next.range : null,
    upgrade: g.freeHone && upgradeCost(tower.kind, tower.rank) != null ? 0 : upgradeCost(tower.kind, tower.rank),
    sell: Math.floor(tower.spent * SELL_REFUND),
    mode: tower.mode,
  };
}

export function buildHud(g: Game): Hud {
  let queued = 0;
  for (const job of g.spawnQueue) queued += job.left;
  const alive = g.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const nextIndex = g.phase === "prep" || g.phase === "menu" ? g.sent : -1;
  const mode = isModeId(g.mode) ? g.mode : "standard";
  const marks = g.marks ?? emptyMarks();
  const roundTimes = Array.isArray(g.roundTimes) ? g.roundTimes : [];
  const combatTime = Number.isFinite(g.combatTime) ? g.combatTime : 0;
  const roundMark = Number.isFinite(g.roundMark) ? g.roundMark : 0;
  const story = g.story != null ? CHAPTERS[g.story] : null;
  const cap = story ? story.waves.length : NIGHT_COUNT;
  const step = coachStep(g);
  const nightOpen = g.phase === "combat" || (g.phase === "defeat" && roundTimes.length < g.sent);
  return {
    phase: g.phase,
    gold: g.gold,
    lives: g.lives,
    livesMax: START_LIVES,
    slain: g.slain,
    cleared: g.cleared,
    sent: g.sent,
    total: mode === "endless" && !story ? 0 : cap,
    remaining: alive + queued,
    nextBlurb: nextIndex >= 0 ? (story ? storyBlurb(g.story ?? 0, nextIndex) : describeWave(nextIndex)) : "",
    placing: g.placing,
    paused: g.paused,
    speed: g.speed,
    banner: g.banner,
    bannerSeq: g.bannerSeq,
    best: g.best,
    bests: g.bests,
    marks,
    map: g.map,
    mapName: MAPS[g.map].name,
    mapPlace: MAPS[g.map].place,
    team: isTeamId(g.team) ? g.team : "dresden",
    teamName: TEAMS[isTeamId(g.team) ? g.team : "dresden"].name,
    mode,
    modeName: MODES[mode].name,
    goldEarned: Number.isFinite(g.goldEarned) ? g.goldEarned : 0,
    livesLost: Number.isFinite(g.livesLost) ? g.livesLost : 0,
    roundTimes,
    combatTime,
    nightClock: nightOpen ? Math.max(0, combatTime - roundMark) : (roundTimes[roundTimes.length - 1] ?? 0),
    nightOpen,
    hasSave: saveBrief != null,
    saveName: saveBrief?.name ?? "",
    savePlace: saveBrief?.place ?? "",
    saveNight: saveBrief?.sent ?? 0,
    saveTeam: saveBrief?.teamName ?? "",
    saveMode: saveBrief?.modeName ?? "",
    selected: selectionOf(g),
    story: g.story,
    storyTitle: story?.title ?? "",
    coach: step?.text ?? "",
    coachBlocks: step != null && step.kind !== "send",
    offerOpen: g.offerOpen,
    offerLesson: story?.teachOffer === true && g.offerOpen,
    freeHone: g.freeHone,
    stoopWard: g.stoopWard,
    epilogue: g.epilogue,
    roster: playerRoster(g),
  };
}

const serverHud = buildHud(createGame());
let hud: Hud = serverHud;

export function getHud() {
  return hud;
}

export function getServerHud() {
  return serverHud;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(g: Game) {
  if (quiet > 0) {
    g.dirty = false;
    return;
  }
  g.dirty = false;
  persistRun(g, true);
  hud = buildHud(g);
  for (const fn of [...listeners]) fn();
}

export function runQuiet(fn: () => void) {
  quiet += 1;
  try {
    fn();
  } finally {
    quiet -= 1;
  }
}

export function refresh(g: Game) {
  emit(g);
}

let leaveDuel: (() => void) | null = null;

export function bindLeaveDuel(fn: () => void) {
  leaveDuel = fn;
}

function leaveBattle() {
  leaveDuel?.();
}

export function queueCreeps(g: Game, kind: CreepId, count: number, interval: number) {
  if (g.phase !== "combat") return;
  if (!(kind in CREEPS) || count <= 0) return;
  g.spawnQueue.push({ kind, left: count, interval: Math.max(0.2, interval) });
  g.dirty = true;
}

export function ensureGame() {
  if (!game) game = createGame();
  return game;
}

function say(g: Game, text: string) {
  g.banner = text;
  g.bannerSeq += 1;
  g.bannerT = 2.4;
  g.dirty = true;
}

function persistBests(bests: Record<MapId, number>) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
    localStorage.setItem(BEST_KEY, String(bests.chicago ?? 0));
  } catch {
    /* private mode */
  }
}

function persistMarks(marks: Marks) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    /* private mode */
  }
}

function modeOf(g: Game): ModeId {
  return isModeId(g.mode) ? g.mode : "standard";
}

function scoreBest(mode: ModeId, bests: Record<MapId, number>, marks: Marks, map: MapId) {
  if (mode === "endless") return marks.endless[map] ?? 0;
  if (mode === "speed") return marks.speed[map] ?? 0;
  return bests[map] ?? 0;
}

function remember(g: Game) {
  const mode = modeOf(g);
  const marks = g.marks ?? emptyMarks();
  g.marks = marks;
  if (mode === "endless") {
    const reached = g.cleared;
    const prev = marks.endless[g.map] ?? 0;
    if (reached > prev) {
      g.marks = { ...marks, endless: { ...marks.endless, [g.map]: reached } };
      persistMarks(g.marks);
    }
    g.best = Math.max(reached, g.marks.endless[g.map] ?? 0);
    return;
  }
  if (mode === "speed") {
    if (g.phase === "victory") {
      const time = g.combatTime;
      const prev = marks.speed[g.map] ?? 0;
      if (time > 0 && (prev <= 0 || time < prev)) {
        g.marks = { ...marks, speed: { ...marks.speed, [g.map]: time } };
        persistMarks(g.marks);
      }
    }
    g.best = g.marks.speed[g.map] ?? 0;
    return;
  }
  const reached = g.phase === "victory" ? NIGHT_COUNT : g.cleared;
  const prev = g.bests[g.map] ?? 0;
  if (reached > prev) {
    g.bests = { ...g.bests, [g.map]: reached };
    persistBests(g.bests);
  }
  g.best = Math.max(reached, g.bests[g.map] ?? 0);
}

function wantsOffer(g: Game) {
  if (g.duel) return false;
  if (g.story != null) return CHAPTERS[g.story]?.teachOffer === true && g.sent < nightCap(g);
  if (modeOf(g) === "speed") return false;
  return true;
}

export function takeOffer(g: Game, kind: "coin" | "hone" | "ward") {
  if (!g.offerOpen || g.phase !== "prep") return;
  g.offerOpen = false;
  if (kind === "coin") {
    g.gold += 40;
    say(g, "Forty coin, left on the stoop.");
  } else if (kind === "hone") {
    g.freeHone = true;
    say(g, "The next hone costs nothing.");
  } else {
    g.stoopWard = true;
    say(g, "A ward sits on the door for one hit.");
  }
  noteDeed("offer");
  emit(g);
}

function endGame(g: Game, phase: "victory" | "defeat") {
  g.phase = phase;
  g.paused = false;
  g.placing = null;
  if (g.duel) {
    g.events.push(phase);
    g.dirty = true;
    return;
  }
  if (g.story != null) {
    g.epilogue = phase === "victory" ? claimChapter(g.story) : "The chapter broke. The swearing waits.";
    clearSave();
    g.events.push(phase);
    g.dirty = true;
    return;
  }
  if (phase === "victory" && modeOf(g) === "standard") noteDeed("dawn");
  remember(g);
  clearSave();
  g.events.push(phase);
  g.dirty = true;
}

function isMapId(value: unknown): value is MapId {
  return typeof value === "string" && MAP_ORDER.includes(value as MapId);
}

function readSave(): SaveFile | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      saveBrief = null;
      return null;
    }
    const data = JSON.parse(raw) as SaveFile;
    if (!data || data.v !== 1 || !isMapId(data.map)) {
      saveBrief = null;
      return null;
    }
    if (data.phase !== "prep" && data.phase !== "combat") return null;
    if (!Array.isArray(data.towers) || !Array.isArray(data.enemies)) return null;
    const team = isTeamId(data.team) ? data.team : "dresden";
    const mode = isModeId(data.mode) ? data.mode : "standard";
    const storyTitle = typeof data.story === "number" ? CHAPTERS[data.story]?.title : "";
    saveBrief = {
      map: data.map,
      name: MAPS[data.map].name,
      place: MAPS[data.map].place,
      sent: Number(data.sent) || 0,
      team,
      teamName: TEAMS[team].name,
      mode,
      modeName: storyTitle || MODES[mode].name,
    };
    return data;
  } catch {
    saveBrief = null;
    return null;
  }
}

function writeSave(g: Game) {
  const file: SaveFile = {
    v: 1,
    map: g.map,
    team: g.team,
    mode: modeOf(g),
    phase: g.phase === "combat" ? "combat" : "prep",
    gold: g.gold,
    lives: g.lives,
    slain: g.slain,
    cleared: g.cleared,
    sent: g.sent,
    paused: g.paused,
    speed: g.speed,
    time: g.time,
    nextId: g.nextId,
    spawnAcc: g.spawnAcc,
    goldEarned: g.goldEarned || 0,
    livesLost: g.livesLost || 0,
    roundTimes: Array.isArray(g.roundTimes) ? g.roundTimes.slice() : [],
    combatTime: g.combatTime || 0,
    roundMark: g.roundMark || 0,
    story: g.story,
    coachAt: g.coachAt,
    offerOpen: g.offerOpen,
    freeHone: g.freeHone,
    stoopWard: g.stoopWard,
    roster: g.roster ? g.roster.slice() : null,
    towers: g.towers.map((t) => ({ ...t, recoil: 0 })),
    enemies: g.enemies.filter((e) => e.alive).map((e) => ({ ...e })),
    spawnQueue: g.spawnQueue.map((job) => ({ ...job })),
  };
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    /* ignore quota */
  }
  const mode = modeOf(g);
  const storyTitle = g.story != null ? CHAPTERS[g.story]?.title : "";
  saveBrief = {
    map: g.map,
    name: MAPS[g.map].name,
    place: MAPS[g.map].place,
    sent: g.sent,
    team: g.team,
    teamName: TEAMS[g.team].name,
    mode,
    modeName: storyTitle || MODES[mode].name,
  };
  lastPersist = g.time;
}

function clearSave() {
  saveBrief = null;
  lastPersist = -999;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

function persistRun(g: Game, force: boolean) {
  if (quiet > 0 || g.duel) return;
  if (g.phase !== "prep" && g.phase !== "combat") return;
  if (!force && g.time - lastPersist < 1) return;
  writeSave(g);
}

function applySave(g: Game, data: SaveFile) {
  const bests = g.bests ?? emptyBests();
  const marks = g.marks ?? emptyMarks();
  const fresh = createGame();
  fresh.bests = bests;
  fresh.marks = marks;
  const team = isTeamId(data.team) ? data.team : "dresden";
  const mode = isModeId(data.mode) ? data.mode : "standard";
  const mask = pathMask(data.map);
  fresh.map = data.map;
  fresh.team = team;
  fresh.mode = mode;
  fresh.best = scoreBest(mode, bests, marks, data.map);
  fresh.phase = data.phase;
  fresh.gold = Math.max(0, Math.floor(data.gold) || 0);
  fresh.lives = Math.max(0, Math.floor(data.lives) || 0);
  fresh.slain = Math.max(0, Math.floor(data.slain) || 0);
  fresh.cleared = Math.max(0, Math.floor(data.cleared) || 0);
  fresh.sent = Math.max(0, Math.floor(data.sent) || 0);
  fresh.paused = Boolean(data.paused);
  fresh.speed = data.speed === 2 ? 2 : 1;
  fresh.time = Number(data.time) || 0;
  fresh.goldEarned = Math.max(0, Math.floor(Number(data.goldEarned)) || 0);
  fresh.livesLost = Math.max(0, Math.floor(Number(data.livesLost)) || 0);
  fresh.combatTime = Math.max(0, Number(data.combatTime) || 0);
  fresh.roundMark = Math.max(0, Number(data.roundMark) || 0);
  fresh.roundTimes = Array.isArray(data.roundTimes)
    ? data.roundTimes.filter((n) => Number.isFinite(n) && n >= 0)
    : [];
  fresh.nextId = Math.max(1, Math.floor(data.nextId) || 1);
  fresh.spawnAcc = Number(data.spawnAcc) || 0;
  fresh.towers = data.towers.filter(
    (t) =>
      t &&
      t.kind in TOWERS &&
      TEAMS[team].units.includes(t.kind) &&
      t.c >= 0 &&
      t.r >= 0 &&
      t.c < COLS &&
      t.r < ROWS &&
      !mask[t.r]?.[t.c],
  );
  fresh.enemies = data.enemies
    .filter((e) => e && e.alive && e.kind in CREEPS)
    .map((e) => ({
      ...e,
      stun: Number(e.stun) || 0,
      dot: Number(e.dot) || 0,
      dotT: Number(e.dotT) || 0,
      siphon: Number(e.siphon) || 0,
      dotHue: typeof e.dotHue === "string" ? e.dotHue : "",
    }));
  fresh.spawnQueue = data.spawnQueue.filter((job) => job && job.kind in CREEPS && job.left > 0);
  const storyIndex = typeof data.story === "number" && CHAPTERS[data.story] ? data.story : null;
  fresh.story = storyIndex;
  fresh.coachAt = Math.max(0, Math.floor(Number(data.coachAt) || 0));
  fresh.offerOpen = Boolean(data.offerOpen);
  fresh.freeHone = Boolean(data.freeHone);
  fresh.stoopWard = Boolean(data.stoopWard);
  fresh.applyTrain = true;
  fresh.limitRoster = true;
  fresh.roster = storyIndex != null ? CHAPTERS[storyIndex].roster.slice() : null;
  syncHint(fresh);
  if (coachStep(fresh)?.kind === "place" && coachStep(fresh)?.tower) {
    fresh.placing = coachStep(fresh)?.tower ?? null;
  }
  Object.assign(g, fresh);
}

function readMarks(): Marks {
  const marks = emptyMarks();
  try {
    if (typeof localStorage === "undefined") return marks;
    const raw = localStorage.getItem(MARKS_KEY);
    if (!raw) return marks;
    const parsed = JSON.parse(raw) as {
      endless?: Partial<Record<MapId, number>>;
      speed?: Partial<Record<MapId, number>>;
    };
    for (const id of MAP_ORDER) {
      const nights = Number(parsed?.endless?.[id]);
      const time = Number(parsed?.speed?.[id]);
      if (Number.isFinite(nights) && nights > 0) marks.endless[id] = nights;
      if (Number.isFinite(time) && time > 0) marks.speed[id] = time;
    }
  } catch {
    /* ignore */
  }
  return marks;
}

export function loadBest(g: Game) {
  try {
    if (typeof localStorage === "undefined") return;
    const bests = emptyBests();
    const raw = localStorage.getItem(BESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<MapId, number>>;
      for (const id of MAP_ORDER) {
        const n = Number(parsed?.[id]);
        if (Number.isFinite(n) && n > 0) bests[id] = n;
      }
    } else {
      const n = Number(localStorage.getItem(BEST_KEY) || 0);
      if (Number.isFinite(n) && n > 0) bests.chicago = n;
    }
    g.bests = bests;
    g.marks = readMarks();
    g.best = scoreBest(modeOf(g), bests, g.marks, g.map);
    g.limitRoster = true;
    g.applyTrain = true;
    readSave();
    emit(g);
  } catch {
    /* ignore */
  }
}

export function newGame(
  g: Game,
  mapId: MapId = "chicago",
  teamId: TeamId = "dresden",
  modeId: ModeId = "standard",
) {
  const id = isMapId(mapId) ? mapId : "chicago";
  const team = isTeamId(teamId) ? teamId : "dresden";
  const mode = isModeId(modeId) ? modeId : "standard";
  leaveBattle();
  const bests = g.bests ?? emptyBests();
  const marks = g.marks ?? emptyMarks();
  const fresh = createGame();
  fresh.bests = bests;
  fresh.marks = marks;
  fresh.map = id;
  fresh.team = team;
  fresh.mode = mode;
  fresh.best = scoreBest(mode, bests, marks, id);
  fresh.phase = "prep";
  fresh.applyTrain = true;
  fresh.limitRoster = true;
  Object.assign(g, fresh);
  say(g, `${MODES[mode].name} · ${TEAMS[team].name} · ${MAPS[id].place}`);
  emit(g);
}

export function startStory(g: Game, index: number) {
  if (!canPlayChapter(index)) return false;
  const chapter = CHAPTERS[index];
  leaveBattle();
  const bests = g.bests ?? emptyBests();
  const marks = g.marks ?? emptyMarks();
  const fresh = createGame();
  fresh.bests = bests;
  fresh.marks = marks;
  fresh.map = chapter.map;
  fresh.team = chapter.team;
  fresh.mode = "standard";
  fresh.best = scoreBest("standard", bests, marks, chapter.map);
  fresh.phase = "prep";
  fresh.story = index;
  fresh.roster = chapter.roster.slice();
  fresh.limitRoster = true;
  fresh.applyTrain = true;
  fresh.coachAt = 0;
  const first = chapter.coach[0];
  if (first?.kind === "place" && first.tower) fresh.placing = first.tower;
  syncHint(fresh);
  Object.assign(g, fresh);
  say(g, chapter.title);
  emit(g);
  return true;
}

export function startCase(g: Game, mapId?: MapId, teamId?: TeamId) {
  newGame(g, mapId ?? "chicago", teamId ?? "dresden");
}

export function continueGame(g: Game) {
  const data = readSave();
  if (!data) return false;
  leaveBattle();
  applySave(g, data);
  say(g, MAPS[g.map].place);
  emit(g);
  return true;
}

export function toMenu(g: Game) {
  if (!g.duel && (g.phase === "prep" || g.phase === "combat")) writeSave(g);
  g.phase = "menu";
  g.paused = false;
  g.placing = null;
  g.selected = null;
  g.hoverC = -1;
  g.hoverR = -1;
  emit(g);
}

export function restart(g: Game) {
  if (g.story != null) {
    startStory(g, g.story);
    return;
  }
  newGame(g, g.map, g.team, modeOf(g));
}

export function selectKind(g: Game, kind: TowerId) {
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") return;
  if (g.limitRoster && !playerRoster(g).includes(kind)) return;
  g.placing = g.placing === kind ? null : kind;
  g.selected = null;
  emit(g);
}

export function clearSelect(g: Game) {
  g.placing = null;
  g.selected = null;
  g.hoverC = -1;
  g.hoverR = -1;
  emit(g);
}

export function setHover(g: Game, c: number, r: number) {
  g.hoverC = c;
  g.hoverR = r;
}

export function setMode(g: Game, mode: TargetMode) {
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return;
  tower.mode = mode;
  if (mode !== "first") noteDeed("aim");
  const step = coachStep(g);
  if (step?.kind === "aim" && mode !== "first") advanceCoach(g);
  emit(g);
}

export function toggleSpeed(g: Game) {
  g.speed = g.speed === 1 ? 2 : 1;
  emit(g);
}

export function togglePause(g: Game) {
  if (g.phase !== "combat") return;
  g.paused = !g.paused;
  emit(g);
}

export function placementStatus(g: Game, c: number, r: number, kind: TowerId): PlaceResult {
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") return "closed";
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return "bounds";
  if (pathMask(g.map)[r][c]) return "street";
  if (g.towers.some((t) => t.c === c && t.r === r)) return "held";
  if (g.gold < TOWERS[kind].cost) return "gold";
  return "ok";
}

function placeTower(g: Game, kind: TowerId, c: number, r: number) {
  if (g.limitRoster && !playerRoster(g).includes(kind)) return;
  const def = TOWERS[kind];
  g.gold -= def.cost;
  const tower = {
    id: g.nextId++,
    kind,
    c,
    r,
    rank: 1,
    spent: def.cost,
    cooldown: 0,
    mode: "first" as const,
    angle: 0,
    recoil: 0,
  };
  g.towers.push(tower);
  say(g, `${def.name} takes the corner.`);
  g.events.push("place");
  const step = coachStep(g);
  if (step?.kind === "place" && (!step.tower || step.tower === kind)) {
    g.selected = tower.id;
    g.placing = null;
    advanceCoach(g);
  }
  emit(g);
}

export function clickCell(g: Game, c: number, r: number) {
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") return;
  if (g.duel && g.paused && g.placing) {
    say(g, "The street is held.");
    emit(g);
    return;
  }
  if (g.placing) {
    const existing = g.towers.find((t) => t.c === c && t.r === r);
    if (existing) {
      g.placing = null;
      g.selected = existing.id;
      emit(g);
      return;
    }
    const status = placementStatus(g, c, r, g.placing);
    if (status === "ok") {
      placeTower(g, g.placing, c, r);
      return;
    }
    if (status === "street") say(g, "The street is warded. Build on the sidewalk.");
    else if (status === "gold") say(g, "Not enough coin.");
    else if (status === "bounds") return;
    if (status === "street" || status === "gold") {
      g.events.push("deny");
      emit(g);
    }
    return;
  }
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) {
    g.selected = null;
    emit(g);
    return;
  }
  const tower = g.towers.find((t) => t.c === c && t.r === r);
  g.selected = tower ? tower.id : null;
  emit(g);
}

export function upgradeSelected(g: Game) {
  if (g.duel && g.paused) {
    say(g, "The street is held.");
    emit(g);
    return;
  }
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return;
  const listed = upgradeCost(tower.kind, tower.rank);
  if (listed == null) {
    say(g, "That craft is already mastered.");
    emit(g);
    return;
  }
  const cost = g.freeHone ? 0 : listed;
  if (g.gold < cost) {
    say(g, "Not enough coin to hone them.");
    g.events.push("deny");
    emit(g);
    return;
  }
  g.gold -= cost;
  if (g.freeHone) g.freeHone = false;
  else tower.spent += cost;
  tower.rank += 1;
  say(g, `${TOWERS[tower.kind].name} is ${RANK_NAMES[tower.rank]}.`);
  g.events.push("upgrade");
  noteDeed("hone");
  if (coachStep(g)?.kind === "hone") advanceCoach(g);
  emit(g);
}

export function sellSelected(g: Game) {
  if (g.duel && g.paused) {
    say(g, "The street is held.");
    emit(g);
    return;
  }
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return;
  const refund = Math.floor(tower.spent * SELL_REFUND);
  g.gold += refund;
  g.towers = g.towers.filter((t) => t.id !== tower.id);
  g.selected = null;
  say(g, `Released. ${refund} coin returned.`);
  g.events.push("sell");
  noteDeed("sell");
  emit(g);
}

function beginWave(g: Game) {
  const mode = modeOf(g);
  const cap = nightCap(g);
  if (mode !== "endless" && g.sent >= cap) return false;
  const wave = nightWave(g);
  if (waveCreepCount(wave) <= 0) return false;
  g.spawnQueue = wave.map((group) => ({
    kind: group.kind,
    left: group.count,
    interval: group.interval,
  }));
  g.spawnAcc = wave[0]?.interval ?? 0;
  g.sent += 1;
  g.phase = "combat";
  g.paused = false;
  g.roundMark = g.combatTime || 0;
  g.offerOpen = false;
  return true;
}

export function sendWave(g: Game) {
  if (g.phase !== "prep") return;
  if (g.offerOpen) {
    say(g, "Take the street's gift first.");
    g.events.push("deny");
    emit(g);
    return;
  }
  const step = coachStep(g);
  if (step && step.kind !== "send") {
    say(g, step.text);
    g.events.push("deny");
    emit(g);
    return;
  }
  const cap = nightCap(g);
  if (modeOf(g) !== "endless" && g.sent >= cap) return;
  if (g.towers.length === 0) {
    say(g, "Post a defender before you open the street.");
    g.events.push("deny");
    emit(g);
    return;
  }
  if (step?.kind === "send") advanceCoach(g);
  if (!beginWave(g)) return;
  say(g, `Night ${g.sent} hits the street.`);
  g.events.push("wave");
  emit(g);
}

function burst(g: Game, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    if (g.particles.length > 140) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    g.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.28 + Math.random() * 0.22,
      max: 0.5,
      size: 2 + Math.random() * 2.5,
      color,
      kind: "spark",
    });
  }
}

function ring(g: Game, x: number, y: number, color: string, size: number) {
  g.particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.32,
    max: 0.32,
    size,
    color,
    kind: "ring",
  });
}

function floatText(g: Game, x: number, y: number, text: string, color: string) {
  g.texts.push({ x, y, text, life: 0.8, max: 0.8, color });
  if (g.texts.length > 24) g.texts.splice(0, g.texts.length - 24);
}

function finishKill(g: Game, enemy: Enemy, siphon: number) {
  if (!enemy.alive || g.phase === "defeat") return;
  enemy.alive = false;
  enemy.hp = 0;
  const bounty = CREEPS[enemy.kind].gold + Math.max(0, Math.round(siphon));
  g.gold += bounty;
  g.goldEarned = (g.goldEarned || 0) + bounty;
  g.slain += 1;
  g.events.push("kill");
  floatText(g, enemy.x, enemy.y - 20, `+${bounty}`, "#e0b15a");
  burst(g, enemy.x, enemy.y, CREEPS[enemy.kind].color, enemy.kind === "outsider" ? 18 : 8);
  g.shake = Math.max(g.shake, enemy.kind === "outsider" ? 1 : 0.22);
  g.dirty = true;
}

function hurt(
  g: Game,
  enemy: Enemy,
  amount: number,
  pierce: boolean,
  slow: number,
  stun: number,
  dot: number,
  dotTime: number,
  siphon: number,
  shatter: number,
  hue: string,
) {
  if (!enemy.alive || g.phase === "defeat") return;
  let hit = amount;
  if (shatter > 0 && ((enemy.slow ?? 0) > 0 || (enemy.stun ?? 0) > 0)) hit *= 1 + shatter;
  const armor = pierce ? 0 : CREEPS[enemy.kind].armor;
  const dealt = Math.max(1, Math.round(hit - armor));
  enemy.hp -= dealt;
  enemy.flash = 0.1;
  if (slow > 0) enemy.slow = Math.max(enemy.slow, slow);
  if (stun > 0) enemy.stun = Math.max(enemy.stun ?? 0, stun);
  if (dot > 0 && dotTime > 0 && (dot >= (enemy.dot ?? 0) || (enemy.dotT ?? 0) <= 0)) {
    enemy.dot = dot;
    enemy.dotT = dotTime;
    enemy.dotHue = hue;
    enemy.siphon = siphon;
  }
  if (enemy.hp <= 0) finishKill(g, enemy, siphon);
}

function leak(g: Game, enemy: Enemy) {
  enemy.alive = false;
  if (g.phase !== "combat") return;
  if (g.stoopWard) {
    g.stoopWard = false;
    g.events.push("leak");
    g.shake = 0.45;
    say(g, "The ward takes the hit.");
    noteDeed("ward");
    return;
  }
  const cost = CREEPS[enemy.kind].leak;
  g.lives -= cost;
  g.livesLost = (g.livesLost || 0) + cost;
  g.events.push("leak");
  g.shake = 1;
  g.flash = 0.5;
  if (g.lives <= 0) {
    g.lives = 0;
    endGame(g, "defeat");
    say(g, "The threshold broke.");
  } else {
    say(g, cost > 1 ? `The door shudders. ${cost} lives.` : "Something reached the door.");
  }
}

function pickTarget(g: Game, tower: Tower, rangePx: number): Enemy | null {
  const origin = cellCenter(tower.c, tower.r);
  const r2 = rangePx * rangePx;
  let best: Enemy | null = null;
  let bestScore = 0;
  for (const enemy of g.enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - origin.x;
    const dy = enemy.y - origin.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const score =
      tower.mode === "first" ? enemy.along : tower.mode === "nearest" ? -d2 : enemy.hp;
    if (!best || score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

function fire(g: Game, tower: Tower, target: Enemy, stats: CombatStats) {
  const origin = cellCenter(tower.c, tower.r);
  const hue = TOWERS[tower.kind].color;
  tower.angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  tower.recoil = 0.12;
  g.events.push(`shoot:${tower.kind}`);
  if (stats.instant) {
    hurt(g, target, stats.damage, false, stats.slow, stats.stun, stats.dot, stats.dotTime, stats.siphon, stats.shatter, hue);
    const r2 = stats.splash * CELL * (stats.splash * CELL);
    for (const enemy of g.enemies) {
      if (!enemy.alive || enemy.id === target.id) continue;
      const dx = enemy.x - target.x;
      const dy = enemy.y - target.y;
      if (dx * dx + dy * dy <= r2) {
        hurt(
          g,
          enemy,
          stats.damage,
          false,
          stats.slow,
          stats.stun * 0.45,
          stats.dot * 0.65,
          stats.dotTime,
          0,
          stats.shatter,
          hue,
        );
      }
    }
    ring(g, target.x, target.y, hue, CELL * 0.25);
    g.shake = Math.max(g.shake, 0.12);
    return;
  }
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy) || 1;
  g.projectiles.push({
    alive: true,
    x: origin.x,
    y: origin.y - 8,
    vx: (dx / dist) * stats.shotSpeed,
    vy: (dy / dist) * stats.shotSpeed,
    speed: stats.shotSpeed,
    ttl: 2.2,
    damage: stats.damage,
    pierce: stats.pierce,
    slow: stats.slow,
    splash: stats.splash,
    stun: stats.stun,
    dot: stats.dot,
    dotTime: stats.dotTime,
    siphon: stats.siphon,
    shatter: stats.shatter,
    color: hue,
    targetId: target.id,
  });
}

function distPointSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 < 0.0001 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return dx * dx + dy * dy;
}

function impact(g: Game, shot: Projectile, hit: Enemy) {
  hurt(
    g,
    hit,
    shot.damage,
    shot.pierce,
    shot.slow,
    shot.stun,
    shot.dot,
    shot.dotTime,
    shot.siphon,
    shot.shatter,
    shot.color,
  );
  if (shot.splash > 0) {
    const r = shot.splash * CELL;
    const r2 = r * r;
    for (const enemy of g.enemies) {
      if (!enemy.alive || enemy.id === hit.id) continue;
      const dx = enemy.x - hit.x;
      const dy = enemy.y - hit.y;
      if (dx * dx + dy * dy <= r2) {
        hurt(
          g,
          enemy,
          shot.damage * 0.65,
          shot.pierce,
          shot.slow,
          shot.stun * 0.45,
          shot.dot * 0.65,
          shot.dotTime,
          0,
          shot.shatter,
          shot.color,
        );
      }
    }
  }
  burst(g, hit.x, hit.y, shot.color, 5);
}

function spawnEnemy(g: Game, kind: CreepId) {
  const def = CREEPS[kind];
  const pts = waypointXY(g.map);
  const pressure =
    1 + Math.max(0, g.sent - 1) * (kind === "outsider" ? 0.04 : 0.055);
  const hp = Math.round(def.hp * pressure);
  const enemy: Enemy = {
    id: g.nextId++,
    kind,
    x: pts[0].x,
    y: pts[0].y,
    wp: 1,
    along: 0,
    hp,
    maxHp: hp,
    slow: 0,
    stun: 0,
    dot: 0,
    dotT: 0,
    siphon: 0,
    dotHue: "",
    face: def.artFace,
    flash: 0,
    alive: true,
    radius: def.radius,
  };
  g.enemies.push(enemy);
  g.dirty = true;
  if (kind === "outsider") {
    say(g, "An Outsider is on the street.");
    g.events.push("boss");
    g.shake = 1;
  }
}

function simulate(g: Game, dt: number) {
  if (g.phase !== "combat") return;
  g.combatTime = (g.combatTime || 0) + dt;
  const pts = waypointXY(g.map);
  g.spawnAcc += dt;
  const head = g.spawnQueue[0];
  if (head) {
    let guard = 0;
    while (head.left > 0 && g.spawnAcc >= head.interval && guard < 6) {
      g.spawnAcc -= head.interval;
      head.left -= 1;
      spawnEnemy(g, head.kind);
      guard += 1;
    }
    if (head.left <= 0) {
      g.spawnQueue.shift();
      g.spawnAcc = 0;
    }
  }

  for (const enemy of g.enemies) {
    if (!enemy.alive) continue;
    if (g.phase !== "combat") break;
    if ((enemy.stun ?? 0) > 0) enemy.stun -= dt;
    if (enemy.slow > 0) enemy.slow -= dt;
    if (enemy.flash > 0) enemy.flash -= dt;
    if ((enemy.dotT ?? 0) > 0 && enemy.alive) {
      enemy.hp -= (enemy.dot ?? 0) * dt;
      enemy.dotT -= dt;
      if (enemy.hp <= 0) {
        finishKill(g, enemy, enemy.siphon ?? 0);
        continue;
      }
    }
    const target = pts[enemy.wp];
    if (!target) {
      leak(g, enemy);
      continue;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const frozen = (enemy.stun ?? 0) > 0;
    const speed = frozen ? 0 : CREEPS[enemy.kind].speed * CELL * (enemy.slow > 0 ? 0.5 : 1);
    const step = speed * dt;
    if (dist <= step || dist < 0.8) {
      enemy.along += dist;
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.wp += 1;
      if (enemy.wp >= pts.length) leak(g, enemy);
    } else {
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
      enemy.along += step;
      if (Math.abs(dx) > 6) enemy.face = (dx > 0 ? 1 : -1) * CREEPS[enemy.kind].artFace;
    }
  }

  if (g.phase !== "combat") {
    g.enemies = g.enemies.filter((e) => e.alive);
    return;
  }

  for (const tower of g.towers) {
    if (tower.cooldown > 0) tower.cooldown -= dt;
    if (tower.recoil > 0) tower.recoil -= dt;
    const stats = statsFor(g, tower.kind, tower.rank);
    const target = pickTarget(g, tower, stats.range * CELL);
    if (target) {
      const origin = cellCenter(tower.c, tower.r);
      tower.angle = Math.atan2(target.y - origin.y, target.x - origin.x);
    }
    if (tower.cooldown <= 0 && target) {
      fire(g, tower, target, stats);
      tower.cooldown = 1 / stats.rate;
    }
  }

  for (const shot of g.projectiles) {
    if (!shot.alive) continue;
    const prevX = shot.x;
    const prevY = shot.y;
    if (shot.targetId != null) {
      const locked = g.enemies.find((e) => e.id === shot.targetId && e.alive);
      if (locked) {
        const dx = locked.x - shot.x;
        const dy = locked.y - shot.y;
        const dist = Math.hypot(dx, dy) || 1;
        shot.vx = (dx / dist) * shot.speed;
        shot.vy = (dy / dist) * shot.speed;
      } else {
        shot.targetId = null;
      }
    }
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.ttl -= dt;
    let hit: Enemy | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const enemy of g.enemies) {
      if (!enemy.alive) continue;
      const d = distPointSeg(enemy.x, enemy.y, prevX, prevY, shot.x, shot.y);
      const rad = enemy.radius + 14;
      if (d <= rad * rad && d < best) {
        best = d;
        hit = enemy;
      }
    }
    if (hit) {
      impact(g, shot, hit);
      shot.alive = false;
    } else if (shot.ttl <= 0) {
      shot.alive = false;
    }
  }

  if (g.projectiles.length > 24) g.projectiles = g.projectiles.filter((p) => p.alive);
  g.enemies = g.enemies.filter((e) => e.alive);

  if (g.phase === "combat" && !g.duel && g.spawnQueue.length === 0 && g.enemies.length === 0) {
    if (!Array.isArray(g.roundTimes)) g.roundTimes = [];
    const elapsed = Math.max(0, (g.combatTime || 0) - (g.roundMark || 0));
    g.roundTimes.push(elapsed);
    g.cleared = g.sent;
    const mode = modeOf(g);
    const cap = nightCap(g);
    const finished = mode !== "endless" && g.sent >= cap;
    if (finished) {
      endGame(g, "victory");
    } else if (mode === "speed" && g.story == null) {
      if (!beginWave(g)) {
        endGame(g, "victory");
      } else {
        say(g, `Night ${g.sent} hits the street. ${formatClock(elapsed)} on the last.`);
        g.events.push("waveclear");
        g.events.push("wave");
      }
    } else {
      g.phase = "prep";
      g.paused = false;
      if (wantsOffer(g)) g.offerOpen = true;
      say(g, `Night ${g.sent} is quiet. ${formatClock(elapsed)}.`);
      g.events.push("waveclear");
      if (mode === "endless" && g.cleared >= 12) noteDeed("endless");
    }
  }
}

function updateFx(g: Game, dt: number) {
  for (const particle of g.particles) {
    particle.life -= dt;
    if (particle.kind === "spark") {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 30 * dt;
    }
  }
  if (g.particles.length) g.particles = g.particles.filter((p) => p.life > 0);
  for (const text of g.texts) {
    text.life -= dt;
    text.y -= 28 * dt;
  }
  if (g.texts.length) g.texts = g.texts.filter((t) => t.life > 0);
}

export function step(g: Game, dt: number) {
  const frame = Math.min(0.05, Math.max(0, dt));
  g.time += frame;
  if (g.flash > 0) g.flash = Math.max(0, g.flash - frame * 1.4);
  if (g.shake > 0) g.shake = Math.max(0, g.shake - frame * 1.7);
  if (g.banner && g.bannerT > 0) {
    g.bannerT -= frame;
    if (g.bannerT <= 0) {
      g.banner = "";
      g.dirty = true;
    }
  }
  updateFx(g, frame);
  if (g.phase === "combat" && !g.paused) {
    const clockBefore = Math.floor(g.combatTime || 0);
    let left = frame * g.speed;
    while (left > 0.0001 && g.phase === "combat") {
      const slice = Math.min(left, 1 / 60);
      simulate(g, slice);
      left -= slice;
    }
    if (Math.floor(g.combatTime || 0) !== clockBefore) g.dirty = true;
  }
  persistRun(g, false);
  if (g.dirty) emit(g);
}

export function debugFast(g: Game, seconds: number) {
  quiet += 1;
  try {
    const n = Math.max(0, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) step(g, 1 / 60);
  } finally {
    quiet -= 1;
    emit(g);
  }
}
