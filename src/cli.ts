#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { packageInfo } from './package.js'
import { checkForUpdates } from './updates.js'
import { inspectBundledSlackStorage, requireSafeSlackBackend } from './storage.js'
import { Adapter, collect, filterMessages, search } from './adapters.js'
import { accountFor, addAccount, changeConfig, configPath, readConfig, selectAccounts } from './config.js'
import { run, type RunOptions } from './process.js'
import { exitCode, fail, failure, label, parseRef, positive, record, result, source, storedProfile, terminal, timeBound, type Account, type Result } from './model.js'

const HELP = `ConvoMux ${packageInfo.version} — read-only Teams + Slack CLI

Usage: cmx <command> [options]

  init                                      Create empty configuration
  config path                               Show configuration path
  account add teams --name work --profile work
  account add slack --name work --workspace company
  account list                              Show account mappings (no secrets)
  login teams [--name work] [--profile work] [--tenant ID]
  login slack --workspace company [--name work]
  doctor [--source all|teams|slack]           Validate configured sessions
  doctor --storage                          Offline bundled Slack storage diagnosis
  channels [--source all|teams|slack]        List channels
  chats [--source all|teams|slack]           List DM/group conversations
  messages <ref> [--limit 100] [--cursor C]  Fetch one bounded page
  thread <ref> <timestamp> [--limit 100]      Slack only; first page, includes parent
  track add <ref> | track remove <ref>       Manage explicit search targets
  track list                                List search targets
  search <query> [--since 7d]                Search tracked fetched pages only

Options:
  --json                    One schema-versioned JSON result on stdout
  --config PATH             Alternative configuration; also CMX_CONFIG
  --source all|teams|slack   Select configured sources (default all)
  --account NAME            Select an account alias
  --limit N                 Page size / per-conversation search cap (1–500; default 100)
  --cursor CURSOR           Slack continuation; channels/chats require one account
  --since 7d | --until ISO   Local date filter; ISO values require timezone
  --scope tracked           Only supported search scope (default tracked)
  --timeout MS              Per-backend timeout (default 30000; max 300000)
  --executable ABSOLUTE     Backend executable/.mjs path, for account add/login
  --help | --version

Search is NOT workspace-wide. Replies are not automatically expanded.
No send/edit/delete/API-passthrough commands. No AI or background sync.
Exit: 0 success, 1 backend failure, 2 usage/config, 3 partial success, 130 interrupted.
`
const STRINGS = ['config', 'source', 'account', 'name', 'profile', 'workspace', 'tenant', 'executable', 'limit', 'cursor', 'since', 'until', 'scope', 'timeout'] as const
const OPTIONS = Object.fromEntries(STRINGS.map(key => [key, { type: 'string' as const }]))
const ALLOWED: Record<string, string[]> = {
  init: [], 'config path': [], 'account list': [],
  'account add': ['name', 'profile', 'workspace', 'executable'],
  login: ['name', 'profile', 'workspace', 'tenant', 'executable', 'timeout'],
  doctor: ['source', 'account', 'timeout', 'storage'],
  channels: ['source', 'account', 'limit', 'cursor', 'timeout'],
  chats: ['source', 'account', 'limit', 'cursor', 'timeout'],
  messages: ['limit', 'cursor', 'since', 'until', 'timeout'],
  thread: ['limit', 'since', 'until', 'timeout'],
  search: ['source', 'account', 'limit', 'since', 'until', 'scope', 'timeout'],
  'track add': [], 'track remove': [], 'track list': [],
}
function argumentsFor(argv: string[]): { values: Record<string, string | boolean | undefined>; positionals: string[]; command: string } {
  let parsed
  try {
    parsed = parseArgs({ args: argv, options: { ...OPTIONS, json: { type: 'boolean' }, storage: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'V' } }, allowPositionals: true, strict: true })
  } catch { return fail('USAGE', 'Unknown option or missing option value. Run cmx --help. Do not pass credentials as arguments.') }
  const values = parsed.values as Record<string, string | boolean | undefined>
  const positionals = parsed.positionals
  const first = positionals[0] ?? ''
  const command = ['account', 'config', 'track'].includes(first) ? positionals.slice(0, 2).join(' ') : first
  if (!values.help && !values.version) {
    if (!ALLOWED[command]) return fail('USAGE', 'Unknown or missing command. Run cmx --help.')
    for (const key of Object.keys(values)) if (!['config', 'json'].includes(key) && !ALLOWED[command]!.includes(key)) return fail('USAGE', `Option --${key} is not valid for this command.`)
  }
  return { values, positionals, command }
}
function expected(args: string[], count: number): void {
  if (args.length !== count) fail('USAGE', 'Unexpected or missing positional arguments. Run cmx --help.')
}
function accountOptions(src: string, values: Record<string, string | boolean | undefined>): Account {
  const service = source(src)
  const profile = service === 'teams' ? values.profile ?? 'default' : values.workspace
  if (typeof profile !== 'string' || !profile) return fail('USAGE', 'Slack requires --workspace with its stored workspace name/subdomain.')
  if (service === 'teams' && values.workspace || service === 'slack' && (values.profile || values.tenant)) return fail('USAGE', 'Use --profile/--tenant for Teams and --workspace for Slack.')
  const account: Account = { source: service, name: label(String(values.name ?? profile)), profile: storedProfile(profile, service) }
  if (typeof values.executable === 'string') account.executable = resolve(values.executable)
  return account
}
export async function dispatch(argv: string[], signal?: AbortSignal): Promise<Result<unknown> | { help: string }> {
  if (!argv.length) return { help: HELP }
  const { values, positionals: args, command } = argumentsFor(argv)
  if (values.help) return { help: HELP }
  if (values.version) return values.json ? result([{ version: packageInfo.version }]) : { help: packageInfo.version + '\n' }
  const opt = (key: string): string | undefined => typeof values[key] === 'string' ? values[key] : undefined
  if (command === 'doctor' && values.storage) {
    expected(args, 1)
    if (values.account !== undefined || values.config !== undefined || values.timeout !== undefined || values.source !== undefined && values.source !== 'slack') return fail('USAGE', 'doctor --storage covers only the bundled Slack build; omit account/config/timeout and use --source slack or no source option. It does not inspect configured accounts or overrides.')
    return inspectBundledSlackStorage()
  }
  const path = configPath(opt('config'))
  const options: RunOptions = { timeout: positive(opt('timeout'), 30000, 300000), ...(signal ? { signal } : {}) }
  if (command === 'config path') { expected(args, 2); return result([{ path }]) }
  if (command === 'init') {
    expected(args, 1)
    await changeConfig(path, config => config)
    return result([{ path }])
  }
  if (command === 'account add' || command === 'login') {
    expected(args, command === 'login' ? 2 : 3)
    const account = accountOptions(args.at(-1)!, values)
    if (command === 'login') {
      await requireSafeSlackBackend(account)
      if (values.json || !process.stdin.isTTY || !process.stderr.isTTY) return fail('USAGE', 'Login requires an interactive terminal and does not support --json. No credential was requested.')
      const existing = await readConfig(path, true)
      const binding = existing.accounts.find(a => a.source === account.source && a.name === account.name)
      if (binding && (account.source === 'teams' ? JSON.stringify(binding) !== JSON.stringify(account) : binding.executable !== account.executable)) return fail('CONFIG', 'The account name already maps to another profile/executable. Use its existing mapping or a new name.')
      let loginArgs: string[]
      if (account.source === 'teams') {
        loginArgs = ['--profile', account.profile, 'login']
        if (opt('tenant')) {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u.test(opt('tenant')!)) return fail('USAGE', 'Tenant must be a UUID or tenant domain.')
          loginArgs.push('--tenant-id', opt('tenant')!)
        }
      } else {
        if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(account.profile)) return fail('USAGE', 'Slack browser login requires a workspace subdomain, not a URL.')
        loginArgs = ['--output', 'json', '--raw', 'auth', 'login', account.profile]
      }
      const loggedIn = await run(account, loginArgs, { ...options, timeout: positive(opt('timeout'), 300000, 300000), interactive: true, captureInteractiveOutput: account.source === 'slack' })
      if (account.source === 'slack') {
        const workspace = record(loggedIn).workspace
        if (typeof workspace !== 'string') return fail('INVALID_RESPONSE', 'Slack login returned no stored workspace name. Existing cmx configuration was not changed.')
        account.profile = storedProfile(workspace, 'slack')
      }
    }
    await addAccount(path, account)
    return result([{ source: account.source, account: account.name, profile: account.profile, action: command === 'login' ? 'login-completed' : 'registered-not-yet-verified' }])
  }
  const config = await readConfig(path)
  if (command === 'account list') { expected(args, 2); return result(config.accounts) }
  if (command === 'track list') { expected(args, 2); return result(config.tracked.map(ref => ({ ref }))) }
  if (command === 'track add' || command === 'track remove') {
    expected(args, 3)
    const ref = args[2]!, parsed = parseRef(ref)
    accountFor(config, parsed.source, parsed.account)
    await changeConfig(path, current => {
      if (command === 'track add' && !current.tracked.includes(ref)) current.tracked.push(ref)
      if (command === 'track remove') current.tracked = current.tracked.filter(item => item !== ref)
      return current
    })
    return result([{ ref, tracked: command === 'track add' }])
  }
  const limit = positive(opt('limit'), 100, 500)
  const now = Date.now(), since = timeBound(opt('since'), now), until = timeBound(opt('until'), now)
  if (since !== undefined && until !== undefined && since > until) return fail('USAGE', '--since must not be after --until.')
  const cursor = opt('cursor')
  if (cursor !== undefined && (!cursor || cursor.length > 4096 || /[\x00-\x20\x7f]/u.test(cursor))) return fail('USAGE', 'Invalid continuation cursor.')
  if (command === 'messages' || command === 'thread') {
    expected(args, command === 'messages' ? 2 : 3)
    const ref = parseRef(args[1]!)
    const account = accountFor(config, ref.source, ref.account)
    const page = await new Adapter(account, run, options).messages(ref, limit, cursor, command === 'thread' ? args[2] : undefined)
    const filtered = since === undefined && until === undefined ? page : filterMessages(page, undefined, since, until)
    return result(filtered.data, [filtered.coverage])
  }
  const accounts = selectAccounts(config, opt('source'), opt('account'))
  if (command === 'doctor') {
    expected(args, 1)
    return collect(accounts.map(account => ({ account, work: () => new Adapter(account, run, options).doctor() })))
  }
  if (command === 'channels' || command === 'chats') {
    expected(args, 1)
    if (cursor && accounts.length !== 1) return fail('USAGE', '--cursor requires exactly one selected account; use --source and --account.')
    return collect(accounts.map(account => ({ account, work: () => new Adapter(account, run, options).conversations(command === 'channels' ? 'channel' : 'chat', limit, cursor) })))
  }
  if (command === 'search') {
    expected(args, 2)
    if (opt('scope') && opt('scope') !== 'tracked') return fail('UNSUPPORTED', 'Only --scope tracked is supported. Workspace-wide search is not implemented.')
    return search(config, accounts, args[1]!, limit, options, since, until)
  }
  return fail('USAGE', 'Unknown command.')
}
export function render(value: Result<unknown>, json: boolean): void {
  if (json) process.stdout.write(JSON.stringify(value) + '\n')
  else {
    for (const raw of value.data) {
      const item = record(raw)
      if ('conversationId' in item) {
        process.stdout.write(terminal(`[${item.source}/${item.account}] ${item.createdAt ?? 'time unknown'} ${item.authorName ?? item.authorId ?? 'author unknown'}\n${item.ref} #${item.id}\n${item.text}\n${item.url ? String(item.url) + '\n' : ''}\n`))
      } else if ('name' in item && 'ref' in item) process.stdout.write(terminal(`${item.ref}\t${item.name}\n`))
      else process.stdout.write(terminal(JSON.stringify(item)) + '\n')
    }
    if (!value.data.length && value.status === 'ok') process.stdout.write('No items in the requested scope.\n')
    for (const c of value.coverage) if (!c.complete && c.requestedLimit) process.stderr.write(terminal(`[scope] ${c.ref ?? c.source + '/' + c.account}: fetched=${c.fetched}, returned=${c.returned}, more=${c.hasMore ?? 'unknown'}. ${c.limitations.join(', ')}${c.nextCursor ? '; cursor=' + c.nextCursor : ''}\n`))
  }
  for (const e of value.errors) process.stderr.write(terminal(`[${e.code}] ${e.source ? e.source + '/' + e.account + ': ' : ''}${e.message}\n`))
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (!argv.includes('--storage')) checkForUpdates(argv)
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  process.on('SIGINT', abort)
  process.on('SIGTERM', abort)
  try {
    const value = await dispatch(argv, controller.signal)
    if ('help' in value) process.stdout.write(value.help)
    else { render(value, argv.includes('--json')); process.exitCode = exitCode(value) }
  } catch (error) {
    const value = result<unknown>([], [], [failure(error)], 0)
    render(value, argv.includes('--json'))
    process.exitCode = exitCode(value)
  } finally { process.off('SIGINT', abort); process.off('SIGTERM', abort) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.stdout.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0); else process.exit(1) })
  await main()
}
