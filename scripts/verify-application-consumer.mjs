import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const PACKAGE_ROOT = path.join(REPOSITORY_ROOT, 'typeferry-ts')

async function main() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'typeferry-consumer-'),
  )
  const applicationRoot = path.join(temporaryRoot, 'application')

  try {
    const packOutput = run(
      'npm',
      ['pack', '--json', '--pack-destination', temporaryRoot],
      PACKAGE_ROOT,
      false,
    )
    const packReport = JSON.parse(packOutput)
    const packageFile = path.join(temporaryRoot, packReport[0].filename)

    await writeFixture(applicationRoot, packageFile)
    run('npm', ['install', '--no-audit', '--no-fund'], applicationRoot)
    run('npm', ['run', 'build'], applicationRoot)
    run('npm', ['run', 'test'], applicationRoot)
    run('npm', ['run', 'runtime-smoke'], applicationRoot)

    await Promise.all([
      access(path.join(applicationRoot, 'dist/client/index.html')),
      access(path.join(applicationRoot, 'dist/server/index.cjs')),
    ])
    await assert.rejects(
      access(path.join(applicationRoot, 'dist/server/index.cjs.map')),
    )

    console.log('Verified packed TypeFerry application consumer.')
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

async function writeFixture(applicationRoot, packageFile) {
  const files = new Map([
    [
      'package.json',
      JSON.stringify(
        {
          name: 'typeferry-application-consumer',
          private: true,
          type: 'module',
          scripts: {
            build: 'typeferry build',
            test: 'typeferry test unit',
            'runtime-smoke':
              'node -e "Promise.all([import(\'typeferry/client\'), import(\'typeferry/server\'), import(\'typeferry/ejson\')])"',
          },
          dependencies: {
            typeferry: `file:${packageFile}`,
          },
        },
        null,
        2,
      ),
    ],
    [
      'client/index.html',
      '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>\n',
    ],
    ['client/main.ts', "document.body.textContent = 'TypeFerry'\n"],
    ['server/index.ts', "console.log('TypeFerry server')\n"],
    [
      'typeferry.config.ts',
      "import { defineConfig } from 'typeferry/config'\n\nexport default defineConfig({ build: { sourceMaps: false } })\n",
    ],
    [
      'test/application.unit.spec.ts',
      "import { expect, it } from 'typeferry/test'\n\nit('runs', () => expect(true).toBe(true))\n",
    ],
  ])

  for (const [relativePath, contents] of files) {
    const filePath = path.join(applicationRoot, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, contents)
  }
}

function run(command, arguments_, cwd, showOutput = true) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${arguments_.join(' ')} failed in ${cwd}`,
        result.stdout,
        result.stderr,
      ].join('\n'),
    )
  }

  if (showOutput && result.stdout) process.stdout.write(result.stdout)
  if (showOutput && result.stderr) process.stderr.write(result.stderr)
  return result.stdout
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
