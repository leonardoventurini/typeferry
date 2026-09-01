import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MESSAGES_CHANGED_EVENT, type Message } from '@/common/messages'

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<readonly Message[]>>(),
  create: vi.fn(),
  remoteEventHandler: undefined as (() => void) | undefined,
  remoteEventOptions: undefined as
    | { active?: boolean; channel?: string; event: string }
    | undefined,
}))

vi.mock('typeferry/react', () => ({
  useAuth: () => ({ authenticated: true }),
  useClient: () => ({
    context: { user: { _id: 'sample-user' } },
    m: { messages: { create: mocks.create, list: mocks.list } },
  }),
  useConnectionState: () => ({ isOnline: true }),
  useRemoteEvent: (
    options: { active?: boolean; channel?: string; event: string },
    handler: () => void,
  ): boolean => {
    mocks.remoteEventOptions = options
    mocks.remoteEventHandler = handler
    return true
  },
}))

const firstMessage: Message = {
  id: 'message-1',
  text: 'Hello, TypeFerry!',
  createdAt: '2026-08-30T12:00:00.000Z',
}
const secondMessage: Message = {
  id: 'message-2',
  text: 'Updated remotely',
  createdAt: '2026-08-30T12:01:00.000Z',
}

describe('App', () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([firstMessage])
    mocks.create.mockReset().mockResolvedValue(firstMessage)
    mocks.remoteEventHandler = undefined
    mocks.remoteEventOptions = undefined
  })

  it('refetches canonical state after an owner-scoped remote event', async () => {
    const { App } = await import('@/client/app')
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Real-time messages' }),
    ).toBeVisible()
    expect(await screen.findByText('Hello, TypeFerry!')).toBeVisible()
    expect(mocks.remoteEventOptions).toEqual({
      active: true,
      channel: 'sample-user',
      event: MESSAGES_CHANGED_EVENT,
    })

    mocks.list.mockResolvedValue([secondMessage, firstMessage])
    mocks.remoteEventHandler?.()

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Updated remotely')).toBeVisible()
  })
})
