import {
  COLS,
  CREEPS,
  MAPS,
  MAP_ORDER,
  ROWS,
  START_LIVES,
  TEAMS,
  TEAM_ORDER,
  TOWERS,
  cellCenter,
  isTeamId,
  pathMask,
  upgradeCost,
  waypointXY,
  type CreepId,
  type MapId,
  type TeamId,
  type TowerId,
} from "./balance";
import { netSend } from "./online";
import {
  bindLeaveDuel,
  clickCell,
  createGame,
  queueCreeps,
  refresh,
  runQuiet,
  step,
  upgradeSelected,
  type Enemy,
  type Game,
  type Phase,
  type Tower,
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

export type FriendRole = "host" | "guest";

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
  online: boolean;
  role: FriendRole;
  quiet: boolean;
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
  online: boolean;
  role: FriendRole;
  friendRound: number;
  toldDown: boolean;
  quiet: boolean;
  towerSig: string;
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
    income: session.online
      ? `${INCOME_GOLD} coin every ${INCOME_EVERY}s on your street`
      : `${INCOME_GOLD} coin every ${INCOME_EVERY}s, both streets`,
    parked: you.phase === "menu",
    online: session.online,
    role: session.role,
    quiet: session.quiet,
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
    online: false,
    role: "host",
    friendRound: 0,
    toldDown: false,
    quiet: false,
    towerSig: "",
  };
  g.banner = `${TEAMS[you].name} against ${TEAMS[rival].name}. Build, or push creeps onto their street.`;
  g.bannerSeq += 1;
  g.bannerT = 3.2;
  g.events.push("wave");
  refresh(g);
}

export function rematch(g: Game) {
  if (!session || session.online) return;
  const setup = session.setup;
  startDuel(g, setup.map, setup.you, setup.rival);
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

function isMap(value: unknown): value is MapId {
  return typeof value === "string" && MAP_ORDER.includes(value as MapId);
}

function isTower(value: unknown): value is TowerId {
  return typeof value === "string" && value in TOWERS;
}

function isCreep(value: unknown): value is CreepId {
  return typeof value === "string" && value in CREEPS;
}

function puppetTower(kind: TowerId, c: number, r: number, rank: number, id: number): Tower {
  return {
    id,
    kind,
    c,
    r,
    rank: Math.max(1, Math.min(3, rank)),
    spent: 0,
    cooldown: 0,
    mode: "first",
    angle: 0,
    recoil: 0,
  };
}

function puppetCreep(kind: CreepId, x: number, y: number, hp: number, max: number, face: number, id: number): Enemy {
  const def = CREEPS[kind];
  const maxHp = Math.max(1, max);
  return {
    id,
    kind,
    x,
    y,
    wp: 1,
    along: x,
    hp: Math.max(0, hp),
    maxHp,
    slow: 0,
    stun: 0,
    dot: 0,
    dotT: 0,
    siphon: 0,
    dotHue: "",
    face: Number.isFinite(face) && face !== 0 ? face : def.artFace,
    flash: 0,
    alive: hp > 0,
    radius: def.radius,
  };
}

function claimRemoteBreak(g: Game) {
  if (!session) return;
  const foe = session.foe;
  if (foe.lives > 0) return;
  if (g.phase !== "combat" && g.phase !== "menu") return;
  g.phase = "victory";
  g.placing = null;
  g.paused = false;
  g.banner = `${TEAMS[foe.team].name} broke.`;
  g.bannerSeq += 1;
  g.bannerT = 2.6;
  g.events.push("victory");
  session.dirty = true;
}

export function streetSnap() {
  if (!session?.online) return null;
  const g = session.you;
  const live = g.phase === "combat" || (g.phase === "menu" && session.parked === "combat");
  if (!live) return null;
  return {
    t: "snap" as const,
    round: session.friendRound,
    lives: g.lives,
    gold: g.gold,
    towers: g.towers.slice(0, 24).map((tower) => ({
      kind: tower.kind,
      c: tower.c,
      r: tower.r,
      rank: tower.rank,
    })),
    creeps: g.enemies
      .filter((enemy) => enemy.alive)
      .slice(0, 40)
      .map((enemy) => ({
        kind: enemy.kind,
        x: Math.round(enemy.x),
        y: Math.round(enemy.y),
        hp: Math.round(enemy.hp),
        max: enemy.maxHp,
        face: enemy.face,
      })),
  };
}

export function applyFriendSnap(data: unknown) {
  if (!session?.online) return;
  const msg = asRecord(data);
  if (!msg || msg.t !== "snap" || msg.round !== session.friendRound) return;
  const foe = session.foe;
  if (typeof msg.lives === "number" && Number.isFinite(msg.lives)) {
    foe.lives = Math.max(0, Math.min(START_LIVES, Math.round(msg.lives)));
  }
  if (typeof msg.gold === "number" && Number.isFinite(msg.gold)) {
    foe.gold = Math.max(0, Math.min(99999, Math.round(msg.gold)));
  }
  if (Array.isArray(msg.towers)) {
    const next = msg.towers.slice(0, 24).flatMap((row, index) => {
      const tower = asRecord(row);
      if (!tower || !isTower(tower.kind)) return [];
      const c = Number(tower.c);
      const r = Number(tower.r);
      if (!Number.isInteger(c) || c < 0 || c >= COLS) return [];
      if (!Number.isInteger(r) || r < 0 || r >= ROWS) return [];
      const rank = Number.isFinite(Number(tower.rank)) ? Math.round(Number(tower.rank)) : 1;
      return [puppetTower(tower.kind, c, r, rank, index + 1)];
    });
    const sig = next.map((tower) => `${tower.kind}:${tower.c}:${tower.r}:${tower.rank}`).join("|");
    if (sig !== session.towerSig) {
      session.towerSig = sig;
      foe.towers = next;
    }
  }
  if (Array.isArray(msg.creeps)) {
    foe.enemies = msg.creeps.slice(0, 40).flatMap((row, index) => {
      const creep = asRecord(row);
      if (!creep || !isCreep(creep.kind)) return [];
      const x = Number(creep.x);
      const y = Number(creep.y);
      const hp = Number(creep.hp);
      const max = Number(creep.max);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(hp)) return [];
      const face = Number(creep.face);
      return [puppetCreep(creep.kind, x, y, hp, Number.isFinite(max) ? max : hp, face, index + 1)];
    });
  }
  const you = session.you;
  claimRemoteBreak(you);
  session.dirty = true;
  refresh(you);
}

