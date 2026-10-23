import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, stat, symlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Adapter, collect, filterMessages, search } from '../dist/adapters.js'
import { CmxError, exitCode, makeRef, parseRef, result, terminal, text, timeBound } from '../dist/model.js'
import { addAccount, changeConfig, readConfig, selectAccounts, validateConfig } from '../dist/config.js'
import { backendEnvironment, execute, resolveExecutable, run } from '../dist/process.js'

const teams = { source: 'teams', name: 'work', profile: 'work' }
const slack = { source: 'slack', name: 'work', profile: 'company' }
const tr = { source: 'teams', account: 'work', kind: 'channel', id: '19:abc@thread.tacv2' }
const sr = { source: 'slack', account: 'work', kind: 'channel', id: 'C123' }
const coverage = { source: 'slack', account: 'work', requestedLimit: 2, fetched: 0, returned: 0, hasMore: false, nextCursor: null, complete: false, limitations: [] }
async function temporary(t) { const dir = await mkdtemp(join(tmpdir(), 'cmx-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir }
const fails = code => e => e instanceof CmxError && e.code === code

test('conversation refs preserve native IDs and isolate same-name accounts', () => {
  assert.deepEqual(parseRef(makeRef(tr)), tr)
  assert.deepEqual(parseRef(makeRef({ ...tr, id: '19:a/b#日本語@thread.v2' })), { ...tr, id: '19:a/b#日本語@thread.v2' })
  assert.notEqual(makeRef(tr), makeRef(sr))
  assert.throws(() => parseRef('slack/work/channel/%'), fails('USAGE'))
  assert.throws(() => parseRef('slack/work/channel/C123/extra'), fails('USAGE'))
  assert.throws(() => parseRef('slack/../channel/C123'), fails('USAGE'))
  assert.throws(() => parseRef('slack/work/channel/%2D%2Dhelp'))
})
test('time bounds require explicit timezone and valid duration', () => {
  assert.equal(timeBound('7d', 1000000000), 395200000)
  assert.equal(timeBound('2026-10-23T09:00:00+09:00'), Date.parse('2026-10-23T00:00:00Z'))
  for (const value of ['2026-10-23', '2026-10-23T09:00:00', '0d', '-2d', '7garbage', '999999999999999d']) assert.throws(() => timeBound(value), fails('USAGE'))
})
test('text preview handles HTML/Japanese/entities and removes scripts', () => {
  assert.equal(text('<p>障害 &amp; &#x5BFE;&#24540;</p><script>secret()</script>', true), '障害 & 対応')
  assert.equal(text('<@U123> &lt;hello&gt;'), '<@U123> <hello>')
  assert.equal(text('&bogus; &#x110000;'), '&bogus; &#x110000;')
})
test('human output strips ANSI/OSC and bidirectional override characters', () => {
  assert.equal(terminal('\x1b[31mred\x1b[0m\x1b]52;c;payload\x07\u202E!'), 'red!')
})
test('Teams globals precede command and snapshot discovery retains tenant', async () => {
  const calls = []
  const adapter = new Adapter(teams, async (_, args) => {
    calls.push(args)
    return { command: 'me', data: { teams: [{ id: 'T1', tenantId: 'tenant-1', channels: [{ id: tr.id, displayName: 'General' }] }], chats: [{ id: '19:dm', threadProperties: { topic: 'Support' } }] } }
  })
  const page = await adapter.conversations('channel', 20)
  assert.deepEqual(calls[0], ['--profile', 'work', '--json', '--no-color', 'me'])
  assert.equal(page.data[0].tenantId, 'tenant-1')
  assert.equal(page.coverage.complete, false)
  assert.equal(page.coverage.hasMore, null)
  assert.equal((await adapter.conversations('chat', 20)).data[0].name, 'Support')
})
test('Teams channel and chat histories use different response shapes', async () => {
  const native = { id: '1700000000000', from: '8:orgid:U1', imdisplayname: 'A', content: '<p>障害対応</p>', messagetype: 'RichText/Html', composetime: '2026-10-22T00:00:00Z' }
  const calls = []
  const adapter = new Adapter(teams, async (_, args) => {
    calls.push(args)
    return { command: 'messages', data: args.includes('channel') ? [native, native] : { messages: [native] } }
  })
  const page = await adapter.messages(tr, 20)
  assert.equal(page.data.length, 1)
  assert.equal(page.data[0].text, '障害対応')
  assert.equal(page.coverage.fetched, 2)
  assert.equal(page.coverage.hasMore, null)
  assert.equal(page.data[0].url, null)
  await adapter.messages({ ...tr, kind: 'chat' }, 20)
  assert.deepEqual(calls[1].slice(4), ['messages', tr.id, '--limit', '20'])
  await assert.rejects(adapter.messages(tr, 10, 'cursor'), fails('UNSUPPORTED'))
  await assert.rejects(adapter.messages(tr, 10, undefined, 'thread'), fails('UNSUPPORTED'))
})
test('schema mismatch is an error rather than an empty successful search', async () => {
  await assert.rejects(new Adapter(teams, async () => ({ command: 'messages', data: {} })).messages({ ...tr, kind: 'chat' }, 10), fails('INVALID_RESPONSE'))
  await assert.rejects(new Adapter(slack, async () => ({ ok: true })).messages(sr, 10), fails('INVALID_RESPONSE'))
  await assert.rejects(new Adapter(slack, async () => ({ ok: false, error: 'invalid_auth', token: 'DO-NOT-PRINT' })).messages(sr, 10), e => e.code === 'AUTHENTICATION' && !e.message.includes('DO-NOT-PRINT'))
})
test('Slack raw history preserves pagination and exact timestamp IDs', async () => {
  let argv
  const adapter = new Adapter(slack, async (_, args) => {
    argv = args
    return { ok: true, messages: [{ ts: '1700000000.000001', user: 'U1', text: 'deploy' }], has_more: true, response_metadata: { next_cursor: 'next==' } }
  })
  const page = await adapter.messages(sr, 15, 'previous==')
  assert.equal(page.data[0].id, '1700000000.000001')
  assert.equal(page.coverage.hasMore, true)
  assert.equal(page.coverage.nextCursor, 'next==')
  assert.ok(argv.includes('conversations.history'))
  assert.ok(argv.includes('cursor=previous=='))
  assert.ok(argv.indexOf('--raw') < argv.indexOf('api'))
  assert.ok(page.coverage.limitations.includes('thread-replies-not-expanded'))
})
test('Slack conversations select channels and DMs separately', async () => {
  let argv
  const adapter = new Adapter(slack, async (_, args) => { argv = args; return { ok: true, channels: [{ id: 'D1', user: 'U2' }], response_metadata: { next_cursor: '' } } })
  const page = await adapter.conversations('chat', 50)
  assert.ok(argv.includes('types=im,mpim'))
  assert.equal(page.data[0].name, 'U2')
  assert.equal(page.coverage.complete, true)
})
test('Slack thread command avoids floating-point coercion and states coverage limits', async () => {
  let argv
  const page = await new Adapter(slack, async (_, args) => { argv = args; return [{ ts: '1700000000.000001', text: 'root' }] }).messages(sr, 10, undefined, '1700000000.000001')
  assert.ok(argv.includes('1700000000.000001'))
  assert.ok(argv.includes('thread'))
  assert.equal(page.coverage.hasMore, null)
  assert.ok(page.coverage.limitations.includes('parent-message-included'))
})
test('partial failure retains successful empty results and nonzero exit status', async () => {
  const partial = await collect([{ account: slack, work: async () => ({ data: [], coverage }) }, { account: teams, work: async () => { throw new CmxError('AUTHENTICATION', 'Login required.') } }])
  assert.equal(partial.status, 'partial')
  assert.equal(partial.ok, false)
  assert.equal(exitCode(partial), 3)
  assert.equal(partial.errors[0].source, 'teams')
  assert.equal(exitCode(result([], [], [{ code: 'USAGE', message: 'bad' }], 0)), 2)
  assert.equal(exitCode(result([], [], [{ code: 'TIMEOUT', message: 'bad' }], 0)), 1)
  assert.equal(exitCode(result([], [], [{ code: 'INTERRUPTED', message: 'bad' }], 0)), 130)
})
test('aggregate byte limit stops further calls without losing existing results', async () => {
  let extraCalled = false
  const response = await collect([
    { account: slack, work: async () => ({ data: ['ok'], coverage }) },
    { account: teams, work: async () => ({ data: ['x'.repeat(1000)], coverage }) },
    { account: teams, work: async () => { extraCalled = true; return { data: [], coverage } } },
  ], 100)
  assert.deepEqual(response.data, ['ok'])
  assert.equal(response.status, 'partial')
  assert.equal(extraCalled, false)
  assert.deepEqual(response.errors.map(e => e.code), ['OUTPUT_LIMIT', 'NOT_ATTEMPTED'])
})
test('search is literal, Unicode-normalized, tracked-only, with explicit unknown dates', async () => {
  const config = { schemaVersion: 1, accounts: [slack, teams], tracked: [makeRef(sr), makeRef(tr)] }
  const response = await search(config, [slack, teams], '障害', 20, { timeout: 100 }, undefined, undefined, async account => account.source === 'slack'
    ? { ok: true, messages: [{ ts: '1700000000.000001', text: '障害対応' }], has_more: false }
    : { command: 'channel-messages', data: [{ id: 'M1', content: '<p>障害復旧</p>' }] })
  assert.equal(response.data.length, 2)
  assert.ok(response.coverage.every(c => c.limitations.includes('tracked-conversations-only')))
  assert.ok(response.coverage.every(c => c.complete === false))
  const page = { data: [{ text: 'ＡＢＣ[.*]', createdAt: null }, { text: 'abc', createdAt: '2026-10-22T00:00:00Z' }], coverage }
  assert.equal(filterMessages(page, '[.*]').data.length, 1)
  assert.equal(filterMessages(page, 'abc').data.length, 2)
  assert.equal(filterMessages(page, undefined, 0).data.length, 1)
  assert.ok(filterMessages(page, undefined, 0).coverage.limitations.includes('unknown-timestamps-excluded:1'))
})
test('config validates schema, binds identities and excludes credential fields', () => {
  assert.throws(() => validateConfig({ schemaVersion: 1, accounts: [slack], tracked: [], token: 'secret' }), fails('CONFIG'))
  assert.throws(() => validateConfig({ schemaVersion: 1, accounts: [slack, slack], tracked: [] }), fails('CONFIG'))
  assert.throws(() => validateConfig({ schemaVersion: 1, accounts: [], tracked: [makeRef(sr)] }), fails('CONFIG'))
  assert.throws(() => selectAccounts({ accounts: [slack] }, 'all', ''), fails('USAGE'))
})
test('config updates are private, atomic, idempotent, and lock-protected', async t => {
  const path = join(await temporary(t), 'config.json')
  await addAccount(path, slack); await addAccount(path, slack)
  assert.equal((await readConfig(path)).accounts.length, 1)
  await assert.rejects(addAccount(path, { ...slack, profile: 'other' }), fails('CONFIG'))
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600)
  await writeFile(path + '.lock', '')
  await assert.rejects(changeConfig(path, x => x), fails('CONFIG_LOCKED'))
  assert.equal((await readConfig(path)).accounts.length, 1)
  const raw = await readFile(path, 'utf8')
  assert.ok(!raw.includes('token'))
})
test('runner treats shell metacharacters as literal arguments', async () => {
  const payload = 'a b; echo SECRET & $(whoami) "日本語"'
  const out = await execute({ command: process.execPath, args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))'] }, [payload], { timeout: 3000 })
  assert.deepEqual(JSON.parse(out), [payload])
})
test('runner caps stdout/stderr, times out, and does not disclose failure bodies', async () => {
  await assert.rejects(execute({ command: process.execPath, args: ['-e', 'setInterval(()=>{},100)'] }, [], { timeout: 50 }), fails('TIMEOUT'))
  await assert.rejects(execute({ command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(10000))'] }, [], { timeout: 3000, maxBytes: 200 }), fails('OUTPUT_LIMIT'))
  await assert.rejects(execute({ command: process.execPath, args: ['-e', 'console.error("invalid_auth xoxc-VERY-SECRET"); process.exitCode=1'] }, [], { timeout: 3000 }), e => e.code === 'AUTHENTICATION' && !e.message.includes('SECRET'))
})
test('runner handles aborted operations and invalid JSON safely', async t => {
  const c = new AbortController(); c.abort()
  await assert.rejects(execute({ command: process.execPath, args: [] }, [], { timeout: 100, signal: c.signal }), fails('INTERRUPTED'))
  const file = join(await temporary(t), 'backend.mjs')
  await writeFile(file, 'console.log("SECRET invalid json")')
  await assert.rejects(run({ ...slack, executable: file }, [], { timeout: 3000 }), e => e.code === 'INVALID_RESPONSE' && !e.message.includes('SECRET'))
})
test('environment overrides cannot silently select a different account or endpoint', () => {
  const keys = ['SLK_TOKEN', 'SLK_COOKIE', 'SLK_WORKSPACE', 'SLK_API_BASE_URL', 'ESTSAUTHPERSISTENT', 'REFRESH_TOKEN']
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]))
  try { for (const key of keys) process.env[key] = 'secret'; const env = backendEnvironment(); for (const key of keys) assert.equal(env[key], undefined); assert.equal(env.SLK_ALLOW_WRITE, 'false') }
  finally { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key] }
})
test('custom JS entrypoints are launched through Node; shell shims are rejected', async t => {
  const dir = await temporary(t), file = join(dir, 'with space.mjs')
  await writeFile(file, '')
  assert.deepEqual(await resolveExecutable({ ...teams, executable: file }), { command: process.execPath, args: [file] })
  const shim = join(dir, 'teams.cmd'); await writeFile(shim, '')
  await assert.rejects(resolveExecutable({ ...teams, executable: shim }), fails('CONFIG'))
  const entry = join(dir, 'node_modules', 'msteams', 'dist', 'cli', 'index.mjs')
  await mkdir(join(dir, 'node_modules', 'msteams', 'dist', 'cli'), { recursive: true }); await writeFile(entry, '')
  assert.deepEqual(await resolveExecutable(teams, 'win32', dir), { command: process.execPath, args: [entry] })
})
test('config symlinks are not followed', { skip: process.platform === 'win32' }, async t => {
  const dir = await temporary(t), file = join(dir, 'real.json'), link = join(dir, 'link.json')
  await writeFile(file, JSON.stringify({ schemaVersion: 1, accounts: [], tracked: [] }))
  await symlink(file, link)
  await assert.rejects(readConfig(link), fails('CONFIG'))
})
test('missing pagination metadata is unknown, not proof of completion', async () => {
  const page = await new Adapter(slack, async () => ({ ok: true, channels: [] })).conversations('channel', 10)
  assert.equal(page.coverage.hasMore, null)
  assert.equal(page.coverage.complete, false)
  await assert.rejects(new Adapter(slack, async () => ({ ok: true, channels: [], response_metadata: { next_cursor: 123 } })).conversations('channel', 10), fails('INVALID_RESPONSE'))
})
test('rate-limited accounts stop making calls while other services continue', async () => {
  let skippedCalled = false
  const response = await collect([
    { account: slack, work: async () => { throw new CmxError('RATE_LIMITED', 'Retry later.') } },
    { account: slack, work: async () => { skippedCalled = true; return { data: [], coverage } } },
    { account: teams, work: async () => ({ data: ['ok'], coverage }) },
  ])
  assert.equal(skippedCalled, false)
  assert.equal(response.status, 'partial')
  assert.deepEqual(response.data, ['ok'])
})
test('an interrupt returns 130 even after partial results', () => {
  assert.equal(exitCode(result(['ok'], [], [{ code: 'INTERRUPTED', message: 'Interrupted.' }], 1)), 130)
})
