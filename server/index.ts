/**
 * Standalone multiplayer WebSocket server for අඳුරු මංසන්ධිය.
 *
 * Runs as a separate Node process from the Next.js app (see package.json's
 * "dev:server"/"dev:all" scripts) because Vercel's serverless Next.js
 * runtime cannot hold persistent WebSocket connections. Production hosting
 * of this process is a separate concern, out of scope for local dev.
 */
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { RoomManager } from "./RoomManager";
import { Room } from "./Room";
import { ServerPlayer } from "./Player";
import type { ClientMessage, ServerMessage } from "./protocol";
import { log } from "./logger";

const PORT = Number(process.env.PORT) || 8787;
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

const wss = new WebSocketServer({ port: PORT });
log.info(`multiplayer ws server listening on :${PORT}`);

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
