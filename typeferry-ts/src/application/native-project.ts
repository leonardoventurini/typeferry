import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Updates generated files only when their last generated contents are intact.
 * User edits are never overwritten by synchronization.
 */
export async function writeGeneratedFile(root: string, relativePath: string, contents: string): Promise<void> {
  const destination = path.join(root, relativePath)
  const ledger = path.join(root, '.typeferry', 'generated', `${createHash('sha256').update(relativePath).digest('hex')}.sha256`)
  let existing: string | undefined
  try { existing = await readFile(destination, 'utf8') } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (existing === contents) {
    await mkdir(path.dirname(ledger), { recursive: true })
    await writeFile(ledger, hash(contents))
    return
  }
  if (existing !== undefined) {
    let previousHash: string | undefined
    try { previousHash = await readFile(ledger, 'utf8') } catch { /* Unowned files cannot be replaced. */ }
    if (previousHash !== hash(existing)) throw new Error(`Refusing to overwrite edited or app-owned file: ${relativePath}`)
  }
  await mkdir(path.dirname(destination), { recursive: true })
  await mkdir(path.dirname(ledger), { recursive: true })
  await writeFile(destination, contents)
  await writeFile(ledger, hash(contents))
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }

/**
 * Registers a generated Swift file in Capacitor's conventional App target.
 * Existing IDs and custom project settings remain untouched.
 */
export function registerNativeSource(project: string): string {
  if (project.includes('/* TypeFerryNative.swift in Sources */')) return project
  const reference = 'F3A000000000000000000001'
  const build = 'F3A000000000000000000002'
  if (project.includes(reference) || project.includes(build)) throw new Error('Native project identifier collision')
  const anchors = ['/* Begin PBXBuildFile section */', '/* Begin PBXFileReference section */', /\t+\w+ \/\* AppDelegate.swift \*\/,/u, /\t+\w+ \/\* AppDelegate.swift in Sources \*\/,/u] as const
  for (const anchor of anchors) {
    if (typeof anchor === 'string' ? !project.includes(anchor) : !anchor.test(project)) throw new Error('Unsupported Xcode project structure; expected AppDelegate.swift in App target')
  }
  return project
    .replace(anchors[0], `${anchors[0]}\n\t\t${build} /* TypeFerryNative.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${reference} /* TypeFerryNative.swift */; };`)
    .replace(anchors[1], `${anchors[1]}\n\t\t${reference} /* TypeFerryNative.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = TypeFerryNative.swift; sourceTree = "<group>"; };`)
    .replace(anchors[2], match => `${match}\n\t\t\t\t${reference} /* TypeFerryNative.swift */,`)
    .replace(anchors[3], match => `${match}\n\t\t\t\t${build} /* TypeFerryNative.swift in Sources */,`)
}

export async function fileExists(file: string): Promise<boolean> {
  try { await access(file); return true } catch { return false }
}
