/** Reliable sends from the match into the open friend link. */
type Sender = (data: unknown) => void;

let sender: Sender | null = null;

export function bindNetSend(fn: Sender | null) {
  sender = fn;
}

export function netSend(data: unknown) {
  sender?.(data);
}
