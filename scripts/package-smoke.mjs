import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir, symlink, copyFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { list } from 'tar'
import { contracts, sha256 } from './backend-artifacts.mjs'

const root = fileURLToPath(new URL('../', import.meta.url)), npm = process.env.npm_execpath
assert.ok(npm, 'Run through npm run package:smoke')
const output = resolve(root, '.upstream', 'package')
await mkdir(output, { recursive: true })
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', shell: false, timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...options })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, `Command failed: ${result.stderr}`)
  return result.stdout
}
let supplied = process.argv[2]
if (supplied === '--existing') {
  const packages = (await readdir(output)).filter(name=>name.endsWith('.tgz'))
  assert.equal(packages.length,1,'Expected exactly one prepared package')
  supplied = join(output,packages[0])
}
if (!supplied && process.platform === 'win32') throw new Error('Use a Linux CI tgz: npm run package:smoke -- PATH. Windows npm pack loses Unix executable modes.')
const tgz = supplied ? resolve(supplied) : join(output, JSON.parse(command(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', output]))[0].filename)
const entries = new Map(), modes = new Map()
await list({ file: tgz, onReadEntry: entry => {
  const chunks = []
  modes.set(entry.path,entry.mode)
  entry.on('data', chunk => chunks.push(chunk))
  entry.on('end', () => entries.set(entry.path, Buffer.concat(chunks)))
} })
for (const [target, artifact] of Object.entries(contracts.slack.artifacts)) {
  assert.equal(sha256(entries.get(`package/vendor/slk/${target}/${artifact.binary}`)), artifact.binarySha256, `Packaged binary: ${target}`)
  if (!target.startsWith('win32')) assert.ok(modes.get(`package/vendor/slk/${target}/${artifact.binary}`)&0o111,`Unix executable mode missing: ${target}; use the Linux CI artifact`)
}
for (const [license, hash] of Object.entries(contracts.licenses)) assert.equal(sha256(entries.get(`package/vendor/licenses/${license}`)), hash)
for (const file of ['dist/cli.js','dist/update-worker.js','node_modules/msteams/dist/cli/index.mjs','node_modules/msteams/LICENSE','THIRD_PARTY_NOTICES.md','backend-contracts.json']) assert.ok(entries.has(`package/${file}`), `Missing packed file: ${file}`)
assert.ok(![...entries.keys()].some(name => /(?:^|\/)(?:\.env|config\.local\.json|credentials.*\.json|\.upstream|\.git)(?:\/|$)/.test(name)))

const temporary = await mkdtemp(join(tmpdir(), 'cmx 配布 '))
try {
  const prefix = join(temporary,'prefix'), local = join(temporary,'local'), home = join(temporary,'home'), nodeBin=join(temporary,'node-bin')
  await mkdir(local); await mkdir(home); await mkdir(nodeBin)
  const isolatedNode=join(nodeBin,process.platform==='win32'?'node.exe':'node')
  if(process.platform==='win32') await copyFile(process.execPath,isolatedNode)
  else await symlink(process.execPath,isolatedNode)
  const env = Object.fromEntries(['SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','TEMP','TMP'].flatMap(key => process.env[key] ? [[key,process.env[key]]] : []))
  Object.assign(env, { PATH: nodeBin, HOME: home, USERPROFILE: home, LOCALAPPDATA: home, APPDATA: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, CMX_NO_UPDATE_NOTIFIER: '1' })
  const flags = ['--ignore-scripts','--offline','--no-audit','--no-fund','--cache',join(temporary,'empty-cache')]
  command(process.execPath,[npm,'install','--global','--prefix',prefix,...flags,tgz],{env})
  command(process.execPath,[npm,'install','--prefix',local,...flags,tgz],{env})
  const metadata = JSON.parse(await readFile(join(root,'package.json'),'utf8'))
  for (const installed of [join(prefix,process.platform==='win32'?'node_modules':'lib/node_modules',metadata.name),join(local,'node_modules',metadata.name)]) {
    const installedRoot = await realpath(installed)
    const cli = join(installed,'dist','cli.js')
    assert.equal(command(process.execPath,[cli,'--version'],{env}).trim(),metadata.version)
    assert.match(command(process.execPath,[cli,'--help'],{env}),/ConvoMux/)
    const { resolveExecutable } = await import(pathToFileURL(join(installed,'dist','process.js')).href)
    for (const source of ['teams','slack']) {
      const invocation = await resolveExecutable({source,name:'synthetic',profile:'synthetic'})
      assert.ok(invocation.command.startsWith(installedRoot) || invocation.args[0]?.startsWith(installedRoot))
      assert.match(command(invocation.command,[...invocation.args,'--help'],{env}),source==='teams'?/Teams/i:/slk|Slack/i)
      if(source==='slack') assert.match(command(invocation.command,[...invocation.args,'--version'],{env}),/0\.2\.0/)
    }
    const { target, binary } = (await import(pathToFileURL(join(installed,'dist','backends.js')).href)).slackTarget(process.platform,process.arch)
    const bundled = join(installed,'vendor','slk',target,binary), saved = await readFile(bundled)
    await rm(bundled)
    await assert.rejects(resolveExecutable({source:'slack',name:'synthetic',profile:'synthetic'}),e=>e.code==='DEPENDENCY_MISSING')
    await writeFile(bundled,saved,{mode:0o755})
  }
  const shim = process.platform==='win32'?join(prefix,'cmx.cmd'):join(prefix,'bin','cmx')
  await access(shim)
  const version = process.platform==='win32'
    ? command(process.env.ComSpec??'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c',`""${shim}" --version"`],{env,windowsVerbatimArguments:true})
    : command(shim,['--version'],{env})
  assert.equal(version.trim(),metadata.version)
  console.log(`PASS ${process.platform}/${process.arch}, Node ${process.versions.node}: offline local/global --ignore-scripts install, cmx shim, real Teams help, real slk help/version, missing backend diagnostic; spaces/Japanese paths`)
  console.log(`Verified tarball: ${tgz}\nSHA-256: ${sha256(await readFile(tgz))}`)
} finally { await rm(temporary,{recursive:true,force:true}) }
