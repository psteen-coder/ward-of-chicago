import { useEffect, useRef, useState } from "react";
import { MAPS, MAP_ORDER, TEAMS, TEAM_ORDER, type MapId, type TeamId } from "@/game/balance";
import {
  acceptAgain,
  applyFriendPush,
  applyFriendSnap,
  applyFriendStart,
  noteFriendBack,
  noteFriendDown,
  noteFriendQuiet,
  streetSnap,
  type FriendRole,
} from "@/game/battle";
import { ensureGame } from "@/game/engine";
import { bindNetSend, netSend } from "@/game/online";
import { useP2PRoom } from "@/lib/multiplayer";
import { isNativeShell, rememberSignalOrigin, shareableInvite, signalBase } from "@/lib/multiplayer/signal-base";
import { courtOpen, mapOpen } from "@/game/ledger";

export type FriendLink = {
  role: FriendRole;
  code: string;
  name: string;
};

export type FriendSeat = {
  joined: boolean;
  state: "wait" | "signal" | "connecting" | "live" | "failed";
  peerName: string;
  peerTeam: TeamId | null;
  peerReady: boolean;
  peerMap: MapId | null;
};

export const EMPTY_SEAT: FriendSeat = {
  joined: false,
  state: "wait",
  peerName: "",
  peerTeam: null,
  peerReady: false,
  peerMap: null,
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeTableCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export function cleanTableCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, "").replace(/[01OI]/g, "").slice(0, 4);
}

function isTeam(value: unknown): value is TeamId {
  return typeof value === "string" && TEAM_ORDER.includes(value as TeamId);
}

function isMap(value: unknown): value is MapId {
  return typeof value === "string" && MAP_ORDER.includes(value as MapId);
}

export function FriendWire({
  link,
  team,
  map,
  ready,
  onSeat,
}: {
  link: FriendLink;
  team: TeamId;
  map: MapId;
  ready: boolean;
  onSeat: (seat: FriendSeat) => void;
}) {
  const room = useP2PRoom({ room: `ward-${link.code}`, name: link.name });
  const peerTeam = useRef<TeamId | null>(null);
  const peerReady = useRef(false);
  const peerMap = useRef<MapId | null>(null);
  const lockedPeer = useRef<string | null>(null);
  const sawLive = useRef(false);
  const againAt = useRef(0);
  const seatJson = useRef("");
  const [metaTick, setMetaTick] = useState(0);

  useEffect(() => {
    bindNetSend((data) => room.send(data));
    return () => bindNetSend(null);
  }, [room.send]);

  useEffect(() => {
    return room.onMessage((from, data) => {
      if (lockedPeer.current && from !== lockedPeer.current) return;
      if (!lockedPeer.current) lockedPeer.current = from;
      if (!data || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;
      if (msg.t === "hello" || msg.t === "ready") {
        if (isTeam(msg.team)) peerTeam.current = msg.team;
        if (isMap(msg.map)) peerMap.current = msg.map;
        peerReady.current = msg.t === "ready";
        setMetaTick((n) => n + 1);
      } else if (msg.t === "snap") {
        applyFriendSnap(data);
      } else if (msg.t === "push") {
        applyFriendPush(data);
      } else if (msg.t === "down") {
        noteFriendDown(data);
      } else if (msg.t === "start" && link.role === "guest") {
        applyFriendStart(ensureGame(), data, "guest");
      } else if (msg.t === "again" && link.role === "host") {
        const now = Date.now();
        if (now - againAt.current < 1500) return;
        againAt.current = now;
        const start = acceptAgain(ensureGame());
        if (start) netSend(start);
      }
    });
  }, [room.onMessage, link.role]);

  const livePeer = room.peers.find((peer) => peer.connectionState === "connected") ?? null;
  const pendingPeer = livePeer ?? room.peers.find((peer) => peer.connectionState !== "failed") ?? null;
  const failed =
    !livePeer && room.peers.some((peer) => peer.connectionState === "failed" || peer.connectionState === "closed");

  const liveId = livePeer?.id ?? "";

  useEffect(() => {
    if (liveId) {
      sawLive.current = true;
      noteFriendBack();
    } else if (sawLive.current) {
      noteFriendQuiet();
    }
  }, [liveId]);

  useEffect(() => {
    if (!liveId) return;
    room.send({ t: "hello", team, map, role: link.role, name: link.name });
  }, [liveId, team, map, link.role, link.name, room.send]);

  useEffect(() => {
    if (!liveId || !ready) return;
    room.send({ t: "ready", team, map });
  }, [liveId, ready, team, map, room.send]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const snap = streetSnap();
      if (snap) room.broadcast(snap);
    }, 100);
    return () => window.clearInterval(id);
  }, [room.broadcast]);

  useEffect(() => {
    const state: FriendSeat["state"] = !room.joined
      ? "wait"
      : livePeer
        ? "live"
        : failed
          ? "failed"
          : pendingPeer
            ? "connecting"
            : "signal";
    const seat: FriendSeat = {
      joined: room.joined,
      state,
      peerName: (livePeer ?? pendingPeer)?.name ?? "",
      peerTeam: peerTeam.current,
      peerReady: peerReady.current && !!livePeer,
      peerMap: peerMap.current,
    };
    const json = JSON.stringify(seat);
    if (json === seatJson.current) return;
    seatJson.current = json;
    onSeat(seat);
  }, [room.joined, room.peers, liveId, pendingPeer, failed, metaTick, onSeat]);

  return null;
}

