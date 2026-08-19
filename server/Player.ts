import type WebSocket from "ws";
import type { TransformPayload } from "./protocol";

export class ServerPlayer {
  name: string;
  isHost = false;
  alive = true;
  lastTransform: TransformPayload | null = null;
  lastSeen = Date.now();

  constructor(
    public readonly id: string,
    public ws: WebSocket,
    name: string,
  ) {
    this.name = name;
  }
}
