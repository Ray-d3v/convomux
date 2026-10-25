// Release engineering only: collect actual notices from checksum-pinned registry sources.
// Nothing fetched here is executed or extracted to archive-controlled filesystem paths.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readCrateNotices } from './notice-archive.mjs'
const root = new URL('../',import.meta.url)
const contracts = JSON.parse(await readFile(new URL('backend-contracts.json',root),'utf8'))
const supplements = JSON.parse(await readFile(new URL('vendor/licenses/slk-notice-sources.json',root),'utf8'))
const hash = bytes=>createHash('sha256').update(bytes).digest('hex')
const gitBlob = bytes=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')
const supplementalDownloads = new Map()
const lockUrl=`https://raw.githubusercontent.com/osodevops/slack-cli/${contracts.slack.revision}/Cargo.lock`
async function download(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)})
  if(!response.ok)throw Error(`Source download failed: ${response.status} ${url}`)
  const chunks=[];let size=0
  for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw Error('Source size limit');chunks.push(Buffer.from(chunk))}
  return Buffer.concat(chunks)
}
const lock=(await download(lockUrl)).toString('utf8').replace(/\r\n/g,'\n')
if(contracts.slack.cargoLockSha256&&hash(lock)!==contracts.slack.cargoLockSha256)throw Error('Cargo.lock checksum mismatch')
const packages=lock.split('[[package]]').slice(1).map(block=>{
  const field=name=>new RegExp(`^${name} = "([^"]+)"`,'m').exec(block)?.[1]
  return {name:field('name'),version:field('version'),source:field('source'),checksum:field('checksum')}
}).filter(pkg=>pkg.source)
for(const pkg of packages)if(pkg.source!=='registry+https://github.com/rust-lang/crates.io-index'||!/^[-a-zA-Z0-9_]+$/.test(pkg.name)||!/^[-a-zA-Z0-9.+]+$/.test(pkg.version)||!/^([a-f0-9]{64})$/.test(pkg.checksum))throw Error('Unexpected Cargo source')
const results=new Array(packages.length);let next=0,completed=0
await Promise.all(Array.from({length:6},async()=>{
  while(next<packages.length){
    const index=next++,pkg=packages[index],url=`https://static.crates.io/crates/${pkg.name}/${pkg.name}-${pkg.version}.crate`
    const bytes=await download(url)
    if(hash(bytes)!==pkg.checksum)throw Error(`Crate checksum mismatch: ${pkg.name}`)
    const supplement=supplements.packages[`${pkg.name}@${pkg.version}`]
    if(supplement&&supplement.crateChecksum!==pkg.checksum)throw Error('Supplement targets a different crate archive')
    const {files,metadata,cargo}=await readCrateNotices(bytes,pkg,supplement?.includeCrateFiles??[])
    if(supplement&&metadata.has('.cargo_vcs_info.json')&&JSON.parse(metadata.get('.cargo_vcs_info.json')).git.sha1!==supplement.sourceRevision)throw Error(`Supplement revision mismatch: ${pkg.name}`)
    for(const file of supplement?.files??[]){
      if(!/^https:\/\/raw\.githubusercontent\.com\/[-\w.]+\/[-\w.]+\/[a-f0-9]{40}\//.test(file.url))throw Error('Supplement must use a fixed public Git revision')
      if(!supplementalDownloads.has(file.url))supplementalDownloads.set(file.url,download(file.url))
      const content=await supplementalDownloads.get(file.url)
      if(content.length>2*1024*1024||hash(content)!==file.sha256||gitBlob(content)!==file.gitBlobSha1)throw Error(`Supplement checksum mismatch: ${file.url}`)
      files.set(file.path,content.toString('utf8').replace(/\r\n/g,'\n'))
    }
    const license=/^license = "([^"]+)"/m.exec(cargo)?.[1]??null
    results[index]={name:pkg.name,version:pkg.version,checksum:pkg.checksum,url,declaredLicense:license,...(supplement?{noticeEvidence:supplement.note,supplementalSources:supplement.files}:{}),notices:[...files].sort(([a],[b])=>a.localeCompare(b,'en'))}
    if(++completed%50===0)console.log(`Verified notice sources: ${completed}/${packages.length}`)
  }
}))
const manifest={sourceRevision:contracts.slack.revision,lockUrl,cargoLockSha256:hash(lock),scope:'Entire release Cargo.lock, including target/build/dev dependencies; source attribution inventory, not binary reproducibility or legal clearance.',packages:results.map(({notices,...pkg})=>({...pkg,noticeFiles:notices.map(([name])=>name)}))}
const notices=['slk v0.2.0 dependency source notices','Source revision: '+contracts.slack.revision,'All downloads verified against release Cargo.lock SHA-256 checksums. Includes target/build/dev dependencies.\n',...results.flatMap(pkg=>[
  `\n========== ${pkg.name} ${pkg.version} ==========\nSource: ${pkg.url}\nDeclared license: ${pkg.declaredLicense??'(not declared)'}\n`,
  ...(pkg.noticeEvidence?[`Attribution evidence: ${pkg.noticeEvidence}\n`,...pkg.supplementalSources.map(file=>`Supplement: ${file.url}\nSHA-256: ${file.sha256}\n`)]:[]),
  ...pkg.notices.map(([name,text])=>`\n--- ${name} ---\n${text}`),
  ...(!pkg.notices.length?['No standalone notice file in published source archive; review declared license and source headers.\n']:[]),
])].join('\n')
await writeFile(new URL('vendor/licenses/slk-Cargo.lock',root),lock)
await writeFile(new URL('vendor/licenses/slk-dependencies.json',root),JSON.stringify(manifest,null,2)+'\n')
await writeFile(new URL('vendor/licenses/slk-dependency-notices.txt',root),notices)
console.log(JSON.stringify({packages:results.length,noNoticeFiles:results.filter(pkg=>!pkg.notices.length).map(pkg=>`${pkg.name}@${pkg.version}`),cargoLockSha256:hash(lock),noticeBytes:Buffer.byteLength(notices)}))
