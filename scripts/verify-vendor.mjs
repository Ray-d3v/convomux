import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { contracts, sha256 } from './backend-artifacts.mjs'

for (const [target, artifact] of Object.entries(contracts.slack.artifacts)) {
  const bytes = await readFile(new URL(`../vendor/slk/${target}/${artifact.binary}`, import.meta.url))
  if (!artifact.binarySha256 || sha256(bytes) !== artifact.binarySha256) throw new Error(`Bundled binary missing/corrupt: ${target}`)
}
for (const [name, hash] of Object.entries(contracts.licenses)) {
  if (sha256(await readFile(new URL(`../vendor/licenses/${name}`, import.meta.url))) !== hash) throw new Error(`License missing/corrupt: ${name}`)
}
const dist = dirname(fileURLToPath(import.meta.resolve('msteams')))
const manifest = JSON.parse(await readFile(join(dist, '..', 'package.json'), 'utf8'))
if (manifest.version !== contracts.teams.sourcePackageVersion || manifest.bin.teams !== contracts.teams.entry) throw new Error('msteams package contract mismatch')
await access(join(dist, 'cli', 'index.mjs')); await access(join(dist, '..', 'LICENSE'))
const manifestRoot = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (manifestRoot.dependencies.msteams !== contracts.teams.sourcePackageVersion || !manifestRoot.bundleDependencies.includes('msteams')) throw new Error('Teams must be pinned and bundled')
console.log('All five binaries, backend entrypoints and license hashes verified')
