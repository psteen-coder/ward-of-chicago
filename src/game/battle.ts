import {
  COLS,
  CREEPS,
  MAPS,
  MAP_ORDER,
  ROWS,
  TEAMS,
  TEAM_ORDER,
  TOWERS,
  cellCenter,
  pathMask,
  upgradeCost,
  waypointXY,
  type CreepId,
  type MapId,
  type TeamId,
  type TowerId,
} from "./balance";
import {
  bindLeaveDuel,
  clickCell,
  createGame,
  queueCreeps,
  refresh,
  runQuiet,
  step,
  upgradeSelected,
  type Game,
  type Phase,
} from "./engine";

export type PushId = "fledgling" | "ghoul" | "blackcourt" | "outsider";

export type PushSpec = {
  id: PushId;
  kind: CreepId;
  count: number;
  cost: number;
  interval: number;
  label: string;
};

/** Paid by the sender. The defender keeps the kill bounty. */
export const PUSHES: PushSpec[] = [
  { id: "fledgling", kind: "fledgling", count: 6, cost: 36, interval: 0.42, label: "6 fledglings" },
  { id: "ghoul", kind: "ghoul", count: 4, cost: 58, interval: 0.7, label: "4 ghouls" },
  { id: "blackcourt", kind: "blackcourt", count: 2, cost: 84, interval: 0.9, label: "2 Black Court" },
  { id: "outsider", kind: "outsider", count: 1, cost: 200, interval: 1.2, label: "An Outsider" },
];

const INCOME_GOLD = 4;
const INCOME_EVERY = 2;
const SEND_EVERY = 7;
const RESERVE = 16;

export type DuelHud = {
  watch: "you" | "rival";
  youTeam: string;
  rivalTeam: string;
  youTeamId: TeamId;
  rivalTeamId: TeamId;
  map: MapId;
  mapPlace: string;
  youLives: number;
  rivalLives: number;
  youGold: number;
  rivalGold: number;
  youLeft: number;
  rivalLeft: number;
  lastPush: string;
  pushSpent: number;
  income: string;
  parked: boolean;
};

type Site = { c: number; r: number };

type Session = {
  you: Game;
  foe: Game;
  watch: "you" | "rival";
  incomeYou: number;
  incomeFoe: number;
  aiAcc: number;
  pushSpent: number;
  lastPush: string;
  dirty: boolean;
  parked: Phase;
  sites: Site[];
  siteCursor: number;
  setup: { map: MapId; you: TeamId; rival: TeamId };
};

let session: Session | null = null;

bindLeaveDuel(() => {
  session = null;
});

function laneSites(map: MapId): Site[] {
  const mask = pathMask(map);
  const start = waypointXY(map)[1] ?? waypointXY(map)[0];
  const sites: (Site & { d: number })[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (mask[r]?.[c]) continue;
      let near = false;
      if (mask[r - 1]?.[c] || mask[r + 1]?.[c] || mask[r]?.[c - 1] || mask[r]?.[c + 1]) near = true;
      if (!near) continue;
      const at = cellCenter(c, r);
      const dx = at.x - start.x;
      const dy = at.y - start.y;
      sites.push({ c, r, d: dx * dx + dy * dy });
    }
  }
  sites.sort((a, b) => a.d - b.d);
  return sites;
}

function pressure(g: Game) {
  let n = 0;
  for (const enemy of g.enemies) if (enemy.alive) n += 1;
  for (const job of g.spawnQueue) n += job.left;
  return n;
}

function placeOn(g: Game, kind: TowerId, sites: Site[], cursor: { i: number }) {
  if (g.gold < TOWERS[kind].cost) return false;
  while (cursor.i < sites.length) {
    const site = sites[cursor.i++];
    if (g.towers.some((tower) => tower.c === site.c && tower.r === site.r)) continue;
    g.placing = kind;
    clickCell(g, site.c, site.r);
    g.placing = null;
    const posted = g.towers.some((tower) => tower.c === site.c && tower.r === site.r);
    if (posted) {
      g.banner = "";
      g.bannerT = 0;
      return true;
    }
  }
  return false;
}

function seedFoe(g: Game, sites: Site[]) {
  const units = TEAMS[g.team].units;
  const cursor = { i: 0 };
  runQuiet(() => {
    placeOn(g, units[0], sites, cursor);
    if (sites.length > 2) cursor.i = Math.min(sites.length - 1, 2);
    placeOn(g, units[1] ?? units[0], sites, cursor);
    g.banner = "";
    g.bannerT = 0;
  });
  return cursor.i;
}

