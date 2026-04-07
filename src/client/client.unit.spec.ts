import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientEvents } from '../utils'
import { Client } from './client'

// Mock ClientSocket as a class
vi.mock('./client-socket', () => ({
  ClientSocket: class MockClientSocket {
    ready = true
    connecting = false
    stopped = false
    socket = null
    connect = vi.fn()
    close = vi.fn().mockResolvedValue(undefined)
    send = vi.fn()
    clearReconnectTimer = vi.fn()
  },
}))

// Mock IdleTimer and VisibilityManager as constructor functions
vi.mock('./idle-timer', () => ({
  IdleTimer: class MockIdleTimer {
    start = vi.fn()
    stop = vi.fn()
    reset = vi.fn()
    destroy = vi.fn()
  },
}))

vi.mock('./visibility-manager', () => ({
  VisibilityManager: class MockVisibilityManager {
    reconnect = vi.fn()
    destroy = vi.fn()
  },
}))

describe('Client', () => {
  describe('initialize()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should preserve authenticated state set before initialize', async () => {
      client.authenticated = true
      client.initializing = false

      await client.initialize()

      expect(client.authenticated).toBe(true)
      expect(client.initialized).toBe(true)
    })

    it('should preserve unauthenticated state set before initialize', async () => {
      client.authenticated = false
      client.initializing = false

      await client.initialize()

      expect(client.authenticated).toBe(false)
      expect(client.initialized).toBe(true)
    })

    it('should emit INITIALIZED event after initialization completes', async () => {
      client.authenticated = true
      client.initializing = false

      const initPromise = new Promise<boolean>(resolve => {
        client.once(ClientEvents.INITIALIZED, authenticated =>
          resolve(authenticated),
        )
      })

      await client.initialize()
      const authenticated = await initPromise

      expect(client.initialized).toBe(true)
      expect(client.initializing).toBe(false)
      expect(authenticated).toBe(true)
    })

    it('should emit INITIALIZING event before initialization', async () => {
      client.initializing = false

      const events: string[] = []
      client.once(ClientEvents.INITIALIZING, () => events.push('initializing'))
      client.once(ClientEvents.INITIALIZED, () => events.push('initialized'))

      await client.initialize()

      expect(events).toEqual(['initializing', 'initialized'])
    })

    it('should wait for existing initialization if already initializing', async () => {
      client.initializing = true

      const initPromise = client.initialize()

      // Emit initialized to unblock the waiting initialize
      setTimeout(() => {
        client.initializing = false
        client.emit(ClientEvents.INITIALIZED, true)
      }, 10)

      await initPromise
    })

    it('should load context from localStorage during initialization', async () => {
      const savedContext = { token: 'saved-token', userId: 'user-123' }
      localStorage.setItem('context', JSON.stringify(savedContext))

      client.initializing = false
      client.context = {}

      await client.initialize()

      expect(localStorage.getItem).toHaveBeenCalledWith('context')
    })
  })

  describe('clearContext()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should clear context and emit CONTEXT_CHANGED event', async () => {
      client.context = { token: 'test', userId: 'user-123' }

      const eventPromise = new Promise<void>(resolve => {
        client.once(ClientEvents.CONTEXT_CHANGED, () => resolve())
      })

      client.clearContext()

      await eventPromise

      expect(client.context).toEqual({})
      expect(localStorage.removeItem).toHaveBeenCalledWith('context')
    })
  })

  describe('loadContext()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should not emit CONTEXT_CHANGED when stored context matches in-memory', () => {
      const context = { token: 'abc', userId: 'u1' }
      client.context = { ...context }
      localStorage.setItem('context', JSON.stringify(context))

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      client.loadContext()

      expect(spy).not.toHaveBeenCalled()
    })

    it('should emit CONTEXT_CHANGED when stored context differs from in-memory', () => {
      client.context = { token: 'old' }
      localStorage.setItem(
        'context',
        JSON.stringify({ token: 'old', userId: 'u1' }),
      )

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      client.loadContext()

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should do nothing when localStorage has no context', () => {
      client.context = { token: 'keep' }

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      client.loadContext()

      expect(spy).not.toHaveBeenCalled()
      expect(client.context).toEqual({ token: 'keep' })
    })
  })

  describe('setContext()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should set context and persist to localStorage', () => {
      const newContext = { token: 'new-token', userId: 'user-456' }

      client.setContext(newContext)

      expect(client.context).toEqual(newContext)
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'context',
        expect.any(String),
      )
    })

    it('should emit CONTEXT_CHANGED event', async () => {
      const eventPromise = new Promise<void>(resolve => {
        client.once(ClientEvents.CONTEXT_CHANGED, () => resolve())
      })

      client.setContext({ token: 'test' })

      await eventPromise
    })
  })

  describe('updateContext()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should emit CONTEXT_CHANGED when context values change', () => {
      client.context = { token: 'old' }

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      client.updateContext({ token: 'new' })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(client.context.token).toBe('new')
    })

    it('should not emit CONTEXT_CHANGED when merged context is identical', () => {
      client.context = { token: 'same', exp: 123 }

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      client.updateContext({ token: 'same', exp: 123 })

      expect(spy).not.toHaveBeenCalled()
    })

    it('should merge new keys into existing context', () => {
      client.context = { token: 'tok' }

      client.updateContext({ userId: 'u1' })

      expect(client.context).toEqual({ token: 'tok', userId: 'u1' })
    })
  })

  describe('setContextAndReInit()', () => {
    let client: Client

    beforeEach(() => {
      const storage: Record<string, string> = {}
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => storage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          Reflect.deleteProperty(storage, key)
        }),
      })

      client = new Client({ host: 'localhost' })
    })

    afterEach(async () => {
      vi.clearAllMocks()
      vi.unstubAllGlobals()
      if (client) {
        await client.close().catch(() => undefined)
      }
    })

    it('should skip setContext when context is identical', () => {
      const ctx = { token: 'tok', exp: 999 }
      client.context = { ...ctx }

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      // setContextAndReInit will try to reconnect (calls socket.disconnect/connect)
      // and then waitFor INITIALIZED — we just need to test the setContext skip.
      // Manually emit INITIALIZED to unblock the promise.
      const promise = client.setContextAndReInit(ctx)
      setTimeout(() => client.emit(ClientEvents.INITIALIZED), 10)

      return promise.then(() => {
        expect(spy).not.toHaveBeenCalled()
      })
    })

    it('should call setContext when context differs', () => {
      client.context = { token: 'old' }

      const spy = vi.fn()
      client.on(ClientEvents.CONTEXT_CHANGED, spy)

      const promise = client.setContextAndReInit({ token: 'new' })
      setTimeout(() => client.emit(ClientEvents.INITIALIZED), 10)

      return promise.then(() => {
        expect(spy).toHaveBeenCalledTimes(1)
        expect(client.context).toEqual({ token: 'new' })
      })
    })
  })
})
