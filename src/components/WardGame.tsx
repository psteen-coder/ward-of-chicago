import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Coins, Heart, Menu, Moon, Pause, Play, Settings, Smartphone, Volume2, VolumeX } from "lucide-react";
import { getVolume, loadAudioPrefs, playEvent, setMuted, setVolume, unlockAudio } from "@/game/audio";
import {
  MAP_ORDER,
  MAPS,
  MODE_ORDER,
  MODES,
  TEAMS,
  TEAM_ORDER,
  TOWERS,
  combatStats,
  formatClock,
  type MapId,
  type ModeId,
  type TargetMode,
  type TeamId,
  type TowerId,
} from "@/game/balance";
import {
  PUSHES,
  fastDuel,
  getDuel,
  holdWatch,
  parkDuel,
  pushCreep,
  rematch,
  resumeDuel,
  setWatch,
  shownGame,
  startDuel,
  stepDuel,
  takeRivalEvents,
  type DuelHud,
  type PushId,
} from "@/game/battle";
import { draw, emptyArt, type ArtBook } from "@/game/draw";
import {
  WORLD_H,
  WORLD_W,
  CELL,
  TOP_PAD,
} from "@/game/balance";
import {
  clearSelect,
  clickCell,
  continueGame,
  debugFast,
  ensureGame,
  getHud,
  getServerHud,
  loadBest,
  newGame,
  restart,
  selectKind,
  sellSelected,
  sendWave,
  setHover,
  setMode,
  startCase,
  subscribe,
  toMenu,
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
      battle: (map: MapId, you: TeamId, rival: TeamId) => void;
      push: (id: PushId) => void;
      watch: (side: "you" | "rival") => void;
      duel: () => DuelHud | null;
    };
  }
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function usePhoneInstall() {
  const [canPrompt, setCanPrompt] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);
  const promptRef = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    setAndroid(/Android/i.test(navigator.userAgent));
    const nav = navigator as Navigator & { standalone?: boolean };
    const mq = window.matchMedia("(display-mode: standalone)");
    const sync = () => setStandalone(mq.matches || nav.standalone === true);
    sync();
    mq.addEventListener("change", sync);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPrompt;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanPrompt(false);
      promptRef.current = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = () => {
    const ev = promptRef.current;
    if (!ev) return;
    void ev.prompt().then(() => ev.userChoice).then((choice) => {
      if (choice.outcome === "accepted") setInstalled(true);
      setCanPrompt(false);
      promptRef.current = null;
    });
  };

  return { canPrompt, standalone, installed, android, install };
}

