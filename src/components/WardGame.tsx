import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Coins, Crosshair, Heart, Moon, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { playEvent, setMuted, unlockAudio } from "@/game/audio";
import {
  TOWER_ORDER,
  TOWERS,
  combatStats,
  type TargetMode,
  type TowerId,
} from "@/game/balance";
import { draw, emptyArt, type ArtBook } from "@/game/draw";
import {
  WORLD_H,
  WORLD_W,
  CELL,
} from "@/game/balance";
import {
  clearSelect,
  clickCell,
  debugFast,
  ensureGame,
  getHud,
  getServerHud,
  loadBest,
  restart,
  selectKind,
  sellSelected,
  sendWave,
  setHover,
  setMode,
  startCase,
  step,
  subscribe,
  togglePause,
  toggleSpeed,
  upgradeSelected,
  type Hud,
} from "@/game/engine";

declare global {
  interface Window {
    __ward?: {
      state: () => Hud;
      start: () => void;
      place: (kind: TowerId, c: number, r: number) => void;
      send: () => void;
      fast: (seconds: number) => void;
    };
  }
}

function fmt(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function nightLabel(hud: Hud) {
  if (hud.phase === "menu") return "The street is quiet";
  if (hud.phase === "victory") return "Dawn held";
  if (hud.phase === "defeat") return "The threshold broke";
  return hud.phase === "combat"
    ? `Night ${hud.sent} of ${hud.total}`
    : hud.sent === 0
      ? "Night 1 is waiting"
      : `Night ${hud.sent} held · next is ${Math.min(hud.total, hud.sent + 1)}`;
}

function loadArt(art: ArtBook) {
  const pull = (src: string, done: (img: HTMLImageElement) => void) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => done(img);
    img.src = src;
  };
  pull("/game/map.png", (img) => {
    art.map = img;
  });
  pull("/game/base.png", (img) => {
    art.base = img;
  });
  for (const kind of TOWER_ORDER) {
    pull(`/game/${kind}.png`, (img) => {
      art.towers[kind] = img;
    });
  }
  for (const kind of ["fledgling", "ghoul", "blackcourt", "outsider"] as const) {
    pull(`/game/${kind}.png`, (img) => {
      art.creeps[kind] = img;
    });
  }
}

