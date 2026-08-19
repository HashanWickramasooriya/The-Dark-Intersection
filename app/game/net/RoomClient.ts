import type { ClientMessage, ServerMessage } from "./protocol";

export const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8787";

type Listener = (msg: ServerMessage) => void;

/**
 * Thin typed WebSocket wrapper around the multiplayer protocol. Owns one
 * connection for the lifetime of a lobby+run; GameShell opens a short-lived
 * one just to create a room (then navigates), MultiplayerRoom opens the
 * real one that lives through lobby -> gameplay.
 */
export class RoomClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(url: string = DEFAULT_WS_URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.pingTimer = setInterval(() => this.send({ type: "ping" }), 20000);
        resolve();
      };
      ws.onerror = () => reject(new Error("ws_connect_failed"));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerMessage;
          for (const l of this.listeners) l(msg);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
      };
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
