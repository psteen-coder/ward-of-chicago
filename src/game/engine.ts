import {
  BEST_KEY,
  CELL,
  COLS,
  CREEPS,
  RANK_NAMES,
  ROWS,
  SELL_REFUND,
  START_GOLD,
  START_LIVES,
  TOWERS,
  WAVES,
  combatStats,
  describeWave,
  upgradeCost,
  waypointXY,
  type CombatStats,
  type CreepId,
  type TargetMode,
  type TowerId,
} from "./balance";
import { PATH } from "./balance";

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
  selected: Selection | null;
};

export type PlaceResult = "ok" | "street" | "held" | "bounds" | "gold" | "closed";

const listeners = new Set<() => void>();
let quiet = 0;
let game: Game | null = null;

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
  };
}

function selectionOf(g: Game): Selection | null {
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return null;
  const def = TOWERS[tower.kind];
  const now = combatStats(tower.kind, tower.rank);
  const next = tower.rank < 3 ? combatStats(tower.kind, tower.rank + 1) : null;
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
    upgrade: upgradeCost(tower.kind, tower.rank),
    sell: Math.floor(tower.spent * SELL_REFUND),
    mode: tower.mode,
  };
}

export function buildHud(g: Game): Hud {
  let queued = 0;
  for (const job of g.spawnQueue) queued += job.left;
  const alive = g.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const nextIndex = g.phase === "prep" || g.phase === "menu" ? g.sent : -1;
  return {
    phase: g.phase,
    gold: g.gold,
    lives: g.lives,
    livesMax: START_LIVES,
    slain: g.slain,
    cleared: g.cleared,
    sent: g.sent,
    total: WAVES.length,
    remaining: alive + queued,
    nextBlurb: nextIndex >= 0 ? describeWave(nextIndex) : "",
    placing: g.placing,
    paused: g.paused,
    speed: g.speed,
    banner: g.banner,
    bannerSeq: g.bannerSeq,
    best: g.best,
    selected: selectionOf(g),
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
  g.dirty = false;
  hud = buildHud(g);
  if (quiet > 0) return;
  for (const fn of [...listeners]) fn();
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

function persistBest(n: number) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* private mode */
  }
}

function remember(g: Game) {
  const reached = g.phase === "victory" ? WAVES.length : g.cleared;
  if (reached > g.best) {
    g.best = reached;
    persistBest(g.best);
  }
}

function endGame(g: Game, phase: "victory" | "defeat") {
  g.phase = phase;
  g.paused = false;
  g.placing = null;
  remember(g);
  g.events.push(phase);
  g.dirty = true;
}

export function loadBest(g: Game) {
  try {
    if (typeof localStorage === "undefined") return;
    const n = Number(localStorage.getItem(BEST_KEY) || 0);
    if (Number.isFinite(n) && n > g.best) {
      g.best = n;
      emit(g);
    }
  } catch {
    /* ignore */
  }
}

export function startCase(g: Game) {
  if (g.phase !== "menu") return;
  g.phase = "prep";
  say(g, "Choose a defender, then tap a sidewalk.");
  emit(g);
}

export function restart(g: Game) {
  const best = Math.max(g.best, g.phase === "victory" ? WAVES.length : g.cleared);
  const fresh = createGame();
  fresh.best = best;
  fresh.phase = "prep";
  Object.assign(g, fresh);
  say(g, "Another night. Same city.");
  emit(g);
}

export function selectKind(g: Game, kind: TowerId) {
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") return;
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
  if (PATH[r][c]) return "street";
  if (g.towers.some((t) => t.c === c && t.r === r)) return "held";
  if (g.gold < TOWERS[kind].cost) return "gold";
  return "ok";
}

function placeTower(g: Game, kind: TowerId, c: number, r: number) {
  const def = TOWERS[kind];
  g.gold -= def.cost;
  g.towers.push({
    id: g.nextId++,
    kind,
    c,
    r,
    rank: 1,
    spent: def.cost,
    cooldown: 0,
    mode: "first",
    angle: 0,
    recoil: 0,
  });
  say(g, `${def.name} takes the corner.`);
  g.events.push("place");
  emit(g);
}

export function clickCell(g: Game, c: number, r: number) {
  if (g.phase === "menu" || g.phase === "victory" || g.phase === "defeat") return;
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
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return;
  const cost = upgradeCost(tower.kind, tower.rank);
  if (cost == null) {
    say(g, "That craft is already mastered.");
    emit(g);
    return;
  }
  if (g.gold < cost) {
    say(g, "Not enough coin to hone them.");
    g.events.push("deny");
    emit(g);
    return;
  }
  g.gold -= cost;
  tower.spent += cost;
  tower.rank += 1;
  say(g, `${TOWERS[tower.kind].name} is ${RANK_NAMES[tower.rank]}.`);
  g.events.push("upgrade");
  emit(g);
}