export function WardGame() {
  const hud = useSyncExternalStore(subscribe, getHud, getServerHud);
  const [muted, setMutedUi] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<ArtBook>(emptyArt());
  const viewRef = useRef({ cssW: 1, cssH: 1, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const g = ensureGame();
    loadBest(g);
    loadArt(artRef.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const availW = Math.max(10, stage.clientWidth - 12);
      const availH = Math.max(10, stage.clientHeight - 12);
      const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
      const cssW = Math.max(1, Math.floor(WORLD_W * scale));
      const cssH = Math.max(1, Math.floor(WORLD_H * scale));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      viewRef.current = { cssW, cssH, dpr };
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(g, dt);
      const events = g.events.splice(0, g.events.length);
      for (let i = 0; i < events.length && i < 6; i++) playEvent(events[i]);
      const view = viewRef.current;
      if (view.cssW > 2) {
        draw(ctx, g, artRef.current, view.cssW, view.cssH, view.dpr, dt, reduce);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const digits = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
      const index = digits.indexOf(event.code);
      if (index >= 0) {
        selectKind(g, TOWER_ORDER[index]);
        return;
      }
      if (event.code === "Escape") {
        clearSelect(g);
        return;
      }
      if (event.code === "KeyU") {
        upgradeSelected(g);
        return;
      }
      if (event.code === "Space" && tag !== "BUTTON") {
        event.preventDefault();
        if (g.phase === "prep") sendWave(g);
        else if (g.phase === "combat") togglePause(g);
      }
    };
    window.addEventListener("keydown", onKey);

    window.__ward = {
      state: () => getHud(),
      start: () => startCase(g),
      place: (kind, c, r) => {
        g.placing = kind;
        clickCell(g, c, r);
      },
      send: () => sendWave(g),
      fast: (seconds) => debugFast(g, seconds),
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
      delete window.__ward;
    };
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WORLD_W;
    const y = ((event.clientY - rect.top) / rect.height) * WORLD_H;
    return { c: Math.floor(x / CELL), r: Math.floor(y / CELL) };
  };

  const placing = hud.placing ? TOWERS[hud.placing] : null;
  const placingStats = hud.placing ? combatStats(hud.placing, 1) : null;
  const canSend = hud.phase === "prep" && hud.sent < hud.total;

  return (
    <div
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-bg text-fg"
      onPointerDown={() => unlockAudio()}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xs tracking-wide text-primary">
            Ward of Chicago
          </h1>
          <p className="truncate text-sm text-muted">{nightLabel(hud)}</p>
          <div className="mt-1 flex gap-1" aria-hidden>
            {Array.from({ length: hud.total }, (_, i) => {
              const done = i < hud.cleared;
              const now = hud.phase === "combat" && i === hud.sent - 1;
              return (
                <span
                  key={i}
                  className={`h-1.5 min-w-0 flex-1 rounded-full ${done ? "bg-primary" : now ? "bg-ward" : "bg-line"}`}
                />
              );
            })}
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5"
          aria-label={`${hud.gold} coin`}
        >
          <Coins className="size-5 text-primary" aria-hidden />
          <span className="num text-base">{hud.gold}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 ${hud.lives <= 5 ? "text-danger" : ""}`}
          aria-label={`${hud.lives} of ${hud.livesMax} lives remaining`}
        >
          <Heart className="size-5 text-danger" aria-hidden />
          <span className="num text-base">{hud.lives}</span>
          <span className="text-xs text-muted">/{hud.livesMax}</span>
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg border border-line bg-surface"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => {
            unlockAudio();
            const next = !muted;
            setMutedUi(next);
            setMuted(next);
          }}
        >
          {muted ? (
            <VolumeX className="size-5" aria-hidden />
          ) : (
            <Volume2 className="size-5" aria-hidden />
          )}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center bg-bg"
        >
          <canvas
            id="board"
            ref={canvasRef}
            className="touch-none"
            aria-label="Warded Chicago street. Place defenders on the sidewalks."
            onPointerMove={(event) => {
              const cell = point(event);
              setHover(ensureGame(), cell.c, cell.r);
            }}
            onPointerLeave={() => setHover(ensureGame(), -1, -1)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              unlockAudio();
              const cell = point(event);
              clickCell(ensureGame(), cell.c, cell.r);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              clearSelect(ensureGame());
            }}
          />
          {hud.banner ? (
            <p
              key={hud.bannerSeq}
              className="banner-pop pointer-events-none absolute top-3 left-1/2 z-10 max-w-xs rounded-full border border-line bg-surface px-3 py-1 text-center text-sm text-fg"
            >
              {hud.banner}
            </p>
          ) : null}
        </div>

        <aside className="flex min-h-0 w-full flex-1 flex-col border-t border-line lg:w-80 lg:flex-none lg:border-t-0 lg:border-l">
          <div className="shrink-0 px-3 pt-3">
            <p className="text-xs tracking-widest text-muted">THE ROSTER</p>
            <p className="mt-1 text-sm text-muted">
              {hud.phase === "combat"
                ? `${hud.remaining} still on the street`
                : hud.nextBlurb
                  ? `Next: ${hud.nextBlurb}`
                  : "The street is quiet"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
            {TOWER_ORDER.map((kind, index) => {
              const def = TOWERS[kind];
              const active = hud.placing === kind;
              const poor = hud.gold < def.cost;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    unlockAudio();
                    selectKind(ensureGame(), kind);
                  }}
                  className={`flex w-44 shrink-0 gap-2 rounded-xl border p-2 text-left lg:w-auto ${
                    active ? "border-primary bg-surface-2" : "border-line bg-surface"
                  }`}
                >
                  <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-bg">
                    <span className={`absolute inset-2 rounded-full ${def.swatch}`} />
                    <img
                      src={`/game/${kind}.png`}
                      alt=""
                      draggable={false}
                      className="relative size-12 object-contain"
                      onError={(event) => {
                        event.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{def.name}</span>
                      <span className={`num text-sm ${poor ? "text-danger" : "text-primary"}`}>
                        {def.cost}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {def.craft}
                      <span className="hidden text-muted sm:inline"> · {index + 1}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{def.special}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line p-3">
            {hud.selected ? (
              <Inspector hud={hud} />
            ) : placing && placingStats ? (
              <div>
                <p className="font-display text-lg">{placing.name}</p>
                <p className="text-sm text-primary">{placing.craft}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{placing.blurb}</p>
                <StatLine label="Damage" value={String(placingStats.damage)} />
                <StatLine label="Fire rate" value={`${fmt(placingStats.rate)} /s`} />
                <StatLine label="Reach" value={`${fmt(placingStats.range)} squares`} />
                <p className="mt-3 text-sm text-fg">Tap a lit sidewalk to post them.</p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Sidewalks only. The gaps between bends cover two lanes. Corners favor the
                sword. Long lanes favor the carbine. Hone a defender to raise damage and
                rate of fire.
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="safe-pad flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 pt-2">
        <button
          id="send-night"
          type="button"
          disabled={!canSend}
          className="min-h-11 flex-1 rounded-xl bg-primary px-3 font-semibold text-primary-fg disabled:opacity-40"
          onClick={() => {
            unlockAudio();
            sendWave(ensureGame());
          }}
        >
          {canSend
            ? hud.sent === 0
              ? "Send the night"
              : "Send the next night"
            : hud.phase === "combat"
              ? hud.paused
                ? "Holding the street"
                : "They're in the street"
              : "Send the night"}
        </button>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-xl border border-line px-3"
          aria-label={hud.speed === 1 ? "Double speed" : "Normal speed"}
          aria-pressed={hud.speed === 2}
          onClick={() => {
            unlockAudio();
            toggleSpeed(ensureGame());
          }}
        >
          <span className="num">{hud.speed}×</span>
        </button>
        {hud.phase === "combat" ? (
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl border border-line"
            aria-label={hud.paused ? "Resume" : "Hold"}
            aria-pressed={hud.paused}
            onClick={() => {
              unlockAudio();
              togglePause(ensureGame());
            }}
          >
            {hud.paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
          </button>
        ) : null}
        {hud.placing ? (
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3"
            onClick={() => clearSelect(ensureGame())}
          >
            Cancel
          </button>
        ) : null}
      </footer>

      {hud.phase === "menu" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-xs tracking-widest text-primary">AN UNOFFICIAL NIGHT</p>
            <p className="mt-2 font-display text-3xl leading-tight text-fg sm:text-4xl">
              Ward of Chicago
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              The Red Court, ghouls, and worse are walking a warded street toward the
              boarding house. Post your people on the sidewalks. Spend what the night
              pays you. Do not let the threshold break.
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed">
              <li className="flex items-start gap-3">
                <Crosshair className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span>Place defenders on sidewalks. The glowing street is theirs, not yours.</span>
              </li>
              <li className="flex items-start gap-3">
                <Coins className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span>Kills pay coin. Hone a defender to raise damage and rate of fire.</span>
              </li>
              <li className="flex items-start gap-3">
                <Heart className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span>Anything that reaches the boarding house costs lives. Hold ten nights.</span>
              </li>
            </ul>
            <button
              id="take-case"
              type="button"
              className="mt-6 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
              onClick={() => {
                unlockAudio();
                startCase(ensureGame());
              }}
            >
              Take the case
            </button>
            {hud.best > 0 ? (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
                <Moon className="size-4 text-primary" aria-hidden />
                Best night held: {hud.best}
              </p>
            ) : null}
            <p className="mt-4 text-xs leading-relaxed text-muted">
              A fan game. Not affiliated with Jim Butcher or the rights holders.
            </p>
          </div>
        </div>
      ) : null}

      {hud.phase === "victory" || hud.phase === "defeat" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
            <p className="text-xs tracking-widest text-primary">
              {hud.phase === "victory" ? "DAWN" : "THE DOOR"}
            </p>
            <p
              className={`mt-2 font-display text-3xl leading-tight ${hud.phase === "defeat" ? "text-danger" : "text-fg"}`}
            >
              {hud.phase === "victory" ? "Dawn held" : "The threshold broke"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {hud.phase === "victory"
                ? "Ten nights. The boarding house still stands, and the coin is warm."
                : "Something reached the oak door. Chicago does not offer a second dawn — except the one you take."}
            </p>
            <p className="num mt-4 text-sm text-fg">
              {hud.cleared} nights held · {hud.slain} put down · {hud.gold} coin left
            </p>
            {hud.best > 0 ? (
              <p className="mt-1 text-sm text-muted">Best night held: {hud.best}</p>
            ) : null}
            <button
              id="restart"
              type="button"
              className="mt-6 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
              onClick={() => {
                unlockAudio();
                restart(ensureGame());
              }}
            >
              Walk it again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-2 flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="num">{value}</span>
    </p>
  );
}

function Inspector({ hud }: { hud: Hud }) {
  const sel = hud.selected;
  if (!sel) return null;
  return (
    <div>
      <p className="font-display text-lg leading-tight">{sel.name}</p>
      <p className="text-sm text-primary">
        {sel.craft} · {sel.rankName}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{sel.blurb}</p>
      <p className="mt-1 text-sm text-fg">{sel.special}</p>
      <StatLine
        label="Damage"
        value={sel.nextDamage != null ? `${sel.damage} → ${sel.nextDamage}` : String(sel.damage)}
      />
      <StatLine
        label="Fire rate"
        value={
          sel.nextRate != null
            ? `${fmt(sel.rate)} → ${fmt(sel.nextRate)} /s`
            : `${fmt(sel.rate)} /s`
        }
      />
      <StatLine
        label="Reach"
        value={
          sel.nextRange != null
            ? `${fmt(sel.range)} → ${fmt(sel.nextRange)}`
            : `${fmt(sel.range)} squares`
        }
      />
      <div className="mt-3 flex gap-2" role="group" aria-label="Targeting">
        {(
          [
            ["first", "First"],
            ["nearest", "Nearest"],
            ["strongest", "Strongest"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={sel.mode === mode}
            className={`min-h-11 flex-1 rounded-lg border px-1 text-sm ${
              sel.mode === mode ? "border-primary bg-surface-2" : "border-line"
            }`}
            onClick={() => setMode(ensureGame(), mode as TargetMode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {sel.upgrade != null ? (
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl bg-primary px-3 font-semibold text-primary-fg"
            onClick={() => {
              unlockAudio();
              upgradeSelected(ensureGame());
            }}
          >
            Hone · {sel.upgrade}
          </button>
        ) : (
          <p className="flex min-h-11 flex-1 items-center text-sm text-muted">
            Warden rank. Damage and fire rate are mastered.
          </p>
        )}
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-3 text-danger"
          onClick={() => {
            unlockAudio();
            sellSelected(ensureGame());
          }}
        >
          Sell {sel.sell}
        </button>
      </div>
    </div>
  );
}
