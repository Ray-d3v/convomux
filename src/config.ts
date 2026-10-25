import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CmxError, fail, label, parseRef, record, source, storedProfile, type Account, type Config, type Source } from './model.js'

export function configPath(explicit?: string): string {
  if (explicit || process.env.CMX_CONFIG) return resolve(explicit ?? process.env.CMX_CONFIG!)
  const base = process.platform === 'win32' ? process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local') : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'convomux', 'config.json')
}
export function emptyConfig(): Config { return { schemaVersion: 1, accounts: [], tracked: [] } }
function keys(object: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(object).some(k => !allowed.includes(k))) fail('CONFIG', 'Unknown configuration fields. Do not store credentials in cmx configuration.')
}
export function validateConfig(value: unknown): Config {
  try {
    const raw = record(value)
    keys(raw, ['schemaVersion', 'accounts', 'tracked'])
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.accounts) || !Array.isArray(raw.tracked)) return fail('CONFIG', 'Expected schemaVersion 1, accounts and tracked arrays.')
    if (raw.accounts.length > 32 || raw.tracked.length > 100) return fail('CONFIG', 'Configuration allows at most 32 accounts and 100 tracked conversations.')
    const accounts = raw.accounts.map((item: unknown): Account => {
      const a = record(item)
      keys(a, ['source', 'name', 'profile', 'executable'])
      if (typeof a.source !== 'string' || typeof a.name !== 'string' || typeof a.profile !== 'string') return fail('CONFIG', 'Each account needs source, name and profile strings.')
      const service = source(a.source)
      const account: Account = { source: service, name: label(a.name), profile: storedProfile(a.profile, service) }
      if (a.executable !== undefined) {
        if (typeof a.executable !== 'string' || !isAbsolute(a.executable) || /[\x00-\x1f]/u.test(a.executable)) return fail('CONFIG', 'executable must be an absolute local path.')
        account.executable = a.executable
      }
      return account
    })
    if (new Set(accounts.map(a => `${a.source}/${a.name}`)).size !== accounts.length) return fail('CONFIG', 'Account source/name pairs must be unique.')
    const tracked = raw.tracked.map((value: unknown) => {
      if (typeof value !== 'string') return fail('CONFIG', 'Tracked entries must be conversation refs.')
      const ref = parseRef(value)
      if (!accounts.some(a => a.source === ref.source && a.name === ref.account)) return fail('CONFIG', 'A tracked ref references an unconfigured account.')
      return value
    })
    if (new Set(tracked).size !== tracked.length) return fail('CONFIG', 'Tracked refs must be unique.')
    return { schemaVersion: 1, accounts, tracked }
  } catch (error) {
    if (error instanceof CmxError && error.code === 'CONFIG') throw error
    return fail('CONFIG', 'Invalid configuration. Expected documented source, account and ref formats.')
  }
}
export async function readConfig(path: string, allowMissing = false): Promise<Config> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 131072) return fail('CONFIG', 'Configuration must be a regular file smaller than 128 KiB, not a symbolic link.')
    return validateConfig(JSON.parse(await readFile(path, 'utf8')) as unknown)
  } catch (error) {
    if (error instanceof CmxError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (allowMissing) return emptyConfig()
      return fail('NOT_CONFIGURED', 'Run cmx account add or cmx login to configure an account.')
    }
    return fail('CONFIG', 'Could not read configuration. Check its JSON syntax and file permissions.')
  }
}
export async function changeConfig(path: string, change: (config: Config) => Config): Promise<Config> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  let lock
  try { lock = await open(`${path}.lock`, 'wx', 0o600) } catch { return fail('CONFIG_LOCKED', 'Cannot acquire the configuration lock. Check permissions or a concurrent cmx process; see README before removing a stale lock.') }
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const next = validateConfig(change(await readConfig(path, true)))
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(next, null, 2) + '\n'); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
    return next
  } finally {
    await lock.close()
    await unlink(temporary).catch(() => undefined)
    await unlink(`${path}.lock`).catch(() => undefined)
  }
}
export async function addAccount(path: string, account: Account): Promise<Config> {
  return changeConfig(path, config => {
    const existing = config.accounts.find(a => a.source === account.source && a.name === account.name)
    if (existing && JSON.stringify(existing) !== JSON.stringify(account)) return fail('CONFIG', 'That account name is already bound to another profile or executable. Use a new account name.')
    if (!existing) config.accounts.push(account)
    return config
  })
}
export function selectAccounts(config: Config, requestedSource = 'all', account?: string): Account[] {
  if (requestedSource !== 'all') source(requestedSource)
  if (account !== undefined) label(account)
  const selected = config.accounts.filter(a => (requestedSource === 'all' || a.source === requestedSource) && (!account || a.name === account))
  if (!selected.length) return fail('NOT_CONFIGURED', 'No configured account matches --source/--account.')
  return selected
}
export function accountFor(config: Config, src: Source, name: string): Account {
  return config.accounts.find(a => a.source === src && a.name === name) ?? fail('NOT_CONFIGURED', 'The conversation account is not configured.')
}
