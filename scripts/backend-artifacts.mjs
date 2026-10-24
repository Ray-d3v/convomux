import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { list } from 'tar'
import { unzipSync } from 'fflate'

const root = new URL('../', import.meta.url)
export const contracts = JSON.parse(await readFile(new URL('backend-contracts.json', root), 'utf8'))
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_ARCHIVE = 20 * 1024 * 1024, MAX_BINARY = 50 * 1024 * 1024
export async function verifiedBinary(bytes, artifact) {
  if (bytes.length > MAX_ARCHIVE || sha256(bytes) !== artifact.sha256) throw new Error('Backend archive SHA-256 mismatch or size limit exceeded')
  const names = new Set(), chunks = []
  let total = 0, invalid
  const accept = (name, size, type) => {
    if (name !== artifact.binary || names.has(name) || type !== 'File' || !Number.isSafeInteger(size) || size < 0 || size > MAX_BINARY) {
      invalid = new Error(`Unsafe or unexpected backend archive entry: ${JSON.stringify(name)}`); return false
    }
    names.add(name); return true
  }
  if (artifact.format === 'zip') {
    const files = unzipSync(bytes, { filter: file => accept(file.name, file.originalSize, 'File') })
    if (files[artifact.binary]) chunks.push(Buffer.from(files[artifact.binary]))
  } else if (artifact.format === 'tar.gz') {
    const parser = list({ strict: true, onReadEntry: entry => {
      if (!accept(entry.path, entry.size, entry.type)) { entry.resume(); return }
      entry.on('data', chunk => {
        total += chunk.length
        if (total > MAX_BINARY) invalid = new Error('Backend decompressed size exceeded')
        else chunks.push(Buffer.from(chunk))
      })
    } })
    await new Promise((resolvePromise, reject) => { parser.on('error', reject); parser.on('end', resolvePromise); parser.end(bytes) })
  } else throw new Error('Unsupported archive format')
  if (invalid) throw invalid
  const binary = Buffer.concat(chunks)
  if (names.size !== 1 || !binary.length || binary.length > MAX_BINARY) throw new Error('Backend binary missing from archive')
  return binary
}
export async function downloadArtifact(artifact) {
  if (!artifact.url.startsWith('https://github.com/osodevops/slack-cli/releases/download/v0.2.0/')) throw new Error('Unapproved backend source')
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Backend download failed: HTTP ${response.status}`)
  const chunks = []; let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.length
    if (bytes > MAX_ARCHIVE) throw new Error('Backend download exceeded size limit')
    chunks.push(Buffer.from(chunk))
  }
  return verifiedBinary(Buffer.concat(chunks), artifact)
}
export async function prepareBackends() {
  for (const [target, artifact] of Object.entries(contracts.slack.artifacts)) {
    const binary = await downloadArtifact(artifact)
    if (artifact.binarySha256 && sha256(binary) !== artifact.binarySha256) throw new Error(`Binary SHA-256 mismatch: ${target}`)
    const destination = new URL(`vendor/slk/${target}/`, root)
    await mkdir(destination, { recursive: true })
    const path = new URL(artifact.binary, destination)
    await writeFile(path, binary); await chmod(path, 0o755)
    console.log(`Verified ${target}: ${sha256(binary)}`)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await prepareBackends()
