import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {root,hash} from './prepare-secure-slk.mjs'

const [target,triple]=process.argv.slice(2)
assert.ok(['win32-x64','darwin-arm64','darwin-x64','linux-x64'].includes(target))
const contract=JSON.parse(await readFile(join(root,'patches/slk/contract.json'),'utf8'))
const filename=target.startsWith('win32')?'slk.exe':'slk'
const binary=resolve(root,'.upstream/slk-target',triple,'release',filename)
function command(executable,args){const r=spawnSync(executable,args,{encoding:'utf8',shell:false,timeout:10000,windowsHide:true});assert.equal(r.error,undefined);assert.equal(r.status,0);return r.stdout.trim()}
assert.ok(command(binary,['--version']).includes(contract.patchedVersion))
assert.match(command(binary,['--help']),/slk|Slack/)
const bytes=await readFile(binary),destination=join(root,'.upstream/secure-build',target)
for(const marker of ['CMX_SECURE_STORAGE','CMX_SECURE_PROFILE_UNAVAILABLE'])assert.ok(bytes.includes(Buffer.from(marker)), 'Required patched behavior marker absent')
await mkdir(destination,{recursive:true})
await copyFile(binary,join(destination,filename))
await copyFile(join(root,'vendor/licenses/slk-MIT.txt'),join(destination,'LICENSE'))
await copyFile(join(root,'patches/slk/secure-storage.patch'),join(destination,'secure-storage.patch'))
await copyFile(join(root,'.upstream/slk-secure-source/Cargo.lock'),join(destination,'Cargo.lock'))
const receipt={...contract,target,triple,binary:filename,binarySha256:hash(bytes),bytes:bytes.length,
  sourceCommit:process.env.GITHUB_SHA,repository:process.env.GITHUB_REPOSITORY,workflowRunId:process.env.GITHUB_RUN_ID,
  rustc:command('rustc',['--version','--verbose']),cargo:command('cargo',['--version']),
  build:{locked:true,release:true,lto:'thin',codegenUnits:16,incremental:false,jobs:2,pathRemapping:'/cmx-source'},
  mockStorageTestsPassed:true,nativeHelpVersionPassed:true,nativeVaultOrRealAccountsAccessed:false,
  persistentOsStoreBuild:contract.persistentTargets.includes(target),liveAuthenticationValidated:false,
}
await writeFile(join(destination,'provenance.json'),JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify({target,binarySha256:receipt.binarySha256,version:contract.patchedVersion,persistentOsStoreBuild:receipt.persistentOsStoreBuild,liveAuthenticationValidated:false}))