export function sellSelected(g: Game) {
  const tower = g.towers.find((t) => t.id === g.selected);
  if (!tower) return;
  const refund = Math.floor(tower.spent * SELL_REFUND);
  g.gold += refund;
  g.towers = g.towers.filter((t) => t.id !== tower.id);
  g.selected = null;
  say(g, `Released. ${refund} coin returned.`);
  g.events.push("sell");
  emit(g);
}

export function sendWave(g: Game) {
  if (g.phase !== "prep") return;
  if (g.sent >= WAVES.length) return;
  if (g.towers.length === 0) {
    say(g, "Post a defender before you open the street.");
    g.events.push("deny");
    emit(g);
    return;
  }
  const wave = WAVES[g.sent];
  g.spawnQueue = wave.map((group) => ({
    kind: group.kind,
    left: group.count,
    interval: group.interval,
  }));
  g.spawnAcc = wave[0]?.interval ?? 0;
  g.sent += 1;
  g.phase = "combat";
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

function hurt(g: Game, enemy: Enemy, amount: number, pierce: boolean, slow: number) {
  if (!enemy.alive || g.phase === "defeat") return;
  const armor = pierce ? 0 : CREEPS[enemy.kind].armor;
  const dealt = Math.max(1, Math.round(amount - armor));
  enemy.hp -= dealt;
  enemy.flash = 0.1;
  if (slow > 0) enemy.slow = Math.max(enemy.slow, slow);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    const bounty = CREEPS[enemy.kind].gold;
    g.gold += bounty;
    g.slain += 1;
    g.events.push("kill");
    floatText(g, enemy.x, enemy.y - 20, `+${bounty}`, "#e0b15a");
    burst(g, enemy.x, enemy.y, CREEPS[enemy.kind].color, enemy.kind === "outsider" ? 18 : 8);
    g.shake = Math.max(g.shake, enemy.kind === "outsider" ? 1 : 0.22);
    g.dirty = true;
  }
}

function leak(g: Game, enemy: Enemy) {
  enemy.alive = false;
  if (g.phase !== "combat") return;
  const cost = CREEPS[enemy.kind].leak;
  g.lives -= cost;
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

function cellCenter(c: number, r: number) {
  return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
}

function fire(g: Game, tower: Tower, target: Enemy, stats: CombatStats) {
  const origin = cellCenter(tower.c, tower.r);
  tower.angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  tower.recoil = 0.12;
  g.events.push(`shoot:${tower.kind}`);
  if (stats.instant) {
    hurt(g, target, stats.damage, false, 0);
    const r2 = stats.splash * CELL * (stats.splash * CELL);
    for (const enemy of g.enemies) {
      if (!enemy.alive || enemy.id === target.id) continue;
      const dx = enemy.x - target.x;
      const dy = enemy.y - target.y;
      if (dx * dx + dy * dy <= r2) hurt(g, enemy, stats.damage, false, 0);
    }
    ring(g, target.x, target.y, TOWERS[tower.kind].color, CELL * 0.25);
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
    color: TOWERS[tower.kind].color,
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
  hurt(g, hit, shot.damage, shot.pierce, shot.slow);
  if (shot.splash > 0) {
    const r = shot.splash * CELL;
    const r2 = r * r;
    for (const enemy of g.enemies) {
      if (!enemy.alive || enemy.id === hit.id) continue;
      const dx = enemy.x - hit.x;
      const dy = enemy.y - hit.y;
      if (dx * dx + dy * dy <= r2) hurt(g, enemy, shot.damage * 0.65, shot.pierce, 0);
    }
  }
  burst(g, hit.x, hit.y, shot.color, 5);
}

function spawnEnemy(g: Game, kind: CreepId) {
  const def = CREEPS[kind];
  const pts = waypointXY();
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
  const pts = waypointXY();
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
    if (enemy.slow > 0) enemy.slow -= dt;
    if (enemy.flash > 0) enemy.flash -= dt;
    const target = pts[enemy.wp];
    if (!target) {
      leak(g, enemy);
      continue;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const speed = CREEPS[enemy.kind].speed * CELL * (enemy.slow > 0 ? 0.5 : 1);
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
    const stats = combatStats(tower.kind, tower.rank);
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

  if (g.phase === "combat" && g.spawnQueue.length === 0 && g.enemies.length === 0) {
    g.cleared = g.sent;
    if (g.sent >= WAVES.length) endGame(g, "victory");
    else {
      g.phase = "prep";
      g.paused = false;
      say(g, `Night ${g.sent} is quiet.`);
      g.events.push("waveclear");
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
    let left = frame * g.speed;
    while (left > 0.0001 && g.phase === "combat") {
      const slice = Math.min(left, 1 / 60);
      simulate(g, slice);
      left -= slice;
    }
  }
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
