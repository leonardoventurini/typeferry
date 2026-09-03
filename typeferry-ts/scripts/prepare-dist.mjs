import {
  access,
  chmod,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST_DIR = new URL('../dist/', import.meta.url)
const FROM_SPECIFIER_PATTERN = /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g
const DYNAMIC_IMPORT_PATTERN = /(import\s*\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g

/**
 * Adds `.js` to relative ESM specifiers in published artifacts so Node and
 * bundlers can resolve dist outputs without relying on TypeScript source.
 */
async function main() {
  await rewriteDirectory(DIST_DIR)
  await chmod(new URL('cli/index.js', DIST_DIR), 0o755)
}

async function rewriteDirectory(directoryUrl) {
  const entries = await readdir(directoryUrl)

  for (const entry of entries) {
    const entryUrl = new URL(entry, directoryUrl)
    const entryStats = await stat(entryUrl)
    if (entryStats.isDirectory()) {
      await rewriteDirectory(new URL(`${entry}/`, directoryUrl))
    }
    else if (shouldRewrite(entry)) await rewriteFile(entryUrl)
  }
}

function shouldRewrite(fileName) {
  return fileName.endsWith('.js') || fileName.endsWith('.d.ts')
}

async function rewriteFile(fileUrl) {
  const source = await readFile(fileUrl, 'utf8')
  const rewritten = await rewriteRelativeSpecifiers(
    source,
    fileURLToPath(fileUrl),
  )

  if (rewritten !== source) await writeFile(fileUrl, rewritten)
}

async function rewriteRelativeSpecifiers(source, filePath) {
  const replacements = await getReplacementMap(source, filePath)
  return rewritePattern(rewritePattern(source, FROM_SPECIFIER_PATTERN, replacements), DYNAMIC_IMPORT_PATTERN, replacements)
}

async function getReplacementMap(source, filePath) {
  const specifiers = new Set()
  collectSpecifiers(source, FROM_SPECIFIER_PATTERN, specifiers)
  collectSpecifiers(source, DYNAMIC_IMPORT_PATTERN, specifiers)

  const entries = await Promise.all(
    [...specifiers].map(async specifier => [
      specifier,
      await resolvePublishedSpecifier(filePath, specifier),
    ]),
  )

  return new Map(entries)
}

function collectSpecifiers(source, pattern, output) {
  for (const [, , specifier] of source.matchAll(pattern)) output.add(specifier)
}

function rewritePattern(source, pattern, replacements) {
  return source.replace(pattern, (fullMatch, prefix, specifier, suffix) => {
    return `${prefix}${replacements.get(specifier) ?? specifier}${suffix}`
  })
}

async function resolvePublishedSpecifier(filePath, specifier) {
  if (path.extname(specifier)) return specifier

  const absoluteBase = path.resolve(path.dirname(filePath), specifier)
  if (await exists(`${absoluteBase}.js`)) return `${specifier}.js`
  if (await exists(path.join(absoluteBase, 'index.js'))) return `${specifier}/index.js`
  return `${specifier}.js`
}

async function exists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