function maybeUpgrade(g: Game) {
  for (const tower of g.towers) {
    const cost = upgradeCost(tower.kind, tower.rank);
    if (cost == null) continue;
    if (g.gold - cost < RESERVE + 20) continue;
    g.selected = tower.id;
    upgradeSelected(g);
    g.selected = null;
    g.banner = "";
    g.bannerT = 0;
    return;
  }
}

function maybePlace(session: Session) {
  const foe = session.foe;
  if (foe.towers.length >= 4) return;
  const units = TEAMS[foe.team].units;
  const kind = units[Math.min(units.length - 1, foe.towers.length)];
  if (foe.gold < TOWERS[kind].cost + RESERVE + 10) return;
  const cursor = { i: session.siteCursor };
  if (placeOn(foe, kind, session.sites, cursor)) session.siteCursor = cursor.i;
}

function maybeSend(session: Session) {
  const foe = session.foe;
  const you = session.you;
  const order = [...PUSHES].reverse();
  const spec = order.find((push) => {
    if (foe.gold - push.cost < RESERVE) return false;
    if (push.kind === "outsider" && foe.combatTime < 50) return false;
    if (push.kind === "blackcourt" && foe.combatTime < 24) return false;
    if (push.kind === "ghoul" && foe.combatTime < 10) return false;
    return true;
  });
  if (!spec) return;
  foe.gold -= spec.cost;
  queueCreeps(you, spec.kind, spec.count, spec.interval);
  session.lastPush = `${TEAMS[foe.team].name} pushed ${spec.label}.`;
  you.banner = session.lastPush;
  you.bannerSeq += 1;
  you.bannerT = 2.4;
  you.dirty = true;
  you.events.push(spec.kind === "outsider" ? "boss" : "wave");
  session.dirty = true;
}

function bot(session: Session, sim: number) {
  if (session.foe.phase !== "combat" || session.you.phase !== "combat") return;
  session.aiAcc += sim;
  if (session.aiAcc < SEND_EVERY) return;
  session.aiAcc -= SEND_EVERY;
  runQuiet(() => {
    maybeUpgrade(session.foe);
    maybePlace(session);
    session.foe.banner = "";
    session.foe.bannerT = 0;
  });
  maybeSend(session);
}

function drip(g: Game, sim: number, acc: number) {
  let left = acc + sim;
  let gained = false;
  while (left >= INCOME_EVERY) {
    left -= INCOME_EVERY;
    g.gold += INCOME_GOLD;
    gained = true;
  }
  if (gained) g.dirty = true;
  return left;
}

export function getDuel(): DuelHud | null {
  if (!session || !session.you.duel) return null;
  const you = session.you;
  const foe = session.foe;
  return {
    watch: session.watch,
    youTeam: TEAMS[you.team].name,
    rivalTeam: TEAMS[foe.team].name,
    youTeamId: you.team,
    rivalTeamId: foe.team,
    map: you.map,
    mapPlace: MAPS[you.map].place,
    youLives: you.lives,
    rivalLives: foe.lives,
    youGold: you.gold,
    rivalGold: foe.gold,
    youLeft: pressure(you),
    rivalLeft: pressure(foe),
    lastPush: session.lastPush,
    pushSpent: session.pushSpent,
    income: `${INCOME_GOLD} coin every ${INCOME_EVERY}s, both streets`,
    parked: you.phase === "menu",
  };
}

export function takeRivalEvents(): string[] {
  if (!session) return [];
  return session.foe.events.splice(0, session.foe.events.length);
}

export function shownGame(player: Game): Game {
  if (!session || !player.duel || session.watch === "you") return player;
  return session.foe;
}

export function setWatch(side: "you" | "rival") {
  if (!session) return;
  session.watch = side;
  if (side === "rival") {
    session.you.hoverC = -1;
    session.you.hoverR = -1;
  }
  refresh(session.you);
}

export function holdWatch(g: Game) {
  if (!session || session.you !== g) return;
  g.banner = "That street is theirs. Switch back to build.";
  g.bannerSeq += 1;
  g.bannerT = 2.4;
  g.dirty = true;
  refresh(g);
}

export function parkDuel(g: Game) {
  if (!session || session.you !== g || !g.duel) return;
  if (g.phase !== "menu") session.parked = g.phase;
}

export function resumeDuel(g: Game) {
  if (!session || session.you !== g || !g.duel) return false;
  const phase = session.parked;
  g.phase = phase === "menu" ? "combat" : phase;
  g.paused = false;
  session.foe.paused = false;
  refresh(g);
  return true;
}