function fmt(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function nightLabel(hud: Hud, duel: DuelHud | null) {
  if (hud.phase === "menu") return "Single player, or a local battle";
  if (duel) {
    const street = duel.watch === "rival" ? "their street" : "your street";
    if (hud.phase === "victory") return `${duel.youTeam} broke ${duel.rivalTeam}`;
    if (hud.phase === "defeat") return `${duel.rivalTeam} broke your door`;
    return `${duel.youTeam} vs ${duel.rivalTeam} · ${street}`;
  }
  const place = `${hud.teamName} · ${hud.mapPlace}`;
  const tag = hud.mode === "endless" ? "Endless" : hud.mode === "speed" ? "Speed" : "Standard";
  if (hud.phase === "victory") {
    return hud.mode === "speed" ? `${place} · Speed clear` : `${place} · Dawn held`;
  }
  if (hud.phase === "defeat") {
    return hud.mode === "endless"
      ? `${place} · Fell on night ${hud.sent}`
      : `${place} · The threshold broke`;
  }
  if (hud.phase === "combat") {
    return hud.mode === "endless"
      ? `${place} · ${tag} · Night ${hud.sent}`
      : `${place} · ${tag} · Night ${hud.sent} of ${hud.total}`;
  }
  if (hud.sent === 0) return `${place} · ${tag} · Night 1 is waiting`;
  if (hud.mode === "endless") return `${place} · ${tag} · Night ${hud.sent} held`;
  return `${place} · ${tag} · Night ${hud.sent} held · next ${Math.min(hud.total, hud.sent + 1)}`;
}

function loadArt(art: ArtBook) {
  const pull = (src: string, done: (img: HTMLImageElement) => void) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => done(img);
    img.src = src;
  };
  for (const id of MAP_ORDER) {
    pull(MAPS[id].art, (img) => {
      art.maps[id] = img;
    });
  }
  pull("/game/base.png", (img) => {
    art.base = img;
  });
  for (const team of TEAM_ORDER) {
    for (const kind of TEAMS[team].units) {
      pull(`/game/${kind}.png`, (img) => {
        art.towers[kind] = img;
      });
    }
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
  const [panel, setPanel] = useState<"main" | "case" | "battle" | "settings">("main");
  const [draftTeam, setDraftTeam] = useState<TeamId>("dresden");
  const [draftMap, setDraftMap] = useState<MapId>("chicago");
  const [draftMode, setDraftMode] = useState<ModeId>("standard");
  const [draftRival, setDraftRival] = useState<TeamId>("winter");
  const [volume, setVolumeUi] = useState(85);
  const phone = usePhoneInstall();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<ArtBook>(emptyArt());
  const viewRef = useRef({ cssW: 1, cssH: 1, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const g = ensureGame();
    const prefs = loadAudioPrefs();
    setMutedUi(prefs.muted);
    setVolumeUi(Math.round(getVolume() * 100));
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
      stepDuel(g, dt);
      const events = g.events.splice(0, g.events.length);
      for (const ev of takeRivalEvents()) {
        if (events.length < 6) events.push(ev);
      }
      for (let i = 0; i < events.length && i < 6; i++) playEvent(events[i]);
      const view = viewRef.current;
      if (view.cssW > 2) {
        draw(ctx, shownGame(g), artRef.current, view.cssW, view.cssH, view.dpr, dt, reduce);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const digits = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
      const roster = (TEAMS[g.team] ?? TEAMS.dresden).units;
      const index = digits.indexOf(event.code);
      if (index >= 0 && roster[index]) {
        selectKind(g, roster[index]);
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
      fast: (seconds) => (g.duel ? fastDuel(g, seconds) : debugFast(g, seconds)),
      battle: (map: MapId, you: TeamId, rival: TeamId) => startDuel(g, map, you, rival),
      push: (id: PushId) => pushCreep(g, id),
      watch: (side: "you" | "rival") => setWatch(side),
      duel: () => getDuel(),
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
    return { c: Math.floor(x / CELL), r: Math.floor((y - TOP_PAD) / CELL) };
  };

  const placing = hud.placing ? TOWERS[hud.placing] : null;
  const placingStats = hud.placing ? combatStats(hud.placing, 1) : null;
  const duel = getDuel();
  const canSend = !duel && hud.phase === "prep" && (hud.mode === "endless" || hud.sent < hud.total);

  return (
    <div
      className="relative h-dvh max-h-dvh overflow-hidden bg-bg text-fg"
      onPointerDown={() => unlockAudio()}
    >
      <div className="flex h-full min-h-0 flex-col" inert={hud.phase === "menu" ? true : undefined}>
      <header className="safe-top safe-x flex shrink-0 items-center gap-2 border-b border-line py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xs tracking-wide text-primary">
            Ward of Chicago
          </h1>
          <p className="truncate text-sm text-muted">{nightLabel(hud, duel)}</p>
          <div className="mt-1 flex gap-1" aria-hidden>
            {duel && hud.phase !== "menu" ? (
              <span className={`text-xs ${duel.rivalLives <= 5 ? "text-danger" : "text-muted"}`}>
                Their door {duel.rivalLives}
                {duel.rivalLeft > 0 ? ` · ${duel.rivalLeft} walking` : ""}
              </span>
            ) : hud.mode === "endless" || hud.total <= 0 ? (
              <span className="text-xs text-muted">
                {hud.cleared > 0 ? `Night ${hud.cleared} finished` : "No night finished yet"}
              </span>
            ) : (
              Array.from({ length: hud.total }, (_, i) => {
                const done = i < hud.cleared;
                const now = hud.phase === "combat" && i === hud.sent - 1;
                return (
                  <span
                    key={i}
                    className={`h-1.5 min-w-0 flex-1 rounded-full ${done ? "bg-primary" : now ? "bg-ward" : "bg-line"}`}
                  />
                );
              })
            )}
          </div>
        </div>
        {hud.phase === "prep" || hud.phase === "combat" ? (
          <button
            id="open-menu"
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface"
            aria-label="Main menu"
            onClick={() => {
              unlockAudio();
              setPanel("main");
              parkDuel(ensureGame());
              toMenu(ensureGame());
            }}
          >
            <Menu className="size-5" aria-hidden />
          </button>
        ) : null}
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5"
          aria-label={`${hud.gold} coin`}
        >
          <Coins className="size-5 text-primary" aria-hidden />
          <span className="num text-base">{hud.gold}</span>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 ${hud.lives <= 5 ? "text-danger" : ""}`}
          aria-label={`${hud.lives} of ${hud.livesMax} lives remaining`}
        >
          <Heart className="size-5 text-danger" aria-hidden />
          <span className="num text-base">{hud.lives}</span>
          <span className="text-xs text-muted">/{hud.livesMax}</span>
        </div>
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => {
            unlockAudio();
            const next = !muted;
            setMutedUi(next);
            setMuted(next);
            setVolumeUi(Math.round(getVolume() * 100));
          }}
        >
          {muted ? (
            <VolumeX className="size-5" aria-hidden />
          ) : (
            <Volume2 className="size-5" aria-hidden />
          )}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col desk:flex-row">
        <div
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center bg-bg"
        >
          <canvas
            id="board"
            ref={canvasRef}
            className="touch-none"
            aria-label={`${hud.mapName}. Place defenders beside the path.`}
            onPointerMove={(event) => {
              if (getDuel()?.watch === "rival") return;
              const cell = point(event);
              setHover(ensureGame(), cell.c, cell.r);
            }}
            onPointerLeave={() => setHover(ensureGame(), -1, -1)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              unlockAudio();
              if (getDuel()?.watch === "rival") {
                holdWatch(ensureGame());
                return;
              }
              const cell = point(event);
              clickCell(ensureGame(), cell.c, cell.r);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              clearSelect(ensureGame());
            }}
          />
          {duel && hud.phase !== "menu" ? (
            <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              {duel.watch === "rival" ? `${duel.rivalTeam}'s street` : "Your street"}
            </p>
          ) : null}
          {hud.banner ? (
            <p
              key={hud.bannerSeq}
              className="banner-pop pointer-events-none absolute top-3 left-1/2 z-10 max-w-xs rounded-full border border-line bg-surface px-3 py-1 text-center text-sm text-fg"
            >
              {hud.banner}
            </p>
          ) : null}
        </div>

        <aside className={`flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-line desk:h-auto desk:max-h-none desk:w-80 desk:flex-none desk:border-t-0 desk:border-l ${duel ? "h-80" : "h-72"}`}>
          <div className="shrink-0 px-3 pt-3">
            {duel && hud.phase !== "menu" ? (
              <div className="mb-3">
                <div className="flex gap-2">
                  <button
                    id="watch-you"
                    type="button"
                    aria-pressed={duel.watch === "you"}
                    className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold ${duel.watch === "you" ? "border-primary bg-surface-2" : "border-line"}`}
                    onClick={() => setWatch("you")}
                  >
                    Your street
                  </button>
                  <button
                    id="watch-rival"
                    type="button"
                    aria-pressed={duel.watch === "rival"}
                    className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold ${duel.watch === "rival" ? "border-primary bg-surface-2" : "border-line"}`}
                    onClick={() => setWatch("rival")}
                  >
                    Their street
                  </button>
                </div>
                <p className={`mt-2 text-sm ${duel.rivalLives <= 5 ? "text-danger" : "text-fg"}`}>
                  {duel.rivalTeam} · {duel.rivalLives} lives · {duel.rivalGold} coin · {duel.rivalLeft} walking
                </p>
                <p className="mt-1 text-xs text-muted">{duel.lastPush}</p>
              </div>
            ) : null}
            <p className="text-xs tracking-widest text-muted">{duel ? "YOUR COURT" : hud.teamName.toUpperCase()}</p>
            <p className="mt-1 text-sm text-muted">
              {duel
                ? `${hud.teamName} · ${duel.youLeft} on your road`
                : hud.phase === "combat"
                  ? `${hud.remaining} still on the street${hud.mode === "speed" ? " · the next night is already walking" : ""}`
                  : hud.nextBlurb
                    ? `Next: ${hud.nextBlurb}`
                    : "The street is quiet"}
            </p>
            {duel && hud.phase !== "menu" ? (
              <p className="mt-1 text-xs text-muted">
                Earned {hud.goldEarned} · pushed {duel.pushSpent} · {formatClock(hud.combatTime)}
              </p>
            ) : hud.phase === "prep" || hud.phase === "combat" ? (
              <p className="mt-1 text-xs text-muted">
                Earned {hud.goldEarned} · lost {hud.livesLost}{" "}
                {hud.livesLost === 1 ? "life" : "lives"} · {formatClock(hud.combatTime)}
                {hud.phase === "combat" ? ` · this night ${formatClock(hud.nightClock)}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2 overflow-x-auto p-3 desk:flex-col desk:overflow-visible">
            {TEAMS[hud.team].units.map((kind, index) => {
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
                    if (getDuel()) setWatch("you");
                    selectKind(ensureGame(), kind);
                  }}
                  className={`flex w-44 shrink-0 gap-2 rounded-xl border p-2 text-left desk:w-auto ${
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
                Off the road. Each ground bends a different way. Hone a defender to raise
                damage and rate of fire.
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="safe-pad safe-x flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface pt-2">
        {duel && hud.phase !== "menu" ? (
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:max-w-md">
            {PUSHES.map((push) => {
              const poor = hud.gold < push.cost;
              const live = hud.phase === "combat" && !hud.paused;
              return (
                <button
                  key={push.id}
                  id={`push-${push.id}`}
                  type="button"
                  disabled={!live || poor}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 text-left text-sm disabled:opacity-40"
                  onClick={() => {
                    unlockAudio();
                    pushCreep(ensureGame(), push.id);
                  }}
                >
                  <span className="truncate">{push.label}</span>
                  <span className={`num shrink-0 ${poor ? "text-danger" : "text-primary"}`}>{push.cost}</span>
                </button>
              );
            })}
          </div>
        ) : (
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
          {hud.mode === "speed" && hud.phase === "combat"
            ? hud.paused
              ? "Holding the street"
              : "Next night starts itself"
            : canSend
              ? hud.sent === 0
                ? "Send the night"
                : "Send the next night"
              : hud.phase === "combat"
                ? hud.paused
                  ? "Holding the street"
                  : "They're in the street"
                : "Send the night"}
        </button>
        )}
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

      {hud.phase === "victory" || hud.phase === "defeat" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
            <p className="text-xs tracking-widest text-primary">
              {duel ? "THE BATTLE" : hud.phase === "victory" ? "DAWN" : "THE DOOR"}
            </p>
            <p
              className={`mt-2 font-display text-3xl leading-tight ${hud.phase === "defeat" ? "text-danger" : "text-fg"}`}
            >
              {duel
                ? hud.phase === "victory"
                  ? "Their door broke"
                  : "Your door broke"
                : hud.phase === "victory"
                  ? hud.mode === "speed"
                    ? "The clock stopped"
                    : "Dawn held"
                  : hud.mode === "endless"
                    ? "The street outlasted you"
                    : "The threshold broke"}
            </p>
            <p className="mt-1 text-sm text-primary">
              {duel
                ? `${duel.youTeam} vs ${duel.rivalTeam} · ${duel.mapPlace}`
                : `${hud.modeName} · ${hud.teamName} · ${hud.mapPlace}`}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {duel
                ? hud.phase === "victory"
                  ? "The rival court could not hold the other street."
                  : "Your street gave way. Theirs is still standing."
                : hud.phase === "victory" && hud.mode === "speed"
                  ? "Ten nights, back to back. The score is how long the fight took, not how fast the clock on the wall ran."
                  : hud.phase === "victory"
                    ? `Ten nights on ${hud.mapPlace.toLowerCase()}. The last door still holds.`
                    : hud.mode === "endless"
                      ? "Endless night keeps the high score as the last night you finished, not the one that broke the door."
                      : `${hud.mapPlace} gave way. Walk the same ground again, or choose another.`}
            </p>
            {duel ? <BattleScore hud={hud} duel={duel} /> : <ScoreCard hud={hud} />}
            <button
              id="restart"
              type="button"
              className="mt-6 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
              onClick={() => {
                unlockAudio();
                if (duel) rematch(ensureGame());
                else restart(ensureGame());
              }}
            >
              Walk it again
            </button>
            <button
              id="main-menu"
              type="button"
              className="mt-2 min-h-12 w-full rounded-xl border border-line font-semibold text-fg"
              onClick={() => {
                unlockAudio();
                setPanel("main");
                parkDuel(ensureGame());
                toMenu(ensureGame());
              }}
            >
              Main menu
            </button>
          </div>
        </div>
      ) : null}
      </div>
      {hud.phase === "menu" ? (
        <FrontDoor
          hud={hud}
          panel={panel}
          volume={volume}
          muted={muted}
          draftTeam={draftTeam}
          draftMap={draftMap}
          draftMode={draftMode}
          draftRival={draftRival}
          onPanel={setPanel}
          onTeam={setDraftTeam}
          onMap={setDraftMap}
          onMode={setDraftMode}
          onRival={setDraftRival}
          onVolume={(next) => {
            setVolumeUi(next);
            setMutedUi(next <= 0);
            unlockAudio();
            setVolume(next / 100);
          }}
          onMute={() => {
            unlockAudio();
            const next = !muted;
            setMutedUi(next);
            setMuted(next);
            setVolumeUi(Math.round(getVolume() * 100));
          }}
          phone={phone}
        />
      ) : null}
    </div>
  );
}

function FrontDoor({
  hud,
  panel,
  volume,
  muted,
  draftTeam,
  draftMap,
  draftMode,
  draftRival,
  onPanel,
  onTeam,
  onMap,
  onMode,
  onRival,
  onVolume,
  onMute,
  phone,
}: {
  hud: Hud;
  panel: "main" | "case" | "battle" | "settings";
  volume: number;
  muted: boolean;
  draftTeam: TeamId;
  draftMap: MapId;
  draftMode: ModeId;
  draftRival: TeamId;
  onPanel: (panel: "main" | "case" | "battle" | "settings") => void;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onMode: (id: ModeId) => void;
  onRival: (id: TeamId) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  phone: ReturnType<typeof usePhoneInstall>;
}) {
  const offerInstall = !phone.standalone && !phone.installed && (phone.android || phone.canPrompt);
  const duel = getDuel();
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-bg">
      <div className={`safe-menu mx-auto flex min-h-full w-full max-w-5xl flex-col ${panel === "main" ? "justify-center" : ""}`}>
        {panel === "settings" ? (
          <SettingsPanel
            volume={volume}
            muted={muted}
            onVolume={onVolume}
            onMute={onMute}
            onBack={() => onPanel("main")}
            phone={phone}
          />
        ) : panel === "case" ? (
          <CasePanel
            hud={hud}
            draftTeam={draftTeam}
            draftMap={draftMap}
            draftMode={draftMode}
            onTeam={onTeam}
            onMap={onMap}
            onMode={onMode}
            onBack={() => onPanel("main")}
            onStart={() => {
              unlockAudio();
              onPanel("main");
              newGame(ensureGame(), draftMap, draftTeam, draftMode);
            }}
          />
        ) : panel === "battle" ? (
          <BattlePanel
            draftTeam={draftTeam}
            draftRival={draftRival}
            draftMap={draftMap}
            onTeam={onTeam}
            onRival={onRival}
            onMap={onMap}
            onBack={() => onPanel("main")}
            onStart={() => {
              unlockAudio();
              onPanel("main");
              startDuel(ensureGame(), draftMap, draftTeam, draftRival);
            }}
          />
        ) : (
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest text-primary">AN UNOFFICIAL NIGHT</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-fg sm:text-6xl">Ward of Chicago</h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                Single player is a night on your own. Multiplayer is a local battle:
                your court holds one street, a rival court holds the other.
              </p>
              <p className="mt-8 max-w-md text-xs leading-relaxed text-muted">
                A fan game. Not affiliated with Jim Butcher or the rights holders.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {hud.hasSave ? (
                <button
                  id="continue"
                  type="button"
                  className={`min-h-14 w-full rounded-xl px-4 py-3 text-left font-semibold ${
                    duel?.parked
                      ? "border border-line bg-surface text-fg"
                      : "bg-primary text-primary-fg"
                  }`}
                  onClick={() => {
                    unlockAudio();
                    onPanel("main");
                    continueGame(ensureGame());
                  }}
                >
                  <span className="block text-lg">{duel?.parked ? "Continue night" : "Continue"}</span>
                  <span className={`mt-0.5 block text-sm font-normal ${duel?.parked ? "text-muted" : "opacity-80"}`}>
                    {hud.saveMode ? `${hud.saveMode} · ` : ""}
                    {hud.saveTeam || hud.saveName}
                    {" · "}
                    {hud.saveNight <= 0
                      ? `${hud.savePlace}, night 1 waiting`
                      : `${hud.savePlace}, night ${hud.saveNight}`}
                  </span>
                </button>
              ) : null}
              {duel?.parked ? (
                <button
                  id="continue-battle"
                  type="button"
                  className="min-h-14 w-full rounded-xl bg-primary px-4 py-3 text-left font-semibold text-primary-fg"
                  onClick={() => {
                    unlockAudio();
                    onPanel("main");
                    resumeDuel(ensureGame());
                  }}
                >
                  <span className="block text-lg">Continue battle</span>
                  <span className="mt-0.5 block text-sm font-normal opacity-80">
                    {duel.youTeam} vs {duel.rivalTeam} · {duel.mapPlace}
                  </span>
                </button>
              ) : null}
              <button
                id="play-single"
                type="button"
                className={`min-h-14 w-full rounded-xl px-4 py-3 text-left font-semibold ${
                  hud.hasSave || duel?.parked
                    ? "border border-line bg-surface text-fg"
                    : "bg-primary text-primary-fg"
                }`}
                onClick={() => onPanel("case")}
              >
                <span className="block text-lg">Single player</span>
                <span className={`mt-0.5 block text-sm font-normal ${hud.hasSave || duel?.parked ? "text-muted" : "opacity-80"}`}>
                  Night, court, and ground.
                </span>
              </button>
              <button
                id="play-multi"
                type="button"
                className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-left font-semibold text-fg"
                onClick={() => onPanel("battle")}
              >
                <span className="block text-lg">Multiplayer</span>
                <span className="mt-0.5 block text-sm font-normal text-muted">
                  A local battle on this device. Your court against a rival court.
                </span>
              </button>
              <button
                id="settings"
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-lg font-semibold text-fg"
                onClick={() => onPanel("settings")}
              >
                <Settings className="size-5 text-primary" aria-hidden />
                Settings
              </button>
              {offerInstall ? (
                <button
                  id="install-app"
                  type="button"
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-lg font-semibold text-fg"
                  onClick={() => {
                    if (phone.canPrompt) phone.install();
                    else onPanel("settings");
                  }}
                >
                  <Smartphone className="size-5 text-primary" aria-hidden />
                  Add to Home screen
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BattlePanel({
  draftTeam,
  draftRival,
  draftMap,
  onTeam,
  onRival,
  onMap,
  onBack,
  onStart,
}: {
  draftTeam: TeamId;
  draftRival: TeamId;
  draftMap: MapId;
  onTeam: (id: TeamId) => void;
  onRival: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <div>
      <button id="battle-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Local battle</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        You hold one street. A rival court holds the other, on this device. Coin ticks in
        on both sides. Spend it to build, or to push creeps onto their road. The first
        broken door loses.
      </p>
      <p className="mt-6 text-xs tracking-widest text-muted">YOUR COURT</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TEAM_ORDER.map((id) => {
          const def = TEAMS[id];
          const on = id === draftTeam;
          return (
            <button
              key={id}
              id={`you-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onTeam(id)}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-xs tracking-widest text-muted">RIVAL COURT</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TEAM_ORDER.map((id) => {
          const def = TEAMS[id];
          const on = id === draftRival;
          return (
            <button
              key={id}
              id={`rival-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onRival(id)}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-xs tracking-widest text-muted">GROUND</p>
      <p className="mt-1 text-sm text-muted">Both courts walk this road.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {MAP_ORDER.map((id) => {
          const def = MAPS[id];
          const on = id === draftMap;
          return (
            <button
              key={id}
              id={`ground-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onMap(id)}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <button
        id="duel-start"
        type="button"
        className="mt-6 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
        onClick={onStart}
      >
        Start battle · {TEAMS[draftTeam].name} vs {TEAMS[draftRival].name}
      </button>
    </div>
  );
}

function CasePanel({
  hud,
  draftTeam,
  draftMap,
  draftMode,
  onTeam,
  onMap,
  onMode,
  onBack,
  onStart,
}: {
  hud: Hud;
  draftTeam: TeamId;
  draftMap: MapId;
  draftMode: ModeId;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onMode: (id: ModeId) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const team = TEAMS[draftTeam];
  const mode = MODES[draftMode];
  return (
    <div>
      <button id="case-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Take a case</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Pick the night, the court you command, then the ground. The road is different on every map.
      </p>
      <p className="mt-6 text-xs tracking-widest text-muted">NIGHT</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {MODE_ORDER.map((id) => {
          const def = MODES[id];
          const on = id === draftMode;
          return (
            <button
              key={id}
              id={`mode-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onMode(id)}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-xs tracking-widest text-muted">COURT</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TEAM_ORDER.map((id) => {
          const def = TEAMS[id];
          const on = id === draftTeam;
          return (
            <button
              key={id}
              id={`team-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onTeam(id)}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-primary">
        {team.units.map((id) => TOWERS[id].name).join(" · ")}
      </p>
      <p className="mt-6 text-xs tracking-widest text-muted">GROUND</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {MAP_ORDER.map((id) => {
          const def = MAPS[id];
          const on = id === draftMap;
          const mark =
            draftMode === "endless"
              ? (hud.marks.endless[id] ?? 0)
              : draftMode === "speed"
                ? (hud.marks.speed[id] ?? 0)
                : (hud.bests[id] ?? 0);
          const markLabel =
            mark <= 0
              ? "Unwalked"
              : draftMode === "speed"
                ? formatClock(mark)
                : draftMode === "endless"
                  ? `High ${mark}`
                  : `Best ${mark}`;
          return (
            <button
              key={id}
              id={`level-${id}`}
              type="button"
              aria-pressed={on}
              className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => onMap(id)}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-lg leading-tight">{def.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                  <Moon className="size-3.5 text-primary" aria-hidden />
                  {markLabel}
                </span>
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{def.blurb}</span>
            </button>
          );
        })}
      </div>
      <button
        id="start-case"
        type="button"
        className="mt-6 min-h-12 w-full rounded-xl bg-primary px-3 font-semibold text-primary-fg"
        onClick={onStart}
      >
        Start · {mode.name} · {team.name}
      </button>
    </div>
  );
}

function SettingsPanel({
  volume,
  muted,
  onVolume,
  onMute,
  onBack,
  phone,
}: {
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMute: () => void;
  onBack: () => void;
  phone: ReturnType<typeof usePhoneInstall>;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <button id="settings-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Settings</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">Sound for the night music and the hits. Saved in this browser.</p>
      <label className="mt-8 block text-sm text-fg" htmlFor="volume">
        Volume
        <span className="num ml-2 text-primary">{muted ? "Muted" : volume}</span>
      </label>
      <input
        id="volume"
        type="range"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={muted ? 0 : volume}
        className="mt-3 h-11 w-full accent-primary"
        onChange={(event) => onVolume(Number(event.target.value))}
      />
      <button
        type="button"
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface font-semibold"
        aria-pressed={muted}
        onClick={onMute}
      >
        {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5 text-primary" aria-hidden />}
        {muted ? "Unmute" : "Mute"}
      </button>
      {phone.standalone ? null : (
        <div className="mt-10 border-t border-line pt-8">
          <h3 className="font-display text-2xl text-fg">On a phone</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The computer layout stays in a wide window. On a phone, add the game to your home screen and it opens full screen. There is no store download.
          </p>
          {phone.installed ? (
            <p className="mt-4 text-sm text-primary">Added. Open Ward of Chicago from your home screen.</p>
          ) : phone.canPrompt ? (
            <button
              id="install-app"
              type="button"
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-fg"
              onClick={phone.install}
            >
              <Smartphone className="size-5" aria-hidden />
              Add to Home screen
            </button>
          ) : (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li>Open this page in Chrome on your phone.</li>
              <li>Tap the Chrome menu, the three dots.</li>
              <li>Choose Install app, or Add to Home screen, then confirm.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function BattleScore({ hud, duel }: { hud: Hud; duel: DuelHud }) {
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg px-4 py-3 text-left">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Their lives left</dt>
        <dd className="num text-right">{duel.rivalLives}</dd>
        <dt className="text-muted">Your lives left</dt>
        <dd className="num text-right">{hud.lives}</dd>
        <dt className="text-muted">Gold from kills</dt>
        <dd className="num text-right">{hud.goldEarned}</dd>
        <dt className="text-muted">Coin spent pushing</dt>
        <dd className="num text-right">{duel.pushSpent}</dd>
        <dt className="text-muted">Time on the street</dt>
        <dd className="num text-right">{formatClock(hud.combatTime)}</dd>
      </dl>
      <p className="mt-3 text-sm text-muted">{duel.lastPush}</p>
      <p className="mt-1 text-xs text-muted">{duel.income}</p>
    </div>
  );
}

function ScoreCard({ hud }: { hud: Hud }) {
  const endlessBest = hud.marks.endless[hud.map] ?? 0;
  const speedBest = hud.marks.speed[hud.map] ?? 0;
  const standardBest = hud.bests[hud.map] ?? 0;
  const record =
    hud.mode === "endless"
      ? endlessBest > 0
        ? `High score on this ground: night ${endlessBest}`
        : ""
      : hud.mode === "speed"
        ? speedBest > 0
          ? `Best speed run here: ${formatClock(speedBest)}`
          : ""
        : standardBest > 0
          ? `Best night held here: ${standardBest}`
          : "";
  const freshRecord =
    hud.mode === "endless"
      ? hud.cleared > 0 && hud.cleared === endlessBest
      : hud.mode === "speed"
        ? hud.phase === "victory" && speedBest > 0 && hud.combatTime <= speedBest + 0.001
        : hud.phase === "victory" && standardBest === hud.cleared && hud.cleared > 0;
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg px-4 py-3 text-left">
      <p className="num text-sm text-fg">
        {hud.cleared} {hud.cleared === 1 ? "night" : "nights"} finished · {hud.slain} put down ·{" "}
        {hud.gold} coin left
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Gold generated</dt>
        <dd className="num text-right">{hud.goldEarned}</dd>
        <dt className="text-muted">Lives lost</dt>
        <dd className="num text-right">{hud.livesLost}</dd>
        <dt className="text-muted">Time on the street</dt>
        <dd className="num text-right">{formatClock(hud.combatTime)}</dd>
        <dt className="text-muted">Highest night finished</dt>
        <dd className="num text-right">{hud.cleared}</dd>
      </dl>
      {hud.roundTimes.length > 0 || hud.nightOpen ? (
        <div className="mt-3 max-h-36 overflow-y-auto border-t border-line pt-2">
          {hud.roundTimes.map((seconds, index) => (
            <p key={index} className="flex justify-between gap-3 text-sm text-muted">
              <span>Night {index + 1}</span>
              <span className="num text-fg">{formatClock(seconds)}</span>
            </p>
          ))}
          {hud.nightOpen ? (
            <p className="flex justify-between gap-3 text-sm text-muted">
              <span>Night {hud.sent} unfinished</span>
              <span className="num text-fg">{formatClock(hud.nightClock)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {record ? (
        <p className="mt-3 text-sm text-muted">
          {record}
          {freshRecord ? " · this run" : ""}
        </p>
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
