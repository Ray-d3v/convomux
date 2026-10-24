import {readFile,writeFile,mkdir,copyFile,chmod} from 'node:fs/promises'
import {join} from 'node:path'
import {root,hash} from './prepare-secure-slk.mjs'
import {secureSlkContract,validateSecureBuild} from '../dist/secure-slk.js'

export async function installSecureBuilds(){
  const builds={}
  for(const target of secureSlkContract.persistentTargets){
    const input=join(root,'.upstream/secure-build',target)
    const raw=JSON.parse(await readFile(join(input,'provenance.json'),'utf8'))
    const build=validateSecureBuild(raw,target)
    const bytes=await readFile(join(input,build.binary))
    if(hash(bytes)!==build.binarySha256)throw Error('Patched binary mismatch: '+target)
    if(hash(await readFile(join(input,'secure-storage.patch')))!==secureSlkContract.patchSha256)throw Error('Patched source provenance mismatch')
    if(hash(await readFile(join(input,'Cargo.lock')))!==secureSlkContract.patchedFiles['Cargo.lock'])throw Error('Patched lock mismatch')
    const license=await readFile(join(input,'LICENSE'))
    if(hash(license)!==hash(await readFile(join(root,'vendor/licenses/slk-MIT.txt'))))throw Error('Patched license mismatch')
    const destination=join(root,'vendor/slk',target)
    await mkdir(destination,{recursive:true})
    await copyFile(join(input,build.binary),join(destination,build.binary));await chmod(join(destination,build.binary),0o755)
    builds[target]=raw
  }
  await writeFile(join(root,'vendor/slk/secure-builds.json'),JSON.stringify({schemaVersion:1,builds},null,2)+'\n')
  console.log('Installed hash/provenance-verified patched Windows/macOS builds; Linux remains unsupported for authentication')
}