export function applyFriendPush(data: unknown) {
  if (!session?.online) return;
  const msg = asRecord(data);
  if (!msg || msg.t !== "push" || msg.round !== session.friendRound) return;
  const spec = PUSHES.find((push) => push.id === msg.id);
  if (!spec) return;
  const you = session.you;
  const parked = you.phase === "menu";
  if (parked) you.phase = "combat";
  queueCreeps(you, spec.kind, spec.count, spec.interval);
  if (parked && you.phase === "combat") you.phase = "menu";
  session.lastPush = `${TEAMS[session.foe.team].name} pushed ${spec.label}.`;
  you.banner = session.lastPush;
  you.bannerSeq += 1;
  you.bannerT = 2.2;
  you.events.push(spec.kind === "outsider" ? "boss" : "wave");
  session.dirty = true;
  refresh(you);
}

export function noteFriendDown(data: unknown) {
  if (!session?.online) return;
  const msg = asRecord(data);
  if (!msg || msg.t !== "down" || msg.round !== session.friendRound) return;
  session.foe.lives = 0;
  session.foe.phase = "defeat";
  claimRemoteBreak(session.you);
  refresh(session.you);
}

export function noteFriendQuiet() {
  if (!session?.online || session.quiet) return;
  session.quiet = true;
  const g = session.you;
  g.banner = "The other street went quiet. Leaving is not a win.";
  g.bannerSeq += 1;
  g.bannerT = 3.2;
  session.dirty = true;
  refresh(g);
}

export function noteFriendBack() {
  if (!session?.online || !session.quiet) return;
  session.quiet = false;
  const g = session.you;
  g.banner = "They're back on the other street.";
  g.bannerSeq += 1;
  g.bannerT = 2.4;
  session.dirty = true;
  refresh(g);
}

export function leaveFriend(g: Game) {
  if (!session?.online || session.you !== g) return;
  session = null;
  g.duel = false;
  g.phase = "menu";
  g.paused = false;
  g.speed = 1;
  g.placing = null;
  g.selected = null;
  g.banner = "";
  g.bannerT = 0;
  refresh(g);
}

