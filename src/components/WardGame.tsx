import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Coins, Heart, Menu, Moon, Pause, Play, Settings, Smartphone, Volume2, VolumeX } from "lucide-react";
import { getVolume, loadAudioPrefs, playEvent, setMuted, setVolume, unlockAudio } from "@/game/audio";
import {
  MAP_ORDER,
  MAPS,
  TEAMS,
  TEAM_ORDER,
  TOWERS,
  combatStats,
  type MapId,
  type TargetMode,
  type TeamId,
  type TowerId,
} from "@/game/balance";
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
  step,
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

function nightLabel(hud: Hud) {
  if (hud.phase === "menu") return "Choose a court and a ground";
  const place = `${hud.teamName} · ${hud.mapPlace}`;
  if (hud.phase === "victory") return `${place} · Dawn held`;
  if (hud.phase === "defeat") return `${place} · The threshold broke`;
  return hud.phase === "combat"
    ? `${place} · Night ${hud.sent} of ${hud.total}`
    : hud.sent === 0
      ? `${place} · Night 1 is waiting`
      : `${place} · Night ${hud.sent} held · next is ${Math.min(hud.total, hud.sent + 1)}`;
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
  const [panel, setPanel] = useState<"main" | "case" | "settings">("main");
  const [draftTeam, setDraftTeam] = useState<TeamId>("dresden");
  const [draftMap, setDraftMap] = useState<MapId>("chicago");
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
    return { c: Math.floor(x / CELL), r: Math.floor((y - TOP_PAD) / CELL) };
  };

  const placing = hud.placing ? TOWERS[hud.placing] : null;
  const placingStats = hud.placing ? combatStats(hud.placing, 1) : null;
  const canSend = hud.phase === "prep" && hud.sent < hud.total;

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
        {hud.phase === "prep" || hud.phase === "combat" ? (
          <button
            id="open-menu"
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface"
            aria-label="Main menu"
            onClick={() => {
              unlockAudio();
              setPanel("main");
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

        <aside className="flex h-72 min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-line desk:h-auto desk:max-h-none desk:w-80 desk:flex-none desk:border-t-0 desk:border-l">
          <div className="shrink-0 px-3 pt-3">
            <p className="text-xs tracking-widest text-muted">{hud.teamName.toUpperCase()}</p>
            <p className="mt-1 text-sm text-muted">
              {hud.phase === "combat"
                ? `${hud.remaining} still on the street`
                : hud.nextBlurb
                  ? `Next: ${hud.nextBlurb}`
                  : "The street is quiet"}
            </p>
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

      <footer className="safe-pad safe-x flex shrink-0 items-center gap-2 border-t border-line bg-surface pt-2">
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

      {hud.phase === "victory" || hud.phase === "defeat" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
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
            <p className="mt-1 text-sm text-primary">
              {hud.teamName} · {hud.mapPlace}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {hud.phase === "victory"
                ? `Ten nights on ${hud.mapPlace.toLowerCase()}. The last door still holds, and the coin is warm.`
                : `${hud.mapPlace} gave way. Walk the same ground again, or choose another.`}
            </p>
            <p className="num mt-4 text-sm text-fg">
              {hud.cleared} nights held · {hud.slain} put down · {hud.gold} coin left
            </p>
            {(hud.bests[hud.map] ?? 0) > 0 ? (
              <p className="mt-1 text-sm text-muted">Best night held here: {hud.bests[hud.map]}</p>
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
            <button
              id="main-menu"
              type="button"
              className="mt-2 min-h-12 w-full rounded-xl border border-line font-semibold text-fg"
              onClick={() => {
                unlockAudio();
                setPanel("main");
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
          onPanel={setPanel}
          onTeam={setDraftTeam}
          onMap={setDraftMap}
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
  onPanel,
  onTeam,
  onMap,
  onVolume,
  onMute,
  phone,
}: {
  hud: Hud;
  panel: "main" | "case" | "settings";
  volume: number;
  muted: boolean;
  draftTeam: TeamId;
  draftMap: MapId;
  onPanel: (panel: "main" | "case" | "settings") => void;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  phone: ReturnType<typeof usePhoneInstall>;
}) {
  const offerInstall = !phone.standalone && !phone.installed && (phone.android || phone.canPrompt);
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
            onTeam={onTeam}
            onMap={onMap}
            onBack={() => onPanel("main")}
            onStart={() => {
              unlockAudio();
              onPanel("main");
              newGame(ensureGame(), draftMap, draftTeam);
            }}
          />
        ) : (
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest text-primary">AN UNOFFICIAL NIGHT</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-fg sm:text-6xl">Ward of Chicago</h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                Four courts. Four grounds, each with its own road. Post a roster beside the
                path, spend what the night pays, and hold the last door for ten nights.
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
                  className="min-h-14 w-full rounded-xl bg-primary px-4 py-3 text-left font-semibold text-primary-fg"
                  onClick={() => {
                    unlockAudio();
                    onPanel("main");
                    continueGame(ensureGame());
                  }}
                >
                  <span className="block text-lg">Continue</span>
                  <span className="mt-0.5 block text-sm font-normal opacity-80">
                    {hud.saveTeam || hud.saveName}
                    {" · "}
                    {hud.saveNight <= 0
                      ? `${hud.savePlace}, night 1 waiting`
                      : `${hud.savePlace}, night ${hud.saveNight}`}
                  </span>
                </button>
              ) : null}
              <button
                id="new-game"
                type="button"
                className={`min-h-14 w-full rounded-xl px-4 text-lg font-semibold ${
                  hud.hasSave
                    ? "border border-line bg-surface text-fg"
                    : "bg-primary text-primary-fg"
                }`}
                onClick={() => onPanel("case")}
              >
                New game
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

function CasePanel({
  hud,
  draftTeam,
  draftMap,
  onTeam,
  onMap,
  onBack,
  onStart,
}: {
  hud: Hud;
  draftTeam: TeamId;
  draftMap: MapId;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const team = TEAMS[draftTeam];
  return (
    <div>
      <button id="case-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Take a case</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Pick the court you command, then the ground. The road is different on every map.
      </p>
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
          const best = hud.bests[id] ?? 0;
          const on = id === draftMap;
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
                  {best > 0 ? `Best ${best}` : "Unwalked"}
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
        className="mt-6 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
        onClick={onStart}
      >
        Start · {team.name} on {MAPS[draftMap].place}
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
