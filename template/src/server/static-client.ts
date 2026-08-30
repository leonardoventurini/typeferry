import { access } from 'node:fs/promises'
import { join } from 'node:path'

interface StaticServer {
  static(path: string, catchAll: boolean): void
}

type AssertReadable = (path: string) => Promise<void>

/** Validates and mounts the production client without masking a broken build. */
export async function configureStaticClient(
  server: StaticServer,
  clientRoot: string,
  assertReadable: AssertReadable = access,
): Promise<void> {
  await assertReadable(join(clientRoot, 'index.html'))
  server.static(clientRoot, true)
}
