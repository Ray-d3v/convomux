import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fail, record, type Account } from './model.js'
import { slackTarget } from './backends.js'

interface PatchContract {
  upstreamCommit: string; sourceArchiveSha256: string; patchedVersion: string
  patchSha256: string; rustToolchain: string; patchedFiles: Record<string, string>
  persistentTargets: string[]
}
export const secureSlkContract = JSON.parse(readFileSync(new URL('../patches/slk/contract.json', import.meta.url), 'utf8')) as PatchContract
const vendor = fileURLToPath(new URL('../vendor/slk/', import.meta.url))
const blocked = (): never => fail('CREDENTIAL_STORAGE_BLOCKED', 'Slack login and reads require the verified patched backend with persistent OS storage and strict requested-profile failure. No unverified executable override is accepted. Existing credentials were not accessed or changed.')

export interface SecureBuild {
  target: string; binary: string; binarySha256: string
  patchedVersion: string; patchSha256: string; persistentOsStoreBuild: boolean
}
export function validateSecureBuild(raw: unknown, target: string): SecureBuild {
  const value = record(raw), contract = secureSlkContract
  const triples: Record<string, string> = { 'win32-x64': 'x86_64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu' }
  if (value.target !== target || value.binary !== (target.startsWith('win32') ? 'slk.exe' : 'slk') ||
      value.triple !== triples[target] || value.upstreamCommit !== contract.upstreamCommit || value.sourceArchiveSha256 !== contract.sourceArchiveSha256 ||
      value.patchedVersion !== contract.patchedVersion || value.patchSha256 !== contract.patchSha256 ||
      value.rustToolchain !== contract.rustToolchain || typeof value.rustc !== 'string' || !value.rustc.startsWith(`rustc ${contract.rustToolchain} `) ||
      value.repository !== 'Ray-d3v/convomux' || typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.sourceCommit) ||
      value.mockStorageTestsPassed !== true || value.nativeHelpVersionPassed !== true || value.nativeVaultOrRealAccountsAccessed !== false ||
      value.persistentOsStoreBuild !== contract.persistentTargets.includes(target) ||
      typeof value.binarySha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.binarySha256)) return blocked()
  const build = record(value.build)
  if (build.locked !== true || build.release !== true || build.lto !== 'thin' || build.codegenUnits !== 16 || build.incremental !== false || build.pathRemapping !== '/cmx-source') return blocked()
  const files = record(value.patchedFiles)
  for (const [path, digest] of Object.entries(contract.patchedFiles)) if (files[path] !== digest) return blocked()
  return value as unknown as SecureBuild
}
export async function packagedSecureBuild(target: string): Promise<SecureBuild> {
  try {
    const manifest = record(JSON.parse(await readFile(join(vendor, 'secure-builds.json'), 'utf8')))
    if (manifest.schemaVersion !== 1) return blocked()
    if (!secureSlkContract.persistentTargets.includes(target)) return fail('UNSUPPORTED', 'Slack authentication is unavailable on this OS: the pinned Linux kernel keyring does not provide secure persistent storage. No plaintext fallback or other account is attempted.')
    const build = validateSecureBuild(record(manifest.builds)[target], target)
    if (!build.persistentOsStoreBuild) return blocked()
    const bytes = await readFile(join(vendor, target, build.binary))
    if (bytes.length > 50 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== build.binarySha256) return blocked()
    return build
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'UNSUPPORTED') throw error
    return blocked()
  }
}
export async function authorizeSlack(account: Account): Promise<void> {
  if (account.source !== 'slack') return
  // Script overrides cannot satisfy a native, source/patch-bound binary contract.
  if (account.executable && ['.js', '.mjs', '.cjs', '.cmd', '.bat', '.ps1'].includes(extname(account.executable).toLowerCase())) return blocked()
  const { target } = slackTarget(process.platform, process.arch)
  if (account.executable && !secureSlkContract.persistentTargets.includes(target)) return blocked()
  const build = await packagedSecureBuild(target)
  try {
    const path = account.executable ?? join(vendor, target, build.binary)
    const info = await stat(path)
    if (!info.isFile() || info.size > 50 * 1024 * 1024) return blocked()
    const digest = createHash('sha256').update(await readFile(path)).digest('hex')
    if (digest !== build.binarySha256) return blocked()
  } catch { return blocked() }
}
