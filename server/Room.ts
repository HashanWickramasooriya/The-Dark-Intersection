import { ServerPlayer } from "./Player";
import { MazeCore } from "./maze/mazeCore";
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from "./protocol";

// Mirrors app/game/engine/items.ts's TOTAL_PAGES. Kept as a plain constant
// here (rather than importing items.ts) so the server never pulls in
// three.js/canvas-dependent client code.
const TOTAL_PAGES = 8;
import type { PlayerInfo, ServerMessage, TransformPayload, Vec3 } from "./protocol";
import { log } from "./logger";

export type RoomState = "lobby" | "playing" | "ended";

export class Room {
  readonly id: string;
  state: RoomState = "lobby";
  players = new Map<string, ServerPlayer>();
  hostId: string | null = null;
  seed = 0;
  collectedPages = new Set<number>();
  exitUnlocked = false;
  monsterAuthorityId: string | null = null;

  constructor(id: string) {
    this.id = id;
  }

  get playerCount() {
    return this.players.size;
  }

  playerInfos(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === this.hostId,
      connected: true,
    }));
  }

  /** Returns null on success, or a rejection reason. */
  canJoin(): "full" | "already_started" | null {
    if (this.state === "playing") return "already_started";
    if (this.playerCount >= MAX_PLAYERS) return "full";
    return null;
  }

  addPlayer(player: ServerPlayer) {
    this.players.set(player.id, player);
    if (this.hostId === null) {
      this.hostId = player.id;
      player.isHost = true;
    }
  }

  /** Returns the id of a newly promoted host, if any. */
  removePlayer(id: string): string | null {
    this.players.delete(id);
    let migratedTo: string | null = null;
    if (this.hostId === id) {
      const next = this.players.values().next().value as ServerPlayer | undefined;
      this.hostId = next ? next.id : null;
      migratedTo = this.hostId;
    }
    if (this.monsterAuthorityId === id) {
      const next = this.players.values().next().value as ServerPlayer | undefined;
      this.monsterAuthorityId = next ? next.id : null;
    }
    return migratedTo;
  }

  broadcast(msg: ServerMessage, excludeId?: string) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id === excludeId) continue;
      try {
        p.ws.send(data);
      } catch (err) {
        log.warn(`room ${this.id}: send failed to ${p.id}`, err);
      }
    }
  }

  sendTo(id: string, msg: ServerMessage) {
    const p = this.players.get(id);
    if (!p) return;
    try {
      p.ws.send(JSON.stringify(msg));
    } catch (err) {
      log.warn(`room ${this.id}: send failed to ${id}`, err);
    }
  }

  canStart(requesterId: string): "not_host" | "not_enough_players" | null {
    if (requesterId !== this.hostId) return "not_host";
    if (this.playerCount < MIN_PLAYERS_TO_START) return "not_enough_players";
    return null;
  }

  /** Builds the shared seed + per-player spawn assignment and flips to "playing". */
  start(): { seed: number; spawns: Record<string, Vec3>; monsterAuthorityId: string } {
    this.seed = (Date.now() ^ (Math.random() * 0xffffff)) >>> 0;
    const maze = new MazeCore(this.seed);
    const ids = [...this.players.keys()];
    const cells = maze.pickPlayerSpawns(ids.length, this.seed);

    const spawns: Record<string, Vec3> = {};
    ids.forEach((id, i) => {
      const c = cells[i];
      spawns[id] = { x: maze.worldX(c.x), y: 0, z: maze.worldZ(c.z) };
    });

    this.state = "playing";
    this.collectedPages.clear();
    this.exitUnlocked = false;
    this.monsterAuthorityId = this.hostId;

    return { seed: this.seed, spawns, monsterAuthorityId: this.monsterAuthorityId! };
  }

  /** Returns true if this collection request is newly accepted (not a dup). */
  tryCollectPage(index: number): boolean {
    if (index < 0 || index >= TOTAL_PAGES) return false;
    if (this.collectedPages.has(index)) return false;
    this.collectedPages.add(index);
    if (this.collectedPages.size >= TOTAL_PAGES) this.exitUnlocked = true;
    return true;
  }

  recordTransform(id: string, t: TransformPayload) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastTransform = t;
    p.alive = t.alive;
    p.lastSeen = Date.now();
  }

  get isEmpty() {
    return this.players.size === 0;
  }
}
