// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mongoLivePublication,
  type MongoLiveClientDocument,
  type MongoLiveViewSnapshot,
} from '../../mongodb'
import { useMongoLivePublication } from './use-mongodb-live-publication'

interface BoardFields {
  readonly name: string
}

type Board = MongoLiveClientDocument<BoardFields>

const descriptor = mongoLivePublication<{ owner: string }, Board>()(
  'boards.mine',
)
const listeners = new Set<() => void>()
let snapshot: MongoLiveViewSnapshot<Board>
const start = vi.fn(async () => undefined)
const stop = vi.fn(async () => undefined)
const resync = vi.fn(async () => undefined)
const mockClient = { uuid: 'client-1' }

vi.mock('./use-client', () => ({
  useClient: () => mockClient,
}))

vi.mock('../../mongodb/live/client', () => {
  return {
    createMongoLiveView: () => ({
      start,
      stop,
      resync,
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }),
  }
})

describe('useMongoLivePublication', () => {
  beforeEach(() => {
    listeners.clear()
    start.mockClear()
    stop.mockClear()
    resync.mockClear()
    snapshot = {
      status: 'connecting',
      documents: [],
      error: null,
    }
  })

  it('renders core state, reacts to updates, and stops on unmount', async () => {
    const { result, rerender, unmount } = renderHook(() =>
      useMongoLivePublication({
        publication: descriptor,
        args: { owner: 'owner-1' },
      }),
    )

    expect(result.current.status).toBe('connecting')
    expect(start).toHaveBeenCalledOnce()
    rerender()
    expect(start).toHaveBeenCalledOnce()
    expect(stop).not.toHaveBeenCalled()

    snapshot = {
      status: 'ready',
      documents: [{ _id: 'board-1', name: 'Roadmap' }],
      error: null,
    }
    act(() => {
      for (const listener of listeners) listener()
    })

    expect(result.current.documents).toEqual([
      { _id: 'board-1', name: 'Roadmap' },
    ])
    await result.current.resync()
    expect(resync).toHaveBeenCalledOnce()

    unmount()
    expect(stop).toHaveBeenCalledOnce()
  })
})
