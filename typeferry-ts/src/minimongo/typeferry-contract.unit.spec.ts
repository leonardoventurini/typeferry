import { describe, expect, it, vi } from 'vitest'

import { LocalCollection } from './index'

interface Task {
  title: string
  details: {
    done: boolean
  }
}

describe('TypeFerry local document store contract', () => {
  it('uses immutable string-form MongoDB IDs', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const id = tasks.insert({ title: 'Design', details: { done: false } })
    const task = tasks.findOne(id)

    expect(id).toMatch(/^[0-9a-f]{24}$/)
    expect(task?._id).toBe(id)
    expect(Object.isFrozen(task)).toBe(true)
    expect(Object.isFrozen(task?.details)).toBe(true)
    expect(() => {
      if (task) (task.details as { done: boolean }).done = true
    }).toThrow()
  })

  it('shares unchanged documents between snapshots', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const firstId = tasks.insert({ title: 'First', details: { done: false } })
    tasks.insert({ title: 'Second', details: { done: false } })
    const cursor = tasks.find({}, { sort: { title: 1 } })
    const before = cursor.fetch()

    tasks.update({ title: 'Second' }, { $set: { 'details.done': true } })
    const after = cursor.fetch()

    expect(after.find(task => task._id === firstId)).toBe(before.find(task => task._id === firstId))
  })

  it('emits typed collection and cursor events', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const insert = vi.fn()
    const update = vi.fn()
    const remove = vi.fn()
    const change = vi.fn()
    const added = vi.fn()
    const changed = vi.fn()
    const removed = vi.fn()
    const cursor = tasks.find({ 'details.done': false })

    tasks.on('insert', insert).on('update', update).on('remove', remove)
    cursor.on('change', change).on('added', added).on('changed', changed).on('removed', removed)

    const id = tasks.insert({ title: 'Design', details: { done: false } })
    tasks.update(id, { $set: { title: 'Build' } })
    tasks.update(id, { $set: { 'details.done': true } })
    tasks.remove(id)

    expect(insert).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledOnce()
    expect(added).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledOnce()
    expect(removed).toHaveBeenCalledOnce()
    expect(change).toHaveBeenCalledTimes(3)
    expect(change.mock.calls.at(-1)?.[0]).toEqual([])
  })

  it('does not emit cursor events for irrelevant mutations', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const cursor = tasks.find({ 'details.done': true })
    const change = vi.fn()

    cursor.on('change', change)
    tasks.insert({ title: 'Unmatched', details: { done: false } })

    expect(change).not.toHaveBeenCalled()
  })

  it('publishes collection events before derived cursor events', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const cursor = tasks.find({ 'details.done': false })
    const order: string[] = []

    tasks.on('insert', () => order.push('collection'))
    cursor.on('change', () => order.push('cursor'))
    tasks.insert({ title: 'Ordered', details: { done: false } })

    expect(order).toEqual(['collection', 'cursor'])
  })

  it('observes projected sorted windows and releases observers with listener cleanup', () => {
    const tasks = new LocalCollection<Task>('tasks')
    const firstId = tasks.insert({ title: 'B', details: { done: false } })
    tasks.insert({ title: 'C', details: { done: false } })
    const cursor = tasks.find({}, {
      sort: { title: 1 },
      limit: 1,
      projection: { title: 1 },
    })
    const change = vi.fn()
    const added = vi.fn()
    const removed = vi.fn()

    cursor.on('change', change).on('added', added).on('removed', removed)
    tasks.insert({ title: 'A', details: { done: false } })

    expect(removed.mock.calls[0]?.[0].document._id).toBe(firstId)
    expect(added.mock.calls[0]?.[0].document.title).toBe('A')
    expect(change.mock.calls[0]?.[0]).toHaveLength(1)

    cursor.removeAllListeners()
    tasks.insert({ title: '0', details: { done: false } })

    expect(change).toHaveBeenCalledOnce()
  })

  it('rejects invalid supplied IDs', () => {
    const tasks = new LocalCollection<Task>('tasks')

    expect(() => tasks.insert({
      _id: 'not-an-object-id',
      title: 'Invalid',
      details: { done: false },
    })).toThrow('24-character hexadecimal string')
  })
})
