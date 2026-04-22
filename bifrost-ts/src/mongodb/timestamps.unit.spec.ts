import { describe, expect, it } from 'vitest'

import { withInsertTimestamps, withUpdateTimestamp } from './timestamps'

describe('mongodb timestamp helpers', () => {
  it('adds deterministic insert timestamps', () => {
    const now = new Date('2026-04-21T00:00:00.000Z')
    const result = withInsertTimestamps({ name: 'Roadmap' }, { now })

    expect(result).toEqual({
      name: 'Roadmap',
      createdAt: now,
      updatedAt: now,
    })
  })

  it('adds update timestamps without removing other operators', () => {
    const now = new Date('2026-04-21T00:00:00.000Z')
    const result = withUpdateTimestamp(
      {
        $set: { name: 'Roadmap' },
        $inc: { version: 1 },
        $unset: { stale: '' },
      },
      { now },
    )

    expect(result).toEqual({
      $set: { name: 'Roadmap', updatedAt: now },
      $inc: { version: 1 },
      $unset: { stale: '' },
    })
  })
})
