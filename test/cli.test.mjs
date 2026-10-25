import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const backend = fileURLToPath(new URL('./fixtures/backend.mjs', import.meta.url))
const tRef = 'teams/work/channel/19%3Aexample%40thread.tacv2'
const sRef = 'slack/work/channel/C123'
async function fixture(t, empty = false) {
  const dir = await mkdtemp(join(tmpdir(), 'cmx-cli-')), config = join(dir, 'config.json')
  t.after(() => rm(dir, { force: true, recursive: true }))
  if (!empty) await writeFile(config, JSON.stringify({ schemaVersion: 1, accounts: [
    { source: 'teams', name: 'work', profile: 'work', executable: backend },
    { source: 'slack', name: 'work', profile: 'company', executable: backend },
  ], tracked: [tRef, sRef] }))
  return { dir, config }
}
function invoke(config, args) {
  const out = spawnSync(process.execPath, [cli, '--config', config, ...args], { encoding: 'utf8', timeout: 10000 })
  assert.equal(out.error, undefined)
  return { ...out, json: args.includes('--json') ? JSON.parse(out.stdout) : undefined }
}
test('CLI --help and --version require neither config nor backends', t => {
  assert.match(invoke('not-present', ['--help']).stdout, /ConvoMux/)
  assert.equal(invoke('not-present', ['--version']).stdout.trim(), '0.1.0')
  assert.equal(invoke('not-present', ['--version', '--json']).json.data[0].version, '0.1.0')
})
test('CLI preserves Teams subprocess reads and partial results while Slack is blocked', async t => {
  const { config } = await fixture(t)
  const doctor = invoke(config, ['doctor', '--json'])
  assert.equal(doctor.status, 3)
  assert.equal(doctor.json.data.length, 1)
  assert.equal(doctor.json.errors[0].code, 'CREDENTIAL_STORAGE_BLOCKED')
  const channels = invoke(config, ['channels', '--json'])
  assert.equal(channels.status, 3)
  assert.deepEqual(channels.json.data.map(c => c.ref), [tRef])
  assert.equal(invoke(config, ['chats', '--json']).json.data.length, 1)
  assert.equal(invoke(config, ['messages', tRef, '--json']).json.data[0].text, '障害対応を確認')
  const thread = invoke(config, ['thread', sRef, '1792627200.000001', '--json'])
  assert.equal(thread.status, 1)
  assert.equal(thread.json.errors[0].code, 'CREDENTIAL_STORAGE_BLOCKED')
})
test('CLI search returns unified JSON and explicitly bounded coverage', async t => {
  const { config } = await fixture(t)
  const out = invoke(config, ['search', '障害', '--since', '2026-10-21T00:00:00Z', '--scope', 'tracked', '--json'])
  assert.equal(out.status, 3)
  assert.match(out.stderr, /CREDENTIAL_STORAGE_BLOCKED/)
  assert.equal(out.json.schemaVersion, 1)
  assert.equal(out.json.status, 'partial')
  assert.equal(out.json.data[0].source, 'teams')
  assert.equal(out.json.data.length, 1)
  assert.equal(out.stdout.trim().split('\n').length, 1)
  assert.ok(out.json.coverage.every(c => c.complete === false))
  assert.ok(!(await readFile(config, 'utf8')).includes('障害'))
})
test('CLI unknown commands, invalid options and writes return structured usage errors', async t => {
  const { config } = await fixture(t)
  for (const args of [['send', 'secret'], ['search', 'x', '--limit', '5oops'], ['channels', '--since', '7d'], ['messages', sRef, '--source', 'teams'], ['doctor', 'unexpected']]) {
    const out = invoke(config, [...args, '--json'])
    assert.equal(out.status, 2)
    assert.equal(out.json.status, 'error')
    assert.equal(out.json.errors[0].code, 'USAGE')
  }
})
test('CLI cursor must select one account and Teams rejects unsupported paging', async t => {
  const { config } = await fixture(t)
  assert.equal(invoke(config, ['channels', '--cursor', 'next==', '--json']).status, 2)
  const teams = invoke(config, ['messages', tRef, '--cursor', 'next==', '--json'])
  assert.equal(teams.status, 1)
  assert.equal(teams.json.errors[0].code, 'UNSUPPORTED')
})
test('CLI dates and unimplemented global search are rejected explicitly', async t => {
  const { config } = await fixture(t)
  assert.equal(invoke(config, ['search', 'x', '--since', '2026-10-24T00:00:00Z', '--until', '2026-10-22T00:00:00Z', '--json']).status, 2)
  assert.equal(invoke(config, ['search', 'x', '--scope', 'all', '--json']).json.errors[0].code, 'UNSUPPORTED')
  assert.equal(invoke(config, ['search', '', '--json']).status, 2)
})
test('CLI account and tracking operations are idempotent local writes only', async t => {
  const { config } = await fixture(t, true)
  assert.equal(invoke(config, ['init', '--json']).status, 0)
  const add = ['account', 'add', 'slack', '--name', 'work', '--workspace', 'company', '--executable', backend, '--json']
  assert.equal(invoke(config, add).status, 0)
  assert.equal(invoke(config, add).status, 0)
  assert.equal(invoke(config, ['account', 'list', '--json']).json.data.length, 1)
  for (let i = 0; i < 2; i++) assert.equal(invoke(config, ['track', 'add', sRef, '--json']).status, 0)
  assert.equal(invoke(config, ['track', 'list', '--json']).json.data.length, 1)
  assert.equal(invoke(config, ['track', 'remove', sRef, '--json']).status, 0)
  assert.equal(invoke(config, ['search', 'x', '--json']).json.errors[0].code, 'NOT_CONFIGURED')
})
test('CLI noninteractive login refuses credentials and never launches a prompt', async t => {
  const { config } = await fixture(t, true)
  const out = invoke(config, ['login', 'teams', '--json'])
  assert.equal(out.status, 2)
  assert.match(out.json.errors[0].message, /interactive/)
})
test('CLI missing dependency produces a useful structured failure', async t => {
  const { config, dir } = await fixture(t, true)
  await writeFile(config, JSON.stringify({ schemaVersion: 1, accounts: [{ source: 'teams', name: 'work', profile: 'work', executable: join(dir, 'missing-executable') }], tracked: [] }))
  const out = invoke(config, ['doctor', '--json'])
  assert.equal(out.status, 1)
  assert.equal(out.json.errors[0].code, 'DEPENDENCY_MISSING')
})
test('CLI human results include scope warnings on stderr, not mixed with data', async t => {
  const { config } = await fixture(t)
  const out = invoke(config, ['search', '障害'])
  assert.equal(out.status, 3)
  assert.match(out.stdout, /障害/)
  assert.ok(!out.stdout.includes('[scope]'))
  assert.match(out.stderr, /tracked-conversations-only/)
})
