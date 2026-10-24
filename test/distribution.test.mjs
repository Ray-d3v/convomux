import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { Header } from 'tar'
import { zipSync } from 'fflate'
import { verifiedBinary, sha256 } from '../scripts/backend-artifacts.mjs'
import { slackTarget } from '../dist/backends.js'

test('Slack selects only published native targets and refuses architecture fallback', () => {
  for (const [platform, arch, binary] of [['win32','x64','slk.exe'],['darwin','arm64','slk'],['darwin','x64','slk'],['linux','x64','slk'],['linux','arm64','slk']]) {
    assert.deepEqual(slackTarget(platform, arch), { target: `${platform}-${arch}`, binary })
  }
  for (const [platform, arch] of [['win32','arm64'],['linux','ia32'],['freebsd','x64']]) assert.throws(() => slackTarget(platform, arch), e => e.code === 'UNSUPPORTED')
})
function tarBytes(path, type = 'File', linkpath) {
  const content = Buffer.from('synthetic binary'), header = new Header({ path, type, linkpath, size: type === 'File' ? content.length : 0, mode: 0o755 })
  header.encode()
  return gzipSync(Buffer.concat([header.block, ...(type === 'File' ? [content, Buffer.alloc(512-content.length)] : []), Buffer.alloc(1024)]))
}
test('archive boundary verifies hashes before accepting only one regular backend file', async () => {
  for (const format of ['zip','tar.gz']) {
    const bytes = format === 'zip' ? Buffer.from(zipSync({ slk: Buffer.from('synthetic binary') })) : tarBytes('slk')
    const artifact = { binary: 'slk', format, sha256: sha256(bytes) }
    assert.equal((await verifiedBinary(bytes, artifact)).toString(), 'synthetic binary')
    await assert.rejects(verifiedBinary(bytes, { ...artifact, sha256: '0'.repeat(64) }), /SHA-256/)
    for (const name of ['../slk','/slk','C:\\slk','nested/slk','slk:stream']) {
      const unsafe = format === 'zip' ? Buffer.from(zipSync({ [name]: Buffer.from('bad') })) : tarBytes(name)
      await assert.rejects(verifiedBinary(unsafe, { ...artifact, sha256: sha256(unsafe) }), /Unsafe/)
    }
  }
  for (const type of ['SymbolicLink','Link','Directory']) {
    const bytes = tarBytes('slk', type, type === 'Directory' ? undefined : '../escape')
    await assert.rejects(verifiedBinary(bytes, { binary: 'slk', format: 'tar.gz', sha256: sha256(bytes) }), /Unsafe/)
  }
  const empty = Buffer.from(zipSync({}))
  await assert.rejects(verifiedBinary(empty, { binary: 'slk', format: 'zip', sha256: sha256(empty) }), /missing/)
})
