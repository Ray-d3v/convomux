// Tripwires run only under explicit test --import, never in the shipped CLI.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { relative, isAbsolute, sep, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const home = resolve(process.env.CMX_TEST_HOME), receipt = process.env.CMX_TEST_RECEIPT
const writeReceipt = fs.writeFileSync.bind(fs), counts = { filesystem:0, subprocess:0, network:0 }
function protectedPath(value) {
  if(typeof value==='number')return false
  const path=value instanceof URL?fileURLToPath(value):String(value)
  const within=relative(home,resolve(path))
  return !within||!isAbsolute(within)&&within!=='..'&&!within.startsWith('..'+sep)
}
for(const [api,names] of [[fs,['readFile','readFileSync','stat','statSync','lstat','lstatSync','readdir','readdirSync','open','openSync','mkdir','mkdirSync','existsSync','access','accessSync','writeFile','writeFileSync']],[fsp,['readFile','stat','lstat','readdir','open','mkdir','access','writeFile']]]){
  for(const name of names){const original=api[name];api[name]=function(...args){if(protectedPath(args[0])){counts.filesystem++;throw Error('Synthetic home access blocked')}return original.apply(this,args)}}
}
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])childProcess[name]=()=>{counts.subprocess++;throw Error('Subprocess blocked')}
for(const api of [http,https])for(const name of ['get','request'])api[name]=()=>{counts.network++;throw Error('Network blocked')}
globalThis.fetch=()=>{counts.network++;throw Error('Network blocked')}
for(const key of ['CI','CONTINUOUS_INTEGRATION','BUILD_NUMBER','GITHUB_ACTIONS','TF_BUILD','NODE_ENV','NO_UPDATE_NOTIFIER','CMX_NO_UPDATE_NOTIFIER'])delete process.env[key]
for(const stream of [process.stdin,process.stdout,process.stderr])Object.defineProperty(stream,'isTTY',{configurable:true,value:true})
syncBuiltinESMExports()
process.on('exit',()=>writeReceipt(receipt,JSON.stringify(counts)))
