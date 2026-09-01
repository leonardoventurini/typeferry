import { describe, expect, it, vi } from 'vitest'

import { RoomRegistry } from '../../server/room-registry'
import type { TypeFerrySocket } from '../../server/types'

/** Creates a mock TypeFerrySocket with configurable readyState. */
function createMockSocket(
  readyState = 1 /* OPEN */,
): TypeFerrySocket & { sentMessages: string[] } {
  const sent: string[] = []

  return {
    readyState,
    send: vi.fn((data: string) => sent.push(data)),
    close: vi.fn(),
    get sentMessages() {
      return sent
    },
  } as unknown as TypeFerrySocket & { sentMessages: string[] }
}

describe('RoomRegistry', () => {
  describe('join', () => {
    it('should add a socket to a room', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')

      expect(registry.has(ws, 'room:1')).toBe(true)
      expect(registry.getRoomSize('room:1')).toBe(1)
    })

    it('should be idempotent — joining the same room twice has no effect', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.join(ws, 'room:1')

      expect(registry.getRoomSize('room:1')).toBe(1)
    })

    it('should track multiple sockets in the same room', () => {
      const registry = new RoomRegistry()
      const ws1 = createMockSocket()
      const ws2 = createMockSocket()

      registry.join(ws1, 'room:1')
      registry.join(ws2, 'room:1')

      expect(registry.getRoomSize('room:1')).toBe(2)
      expect(registry.has(ws1, 'room:1')).toBe(true)
      expect(registry.has(ws2, 'room:1')).toBe(true)
    })

    it('should track a socket across multiple rooms', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.join(ws, 'room:2')
      registry.join(ws, 'room:3')

      expect(registry.has(ws, 'room:1')).toBe(true)
      expect(registry.has(ws, 'room:2')).toBe(true)
      expect(registry.has(ws, 'room:3')).toBe(true)
    })
  })

  describe('leave', () => {
    it('should remove a socket from a room', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.leave(ws, 'room:1')

      expect(registry.has(ws, 'room:1')).toBe(false)
      expect(registry.getRoomSize('room:1')).toBe(0)
    })

    it('should clean up empty rooms', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.leave(ws, 'room:1')

      // Internal map should not contain the room key
      expect(registry.getRoomSize('room:1')).toBe(0)
    })

    it('should be safe to call on a socket not in the room', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      // Should not throw
      registry.leave(ws, 'room:nonexistent')

      expect(registry.has(ws, 'room:nonexistent')).toBe(false)
    })

    it('should not affect other sockets in the same room', () => {
      const registry = new RoomRegistry()
      const ws1 = createMockSocket()
      const ws2 = createMockSocket()

      registry.join(ws1, 'room:1')
      registry.join(ws2, 'room:1')
      registry.leave(ws1, 'room:1')

      expect(registry.has(ws1, 'room:1')).toBe(false)
      expect(registry.has(ws2, 'room:1')).toBe(true)
      expect(registry.getRoomSize('room:1')).toBe(1)
    })

    it('should not affect other rooms the socket is in', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.join(ws, 'room:2')
      registry.leave(ws, 'room:1')

      expect(registry.has(ws, 'room:1')).toBe(false)
      expect(registry.has(ws, 'room:2')).toBe(true)
    })
  })

  describe('leaveAll', () => {
    it('should remove the socket from all rooms', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.join(ws, 'room:2')
      registry.join(ws, 'room:3')

      registry.leaveAll(ws)

      expect(registry.has(ws, 'room:1')).toBe(false)
      expect(registry.has(ws, 'room:2')).toBe(false)
      expect(registry.has(ws, 'room:3')).toBe(false)
    })

    it('should clean up empty rooms after leaveAll', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.join(ws, 'room:2')

      registry.leaveAll(ws)

      expect(registry.getRoomSize('room:1')).toBe(0)
      expect(registry.getRoomSize('room:2')).toBe(0)
    })

    it('should not affect other sockets in shared rooms', () => {
      const registry = new RoomRegistry()
      const ws1 = createMockSocket()
      const ws2 = createMockSocket()

      registry.join(ws1, 'room:shared')
      registry.join(ws2, 'room:shared')

      registry.leaveAll(ws1)

      expect(registry.has(ws2, 'room:shared')).toBe(true)
      expect(registry.getRoomSize('room:shared')).toBe(1)
    })

    it('should be safe to call on a socket with no rooms', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      // Should not throw
      registry.leaveAll(ws)
    })

    it('should be safe to call twice', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.leaveAll(ws)
      registry.leaveAll(ws)

      expect(registry.has(ws, 'room:1')).toBe(false)
    })
  })

  describe('broadcast', () => {
    it('should send data to all sockets in a room', () => {
      const registry = new RoomRegistry()
      const ws1 = createMockSocket()
      const ws2 = createMockSocket()

      registry.join(ws1, 'room:1')
      registry.join(ws2, 'room:1')

      registry.broadcast('room:1', '{"msg":"hello"}')

      expect(ws1.send).toHaveBeenCalledWith('{"msg":"hello"}')
      expect(ws2.send).toHaveBeenCalledWith('{"msg":"hello"}')
    })

    it('should exclude a specified socket', () => {
      const registry = new RoomRegistry()
      const ws1 = createMockSocket()
      const ws2 = createMockSocket()

      registry.join(ws1, 'room:1')
      registry.join(ws2, 'room:1')

      registry.broadcast('room:1', '{"msg":"hello"}', ws1)

      expect(ws1.send).not.toHaveBeenCalled()
      expect(ws2.send).toHaveBeenCalledWith('{"msg":"hello"}')
    })

    it('should skip sockets that are not in OPEN state', () => {
      const registry = new RoomRegistry()
      const wsOpen = createMockSocket(1) // OPEN
      const wsClosed = createMockSocket(3) // CLOSED

      registry.join(wsOpen, 'room:1')
      registry.join(wsClosed, 'room:1')

      registry.broadcast('room:1', '{"msg":"hello"}')

      expect(wsOpen.send).toHaveBeenCalled()
      expect(wsClosed.send).not.toHaveBeenCalled()
    })

    it('should do nothing for a nonexistent room', () => {
      const registry = new RoomRegistry()

      // Should not throw
      registry.broadcast('room:nonexistent', '{"msg":"hello"}')
    })

    it('should do nothing for an empty room', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.leave(ws, 'room:1')

      registry.broadcast('room:1', '{"msg":"hello"}')

      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('has', () => {
    it('should return false for unknown socket', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      expect(registry.has(ws, 'room:1')).toBe(false)
    })

    it('should return false for unknown room', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')

      expect(registry.has(ws, 'room:other')).toBe(false)
    })

    it('should return false after leave', () => {
      const registry = new RoomRegistry()
      const ws = createMockSocket()

      registry.join(ws, 'room:1')
      registry.leave(ws, 'room:1')

      expect(registry.has(ws, 'room:1')).toBe(false)
    })
  })

  describe('getRoomSize', () => {
    it('should return 0 for nonexistent room', () => {
      const registry = new RoomRegistry()

      expect(registry.getRoomSize('room:nonexistent')).toBe(0)
    })

    it('should track size accurately through join/leave cycles', () => {
      const registry = new RoomRegistry()
      const sockets = Array.from({ length: 5 }, () => createMockSocket())

      for (const ws of sockets) registry.join(ws, 'room:1')
      expect(registry.getRoomSize('room:1')).toBe(5)

      registry.leave(sockets[0], 'room:1')
      registry.leave(sockets[1], 'room:1')
      expect(registry.getRoomSize('room:1')).toBe(3)

      registry.leaveAll(sockets[2])
      expect(registry.getRoomSize('room:1')).toBe(2)
    })
  })
})
