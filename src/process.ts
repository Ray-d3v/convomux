import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path'
import { CmxError, fail, type Account } from './model.js'

export interface Invocation { command: string; args: string[] }
export interface RunOptions { timeout: number; signal?: AbortSignal; interactive?: boolean; maxBytes?: number }
export type Runner = (account: Account, args: string[], options: RunOptions) => Promise<unknown>

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() } catch { return false }
}
export async function resolveExecutable(account: Account, platform = process.platform, pathValue = process.env.PATH ?? ''): Promise<Invocation> {
  let command = account.executable
  if (command && !isAbsolute(command)) return fail('CONFIG', 'Custom executable paths must be absolute.')
  if (!command) {
    const name = account.source === 'teams' ? 'teams' : 'slk'
    const suffixes = platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
    for (const entry of pathValue.split(platform === 'win32' ? ';' : delimiter).filter(Boolean)) {
      if (!isAbsolute(entry)) continue // Never implicitly execute a binary from the current directory.
      for (const suffix of suffixes) {
        const candidate = join(entry, name + suffix)
        if (await exists(candidate)) { command = candidate; break }
      }
      if (command) break
    }
  }
  if (!command || !await exists(command)) return fail('DEPENDENCY_MISSING', `Install ${account.source === 'teams' ? 'msteams (teams)' : 'osodevops/slack-cli (slk)'} or configure its absolute executable path.`)
  const extension = extname(command).toLowerCase()
  // npm's Windows .cmd shims need a shell. Resolve the known package entry instead.
  if (extension === '.cmd' && account.source === 'teams' && !account.executable) {
    const entry = join(dirname(command), 'node_modules', 'msteams', 'dist', 'cli', 'index.mjs')
    if (!await exists(entry)) return fail('DEPENDENCY_MISSING', 'Cannot resolve the msteams npm entry. Set --executable to its dist/cli/index.mjs file.')
    return { command: process.execPath, args: [entry] }
  }
  if (['.cmd', '.bat', '.ps1'].includes(extension)) return fail('CONFIG', 'Shell script shims are not executed. Configure a native executable or a .js/.mjs entry.')
  if (['.js', '.mjs', '.cjs'].includes(extension)) return { command: process.execPath, args: [command] }
  if (platform !== 'win32') {
    try { await access(command, constants.X_OK) } catch { return fail('DEPENDENCY_MISSING', 'The configured backend is not executable.') }
  }
  return { command, args: [] }
}
export function backendEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env, NO_COLOR: '1', SLK_ALLOW_WRITE: 'false' }
  // Environment credentials override stored profiles in the upstream tools. Do not cross accounts.
  for (const key of ['SLK_TOKEN', 'SLK_COOKIE', 'SLK_WORKSPACE', 'SLK_API_BASE_URL', 'ESTSAUTHPERSISTENT', 'REFRESH_TOKEN']) delete env[key as keyof typeof env]
  return env
}
export function backendError(body: string, code: number | null): CmxError {
  if (/invalid_auth|not_authed|token_revoked|account_inactive|invalid_grant|login required|no credentials|no token|refresh.token.*(?:missing|expired)|profile.*not found/iu.test(body)) return new CmxError('AUTHENTICATION', 'Authentication is missing or expired. Run cmx login for this account.')
  if (/ratelimited|rate.limit|retry.after|\b429\b/iu.test(body)) return new CmxError('RATE_LIMITED', 'The service rate limit was reached. Retry later; no automatic retry was attempted.')
  if (/missing_scope|access_denied|forbidden|enterprise_is_restricted|\b403\b/iu.test(body)) return new CmxError('FORBIDDEN', 'The service denied access. Existing account or organization permissions apply.')
  if (/channel_not_found|not_in_channel/iu.test(body)) return new CmxError('NOT_FOUND', 'The conversation is unavailable to this account.')
  return new CmxError('BACKEND_FAILED', `Backend command failed (exit ${code ?? 'signal'}). Check its setup and account locally.`)
}
export async function execute(invocation: Invocation, args: string[], options: RunOptions): Promise<string> {
  if (options.signal?.aborted) return fail('INTERRUPTED', 'Operation interrupted.')
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.args, ...args], {
      shell: false, windowsHide: !options.interactive, env: backendEnvironment(),
      stdio: options.interactive ? ['inherit', 2, 2] : ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = '', bytes = 0
    let stopped: CmxError | undefined
    let escalation: NodeJS.Timeout | undefined
    const stop = (error: CmxError): void => {
      if (stopped) return
      stopped = error
      child.kill('SIGTERM')
      escalation = setTimeout(() => { child.kill('SIGKILL') }, 250)
      escalation.unref()
    }
    const timer = setTimeout(() => stop(new CmxError('TIMEOUT', 'Backend command timed out.')), options.timeout)
    const abort = (): void => stop(new CmxError('INTERRUPTED', 'Operation interrupted.'))
    options.signal?.addEventListener('abort', abort, { once: true })
    const cleanup = (): void => { clearTimeout(timer); if (escalation) clearTimeout(escalation); options.signal?.removeEventListener('abort', abort) }
    const consume = (chunk: Buffer, output: boolean): void => {
      bytes += chunk.length
      if (bytes > (options.maxBytes ?? 8 * 1024 * 1024)) { stop(new CmxError('OUTPUT_LIMIT', 'Backend output exceeded the safety limit. Use a smaller --limit.')); return }
      if (output) stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8')
    }
    // StringDecoder via setEncoding preserves characters split across chunks.
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => consume(Buffer.from(chunk), true))
    child.stderr?.on('data', (chunk: string) => consume(Buffer.from(chunk), false))
    child.once('error', () => { cleanup(); reject(new CmxError('DEPENDENCY_MISSING', 'Could not start the backend executable.')) })
    child.once('close', (code, signal) => {
      cleanup()
      if (stopped) reject(stopped)
      else if (signal === 'SIGINT') reject(new CmxError('INTERRUPTED', 'Operation interrupted.'))
      else if (code !== 0) reject(backendError(stdout + '\n' + stderr, code))
      else resolve(stdout)
    })
    if (options.signal?.aborted) abort()
  })
}
export const run: Runner = async (account, args, options) => {
  const output = await execute(await resolveExecutable(account), args, options)
  if (options.interactive) return null
  try { return JSON.parse(output) as unknown } catch { return fail('INVALID_RESPONSE', 'Backend did not return valid JSON. No raw output has been printed.') }
}
