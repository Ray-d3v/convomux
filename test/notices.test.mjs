import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { Header } from 'tar'
import { readCrateNotices } from '../scripts/notice-archive.mjs'

function archive(entries) {
  const blocks=[]
  for(const [path,text] of entries){const bytes=Buffer.from(text),header=new Header({path,type:'File',size:bytes.length,mode:0o644});header.encode();blocks.push(header.block,bytes,Buffer.alloc((512-bytes.length%512)%512))}
  return gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]))
}
test('crate notice collection includes SPDX-named license directories and excludes executable source',async()=>{
  const pkg={name:'synthetic',version:'1.0.0'}
  const {files}=await readCrateNotices(archive([
    ['synthetic-1.0.0/Cargo.toml','[package]\nlicense = "MIT OR Apache-2.0"'],
    ['synthetic-1.0.0/LICENSES/MIT.txt','Synthetic MIT terms'],
    ['synthetic-1.0.0/LICENSES/Apache-2.0.txt','Synthetic Apache terms'],
    ['synthetic-1.0.0/src/lib.rs','synthetic source; never a notice'],
  ]),pkg)
  assert.equal(files.get('LICENSES/MIT.txt'),'Synthetic MIT terms')
  assert.equal(files.get('LICENSES/Apache-2.0.txt'),'Synthetic Apache terms')
  assert.equal(files.has('src/lib.rs'),false)
})
