/**
 * Where the handshake lives. The website uses its own origin. The installed
 * Android file has no server of its own, so it uses the published website.
 */
const ORIGIN_KEY = "ward-signal-origin";
const ORIGIN_FILE = "https://raw.githubusercontent.com/psteen-coder/ward-of-chicago/main/public/signal-origin.txt";

let cached: string | null = null;
let pending: Promise<string> | null = null;

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform === "function" && cap.isNativePlatform()) return true;
  const protocol = window.location.protocol;
  return protocol === "file:" || protocol === "capacitor:" || protocol === "ionic:";
}

export function normalizeSignalOrigin(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function pageOrigin(): string {
  if (typeof window === "undefined") return "";
  if (isNativeShell()) return "";
  const protocol = window.location.protocol;
  if (protocol !== "http:" && protocol !== "https:") return "";
  return window.location.origin;
}

async function readPublishedOrigin(): Promise<string> {
  const fromEnv = normalizeSignalOrigin(String(import.meta.env.VITE_SIGNAL_ORIGIN ?? ""));
  if (fromEnv && !fromEnv.includes("localhost") && !fromEnv.includes("127.0.0.1")) return fromEnv;
  try {
    const saved = normalizeSignalOrigin(localStorage.getItem(ORIGIN_KEY) ?? "");
    if (saved) return saved;
  } catch {
    // Private mode can block storage. The published file is the other source.
  }
  try {
    const res = await fetch(ORIGIN_FILE, { cache: "no-store" });
    if (!res.ok) return "";
    const text = (await res.text()).trim().split(/\s+/)[0] ?? "";
    return normalizeSignalOrigin(text);
  } catch {
    return "";
  }
}

export function signalBase(): Promise<string> {
  const local = pageOrigin();
  if (local) return Promise.resolve(local);
  if (cached != null) return Promise.resolve(cached);
  if (!pending) {
    pending = readPublishedOrigin().then((value) => {
      cached = value;
      return value;
    });
  }
  return pending;
}

export function rememberSignalOrigin(raw: string): string {
  const origin = normalizeSignalOrigin(raw);
  if (!origin) return "";
  try {
    localStorage.setItem(ORIGIN_KEY, origin);
  } catch {
    // The in-memory value still covers this session.
  }
  cached = origin;
  pending = Promise.resolve(origin);
  return origin;
}

export function shareableInvite(code: string): string {
  if (typeof window === "undefined" || isNativeShell()) return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "";
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("table", code);
  url.hash = "";
  return url.toString();
}

export async function rtcUrl(path: string): Promise<string> {
  const base = await signalBase();
  return `${base}${path}`;
}
