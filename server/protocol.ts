/**
 * Wire protocol between the browser client and the standalone multiplayer
 * WebSocket server. Imported type-only from the client (app/game/net/protocol.ts)
 * so none of this runs client-side — it's purely a shared type contract.
 */

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export interface TransformPayload {
  pos: Vec3;
  yaw: number;
  pitch: number;
  sprinting: boolean;
  sneaking: boolean;
  flashlightOn: boolean;
  alive: boolean;
  seq: number;
}

export type ClientMessage =
  | { type: "create_room"; name: string }
  | { type: "join_room"; roomId: string; name: string }
  | { type: "leave_room" }
  | { type: "start_game" }
  | ({ type: "transform" } & TransformPayload)
  | { type: "page_collect_request"; index: number }
  | { type: "monster_transform"; pos: Vec3; yaw: number; state: string; seq: number }
  | { type: "ping" };

export type ServerMessage =
  | { type: "room_created"; roomId: string; playerId: string }
  | { type: "join_ok"; playerId: string; roomId: string; isHost: boolean; players: PlayerInfo[] }
  | { type: "join_error"; reason: "not_found" | "full" | "already_started" }
  | { type: "player_list"; players: PlayerInfo[]; hostId: string }
  | { type: "host_migrated"; newHostId: string }
  | { type: "game_starting" }
  | {
      type: "game_start";
      seed: number;
      spawns: Record<string, Vec3>;
      monsterAuthorityId: string;
    }
  | { type: "room_full" }
  | { type: "room_not_found" }
  | { type: "already_started" }
  | { type: "start_error"; reason: "not_host" | "not_enough_players" }
  | ({ type: "player_transform"; playerId: string } & TransformPayload)
  | { type: "page_collected"; index: number; by: string }
  | { type: "objective_update"; collected: number; total: number }
  | { type: "exit_unlocked" }
  | { type: "player_died"; playerId: string }
  | { type: "player_joined"; player: PlayerInfo }
  | { type: "player_left"; playerId: string }
  | { type: "monster_transform"; pos: Vec3; yaw: number; state: string; seq: number }
  | { type: "monster_authority_changed"; playerId: string }
  | { type: "game_over" }
  | { type: "pong" };
