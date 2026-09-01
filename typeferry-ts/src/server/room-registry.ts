import type { TypeFerrySocket } from './types'
import { SocketState } from './types'

/**
 * In-memory room/subscription registry replacing Socket.IO's room system.
 *
 * Maintains a bidirectional index for O(1) join/leave/broadcast and O(1)
 * cleanup when a socket disconnects (via the reverse index).
 */
export class RoomRegistry {
  /** room name → set of sockets subscribed to that room */
  private rooms = new Map<string, Set<TypeFerrySocket>>()

  /** socket → set of rooms it has joined (reverse index for fast cleanup) */
  private socketRooms = new Map<TypeFerrySocket, Set<string>>()

  /** Adds a socket to a room. Idempotent. */
  join(ws: TypeFerrySocket, room: string): void {
    let members = this.rooms.get(room)
    if (!members) {
      members = new Set()
      this.rooms.set(room, members)
    }
    members.add(ws)

    let joined = this.socketRooms.get(ws)
    if (!joined) {
      joined = new Set()
      this.socketRooms.set(ws, joined)
    }
    joined.add(room)
  }

  /** Removes a socket from a room. Cleans up empty rooms. */
  leave(ws: TypeFerrySocket, room: string): void {
    const members = this.rooms.get(room)
    if (members) {
      members.delete(ws)
      if (members.size === 0) this.rooms.delete(room)
    }

    const joined = this.socketRooms.get(ws)
    if (joined) {
      joined.delete(room)
      if (joined.size === 0) this.socketRooms.delete(ws)
    }
  }

  /** Removes a socket from all rooms. Called on disconnect. */
  leaveAll(ws: TypeFerrySocket): void {
    const joined = this.socketRooms.get(ws)
    if (!joined) return

    for (const room of joined) {
      const members = this.rooms.get(room)
      if (members) {
        members.delete(ws)
        if (members.size === 0) this.rooms.delete(room)
      }
    }

    this.socketRooms.delete(ws)
  }

  /**
   * Sends `data` to every socket in `room`.
   * Optionally excludes a single socket (e.g. the originator).
   */
  broadcast(room: string, data: string, exclude?: TypeFerrySocket): void {
    const members = this.rooms.get(room)
    if (!members) return

    for (const ws of members) {
      if (ws === exclude) continue
      if (ws.readyState === SocketState.OPEN) {
        ws.send(data)
      }
    }
  }

  /** Returns true if `ws` is a member of `room`. */
  has(ws: TypeFerrySocket, room: string): boolean {
    return this.rooms.get(room)?.has(ws) ?? false
  }

  /** Returns the number of sockets in a room. */
  getRoomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0
  }
}
