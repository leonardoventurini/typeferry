import { access } from 'node:fs/promises'
import path from 'node:path'

export async function findApplicationRoot(start: string): Promise<string> {
  let candidate = path.resolve(start)

  while (true) {
    try {
      await access(path.join(candidate, 'package.json'))
      return candidate
    } catch {
      const parent = path.dirname(candidate)
      if (parent === candidate) {
        throw new Error(
          `Could not find an application package.json from ${start}`,
        )
      }
      candidate = parent
    }
  }
}
