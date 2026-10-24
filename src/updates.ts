import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { packageInfo } from './package.js'

const DAY = 86400000
export interface UpdateCache { checkedAt: number; latest?: string }
export function updateCachePath(): string {
  const base = process.platform === 'win32' ? process.env.LOCALAPPDATA : process.env.XDG_CACHE_HOME
  return join(base && isAbsolute(base) ? base : join(homedir(), '.cache'), 'convomux', 'updates.json')
}
export function newerStable(latest: unknown, current = packageInfo.version): latest is string {
  return typeof latest === 'string' && Boolean(semver.valid(latest)) && !semver.prerelease(latest) && Boolean(semver.valid(current)) && semver.gt(latest, current)
}
export function writeUpdateCache(path: string, value: UpdateCache): void {
  const temporary = `${path}.${process.pid}.tmp`
  try { writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }); renameSync(temporary, path) }
  finally { try { unlinkSync(temporary) } catch { /* Already renamed. */ } }
}
export function checkForUpdates(argv: string[]): void {
  // Gate before reading caches or loading any network implementation.
  if (argv.includes('--json') || argv.includes('--json=true') || !process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY ||
    ['CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER', 'GITHUB_ACTIONS', 'TF_BUILD', 'NO_UPDATE_NOTIFIER', 'CMX_NO_UPDATE_NOTIFIER'].some(key => key in process.env) || process.env.NODE_ENV === 'test') return
  const path = updateCachePath(), now = Date.now()
  let locked = false
  try {
    mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 })
    closeSync(openSync(path + '.lock', 'wx', 0o600)); locked = true
    let cache: UpdateCache = { checkedAt: 0 }
    try { cache = JSON.parse(readFileSync(path, 'utf8')) as UpdateCache } catch { /* First run or invalid cache. */ }
    if (newerStable(cache.latest)) process.stderr.write(`ConvoMux ${cache.latest} is available (current ${packageInfo.version}). Run npm install -g ${packageInfo.name}@latest\n`)
    if (Number.isFinite(cache.checkedAt) && now - cache.checkedAt < DAY && cache.checkedAt <= now + DAY) return
    // Cache attempts as well as successes, so offline/unpublished installs check at most daily.
    writeUpdateCache(path, { checkedAt: now, ...(newerStable(cache.latest) ? { latest: cache.latest } : {}) })
    const child = spawn(process.execPath, [fileURLToPath(new URL('./update-worker.js', import.meta.url)), String(now)], {
      shell: false, detached: true, windowsHide: true, stdio: 'ignore',
      // Never pass credentials, account state, NODE_OPTIONS or npm authentication to the worker.
      env: Object.fromEntries(['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'SystemRoot', 'SYSTEMROOT', 'TMP', 'TEMP'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]])),
    })
    child.on('error', () => { /* Update checks never fail a CLI command. */ }); child.unref()
  } catch { /* Read-only home, lock contention and spawn failure are harmless. */ }
  finally { if (locked) try { unlinkSync(path + '.lock') } catch { /* Best effort. */ } }
}