export function FriendPanel({
  link,
  seat,
  name,
  code,
  ready,
  team,
  map,
  onName,
  onCode,
  onTeam,
  onMap,
  onReady,
  onHost,
  onJoin,
  onBegin,
  onLeave,
  onBack,
}: {
  link: FriendLink | null;
  seat: FriendSeat;
  name: string;
  code: string;
  ready: boolean;
  team: TeamId;
  map: MapId;
  onName: (value: string) => void;
  onCode: (value: string) => void;
  onTeam: (id: TeamId) => void;
  onMap: (id: MapId) => void;
  onReady: (value: boolean) => void;
  onHost: () => void;
  onJoin: () => void;
  onBegin: () => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const native = isNativeShell();
  const [server, setServer] = useState("");
  const [serverReady, setServerReady] = useState(!native);
  const [serverError, setServerError] = useState("");
  const [copied, setCopied] = useState(false);
  const invite = link ? shareableInvite(link.code) : "";

  useEffect(() => {
    if (!native) return;
    void signalBase().then((origin) => {
      if (origin) {
        setServer(origin);
        setServerReady(true);
      }
    });
  }, [native]);

  const line =
    seat.state === "live"
      ? seat.peerName
        ? `Direct line open with ${seat.peerName}.`
        : "Direct line open."
      : seat.state === "failed"
        ? "Could not open a direct line. Some networks block it. Try another network, or play on this device."
        : seat.state === "connecting"
          ? "They're at the table. Opening a direct line…"
          : seat.state === "signal"
            ? "Table is open. Give them the code."
            : "Opening the table…";

  return (
    <div>
      <button id="friend-back" type="button" className="min-h-11 rounded-lg px-1 text-sm text-muted" onClick={onBack}>
        Back
      </button>
      <h2 className="mt-3 font-display text-4xl leading-tight text-fg">A table with a friend</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Each of you holds a street. Coin ticks in on your side only. Spend it to build, or to push
        creeps onto their road. The first door to break loses. This is a friendly table, not a ranked match.
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        {native
          ? "The phone file joins through the game's website. Both players use that same address."
          : "Send the code, or the invite link. A phone with the Android file can join the same table once it knows this website."}
      </p>
      {native && !serverReady ? (
        <div className="mt-6 max-w-xl">
          <label className="block text-xs tracking-widest text-muted" htmlFor="signal-origin">
            GAME WEBSITE
          </label>
          <input
            id="signal-origin"
            value={server}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://"
            className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg"
            onChange={(event) => {
              setServer(event.target.value);
              setServerError("");
            }}
          />
          <button
            id="signal-save"
            type="button"
            className="mt-2 min-h-12 w-full rounded-xl bg-primary font-semibold text-primary-fg"
            onClick={() => {
              const saved = rememberSignalOrigin(server);
              if (!saved) {
                setServerError("Use the full website address, starting with https.");
                return;
              }
              setServer(saved);
              setServerReady(true);
            }}
          >
            Use this website
          </button>
          {serverError ? <p className="mt-2 text-sm text-danger">{serverError}</p> : null}
        </div>
      ) : null}

      {link ? (
        <div className="mt-6">
          <p className="text-xs tracking-widest text-muted">{link.role === "host" ? "YOUR CODE" : "TABLE"}</p>
          <p id="friend-code-label" className="mt-1 font-display text-4xl tracking-widest text-primary">
            {link.code}
          </p>
          {invite ? (
            <button
              id="friend-invite"
              type="button"
              className="mt-3 min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-semibold"
              onClick={() => {
                const done = () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                };
                if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(invite).then(done).catch(done);
                  return;
                }
                done();
              }}
            >
              {copied ? "Invite copied" : "Copy invite link"}
            </button>
          ) : null}
          <p id="friend-line" className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {line}
          </p>
          {link.role === "guest" && seat.peerMap ? (
            <p className="mt-2 text-sm text-fg">Ground: {MAPS[seat.peerMap].place}</p>
          ) : null}
          {seat.peerTeam ? (
            <p className="mt-1 text-sm text-fg">
              Their court: {TEAMS[seat.peerTeam].name}
              {seat.peerReady ? " · ready" : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          <label className="block text-xs tracking-widest text-muted" htmlFor="friend-name">
            YOUR NAME
          </label>
          <input
            id="friend-name"
            value={name}
            maxLength={24}
            autoComplete="nickname"
            className="mt-2 h-12 w-full max-w-md rounded-xl border border-line bg-surface px-3 text-fg"
            onChange={(event) => onName(event.target.value)}
          />
        </div>
      )}

      <p className="mt-6 text-xs tracking-widest text-muted">YOUR COURT</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TEAM_ORDER.map((id) => {
          const def = TEAMS[id];
          const on = id === team;
          const shut = !courtOpen(id);
          return (
            <button
              key={id}
              id={`seat-${id}`}
              type="button"
              aria-pressed={on}
              disabled={shut}
              className={`min-h-11 rounded-xl border p-3 text-left disabled:opacity-40 ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
              onClick={() => {
                onTeam(id);
                onReady(false);
              }}
            >
              <span className="font-display text-lg leading-tight">{def.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                {shut ? "Still shut. The case opens this court." : def.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {link?.role === "host" || !link ? (
        <>
          <p className="mt-6 text-xs tracking-widest text-muted">GROUND</p>
          <p className="mt-1 text-sm text-muted">
            {link ? "You choose the road. They walk the same one." : "If you host, both courts walk this road."}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MAP_ORDER.map((id) => {
              const def = MAPS[id];
              const on = id === map;
              const shut = !mapOpen(id);
              return (
                <button
                  key={id}
                  id={`friend-ground-${id}`}
                  type="button"
                  aria-pressed={on}
                  disabled={shut || (!!link && link.role === "guest")}
                  className={`min-h-11 rounded-xl border p-3 text-left disabled:opacity-40 ${on ? "border-primary bg-surface-2" : "border-line bg-surface"}`}
                  onClick={() => onMap(id)}
                >
                  <span className="font-display text-lg leading-tight">{def.name}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">
                    {shut ? "Still shut. The case opens this road." : def.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {!link ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            id="friend-host"
            type="button"
            disabled={!serverReady}
            className="min-h-12 rounded-xl bg-primary font-semibold text-primary-fg disabled:opacity-40"
            onClick={onHost}
          >
            Host a table
          </button>
          <div className="flex gap-2">
            <input
              id="friend-code"
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Table code"
              placeholder="Code"
              className="h-12 w-28 rounded-xl border border-line bg-surface px-3 font-display tracking-widest text-fg uppercase"
              onChange={(event) => onCode(cleanTableCode(event.target.value))}
            />
            <button
              id="friend-join"
              type="button"
              disabled={!serverReady || code.length !== 4}
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface font-semibold text-fg disabled:opacity-40"
              onClick={onJoin}
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <button
            id="friend-ready"
            type="button"
            disabled={seat.state !== "live"}
            aria-pressed={ready}
            className={`min-h-12 rounded-xl border font-semibold disabled:opacity-40 ${ready ? "border-primary bg-surface-2 text-fg" : "border-line bg-surface text-fg"}`}
            onClick={() => onReady(!ready)}
          >
            {ready ? "Ready" : "Mark ready"}
          </button>
          {link.role === "host" ? (
            <button
              id="friend-begin"
              type="button"
              disabled={seat.state !== "live" || !ready || !seat.peerReady || !seat.peerTeam}
              className="min-h-12 rounded-xl bg-primary font-semibold text-primary-fg disabled:opacity-40"
              onClick={onBegin}
            >
              Begin the night
            </button>
          ) : (
            <p className="text-sm text-muted">
              {ready ? "Waiting for them to begin." : "Mark ready when your court is set."}
            </p>
          )}
          <button
            id="friend-leave"
            type="button"
            className="min-h-12 rounded-xl border border-line font-semibold text-fg"
            onClick={onLeave}
          >
            Leave the table
          </button>
        </div>
      )}
    </div>
  );
}
