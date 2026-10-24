import { list } from 'tar'

// Archive-controlled names are only keys in memory; they are never filesystem paths.
export async function readCrateNotices(bytes, pkg, extraFiles = []) {
  const prefix = `${pkg.name}-${pkg.version}/`, files = new Map(), metadata = new Map()
  const parser = list({ strict:true, onReadEntry:entry=>{
    if(!entry.path.startsWith(prefix)||entry.path.split('/').includes('..'))throw Error('Unsafe source path')
    const path=entry.path.slice(prefix.length),base=path.split('/').at(-1)
    const meta=['Cargo.toml','Cargo.toml.orig','.cargo_vcs_info.json'].includes(path)
    const notice=/^(?:licen[cs]e|copying|notice|copyright|authors)(?:[._-].*)?$/i.test(base)||/(?:^|\/)LICEN[CS]ES\//i.test(path)||/\.license$/i.test(base)
    if(entry.type!=='File'||(!notice&&!meta&&!extraFiles.includes(path))){entry.resume();return}
    if(entry.size>2*1024*1024)throw Error('Notice size limit')
    const chunks=[];entry.on('data',chunk=>chunks.push(chunk));entry.on('end',()=>{
      const text=Buffer.concat(chunks).toString('utf8').replace(/\r\n/g,'\n')
      if(meta)metadata.set(path,text)
      if(notice||extraFiles.includes(path))files.set(path,text)
    })
  }})
  await new Promise((resolve,reject)=>{parser.on('error',reject);parser.on('end',resolve);parser.end(bytes)})
  return {files,metadata,cargo:metadata.get('Cargo.toml')??''}
}
