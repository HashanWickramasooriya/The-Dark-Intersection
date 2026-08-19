import { Room } from "./Room";
import { generateRoomId } from "./roomId";

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(): Room {
    const id = generateRoomId((candidate) => this.rooms.has(candidate));
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id.toUpperCase());
  }

  /** Drops empty rooms so long-running dev sessions don't leak memory. */
  gc(room: Room) {
    if (room.isEmpty) this.rooms.delete(room.id);
  }
}
