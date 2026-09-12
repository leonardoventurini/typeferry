import {
  LocalCollection,
  type DeepReadonly,
  type MaterializedDocument,
} from './index'

interface Task {
  title: string
  nested: {
    done: boolean
  }
}

const tasks = new LocalCollection<Task>()
const id: string = tasks.insert({ title: 'Typed', nested: { done: false } })
const document: MaterializedDocument<Task> | undefined = tasks.findOne(id)
const snapshot: readonly DeepReadonly<MaterializedDocument<Task>>[] = tasks.find().fetch()

tasks.on('insert', event => {
  const insertedId: string = event.document._id
  void insertedId

  // @ts-expect-error Public snapshots are deeply readonly.
  event.document.nested.done = true
})

tasks.find().on('change', documents => {
  const first = documents[0]

  // @ts-expect-error Cursor snapshots are readonly arrays.
  documents.push(first!)
})

// @ts-expect-error Local collections accept only string IDs.
tasks.insert({ _id: 1, title: 'Invalid', nested: { done: false } })

void document
void snapshot
