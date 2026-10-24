import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { contracts, sha256 } from './backend-artifacts.mjs'
import {secureSlkContract,validateSecureBuild} from '../dist/secure-slk.js'

const secureManifest=JSON.parse(await readFile(new URL('../vendor/slk/secure-builds.json',import.meta.url),'utf8'))
if(secureManifest.schemaVersion!==1)throw Error('Patched backend manifest missing')
if(sha256(await readFile(new URL('../patches/slk/secure-storage.patch',import.meta.url)))!==secureSlkContract.patchSha256)throw Error('Local patch hash mismatch')

for (const [target, artifact] of Object.entries(contracts.slack.artifacts)) {
  const bytes = await readFile(new URL(`../vendor/slk/${target}/${artifact.binary}`, import.meta.url))
  const expected=target.startsWith('linux-')?artifact.binarySha256:validateSecureBuild(secureManifest.builds[target],target).binarySha256
  if(!target.startsWith('linux-')&&sha256(await readFile(new URL(`../vendor/slk/${target}/mock-test-proof.json`,import.meta.url)))!==secureManifest.builds[target].mockStorageProofSha256)throw Error('Mock test proof missing/corrupt')
  if (!expected || sha256(bytes) !== expected) throw new Error(`Bundled binary missing/corrupt: ${target}`)
}
for (const [name, hash] of Object.entries(contracts.licenses)) {
  if (sha256(await readFile(new URL(`../vendor/licenses/${name}`, import.meta.url))) !== hash) throw new Error(`License missing/corrupt: ${name}`)
}
const noticeManifest=JSON.parse(await readFile(new URL('../vendor/licenses/slk-dependencies.json',import.meta.url),'utf8'))
if(noticeManifest.packages.some(pkg=>!pkg.noticeFiles.length))throw new Error('A dependency lacks retained notice/attribution material')
const dist = dirname(fileURLToPath(import.meta.resolve('msteams')))
const manifest = JSON.parse(await readFile(join(dist, '..', 'package.json'), 'utf8'))
if (manifest.version !== contracts.teams.sourcePackageVersion || manifest.bin.teams !== contracts.teams.entry) throw new Error('msteams package contract mismatch')
await access(join(dist, 'cli', 'index.mjs')); await access(join(dist, '..', 'LICENSE'))
const manifestRoot = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (manifestRoot.dependencies.msteams !== contracts.teams.sourcePackageVersion || !manifestRoot.bundleDependencies.includes('msteams')) throw new Error('Teams must be pinned and bundled')
console.log('All five binaries, backend entrypoints and license hashes verified')
