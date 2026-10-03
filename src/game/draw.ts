import {
  CELL,
  COLS,
  CREEPS,
  MAPS,
  ROWS,
  TOP_PAD,
  TOWERS,
  WORLD_H,
  WORLD_W,
  baseCell,
  cellCenter,
  combatStats,
  pathMask,
  waypointXY,
  type CreepId,
  type MapId,
  type TowerId,
} from "./balance";
import { trainedStats } from "./ledger";
import { placementStatus, type Game } from "./engine";

function lookStats(g: Game, kind: TowerId, rank: number) {
  return g.applyTrain ? trainedStats(kind, rank) : combatStats(kind, rank);
}

export type ArtBook = {
  maps: Partial<Record<MapId, HTMLImageElement>>;
  base: HTMLImageElement | null;
  towers: Partial<Record<TowerId, HTMLImageElement>>;
  creeps: Partial<Record<CreepId, HTMLImageElement>>;
};

export function emptyArt(): ArtBook {
  return { maps: {}, base: null, towers: {}, creeps: {} };
}

type Drop = { x: number; y: number; v: number; len: number; drift: number };
let weatherMap: MapId | null = null;
let flakes: Drop[] | null = null;

function weather(map: MapId) {
  if (weatherMap !== map || !flakes) {
    weatherMap = map;
    const kind = MAPS[map].weather;
    const count = kind === "embers" ? 26 : kind === "motes" ? 40 : kind === "snow" ? 70 : 64;
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      v:
        kind === "snow"
          ? 36 + Math.random() * 48
          : kind === "embers"
            ? -(28 + Math.random() * 36)
            : kind === "motes"
              ? 12 + Math.random() * 20
              : 260 + Math.random() * 240,
      len: kind === "rain" ? 8 + Math.random() * 12 : 1.5 + Math.random() * 1.5,
      drift: kind === "snow" ? -10 + Math.random() * 20 : kind === "embers" ? -8 : kind === "motes" ? -6 : 18,
    }));
  }
  return flakes;
}

const LAMPS: [number, number][] = [
  [1, 1],
  [6, 1],
  [9, 1],
  [4, 3],
  [8, 3],
  [5, 5],
  [9, 5],
  [4, 7],
  [8, 7],
];

function tracePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 4) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = sh * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = sw / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function ready(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

function paint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  size: number,
  face: number,
  fallback: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  if (ready(img)) {
    const aspect = img.width / Math.max(1, img.height);
    const h = size;
    const w = h * aspect;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = fallback;
    ctx.beginPath();
    ctx.arc(0, -size * 0.08, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeRange(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  ok: boolean,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = ok ? "rgba(224,177,90,0.1)" : "rgba(196,81,77,0.1)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ok ? "rgba(224,177,90,0.75)" : "rgba(196,81,77,0.8)";
  ctx.stroke();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  art: ArtBook,
  cssW: number,
  cssH: number,
  dpr: number,
  dt: number,
  reduce: boolean,
) {
  const mag = reduce ? 0 : g.shake * 7;
  const sx = Math.sin(g.time * 42) * mag;
  const sy = Math.cos(g.time * 35) * mag;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.translate(sx, sy);
  ctx.scale(cssW / WORLD_W, cssH / WORLD_H);
  ctx.imageSmoothingEnabled = true;

  const theme = MAPS[g.map] ?? MAPS.chicago;
  const mask = pathMask(g.map);
  const pts = waypointXY(g.map);
  ctx.fillStyle = "#10141c";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const plate = art.maps[g.map];
  if (ready(plate)) {
    drawCover(ctx, plate, 0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = theme.wash;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  for (const [c, r] of LAMPS) {
    if (mask[r]?.[c]) continue;
    const p = cellCenter(c, r);
    const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, CELL * 1.5);
    glow.addColorStop(0, "rgba(224,177,90,0.2)");
    glow.addColorStop(1, "rgba(224,177,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CELL * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  tracePath(ctx, pts);
  ctx.strokeStyle = theme.laneDark;
  ctx.lineWidth = CELL * 0.78;
  ctx.stroke();
  tracePath(ctx, pts);
  ctx.strokeStyle = theme.lane;
  ctx.lineWidth = CELL * 0.58;
  ctx.stroke();
  tracePath(ctx, pts);
  ctx.strokeStyle = theme.ward;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([12, 16]);
  tracePath(ctx, pts);
  ctx.strokeStyle = theme.dash;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(126,176,200,0.85)";
  ctx.lineWidth = 1.5;
  for (let i = 2; i < pts.length - 1; i++) {
    star(ctx, pts[i].x, pts[i].y, 7);
    ctx.stroke();
  }

  if (g.placing && g.phase !== "menu" && g.phase !== "victory" && g.phase !== "defeat") {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (mask[r][c]) continue;
        if (g.towers.some((t) => t.c === c && t.r === r)) continue;
        const p = cellCenter(c, r);
        ctx.fillStyle = "rgba(224,177,90,0.45)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (g.hint) {
      const p = cellCenter(g.hint.c, g.hint.r);
      const pulse = 16 + Math.sin(g.time * 5) * 5;
      ctx.strokeStyle = "rgba(224,177,90,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (g.hoverC >= 0 && g.hoverR >= 0) {
      const status = placementStatus(g, g.hoverC, g.hoverR, g.placing);
      if (status !== "bounds" && status !== "closed") {
        const stats = lookStats(g, g.placing, 1);
        const p = cellCenter(g.hoverC, g.hoverR);
        strokeRange(ctx, p.x, p.y, stats.range * CELL, status === "ok");
        ctx.strokeStyle = status === "ok" ? "#e0b15a" : "#c4514d";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          g.hoverC * CELL + 4,
          TOP_PAD + g.hoverR * CELL + 4,
          CELL - 8,
          CELL - 8,
        );
        if (status !== "street") {
          const def = TOWERS[g.placing];
          ctx.save();
          ctx.globalAlpha = status === "ok" ? 0.78 : 0.4;
          paint(
            ctx,
            art.towers[g.placing],
            p.x,
            p.y - 8,
            CELL * def.scale * 1.35,
            1,
            def.color,
          );
          ctx.restore();
        }
      }
    }
  } else if (g.selected != null) {
    const tower = g.towers.find((t) => t.id === g.selected);
    if (tower) {
      const stats = lookStats(g, tower.kind, tower.rank);
      const p = cellCenter(tower.c, tower.r);
      strokeRange(ctx, p.x, p.y, stats.range * CELL, true);
    }
  }

  const door = baseCell(g.map);
  const base = cellCenter(door.c, door.r);
  ctx.fillStyle = "rgba(126,176,200,0.16)";
  ctx.beginPath();
  ctx.arc(base.x, base.y, CELL * 0.55, 0, Math.PI * 2);
  ctx.fill();
  paint(ctx, art.base, base.x, base.y - 6, CELL * 1.7, 1, "#7eb0c8");

  const towers = [...g.towers].sort((a, b) => a.r - b.r);
  for (const tower of towers) {
    const def = TOWERS[tower.kind];
    const p = cellCenter(tower.c, tower.r);
    const bob = Math.sin(g.time * 2.2 + tower.id) * 2.5;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y + 4, CELL * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = tower.id === g.selected ? "rgba(224,177,90,0.28)" : "rgba(224,177,90,0.12)";
    ctx.fill();
    ctx.lineWidth = tower.id === g.selected ? 2.5 : 1.25;
    ctx.strokeStyle = tower.id === g.selected ? "#e0b15a" : "rgba(224,177,90,0.4)";
    ctx.stroke();
    const kick = Math.max(0, tower.recoil) * 10;
    paint(
      ctx,
      art.towers[tower.kind],
      p.x - Math.cos(tower.angle) * kick,
      p.y - 10 + bob,
      CELL * def.scale * 1.35,
      1,
      def.color,
    );
    if (tower.recoil > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, tower.recoil * 7);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 8);
      ctx.lineTo(
        p.x + Math.cos(tower.angle) * CELL * 0.7,
        p.y - 8 + Math.sin(tower.angle) * CELL * 0.7,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  const enemies = [...g.enemies].sort((a, b) => a.y - b.y);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const def = CREEPS[enemy.kind];
    const bob = Math.sin(enemy.along * 0.14) * 3;
    const height = CELL * def.scale * 1.15;
    if (enemy.slow > 0) {
      ctx.strokeStyle = "rgba(126,176,200,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y + 8, 14, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((enemy.stun ?? 0) > 0) {
      ctx.strokeStyle = "rgba(214,230,240,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y - height * 0.15, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + 8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    paint(ctx, art.creeps[enemy.kind], enemy.x, enemy.y - 4 + bob, height, enemy.face || 1, def.color);
    if (enemy.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, enemy.flash * 5);
      ctx.fillStyle = "#f3ecdf";
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y - height * 0.2, height * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const barW = enemy.kind === "outsider" ? 46 : 28;
    const pct = Math.max(0, enemy.hp / enemy.maxHp);
    const top = enemy.y - height * 0.55;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(enemy.x - barW / 2, top, barW, 4);
    ctx.fillStyle = pct > 0.35 ? "#e0b15a" : "#c4514d";
    ctx.fillRect(enemy.x - barW / 2, top, barW * pct, 4);
    if ((enemy.dotT ?? 0) > 0) {
      ctx.fillStyle = enemy.dotHue || "#c4514d";
      ctx.fillRect(enemy.x - barW / 2, top + 5, barW, 2);
    }
  }

  for (const shot of g.projectiles) {
    if (!shot.alive) continue;
    ctx.strokeStyle = shot.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(shot.x - shot.vx * 0.03, shot.y - shot.vy * 0.03);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = shot.color;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3ecdf";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const particle of g.particles) {
    const t = 1 - particle.life / particle.max;
    if (particle.kind === "ring") {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size + t * CELL * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.font = "600 15px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const text of g.texts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, text.life / text.max);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
    ctx.restore();
  }

  if (!reduce) {
    const kind = theme.weather;
    ctx.lineWidth = 1.4;
    for (const drop of weather(g.map)) {
      drop.y += drop.v * dt;
      drop.x += drop.drift * dt;
      if (drop.y > WORLD_H + 8) {
        drop.y = -12;
        drop.x = Math.random() * WORLD_W;
      } else if (drop.y < -16) {
        drop.y = WORLD_H + 8;
        drop.x = Math.random() * WORLD_W;
      }
      if (drop.x < -8) drop.x = WORLD_W + 4;
      if (drop.x > WORLD_W + 8) drop.x = -4;
      if (kind === "rain") {
        ctx.strokeStyle = "rgba(214,226,232,0.28)";
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3, drop.y + drop.len);
        ctx.stroke();
      } else {
        ctx.fillStyle =
          kind === "embers"
            ? "rgba(196,81,77,0.55)"
            : kind === "motes"
              ? "rgba(224,196,110,0.7)"
              : "rgba(236,244,250,0.75)";
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.len, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const vignette = ctx.createRadialGradient(
    WORLD_W / 2,
    WORLD_H / 2,
    WORLD_W * 0.28,
    WORLD_W / 2,
    WORLD_H / 2,
    WORLD_W * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(196,81,77,${Math.min(0.35, g.flash * 0.4)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
}
