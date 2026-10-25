import {spawnSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {root} from './prepare-secure-slk.mjs'
import {mockTestName,mockTestProof} from './rust-test-proof.mjs'

const target=process.argv[2]
if(!['x86_64-pc-windows-msvc','aarch64-apple-darwin','x86_64-apple-darwin','x86_64-unknown-linux-gnu'].includes(target))throw Error('Unknown native test target')
const args=['test','--manifest-path','.upstream/slk-secure-source/Cargo.toml','--target',target,'--locked','--release','--lib',mockTestName,'--','--exact','--test-threads=1','--color','never']
const result=spawnSync('cargo',args,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,stdio:['ignore','pipe','inherit'],timeout:40*60*1000,maxBuffer:4*1024*1024})
if(result.error)throw result.error
process.stdout.write(result.stdout??'')
const proof=mockTestProof(result.stdout??'',result.status)
const contract=JSON.parse(await readFile(join(root,'patches/slk/contract.json'),'utf8'))
await writeFile(join(root,'.upstream/slk-mock-test-proof.json'),JSON.stringify({...proof,target,command:['cargo',...args],patchSha256:contract.patchSha256,sourceArchiveSha256:contract.sourceArchiveSha256,nativeVaultOrRealAccountsAccessed:false},null,2)+'\n')
