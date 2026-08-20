import type { RoomClient } from "./RoomClient";
import type { PlayerInfo } from "./protocol";

/**
 * Hands off an already-connected RoomClient from the "Create Room" flow
 * (GameShell) to the destination page (MultiplayerRoom) across a client-side
 * navigation, so the room-creation connection is REUSED rather than closed
 * and replaced with a second one.
 *
 * Why this exists: the server deletes a room the instant it becomes empty
 * (see server/index.ts's handleLeave -> RoomManager.gc). A freshly created
 * room has exactly one player — its creator — so closing the creator's
 * socket to open a new one on the next page would delete the room before
 * the new connection could join it. Module-level state (not sessionStorage)
 * because a live WebSocket can't be serialized; this only needs to survive
 * the synchronous instant between router.push and the next page's mount,
 * within the same JS runtime (no full page reload happens for this route).
 */
interface PendingRoom {
  roomId: string;
  client: RoomClient;
  playerId: string;
  isHost: boolean;
  players: PlayerInfo[];
}

let pending: PendingRoom | null = null;

export function setPendingRoom(p: PendingRoom) {
  pending = p;
}

/** Consumes (and clears) the pending room only if it matches this roomId. */
export function takePendingRoom(roomId: string): PendingRoom | null {
  if (pending && pending.roomId === roomId) {
    const p = pending;
    pending = null;
    return p;
  }
  return null;
}
