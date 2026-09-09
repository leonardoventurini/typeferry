import { LocalCollection, type MaterializedDocument, type ObjectIDContract } from './index'

interface Task {
  title: string
  rank: number
  tags: string[]
  nested: { enabled: boolean }
  location: readonly [number, number]
}

const tasks = new LocalCollection<Task, string>()
const insertedId: string = tasks.insert({
  title: 'typed',
  rank: 1,
  tags: [],
  nested: { enabled: true },
  location: [0, 0],
})
const task: MaterializedDocument<Task, string> | undefined = tasks.findOne(insertedId)

tasks.find({
  title: { $regex: '^type', $options: 'i' },
  rank: { $gte: 1, $type: 'double' },
  tags: { $all: ['strict'] },
  'nested.enabled': true,
  location: { $near: [0, 0], $maxDistance: 10 },
})
tasks.update(insertedId, {
  $inc: { rank: 1 },
  $set: { title: 'updated', 'nested.enabled': false },
  $push: { tags: { $each: ['safe'], $position: 0 } },
})

const transformed = tasks.find({}, {
  transform: document => ({ id: document._id, label: document.title }),
}).fetch()
const transformedId: string = transformed[0]!.id
const restoredId: string = transformed[0]!._id

tasks.find().observeChanges({
  added(id, fields) {
    const typedId: string | number | ObjectIDContract = id
    const title: string | undefined = fields.title
    void typedId
    void title
  },
})

// @ts-expect-error Numeric selectors reject string operands.
tasks.find({ rank: { $gt: 'high' } })
// @ts-expect-error Unknown document paths are rejected.
tasks.find({ missing: true })
// @ts-expect-error Numeric modifiers reject string increments.
tasks.update(insertedId, { $inc: { rank: 'one' } })
// @ts-expect-error Array modifiers reject element values of the wrong type.
tasks.update(insertedId, { $push: { tags: 42 } })
// @ts-expect-error Projection values use Mongo inclusion/exclusion flags.
tasks.find({}, { projection: { title: 2 } })

void task
void transformedId
void restoredId
