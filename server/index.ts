/**
 * Standalone multiplayer WebSocket server for අඳුරු මංසන්ධිය.
 *
 * Runs as a separate Node process from the Next.js app (see package.json's
 * "dev:server"/"dev:all" scripts for local dev, "start:server" for
 * production) because Vercel's serverless Next.js runtime cannot hold
 * persistent WebSocket connections. Deploy this process to an always-on
 * host (Render, Railway, a VM, ...) — see render.yaml at the repo root.
 */
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { RoomManager } from "./RoomManager";
import { Room } from "./Room";
import { ServerPlayer } from "./Player";
import type { ClientMessage, ServerMessage } from "./protocol";
import { log } from "./logger";

const PORT = Number(process.env.PORT) || 8787;
// Render/Railway route traffic to whatever interface the process listens
// on internally, but binding explicitly to all interfaces (rather than the
// "localhost"-only default some hosts' containers use) is what actually
// makes the process reachable from their edge/proxy layer.
const HOST = process.env.HOST || "0.0.0.0";

/**
 * Strips a single matching pair of wrapping quotes. Some hosting
 * dashboards' env-var UIs preserve literal quote characters when a value is
 * pasted in already-quoted (e.g. ALLOWED_ORIGINS="a,b,c") — that leaves a
 * stray leading/trailing `"` on the first/last entry after splitting, which
 * survives a plain .trim() and silently breaks an exact-match comparison.
 */
function stripWrappingQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Trim, unquote, and drop any trailing slash so config typos and stray
 * formatting can't cause a same-origin request to be silently rejected. */
function normalizeOrigin(raw: string): string {
  return stripWrappingQuotes(raw.trim()).trim().replace(/\/+$/, "");
}

// Browsers send an Origin header on WebSocket handshakes; non-browser
// clients (health checks, local test scripts, server-to-server) send none
// and are always allowed. Configurable via ALLOWED_ORIGINS (comma-separated)
// so the production Vercel domain(s) can be set without touching source.
const rawAllowedOrigins = stripWrappingQuotes(
  (
    process.env.ALLOWED_ORIGINS ??
    "http://localhost:3000,https://the-dark-intersection-multiplayer.vercel.app"
  ).trim(),
);
const ALLOWED_ORIGINS = rawAllowedOrigins
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(normalizeOrigin(origin));
}

const manager = new RoomManager();

interface ConnState {
  room: Room | null;
  playerId: string | null;
}

const conns = new Map<WebSocket, ConnState>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function defaultName(room: Room): string {
  return `ක්‍රීඩකයා ${room.playerCount + 1}`;
}

function broadcastPlayerList(room: Room) {
  room.broadcast({ type: "player_list", players: room.playerInfos(), hostId: room.hostId ?? "" });
}

function handleJoin(ws: WebSocket, state: ConnState, room: Room, name: string) {
  const err = room.canJoin();
  if (err === "full") return send(ws, { type: "join_error", reason: "full" });
  if (err === "already_started") return send(ws, { type: "join_error", reason: "already_started" });

  const playerId = randomUUID();
  const player = new ServerPlayer(playerId, ws, name.trim() || defaultName(room));
  room.addPlayer(player);
  state.room = room;
  state.playerId = playerId;

  send(ws, {
    type: "join_ok",
    playerId,
    roomId: room.id,
    isHost: player.id === room.hostId,
    players: room.playerInfos(),
  });
  room.broadcast(
    { type: "player_joined", player: { id: player.id, name: player.name, isHost: player.isHost, connected: true } },
    playerId,
  );
  broadcastPlayerList(room);
  log.info(`room ${room.id}: ${player.name} joined (${room.playerCount} players)`);
}

function handleLeave(ws: WebSocket, state: ConnState) {
  const { room, playerId } = state;
  if (!room || !playerId) return;
  const wasPlaying = room.state === "playing";
  const prevMonsterAuthority = room.monsterAuthorityId;
  const migratedHost = room.removePlayer(playerId);

  state.room = null;
  state.playerId = null;

  if (room.isEmpty) {
    manager.gc(room);
    return;
  }

  room.broadcast({ type: "player_left", playerId });
  if (migratedHost) room.broadcast({ type: "host_migrated", newHostId: migratedHost });
  if (wasPlaying && prevMonsterAuthority === playerId && room.monsterAuthorityId) {
    room.broadcast({ type: "monster_authority_changed", playerId: room.monsterAuthorityId });
  }
  broadcastPlayerList(room);
  log.info(`room ${room.id}: player left (${room.playerCount} remaining)`);
}