export function startDuel(g: Game, mapId: MapId, youId: TeamId, rivalId: TeamId) {
  const map = MAP_ORDER.includes(mapId) ? mapId : "chicago";
  const you = TEAM_ORDER.includes(youId) ? youId : "dresden";
  const rival = TEAM_ORDER.includes(rivalId) ? rivalId : "winter";
  const bests = g.bests;
  const marks = g.marks;
  const fresh = createGame();
  fresh.duel = true;
  fresh.bests = bests;
  fresh.marks = marks;
  fresh.map = map;
  fresh.team = you;
  fresh.phase = "combat";
  fresh.best = bests[map] ?? 0;
  Object.assign(g, fresh);

  const foe = createGame();
  foe.duel = true;
  foe.bests = bests;
  foe.marks = marks;
  foe.map = map;
  foe.team = rival;
  foe.phase = "combat";
  const sites = laneSites(map);
  const siteCursor = seedFoe(foe, sites);

  session = {
    you: g,
    foe,
    watch: "you",
    incomeYou: 0,
    incomeFoe: 0,
    aiAcc: 0,
    pushSpent: 0,
    lastPush: `${TEAMS[rival].name} is posted on the other street.`,
    dirty: true,
    parked: "combat",
    sites,
    siteCursor,
    setup: { map, you, rival },
  };
  g.banner = `${TEAMS[you].name} against ${TEAMS[rival].name}. Build, or push creeps onto their street.`;
  g.bannerSeq += 1;
  g.bannerT = 3.2;
  g.events.push("wave");
  refresh(g);
}

export function rematch(g: Game) {
  if (!session) return;
  const setup = session.setup;
  startDuel(g, setup.map, setup.you, setup.rival);
}

export function pushCreep(g: Game, id: PushId) {
  if (!session || session.you !== g || !g.duel) return;
  if (g.phase !== "combat") return;
  if (g.paused) {
    g.banner = "The street is held.";
    g.bannerSeq += 1;
    g.bannerT = 1.6;
    refresh(g);
    return;
  }
  const spec = PUSHES.find((push) => push.id === id);
  if (!spec || !(spec.kind in CREEPS)) return;
  if (g.gold < spec.cost) {
    g.banner = "Not enough coin to push.";
    g.bannerSeq += 1;
    g.bannerT = 1.8;
    g.events.push("deny");
    refresh(g);
    return;
  }
  g.gold -= spec.cost;
  session.pushSpent += spec.cost;
  queueCreeps(session.foe, spec.kind, spec.count, spec.interval);
  session.lastPush = `You pushed ${spec.label}.`;
  g.banner = session.lastPush;
  g.bannerSeq += 1;
  g.bannerT = 2.2;
  g.dirty = true;
  g.events.push(spec.kind === "outsider" ? "boss" : "wave");
  session.dirty = true;
  refresh(g);
}

export function stepDuel(g: Game, dt: number) {
  if (!g.duel || !session || session.you !== g) {
    step(g, dt);
    return;
  }
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") {
    step(g, dt);
    return;
  }
  const foe = session.foe;
  foe.paused = g.paused;
  foe.speed = g.speed;
  const youGold = g.gold;
  const youLives = g.lives;
  const foeGold = foe.gold;
  const foeLives = foe.lives;
  const youBefore = g.combatTime || 0;
  const foeBefore = foe.combatTime || 0;
  runQuiet(() => step(foe, dt));
  step(g, dt);
  const youPhase = g.phase as Phase;
  const foePhase = foe.phase as Phase;
  if (youPhase === "combat" && foePhase === "combat" && !g.paused) {
    const youSim = Math.max(0, (g.combatTime || 0) - youBefore);
    const foeSim = Math.max(0, (foe.combatTime || 0) - foeBefore);
    session.incomeYou = drip(g, youSim, session.incomeYou);
    session.incomeFoe = drip(foe, foeSim, session.incomeFoe);
    if (g.dirty || foe.dirty) session.dirty = true;
    bot(session, youSim);
  }
  let ended = false;
  if (foePhase === "defeat" && youPhase === "combat") {
    g.phase = "victory";
    g.placing = null;
    g.paused = false;
    g.banner = `${TEAMS[foe.team].name} broke.`;
    g.bannerSeq += 1;
    g.bannerT = 2.6;
    g.events.push("victory");
    session.dirty = true;
    ended = true;
  } else if (youPhase === "defeat") {
    foe.phase = "victory";
    foe.paused = false;
    session.dirty = true;
    ended = true;
  }
  const changed =
    session.dirty ||
    g.dirty ||
    g.gold !== youGold ||
    g.lives !== youLives ||
    foe.gold !== foeGold ||
    foe.lives !== foeLives ||
    ended;
  session.dirty = false;
  if (changed) refresh(g);
}

export function fastDuel(g: Game, seconds: number) {
  const n = Math.max(0, Math.round(seconds * 60));
  runQuiet(() => {
    for (let i = 0; i < n; i++) stepDuel(g, 1 / 60);
  });
  refresh(g);
}
