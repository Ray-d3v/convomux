import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir, symlink, copyFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute, sep, dirname, basename } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { list } from 'tar'
import { contracts, sha256 } from './backend-artifacts.mjs'
import {secureSlkContract,validateSecureBuild} from '../dist/secure-slk.js'

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
const checkSidecar = supplied === '--existing'
if (supplied === '--existing') {
  const packages = (await readdir(output)).filter(name=>name.endsWith('.tgz'))
  assert.equal(packages.length,1,'Expected exactly one prepared package')
  supplied = join(output,packages[0])
}
if (!supplied && process.platform === 'win32') throw new Error('Use a Linux CI tgz: npm run package:smoke -- PATH. Windows npm pack loses Unix executable modes.')
const tgz = supplied ? resolve(supplied) : join(output, JSON.parse(command(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', output]))[0].filename)
const tarballDigest = sha256(await readFile(tgz))
if(checkSidecar){
  const receipt=(await readFile(join(dirname(tgz),'SHA256SUMS'),'utf8')).trim().split(/\s+/u)
  assert.deepEqual(receipt,[tarballDigest,basename(tgz)],'Artifact checksum sidecar does not match the tgz')
}
const entries = new Map(), modes = new Map()
await list({ file: tgz, onReadEntry: entry => {
  const chunks = []
  modes.set(entry.path,entry.mode)
  entry.on('data', chunk => chunks.push(chunk))
  entry.on('end', () => entries.set(entry.path, Buffer.concat(chunks)))
} })
const secureManifest=JSON.parse(entries.get('package/vendor/slk/secure-builds.json'))
assert.equal(secureManifest.schemaVersion,1)
assert.equal(sha256(entries.get('package/patches/slk/secure-storage.patch')),secureSlkContract.patchSha256)
for (const [target, artifact] of Object.entries(contracts.slack.artifacts)) {
  const expected=target.startsWith('linux-')?artifact.binarySha256:validateSecureBuild(secureManifest.builds[target],target).binarySha256
  assert.equal(sha256(entries.get(`package/vendor/slk/${target}/${artifact.binary}`)), expected, `Packaged binary: ${target}`)
  if(!target.startsWith('linux-'))for(const marker of ['CMX_SECURE_STORAGE','CMX_SECURE_PROFILE_UNAVAILABLE'])assert.ok(entries.get(`package/vendor/slk/${target}/${artifact.binary}`).includes(Buffer.from(marker)))
  if (!target.startsWith('win32')) assert.ok(modes.get(`package/vendor/slk/${target}/${artifact.binary}`)&0o111,`Unix executable mode missing: ${target}; use the Linux CI artifact`)
}
for (const [license, hash] of Object.entries(contracts.licenses)) assert.equal(sha256(entries.get(`package/vendor/licenses/${license}`)), hash)
for (const file of ['dist/cli.js','dist/storage.js','dist/secure-slk.js','dist/update-worker.js','node_modules/msteams/dist/cli/index.mjs','node_modules/msteams/LICENSE','THIRD_PARTY_NOTICES.md','backend-contracts.json','patches/slk/contract.json','patches/slk/secure-storage.patch','docs/INSTALL_CANDIDATE.md','docs/DEPENDENCY_NOTICES.md','docs/CREDENTIAL_STORAGE.md','docs/PATCHED_BACKENDS.md']) assert.ok(entries.has(`package/${file}`), `Missing packed file: ${file}`)
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
    const storage = spawnSync(process.execPath,[cli,'doctor','--storage','--json'],{env,encoding:'utf8',shell:false,timeout:10000})
    assert.equal(storage.error,undefined)
    assert.equal(storage.status,1,storage.stderr)
    const diagnosis = JSON.parse(storage.stdout)
    assert.equal(diagnosis.ok,false)
    assert.equal(diagnosis.data[0].secureStorageVerified,false)
    assert.equal(diagnosis.data[0].accountRoutingVerified,false)
    assert.equal(diagnosis.data[0].target,`${process.platform}-${process.arch}`)
    assert.equal(diagnosis.data[0].accessBlocked,process.platform==='linux')
    // A script override must never become an authentication bypass. Only own
    // synthetic configuration is used, and this command must start no backend.
    const override=join(home,'unverified.mjs'),marker=join(home,'override-ran'),config=join(home,'blocked-config.json')
    await writeFile(override,`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'called')`)
    await writeFile(config,JSON.stringify({schemaVersion:1,accounts:[{source:'slack',name:'synthetic',profile:'synthetic',executable:override}],tracked:[]}))
    const blocked=spawnSync(process.execPath,[cli,'--config',config,'doctor','--source','slack','--json'],{env,encoding:'utf8',shell:false,timeout:10000})
    assert.equal(blocked.status,1)
    assert.equal(JSON.parse(blocked.stdout).errors[0].code,'CREDENTIAL_STORAGE_BLOCKED')
    await assert.rejects(access(marker))
    const { resolveExecutable } = await import(pathToFileURL(join(installed,'dist','process.js')).href)
    for (const source of ['teams','slack']) {
      const invocation = await resolveExecutable({source,name:'synthetic',profile:'synthetic'})
      const backendPath = await realpath(invocation.args[0] ?? invocation.command)
      const withinPackage = relative(installedRoot,backendPath)
      assert.ok(withinPackage && !isAbsolute(withinPackage) && withinPackage !== '..' && !withinPackage.startsWith('..'+sep), `Backend resolved outside installed package: ${backendPath}`)
      assert.match(command(invocation.command,[...invocation.args,'--help'],{env}),source==='teams'?/Teams/i:/slk|Slack/i)
      if(source==='slack') assert.ok(command(invocation.command,[...invocation.args,'--version'],{env}).includes(process.platform==='linux'?'0.2.0':secureSlkContract.patchedVersion))
    }
    const { target, binary } = (await import(pathToFileURL(join(installed,'dist','backends.js')).href)).slackTarget(process.platform,process.arch)
    const bundled = join(installed,'vendor','slk',target,binary), saved = await readFile(bundled)
    if(process.platform!=='linux'){
      const corrupt=Buffer.from(saved);corrupt[0]^=0xff;await writeFile(bundled,corrupt)
      const {authorizeSlack}=await import(pathToFileURL(join(installed,'dist','secure-slk.js')).href)
      await assert.rejects(authorizeSlack({source:'slack',name:'synthetic',profile:'synthetic'}),e=>e.code==='CREDENTIAL_STORAGE_BLOCKED')
      await writeFile(bundled,saved,{mode:0o755})
    }
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
  if(!supplied){
    await writeFile(join(dirname(tgz),'SHA256SUMS'),`${tarballDigest}  ${basename(tgz)}\n`)
    await writeFile(join(dirname(tgz),'BACKEND_PROVENANCE.json'),JSON.stringify(secureManifest,null,2)+'\n')
    for(const [source,destination] of [['INSTALL_CANDIDATE','INSTALL'],['INSTALL_CANDIDATE','INSTALL_CANDIDATE'],['RELEASING','RELEASING'],['DEPENDENCY_NOTICES','DEPENDENCY_NOTICES'],['CREDENTIAL_STORAGE','CREDENTIAL_STORAGE'],['PATCHED_BACKENDS','PATCHED_BACKENDS']]){
      await writeFile(join(dirname(tgz),destination+'.md'),await readFile(new URL('../docs/'+source+'.md',import.meta.url),'utf8'))
    }
  }
  console.log(`Verified tarball: ${tgz}\nSHA-256: ${tarballDigest}`)
} finally { await rm(temporary,{recursive:true,force:true}) }