export function startFriendDuel(
  g: Game,
  mapId: MapId,
  youId: TeamId,
  rivalId: TeamId,
  round: number,
  role: FriendRole,
) {
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
  fresh.speed = 1;
  fresh.paused = false;
  fresh.best = bests[map] ?? 0;
  Object.assign(g, fresh);

  const foe = createGame();
  foe.duel = true;
  foe.bests = bests;
  foe.marks = marks;
  foe.map = map;
  foe.team = rival;
  foe.phase = "combat";
  foe.paused = true;
  foe.speed = 1;

  session = {
    you: g,
    foe,
    watch: "you",
    incomeYou: 0,
    incomeFoe: 0,
    aiAcc: 0,
    pushSpent: 0,
    lastPush: "Their street is live.",
    dirty: true,
    parked: "combat",
    sites: [],
    siteCursor: 0,
    setup: { map, you, rival },
    online: true,
    role,
    friendRound: Math.max(1, Math.round(round)),
    toldDown: false,
    quiet: false,
    towerSig: "",
  };
  g.banner = `${TEAMS[you].name} against ${TEAMS[rival].name}. Build, or push creeps onto their street.`;
  g.bannerSeq += 1;
  g.bannerT = 3.2;
  g.events.push("wave");
  refresh(g);
}

export function applyFriendStart(g: Game, data: unknown, role: FriendRole) {
  const msg = asRecord(data);
  if (!msg || msg.t !== "start") return false;
  if (!isMap(msg.map) || !isTeamId(msg.hostTeam) || !isTeamId(msg.guestTeam)) return false;
  const round = typeof msg.round === "number" ? Math.round(msg.round) : 0;
  if (round < 1) return false;
  if (session?.online && session.friendRound === round && g.duel && g.phase !== "menu") return false;
  const you = role === "host" ? msg.hostTeam : msg.guestTeam;
  const foe = role === "host" ? msg.guestTeam : msg.hostTeam;
  startFriendDuel(g, msg.map, you, foe, round, role);
  return true;
}

export function acceptAgain(g: Game) {
  if (!session?.online || session.role !== "host" || session.you !== g) return null;
  const round = session.friendRound + 1;
  const msg = {
    t: "start" as const,
    map: session.setup.map,
    hostTeam: session.setup.you,
    guestTeam: session.setup.rival,
    round,
  };
  applyFriendStart(g, msg, "host");
  return msg;
}

export function askAgain(g: Game) {
  if (!session?.online || session.you !== g) return;
  g.banner = "Asking them to walk it again.";
  g.bannerSeq += 1;
  g.bannerT = 2.4;
  refresh(g);
}

export function pushCreep(g: Game, id: PushId) {
  if (!session || session.you !== g || !g.duel) return;
  if (g.phase !== "combat") return;
  if (g.paused && !session.online) {
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
  if (session.online) netSend({ t: "push", id: spec.id, round: session.friendRound });
  else queueCreeps(session.foe, spec.kind, spec.count, spec.interval);
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
  if (session.online) {
    stepOnline(g, dt);
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

function stepOnline(g: Game, dt: number) {
  const live = session;
  if (!live) return;
  if (g.phase === "victory" || g.phase === "defeat") {
    step(g, dt);
    return;
  }
  const behindMenu = g.phase === "menu" && live.parked === "combat";
  if (g.phase === "menu" && !behindMenu) {
    step(g, dt);
    return;
  }
  if (behindMenu) g.phase = "combat";
  g.speed = 1;
  g.paused = false;
  const foe = live.foe;
  const youGold = g.gold;
  const youLives = g.lives;
  const foeLives = foe.lives;
  const before = g.combatTime || 0;
  if (behindMenu) runQuiet(() => step(g, dt));
  else step(g, dt);
  if (g.phase === "combat") {
    const sim = Math.max(0, (g.combatTime || 0) - before);
    live.incomeYou = drip(g, sim, live.incomeYou);
  }
  foe.time += Math.min(0.05, Math.max(0, dt));
  if ((g.phase as Phase) === "defeat" && !live.toldDown) {
    live.toldDown = true;
    netSend({ t: "down", round: live.friendRound });
  } else if (foe.lives <= 0 && g.phase === "combat") {
    claimRemoteBreak(g);
  }
  if (behindMenu && g.phase === "combat") g.phase = "menu";
  const changed =
    live.dirty || g.dirty || g.gold !== youGold || g.lives !== youLives || foe.lives !== foeLives;
  live.dirty = false;
  if (changed) refresh(g);
}

export function fastDuel(g: Game, seconds: number) {
  const n = Math.max(0, Math.round(seconds * 60));
  runQuiet(() => {
    for (let i = 0; i < n; i++) stepDuel(g, 1 / 60);
  });
  refresh(g);
}
