import {readFile,writeFile,mkdir,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {resolve,dirname,join} from 'node:path'
import {list} from 'tar'

export const upstreamRevision='f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1'
export const sourceSha256='cb7b4a106b5e2ecf2e7baa6035016ac973a1e99ceea69f47bb3a52dab6b11ecf'
export const root=fileURLToPath(new URL('../',import.meta.url))
export const sourceDirectory=join(root,'.upstream','slk-secure-source')
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export async function extractSource(bytes,destination){
  if(bytes.length>2*1024*1024||hash(bytes)!==sourceSha256)throw Error('Fixed slk source archive mismatch')
  const prefix=`slack-cli-${upstreamRevision}/`,files=new Map(),seen=new Set()
  let invalid,total=0
  const parser=list({strict:true,onReadEntry:entry=>{
    if(!entry.path.startsWith(prefix)||entry.path.includes('\\')||entry.path.split('/').some(s=>s==='..'||s==='.git')||!['File','Directory'].includes(entry.type)||seen.has(entry.path)){
      invalid=Error('Unsafe source archive entry');entry.resume();return
    }
    seen.add(entry.path)
    if(entry.type==='Directory'){entry.resume();return}
    if(entry.size>1024*1024){invalid=Error('Oversized source file');entry.resume();return}
    const chunks=[]
    entry.on('data',c=>{total+=c.length;if(total>10*1024*1024)invalid=Error('Oversized source archive');else chunks.push(c)})
    entry.on('end',()=>files.set(entry.path.slice(prefix.length),Buffer.concat(chunks)))
  }})
  await new Promise((done,fail)=>{parser.on('error',fail);parser.on('end',done);parser.end(bytes)})
  if(invalid||!files.has('Cargo.toml')||!files.has('src/auth/keyring.rs'))throw invalid??Error('Source missing')
  for(const [path,content] of files){const target=join(destination,...path.split('/'));await mkdir(dirname(target),{recursive:true});await writeFile(target,content)}
}
export async function prepareSource(){
  try{await stat(sourceDirectory);throw Error('Source directory already exists; use a fresh checkout/build directory')}catch(error){if(error.code!=='ENOENT')throw error}
  const response=await fetch(`https://codeload.github.com/osodevops/slack-cli/tar.gz/${upstreamRevision}`,{signal:AbortSignal.timeout(30000)})
  if(!response.ok)throw Error(`Source fetch HTTP ${response.status}`)
  const chunks=[];let size=0
  for await(const c of response.body){size+=c.length;if(size>2*1024*1024)throw Error('Source fetch exceeded limit');chunks.push(c)}
  await extractSource(Buffer.concat(chunks),sourceDirectory)
  const contract=JSON.parse(await readFile(join(root,'patches/slk/contract.json'),'utf8'))
  if(hash(await readFile(join(root,'patches/slk/secure-storage.patch')))!==contract.patchSha256)throw Error('Patch hash mismatch')
  for(const args of [['apply','--check'],['apply']]){
    const result=spawnSync('git',[...args,'--directory=.upstream/slk-secure-source','patches/slk/secure-storage.patch'],{cwd:root,encoding:'utf8',shell:false,timeout:30000,windowsHide:true})
    if(result.error||result.status!==0)throw Error('Fixed source patch did not apply cleanly')
  }
  for(const [path,digest] of Object.entries(contract.patchedFiles))if(hash(await readFile(join(sourceDirectory,path)))!==digest)throw Error('Patched source mismatch: '+path)
  await writeFile(join(sourceDirectory,'LICENSE'),await readFile(join(root,'vendor/licenses/slk-MIT.txt')))
  console.log('Verified fixed slk source and local secure-storage patch; no source scripts executed')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await prepareSource()