function handleMessage(ws: WebSocket, state: ConnState, raw: string) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  switch (msg.type) {
    case "create_room": {
      const room = manager.create();
      const playerId = randomUUID();
      const player = new ServerPlayer(playerId, ws, msg.name.trim() || defaultName(room));
      room.addPlayer(player);
      state.room = room;
      state.playerId = playerId;
      send(ws, { type: "room_created", roomId: room.id, playerId });
      send(ws, {
        type: "join_ok",
        playerId,
        roomId: room.id,
        isHost: true,
        players: room.playerInfos(),
      });
      log.info(`room ${room.id} created by ${player.name}`);
      break;
    }
    case "join_room": {
      const room = manager.get(msg.roomId);
      if (!room) return send(ws, { type: "join_error", reason: "not_found" });
      handleJoin(ws, state, room, msg.name);
      break;
    }
    case "leave_room":
      handleLeave(ws, state);
      break;
    case "start_game": {
      const { room, playerId } = state;
      if (!room || !playerId) return;
      const err = room.canStart(playerId);
      if (err) return send(ws, { type: "start_error", reason: err });
      room.broadcast({ type: "game_starting" });
      const { seed, spawns, monsterAuthorityId } = room.start();
      room.broadcast({ type: "game_start", seed, spawns, monsterAuthorityId });
      log.info(`room ${room.id}: game started (seed=${seed})`);
      break;
    }
    case "transform": {
      const { room, playerId } = state;
      if (!room || !playerId) return;
      const wasAlive = room.players.get(playerId)?.alive ?? true;
      const { type: _type, ...payload } = msg;
      void _type;
      room.recordTransform(playerId, payload);
      room.broadcast({ type: "player_transform", playerId, ...payload }, playerId);
      if (wasAlive && !payload.alive) room.broadcast({ type: "player_died", playerId });
      break;
    }
    case "page_collect_request": {
      const { room, playerId } = state;
      if (!room || !playerId) return;
      const wasUnlocked = room.exitUnlocked;
      const accepted = room.tryCollectPage(msg.index);
      if (!accepted) return;
      room.broadcast({ type: "page_collected", index: msg.index, by: playerId });
      room.broadcast({ type: "objective_update", collected: room.collectedPages.size, total: 8 });
      if (room.exitUnlocked && !wasUnlocked) room.broadcast({ type: "exit_unlocked" });
      break;
    }
    case "monster_transform": {
      const { room, playerId } = state;
      if (!room || !playerId) return;
      if (room.monsterAuthorityId !== playerId) return; // ignore non-authoritative senders
      room.broadcast({ type: "monster_transform", pos: msg.pos, yaw: msg.yaw, state: msg.state, seq: msg.seq }, playerId);
      break;
    }
    case "ping":
      send(ws, { type: "pong" });
      break;
  }
}

// A plain http.Server (rather than letting `ws` open its own internal one
// via the `port` option) so a normal GET — Render's health check, an
// uptime monitor, a curl smoke test — gets a real 200 instead of the bare
// 426 Upgrade Required `ws` returns by default for non-WebSocket requests.
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("dark-intersection multiplayer server: ok");
});

const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info, cb) => {
    const allowed = isOriginAllowed(info.origin);
    if (!allowed) log.warn(`rejected connection from disallowed origin: ${info.origin}`);
    cb(allowed);
  },
});

httpServer.listen(PORT, HOST, () => {
  log.info(`multiplayer ws server listening on ${HOST}:${PORT} (allowed origins: ${ALLOWED_ORIGINS.join(", ")})`);
});

wss.on("connection", (ws) => {
  const state: ConnState = { room: null, playerId: null };
  conns.set(ws, state);

  ws.on("message", (data) => handleMessage(ws, state, data.toString()));
  ws.on("close", () => {
    handleLeave(ws, state);
    conns.delete(ws);
  });
  ws.on("error", (err) => log.warn("socket error", err));
});
