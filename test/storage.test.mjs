import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectBundledSlackStorage } from '../dist/storage.js'
import { secureSlkContract, validateSecureBuild } from '../dist/secure-slk.js'
import { backendError } from '../dist/process.js'

const contracts=JSON.parse(await readFile(new URL('../backend-contracts.json',import.meta.url),'utf8'))

test('secure backend failures preserve fail-closed diagnostics without exposing backend content',()=>{
  for(const [marker,code] of [['CMX_SECURE_STORAGE_UNSUPPORTED','UNSUPPORTED'],['CMX_SECURE_PROFILE_UNAVAILABLE','CREDENTIAL_PROFILE_UNAVAILABLE'],['CMX_SECURE_STORAGE','CREDENTIAL_STORAGE_UNAVAILABLE']]){
    const error=backendError(marker+' synthetic-sensitive-detail',1)
    assert.equal(error.code,code)
    assert.ok(!error.message.includes('synthetic-sensitive-detail'))
    assert.match(error.message,/No plaintext|No credential/)
  }
})

test('patched artifact admission rejects wrong source, patch, target, toolchain and unverified store tests',()=>{
  const receipt={...secureSlkContract,target:'win32-x64',triple:'x86_64-pc-windows-msvc',binary:'slk.exe',binarySha256:'a'.repeat(64),rustc:'rustc 1.98.0 (synthetic)',repository:'Ray-d3v/convomux',sourceCommit:'1'.repeat(40),mockStorageTestsPassed:true,nativeHelpVersionPassed:true,nativeVaultOrRealAccountsAccessed:false,persistentOsStoreBuild:true,build:{locked:true,release:true,lto:'thin',codegenUnits:16,incremental:false,pathRemapping:'/cmx-source'}}
  assert.equal(validateSecureBuild(receipt,'win32-x64').binarySha256,receipt.binarySha256)
  for(const changes of [{upstreamCommit:'0'.repeat(40)},{patchSha256:'0'.repeat(64)},{triple:'aarch64-apple-darwin'},{rustc:'rustc unverified'},{mockStorageTestsPassed:false},{nativeHelpVersionPassed:false},{nativeVaultOrRealAccountsAccessed:true},{persistentOsStoreBuild:false},{patchedFiles:{}},{build:{...receipt.build,locked:false}}]){
    assert.throws(()=>validateSecureBuild({...receipt,...changes},'win32-x64'),e=>e.code==='CREDENTIAL_STORAGE_BLOCKED')
  }
})

test('fixed Slack storage contracts never certify live persistence or account identity',async()=>{
  for(const [platform,arch,store,lifetime] of [
    ['win32','x64','entry-local-mock','entry-only'],
    ['linux','x64','linux-kernel-keyring','until-kernel-reboot-or-expiry'],
    ['linux','arm64','linux-kernel-keyring','until-kernel-reboot-or-expiry'],
    ['darwin','arm64','macos-keychain','keychain-policy'],
    ['darwin','x64','macos-keychain','keychain-policy'],
  ]){
    const response=await inspectBundledSlackStorage(platform,arch),data=response.data[0]
    const patched=data.version!=='0.2.0'
    assert.equal(response.ok,false);assert.equal(response.status,'error')
    assert.equal(data.expectedStore,patched&&platform==='win32'?'windows-credential-manager':store)
    assert.equal(data.lifetime,patched&&platform==='win32'?'until-os-store-delete':lifetime)
    assert.equal(data.osStoreEnabledByBuild,patched||platform!=='win32')
    assert.ok([contracts.slack.sourcePackageVersion,'0.2.0+cmx.1'].includes(data.version))
    assert.equal(data.keyringVersion,contracts.slack.credentialStorage.keyring.version)
    assert.equal(data.secureStorageVerified,false);assert.equal(data.accountRoutingVerified,false)
    assert.equal(data.plaintextFallbackCanBeDisabled,false)
    assert.equal(data.plaintextFallbackAllowed,!patched)
    assert.equal(data.strictRequestedProfileEnforced,patched)
  }
  await assert.rejects(inspectBundledSlackStorage('win32','arm64'),e=>e.code==='UNSUPPORTED')
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
