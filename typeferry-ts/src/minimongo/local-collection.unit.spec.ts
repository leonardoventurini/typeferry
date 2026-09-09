import { describe, expect, it, vi } from 'vitest'

import { LocalCollection } from './local-collection'

interface Task {
  title: string
  done: boolean
  rank: number
  labels?: string[]
}

describe('LocalCollection and Cursor', () => {
  it('clones inserts and query results while supporting typed queries', () => {
    const collection = new LocalCollection<Task, string>('tasks', {
      components: { randomId: () => 'generated' },
    })
    const source: Task = { title: 'First', done: false, rank: 2 }
    const id = collection.insert(source)

    source.title = 'mutated'
    const found = collection.findOne(id)
    if (found) found.title = 'also mutated'

    expect(id).toBe('generated')
    expect(collection.findOne(id)).toEqual({ _id: id, title: 'First', done: false, rank: 2 })
    expect(collection.find().count()).toBe(1)
    expect(collection.find(undefined).count()).toBe(0)
    expect(collection.findOne()).toEqual({ _id: id, title: 'First', done: false, rank: 2 })
    expect(collection.findOne(undefined)).toBeUndefined()
  })

  it('supports sort, skip, limit, projection, transform, and iteration', async () => {
    const collection = createTasks()
    const cursor = collection.find(
      { done: false },
      {
        sort: { rank: 1 },
        skip: 1,
        limit: 1,
        projection: { title: 1 },
        transform: document => document.title.toUpperCase(),
      },
    )

    expect(cursor.fetch()).toEqual(['THIRD'])
    expect([...cursor]).toEqual(['THIRD'])
    expect(await cursor.mapAsync(value => value.length)).toEqual([5])
    expect(await collection.countDocuments({ done: false })).toBe(2)
  })

  it('updates, upserts, and removes documents with sync and async APIs', async () => {
    const collection = createTasks()

    expect(collection.update({ done: false }, { $inc: { rank: 10 } }, { multi: true })).toBe(2)
    expect(await collection.updateAsync('a', { $set: { done: true } })).toBe(1)
    expect(collection.upsert({ title: 'New' }, { $set: { done: false, rank: 9 } })).toEqual({
      numberAffected: 1,
      insertedId: 'generated',
    })
    expect(await collection.removeAsync({ done: true })).toBe(2)
    expect(collection.find().map(document => document.title)).toEqual(['Third', 'New'])
  })

  it('delivers unordered changes and stops the live query', () => {
    const collection = new LocalCollection<Task, string>('tasks')
    const events: unknown[] = []
    collection.insert({ _id: 'a', title: 'First', done: false, rank: 1 })
    const handle = collection.find({ done: false }).observeChanges({
      added: (id, fields) => events.push(['added', id, fields]),
      changed: (id, fields) => events.push(['changed', id, fields]),
      removed: id => events.push(['removed', id]),
    })

    collection.update('a', { $set: { title: 'Changed' } })
    collection.update('a', { $set: { done: true } })
    handle.stop()
    collection.insert({ _id: 'b', title: 'Ignored', done: false, rank: 2 })

    expect(events).toEqual([
      ['added', 'a', { title: 'First', done: false, rank: 1 }],
      ['changed', 'a', { title: 'Changed' }],
      ['removed', 'a'],
    ])
    expect(handle.isReady).toBe(true)
  })

  it('reapplies transforms to raw projected documents during observation', () => {
    const collection = new LocalCollection<Task, string>('tasks')
    const events: unknown[] = []
    collection.insert({ _id: 'a', title: 'First', done: false, rank: 1 })

    collection.find(
      'a',
      { transform: document => ({ label: document.title.toUpperCase() }) },
    ).observe({
      added: document => events.push(['added', document]),
      changed: (document, previous) => events.push(['changed', document, previous]),
    })
    collection.update('a', { $set: { title: 'Changed' } })

    expect(events).toEqual([
      ['added', { label: 'FIRST' }],
      ['changed', { label: 'CHANGED' }, { label: 'FIRST' }],
    ])
  })

  it('coalesces paused ordered changes into final callbacks', () => {
    const collection = createTasks()
    const events: unknown[] = []
    collection.find({}, { sort: { rank: 1 } }).observeChanges({
      addedBefore: (id, _fields, before) => events.push(['added', id, before]),
      movedBefore: (id, before) => events.push(['moved', id, before]),
      changed: (id, fields) => events.push(['changed', id, fields]),
      removed: id => events.push(['removed', id]),
    })
    events.length = 0

    collection.pauseObservers()
    collection.update('a', { $set: { rank: 4 } })
    collection.remove('b')
    collection.insert({ _id: 'd', title: 'Fourth', done: false, rank: 0 })
    expect(events).toEqual([])
    collection.resumeObserversClient()

    expect(events).toContainEqual(['removed', 'b'])
    expect(events).toContainEqual(['added', 'd', 'a'])
    expect(events).toContainEqual(['moved', 'c', 'a'])
  })

  it('defers initial observer delivery when observation starts while paused', () => {
    const collection = createTasks()
    const events: string[] = []
    collection.pauseObservers()

    collection.find().observeChanges({ added: id => events.push(String(id)) })
    expect(events).toEqual([])
    collection.resumeObserversClient()

    expect(events).toEqual(['a', 'b', 'c'])
  })

  it('tracks copy-on-write originals and defers callbacks', async () => {
    const collection = new LocalCollection<Task, string>('tasks')
    collection.insert({ _id: 'a', title: 'First', done: false, rank: 1 })
    collection.saveOriginals()
    const callback = vi.fn()

    collection.update('a', { $set: { title: 'Changed' } }, {}, callback)
    collection.update('a', { $set: { rank: 2 } })
    const originals = collection.retrieveOriginals()

    expect(originals.get('a')).toEqual({ _id: 'a', title: 'First', done: false, rank: 1 })
    expect(callback).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(callback).toHaveBeenCalledWith(null, 1)
  })
})

function createTasks(): LocalCollection<Task, string> {
  const collection = new LocalCollection<Task, string>('tasks', {
    components: { randomId: () => 'generated' },
  })

  collection.insert({ _id: 'a', title: 'First', done: false, rank: 2 })
  collection.insert({ _id: 'b', title: 'Second', done: true, rank: 1 })
  collection.insert({ _id: 'c', title: 'Third', done: false, rank: 3 })

  return collection
}
