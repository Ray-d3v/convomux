import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectBundledSlackStorage } from '../dist/storage.js'

const contracts=JSON.parse(await readFile(new URL('../backend-contracts.json',import.meta.url),'utf8'))

test('fixed Slack storage contracts never certify unsafe persistence or account routing',()=>{
  for(const [platform,arch,store,lifetime] of [
    ['win32','x64','entry-local-mock','entry-only'],
    ['linux','x64','linux-kernel-keyring','until-kernel-reboot-or-expiry'],
    ['linux','arm64','linux-kernel-keyring','until-kernel-reboot-or-expiry'],
    ['darwin','arm64','macos-keychain','keychain-policy'],
    ['darwin','x64','macos-keychain','keychain-policy'],
  ]){
    const response=inspectBundledSlackStorage(platform,arch),data=response.data[0]
    assert.equal(response.ok,false);assert.equal(response.status,'error')
    assert.equal(data.expectedStore,store);assert.equal(data.lifetime,lifetime)
    assert.equal(data.osStoreEnabledByBuild,platform!=='win32')
    assert.equal(data.version,contracts.slack.sourcePackageVersion)
    assert.equal(data.keyringVersion,contracts.slack.credentialStorage.keyring.version)
    assert.equal(data.secureStorageVerified,false);assert.equal(data.accountRoutingVerified,false)
    assert.equal(data.plaintextFallbackCanBeDisabled,false)
  }
  assert.throws(()=>inspectBundledSlackStorage('win32','arm64'),e=>e.code==='UNSUPPORTED')
})

test('offline storage CLI touches no accounts, credential files, backend, cache or network even in a TTY',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cmx-storage-offline-')),config=join(dir,'config.json'),receipt=join(dir,'receipt.json')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  await writeFile(config,'This synthetic sentinel must never be read as configuration.')
  const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url)),fixture=new URL('./fixtures/storage-no-io.mjs',import.meta.url).href
  const env={...process.env,NODE_OPTIONS:'',HOME:dir,USERPROFILE:dir,APPDATA:dir,LOCALAPPDATA:dir,XDG_CONFIG_HOME:dir,XDG_CACHE_HOME:dir,CMX_CONFIG:config,CMX_TEST_HOME:dir,CMX_TEST_RECEIPT:receipt}
  for(const [args,invalid] of [
    [['doctor','--storage','--json'],false],
    [['doctor','--storage'],false],
    [['doctor','--storage','--source','slack','--json'],false],
    [['doctor','--storage','--source','teams','--json'],true],
    [['doctor','--storage','--account','synthetic','--json'],true],
    [['doctor','--storage','--config',config,'--json'],true],
    [['doctor','--storage','--timeout','10','--json'],true],
  ]){
    const output=spawnSync(process.execPath,['--import',fixture,cli,...args],{encoding:'utf8',env,timeout:6000})
    assert.equal(output.error,undefined)
    assert.equal(output.status,invalid?2:1,output.stderr)
    if(args.includes('--json')){
      const data=JSON.parse(output.stdout)
      assert.equal(data.schemaVersion,1);assert.equal(data.ok,false)
      if(!invalid){assert.equal(data.data[0].accountOrCredentialStoresAccessed,false);assert.equal(data.data[0].networkOrBackendCalls,false)}
    }
    assert.deepEqual(JSON.parse(await readFile(receipt,'utf8')),{filesystem:0,subprocess:0,network:0})
    assert.ok(!output.stdout.includes('sentinel'));assert.ok(!output.stderr.includes('sentinel'))
  }
})
