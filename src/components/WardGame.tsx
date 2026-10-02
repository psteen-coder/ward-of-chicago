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
  acceptAgain,
  applyFriendStart,
  askAgain,
  fastDuel,
  getDuel,
  holdWatch,
  leaveFriend,
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
import { netSend } from "@/game/online";
import {
  EMPTY_SEAT,
  FriendPanel,
  FriendWire,
  cleanTableCode,
  makeTableCode,
  type FriendLink,
  type FriendSeat,
} from "@/components/FriendTable";
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

function waveStatus(hud: Hud) {
  if (hud.mode === "endless") {
    if (hud.phase === "combat") return `Night ${hud.sent}`;
    return hud.sent <= 0 ? "Night 1" : `Night ${hud.sent + 1}`;
  }
  const night = hud.phase === "combat" ? hud.sent : Math.min(hud.total, Math.max(1, hud.sent + 1));
  return `Night ${night}/${hud.total || 10}`;
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

type DoorPanel = "main" | "case" | "battle" | "settings" | "multi" | "friend";

function tableFromUrl() {
  if (typeof window === "undefined") return "";
  return cleanTableCode(new URLSearchParams(window.location.search).get("table") ?? "");
}

export function WardGame() {
  const hud = useSyncExternalStore(subscribe, getHud, getServerHud);
  const [muted, setMutedUi] = useState(false);
  const [panel, setPanel] = useState<DoorPanel>(() => (tableFromUrl().length === 4 ? "friend" : "main"));
  const [draftTeam, setDraftTeam] = useState<TeamId>("dresden");
  const [draftMap, setDraftMap] = useState<MapId>("chicago");
  const [draftMode, setDraftMode] = useState<ModeId>("standard");
  const [draftRival, setDraftRival] = useState<TeamId>("winter");
  const [link, setLink] = useState<FriendLink | null>(null);
  const [seat, setSeat] = useState<FriendSeat>(EMPTY_SEAT);
  const [friendName, setFriendName] = useState("Warden");
  const [friendCode, setFriendCode] = useState(() => tableFromUrl());
  const [friendReady, setFriendReady] = useState(false);
  const [volume, setVolumeUi] = useState(85);
  const phone = usePhoneInstall();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<ArtBook>(emptyArt());
  const viewRef = useRef({ cssW: 1, cssH: 1, dpr: 1 });
  const dismissTipRef = useRef<() => void>(() => {});
  const tipLockRef = useRef(false);
  const hideTipTimer = useRef<number | null>(null);
  const [tip, setTip] = useState<TowerId | null>(null);
  const [tipLock, setTipLock] = useState(false);

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
        dismissTipRef.current();
        return;
      }
      if (event.code === "KeyU") {
        upgradeSelected(g);
        return;
      }
      if (event.code === "Space" && tag !== "BUTTON") {
        event.preventDefault();
        if (g.phase === "prep") sendWave(g);
        else if (g.phase === "combat" && !getDuel()?.online) togglePause(g);
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

  const duel = getDuel();
  const canSend = !duel && hud.phase === "prep" && (hud.mode === "endless" || hud.sent < hud.total);
  const playing = hud.phase === "prep" || hud.phase === "combat";

  const dropLink = () => {
    setLink(null);
    setFriendReady(false);
    setSeat(EMPTY_SEAT);
    leaveFriend(ensureGame());
  };

  const hostTable = () => {
    unlockAudio();
    const code = makeTableCode();
    const name = friendName.trim().slice(0, 24) || "Warden";
    setFriendReady(false);
    setSeat(EMPTY_SEAT);
    setLink({ role: "host", code, name });
  };

  const joinTable = () => {
    const code = cleanTableCode(friendCode);
    if (code.length !== 4) return;
    unlockAudio();
    const name = friendName.trim().slice(0, 24) || "Warden";
    setFriendReady(false);
    setSeat(EMPTY_SEAT);
    setLink({ role: "guest", code, name });
  };

  const beginTable = () => {
    if (!link || link.role !== "host" || !seat.peerTeam) return;
    unlockAudio();
    const msg = {
      t: "start" as const,
      map: draftMap,
      hostTeam: draftTeam,
      guestTeam: seat.peerTeam,
      round: 1,
    };
    applyFriendStart(ensureGame(), msg, "host");
    netSend(msg);
    setPanel("main");
  };

  const dismissTip = () => {
    if (hideTipTimer.current != null) window.clearTimeout(hideTipTimer.current);
    hideTipTimer.current = null;
    tipLockRef.current = false;
    setTipLock(false);
    setTip(null);
  };
  dismissTipRef.current = dismissTip;

  const showTip = (kind: TowerId, lock: boolean) => {
    if (hideTipTimer.current != null) window.clearTimeout(hideTipTimer.current);
    hideTipTimer.current = null;
    setTip(kind);
    if (lock) {
      tipLockRef.current = true;
      setTipLock(true);
    }
  };

  const queueHideTip = () => {
    if (tipLockRef.current) return;
    if (hideTipTimer.current != null) window.clearTimeout(hideTipTimer.current);
    hideTipTimer.current = window.setTimeout(() => setTip(null), 180);
  };

  const pickTower = (kind: TowerId) => {
    unlockAudio();
    if (tipLockRef.current) dismissTip();
    if (getDuel()) setWatch("you");
    selectKind(ensureGame(), kind);
  };

  return (
    <div
      className="relative h-dvh max-h-dvh overflow-hidden bg-bg text-fg"
      onPointerDown={() => unlockAudio()}
    >
      <div className="flex h-full min-h-0 flex-col" inert={hud.phase === "menu" ? true : undefined}>
      <header className="safe-top safe-x flex shrink-0 items-center gap-1 border-b border-line bg-surface py-1.5">
        {playing ? (
          <button
            id="open-menu"
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-line"
            aria-label="Main menu"
            onClick={() => {
              unlockAudio();
              dismissTip();
              setPanel("main");
              parkDuel(ensureGame());
              toMenu(ensureGame());
            }}
          >
            <Menu className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="size-10 shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span
            className="flex shrink-0 items-center gap-1"
            aria-label={`${hud.lives} of ${hud.livesMax} lives remaining`}
          >
            <Heart className="size-4 text-danger" aria-hidden />
            <span className={`num text-sm font-semibold ${hud.lives <= 5 ? "text-danger" : ""}`}>
              {hud.lives}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1" aria-label={`${hud.gold} coin`}>
            <Coins className="size-4 text-primary" aria-hidden />
            <span className="num text-sm font-semibold">{hud.gold}</span>
          </span>
          {duel && playing ? (
            <span
              className={`flex shrink-0 items-center gap-1 ${duel.rivalLives <= 5 ? "text-danger" : ""}`}
              aria-label={`Their door, ${duel.rivalLives} lives`}
            >
              <span className="text-[11px] text-muted">Them</span>
              <Heart className="size-4 text-ward" aria-hidden />
              <span className="num text-sm font-semibold">{duel.rivalLives}</span>
            </span>
          ) : (
            <span className="truncate text-sm font-semibold">{waveStatus(hud)}</span>
          )}
        </div>
        {duel && playing ? (
          <div className="flex shrink-0 rounded-lg border border-line p-0.5" role="group" aria-label="Which street">
            <button
              id="watch-you"
              type="button"
              aria-pressed={duel.watch === "you"}
              className={`h-8 rounded-md px-2 text-xs font-semibold ${duel.watch === "you" ? "bg-surface-2 text-fg" : "text-muted"}`}
              onClick={() => setWatch("you")}
            >
              You
            </button>
            <button
              id="watch-rival"
              type="button"
              aria-pressed={duel.watch === "rival"}
              className={`h-8 rounded-md px-2 text-xs font-semibold ${duel.watch === "rival" ? "bg-surface-2 text-fg" : "text-muted"}`}
              onClick={() => setWatch("rival")}
            >
              Them
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-line"
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
          {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
        </button>
      </header>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-bg"
        onPointerDown={() => {
          if (tip || tipLockRef.current) dismissTip();
        }}
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
          {hud.banner ? (
            <p
              key={hud.bannerSeq}
              className="banner-pop pointer-events-none absolute top-3 left-1/2 z-10 max-w-xs rounded-full border border-line bg-surface px-3 py-1 text-center text-sm text-fg"
            >
              {hud.banner}
            </p>
          ) : null}
      </div>

      <footer className="safe-pad safe-x shrink-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          {tip ? (
            <TowerCard
              kind={tip}
              locked={tipLock}
              onHold={() => {
                if (hideTipTimer.current != null) window.clearTimeout(hideTipTimer.current);
                hideTipTimer.current = null;
              }}
              onLeave={queueHideTip}
              onDismiss={dismissTip}
            />
          ) : null}
          {hud.selected && !tip ? <SelectedBar hud={hud} /> : null}
          <div className="flex gap-1 overflow-x-auto py-1.5" role="toolbar" aria-label="Defenders">
            {TEAMS[hud.team].units.map((kind) => (
              <TowerPick
                key={kind}
                kind={kind}
                active={hud.placing === kind}
                inspected={tip === kind}
                poor={hud.gold < TOWERS[kind].cost}
                onPick={() => pickTower(kind)}
                onHoverStart={() => showTip(kind, false)}
                onHoverEnd={queueHideTip}
                onLongPress={() => showTip(kind, true)}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5 pb-1.5">
            {duel && playing ? (
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {PUSHES.map((push) => {
                  const poor = hud.gold < push.cost;
                  const live = hud.phase === "combat" && !hud.paused;
                  return (
                    <button
                      key={push.id}
                      id={`push-${push.id}`}
                      type="button"
                      disabled={!live || poor}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 text-sm whitespace-nowrap disabled:opacity-40"
                      onClick={() => {
                        unlockAudio();
                        pushCreep(ensureGame(), push.id);
                      }}
                    >
                      <span>{push.label}</span>
                      <span className={`num ${poor ? "text-danger" : "text-primary"}`}>{push.cost}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                id="send-night"
                type="button"
                disabled={!canSend}
                className="h-10 min-w-0 flex-1 truncate rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
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
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-line"
              aria-label={hud.speed === 1 ? "Double speed" : "Normal speed"}
              aria-pressed={hud.speed === 2}
              hidden={!!duel?.online}
              onClick={() => {
                unlockAudio();
                toggleSpeed(ensureGame());
              }}
            >
              <span className="num text-sm">{hud.speed}×</span>
            </button>
            {hud.phase === "combat" && !duel?.online ? (
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-line"
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
                className="h-10 shrink-0 rounded-xl border border-line px-2.5 text-sm"
                onClick={() => clearSelect(ensureGame())}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
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
                if (duel?.online) {
                  if (duel.role === "host") {
                    const start = acceptAgain(ensureGame());
                    if (start) netSend(start);
                  } else {
                    netSend({ t: "again" });
                    askAgain(ensureGame());
                  }
                } else if (duel) rematch(ensureGame());
                else restart(ensureGame());
              }}
            >
              {duel?.online && duel.role === "guest" ? "Ask to walk it again" : "Walk it again"}
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
          link={link}
          seat={seat}
          friendName={friendName}
          friendCode={friendCode}
          friendReady={friendReady}
          onFriendName={setFriendName}
          onFriendCode={setFriendCode}
          onFriendReady={setFriendReady}
          onHost={hostTable}
          onJoin={joinTable}
          onBegin={beginTable}
          onDropLink={dropLink}
        />
      ) : null}
      {link ? (
        <FriendWire
          key={`${link.role}:${link.code}:${link.name}`}
          link={link}
          team={draftTeam}
          map={draftMap}
          ready={friendReady}
          onSeat={setSeat}
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
  link,
  seat,
  friendName,
  friendCode,
  friendReady,
  onFriendName,
  onFriendCode,
  onFriendReady,
  onHost,
  onJoin,
  onBegin,
  onDropLink,
}: {
  hud: Hud;
  panel: DoorPanel;
  volume: number;
  muted: boolean;
  draftTeam: TeamId;
  draftMap: MapId;
  draftMode: ModeId;
  draftRival: TeamId;
  onPanel: (panel: DoorPanel) => void;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onMode: (id: ModeId) => void;
  onRival: (id: TeamId) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  phone: ReturnType<typeof usePhoneInstall>;
  link: FriendLink | null;
  seat: FriendSeat;
  friendName: string;
  friendCode: string;
  friendReady: boolean;
  onFriendName: (value: string) => void;
  onFriendCode: (value: string) => void;
  onFriendReady: (value: boolean) => void;
  onHost: () => void;
  onJoin: () => void;
  onBegin: () => void;
  onDropLink: () => void;
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
              onDropLink();
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
            onBack={() => onPanel("multi")}
            onStart={() => {
              unlockAudio();
              onDropLink();
              onPanel("main");
              startDuel(ensureGame(), draftMap, draftTeam, draftRival);
            }}
          />
        ) : panel === "multi" ? (
          <div>
            <button id="multi-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={() => onPanel("main")}>
              Back
            </button>
            <h2 className="mt-3 font-display text-4xl leading-tight text-fg">Multiplayer</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Sit a friend at another screen, or fight a rival court on this one. Either way, the first broken door loses.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                id="play-friend"
                type="button"
                className="min-h-14 w-full rounded-xl bg-primary px-4 py-3 text-left font-semibold text-primary-fg"
                onClick={() => onPanel("friend")}
              >
                <span className="block text-lg">With a friend</span>
                <span className="mt-0.5 block text-sm font-normal opacity-80">
                  Share a short code. Each of you holds a street.
                </span>
              </button>
              <button
                id="play-local"
                type="button"
                className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-left font-semibold text-fg"
                onClick={() => onPanel("battle")}
              >
                <span className="block text-lg">On this device</span>
                <span className="mt-0.5 block text-sm font-normal text-muted">
                  A rival court plays the other street here.
                </span>
              </button>
            </div>
          </div>
        ) : panel === "friend" ? (
          <FriendPanel
            link={link}
            seat={seat}
            name={friendName}
            code={friendCode}
            ready={friendReady}
            team={draftTeam}
            map={draftMap}
            onName={onFriendName}
            onCode={onFriendCode}
            onTeam={onTeam}
            onMap={onMap}
            onReady={onFriendReady}
            onHost={onHost}
            onJoin={onJoin}
            onBegin={onBegin}
            onLeave={onDropLink}
            onBack={() => onPanel("multi")}
          />
        ) : (
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest text-primary">AN UNOFFICIAL NIGHT</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-fg sm:text-6xl">Ward of Chicago</h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                Single player is a night on your own. Multiplayer is a friend at another screen, or a rival court on this one.
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
                    onDropLink();
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
                    if (!duel.online) onDropLink();
                    onPanel("main");
                    resumeDuel(ensureGame());
                  }}
                >
                  <span className="block text-lg">Continue battle</span>
                  <span className="mt-0.5 block text-sm font-normal opacity-80">
                    {duel.online && duel.quiet
                      ? "The other street went quiet."
                      : duel.online
                        ? "The night is still running."
                        : `${duel.youTeam} vs ${duel.rivalTeam} · ${duel.mapPlace}`}
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
                onClick={() => onPanel("multi")}
              >
                <span className="block text-lg">Multiplayer</span>
                <span className="mt-0.5 block text-sm font-normal text-muted">
                  A friend on another screen, or a rival court on this one.
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
            The computer layout stays in a wide window. On a phone, add the game to your home screen, or install the Android file.
          </p>
          <a
            id="download-apk"
            href="https://github.com/psteen-coder/ward-of-chicago/releases/download/v1.0.0/Ward-of-Chicago.apk"
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface font-semibold text-fg"
          >
            Download the Android file
          </a>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Open the file on the phone and allow the install. If an older Ward of Chicago is already there and will not update, remove it first. The file can join a friend table once it has this website's address.
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

function extraLine(stats: ReturnType<typeof combatStats>) {
  const bits: string[] = [];
  if (stats.splash > 0) bits.push(`splash ${fmt(stats.splash)}`);
  if (stats.slow > 0) bits.push(`chill ${fmt(stats.slow)}s`);
  if (stats.pierce) bits.push("ignores armor");
  if (stats.dot > 0) bits.push(`${fmt(stats.dot)} for ${fmt(stats.dotTime)}s`);
  if (stats.stun > 0) bits.push(`root ${fmt(stats.stun)}s`);
  if (stats.siphon > 0) bits.push(`+${stats.siphon} coin on a kill`);
  if (stats.shatter > 0) bits.push(`+${Math.round(stats.shatter * 100)}% vs chilled`);
  return bits.join(" · ");
}

function TowerPick({
  kind,
  active,
  inspected,
  poor,
  onPick,
  onHoverStart,
  onHoverEnd,
  onLongPress,
}: {
  kind: TowerId;
  active: boolean;
  inspected: boolean;
  poor: boolean;
  onPick: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onLongPress: () => void;
}) {
  const def = TOWERS[kind];
  const timer = useRef<number | null>(null);
  const suppress = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clearTimer, []);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${def.name}, ${def.cost} coin`}
      aria-describedby={inspected ? "tower-tip" : undefined}
      className={`tower-pick flex min-w-[4.25rem] flex-1 flex-col items-center gap-0.5 rounded-lg border px-1 py-1 ${
        active || inspected ? "border-primary bg-surface-2" : "border-line bg-bg"
      }`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onHoverStart();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        const next = event.relatedTarget;
        if (next instanceof Node && document.getElementById("tower-tip")?.contains(next)) return;
        onHoverEnd();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.pointerType === "mouse") return;
        suppress.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        clearTimer();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          suppress.current = true;
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(12);
          }
          onLongPress();
        }, 480);
      }}
      onPointerMove={(event) => {
        if (timer.current == null) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (dx * dx + dy * dy > 64) clearTimer();
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        onPick();
      }}
    >
      <span className="relative grid size-9 place-items-center">
        <span className={`absolute inset-1 rounded-full ${def.swatch}`} />
        <img
          src={`/game/${kind}.png`}
          alt=""
          draggable={false}
          className="relative size-9 object-contain"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      </span>
      <span className={`line-clamp-2 h-8 w-full text-center text-[11px] leading-tight font-semibold ${poor ? "text-danger" : ""}`}>
        {def.name}
      </span>
      <span className={`num text-[10px] leading-none ${poor ? "text-danger" : "text-primary"}`}>{def.cost}</span>
    </button>
  );
}

function TowerCard({
  kind,
  locked,
  onHold,
  onLeave,
  onDismiss,
}: {
  kind: TowerId;
  locked: boolean;
  onHold: () => void;
  onLeave: () => void;
  onDismiss: () => void;
}) {
  const def = TOWERS[kind];
  const stats = combatStats(kind, 1);
  const extra = extraLine(stats);
  return (
    <div
      id="tower-tip"
      role="tooltip"
      className="border-b border-line px-1 py-2"
      onPointerEnter={onHold}
      onPointerLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest(".tower-pick")) return;
        onLeave();
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-base leading-tight">{def.name}</p>
        <p className="num shrink-0 text-sm text-primary">{def.cost} coin</p>
      </div>
      <p className="text-xs text-primary">{def.craft}</p>
      <p className="mt-1 text-sm">
        Damage {stats.damage}
        <span className="text-muted"> · </span>
        Fire {fmt(stats.rate)}/s
        <span className="text-muted"> · </span>
        Reach {fmt(stats.range)}
      </p>
      <p className="text-xs text-muted">
        {def.special}
        {extra ? ` · ${extra}` : ""}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{def.blurb}</p>
      {locked ? (
        <button type="button" className="mt-1 text-xs text-primary" onClick={onDismiss}>
          Close
        </button>
      ) : null}
    </div>
  );
}

function SelectedBar({ hud }: { hud: Hud }) {
  const sel = hud.selected;
  if (!sel) return null;
  const damage = sel.nextDamage != null ? `${sel.damage}→${sel.nextDamage}` : String(sel.damage);
  const rate = sel.nextRate != null ? `${fmt(sel.rate)}→${fmt(sel.nextRate)}` : fmt(sel.rate);
  const reach = sel.nextRange != null ? `${fmt(sel.range)}→${fmt(sel.nextRange)}` : fmt(sel.range);
  return (
    <div className="border-b border-line px-1 py-1.5">
      <p className="truncate text-sm">
        <span className="font-semibold">{sel.name}</span>
        <span className="text-muted"> · {sel.rankName}</span>
      </p>
      <p className="text-xs text-muted">
        Dmg {damage} · Rate {rate}/s · Reach {reach}
      </p>
      <div className="mt-1 flex gap-1">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1" role="group" aria-label="Targeting">
          {(
            [
              ["first", "First"],
              ["nearest", "Near"],
              ["strongest", "Strong"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-label={mode === "nearest" ? "Nearest" : mode === "strongest" ? "Strongest" : "First"}
              aria-pressed={sel.mode === mode}
              className={`h-9 rounded-lg border text-xs ${
                sel.mode === mode ? "border-primary bg-surface-2" : "border-line"
              }`}
              onClick={() => setMode(ensureGame(), mode as TargetMode)}
            >
              {label}
            </button>
          ))}
        </div>
        {sel.upgrade != null ? (
          <button
            type="button"
            className="h-9 shrink-0 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-fg"
            onClick={() => {
              unlockAudio();
              upgradeSelected(ensureGame());
            }}
          >
            Hone {sel.upgrade}
          </button>
        ) : (
          <span className="flex h-9 shrink-0 items-center px-1 text-xs text-muted">Warden</span>
        )}
        <button
          type="button"
          className="h-9 shrink-0 rounded-lg border border-line px-2.5 text-xs text-danger"
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
