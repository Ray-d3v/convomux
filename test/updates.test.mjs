import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { checkForUpdates, newerStable, updateCachePath } from '../dist/updates.js'

test('SemVer notices compare stable latest against releases and prereleases', () => {
  for (const [latest, current, newer] of [['0.10.0','0.9.0',true],['1.0.0','1.0.0-beta.1',true],['1.0.0','1.0.0',false],['1.0.0','2.0.0',false],['2.0.0-beta.1','1.0.0',false],['invalid','1.0.0',false]]) assert.equal(newerStable(latest,current),newer)
})
test('real update worker handles success, unpublished package, invalid data, timeout and transport failure offline', t => {
  const dir = mkdtempSync(join(tmpdir(),'cmx-worker-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const path = join(dir,'convomux','updates.json'), receipt = join(dir,'receipt.json')
  mkdirSync(join(path,'..'),{recursive:true})
  for (const mode of ['success','404','invalid','oversized','timeout','failure']) {
    const checkedAt = Date.now(); writeFileSync(path,JSON.stringify({checkedAt}))
    const output = childProcess.spawnSync(process.execPath,['--import',new URL('./fixtures/update-transport.mjs',import.meta.url).href,fileURLToPath(new URL('../dist/update-worker.js',import.meta.url)),String(checkedAt)],{
      encoding:'utf8',timeout:6000,env:{...process.env,LOCALAPPDATA:dir,XDG_CACHE_HOME:dir,CMX_TEST_RECEIPT:receipt,CMX_TEST_RESPONSE:mode},
    })
    assert.equal(output.error,undefined); assert.equal(output.status,0,output.stderr); assert.equal(output.stdout,''); assert.equal(output.stderr,'')
    assert.equal(JSON.parse(readFileSync(path,'utf8')).latest,mode==='success'?'99.0.0':undefined)
    const sent = JSON.parse(readFileSync(receipt,'utf8'))
    assert.equal(sent.url,'https://registry.npmjs.org/-/package/@ray-d3v/convomux/dist-tags')
    assert.deepEqual(sent.options.headers,{accept:'application/json'})
  }
})
test('notification boundary gates all activity, caches attempts daily, tolerates failures and writes stderr only', t => {
  const dir = mkdtempSync(join(tmpdir(),'cmx-update-')), previous = { ...process.env }
  const streams = [process.stdin,process.stdout,process.stderr], descriptors = streams.map(s => Object.getOwnPropertyDescriptor(s,'isTTY'))
  const originalSpawn = childProcess.spawn, originalWrite = process.stderr.write
  let launches = 0, notices = ''
  t.after(() => {
    childProcess.spawn = originalSpawn; syncBuiltinESMExports(); process.stderr.write = originalWrite
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env,previous)
    streams.forEach((s,i) => descriptors[i] ? Object.defineProperty(s,'isTTY',descriptors[i]) : delete s.isTTY)
    rmSync(dir,{recursive:true,force:true})
  })
  for (const key of ['CI','CONTINUOUS_INTEGRATION','BUILD_NUMBER','GITHUB_ACTIONS','TF_BUILD','NODE_ENV','NO_UPDATE_NOTIFIER','CMX_NO_UPDATE_NOTIFIER']) delete process.env[key]
  process.env.LOCALAPPDATA = dir; process.env.XDG_CACHE_HOME = dir
  streams.forEach(s => Object.defineProperty(s,'isTTY',{configurable:true,value:true}))
  childProcess.spawn = () => { launches++; const child = new EventEmitter(); child.unref=()=>{}; return child }; syncBuiltinESMExports()
  process.stderr.write = value => { notices += value; return true }
  for (const key of ['CI','GITHUB_ACTIONS','NO_UPDATE_NOTIFIER','CMX_NO_UPDATE_NOTIFIER']) { process.env[key]='1'; checkForUpdates([]); delete process.env[key] }
  checkForUpdates(['doctor','--json']); assert.equal(launches,0)
  for (const stream of streams) { Object.defineProperty(stream,'isTTY',{configurable:true,value:false}); checkForUpdates([]); Object.defineProperty(stream,'isTTY',{configurable:true,value:true}) }
  assert.equal(launches,0)
  assert.throws(() => readFileSync(updateCachePath()))
  checkForUpdates([]); checkForUpdates([]); assert.equal(launches,1)
  const path = updateCachePath(), cache = JSON.parse(readFileSync(path,'utf8'))
  assert.ok(Date.now()-cache.checkedAt<1000)
  writeFileSync(path,JSON.stringify({checkedAt:Date.now(),latest:'99.0.0'})); checkForUpdates([])
  assert.match(notices,/npm install -g @ray-d3v\/convomux@latest/); assert.equal(launches,1)
  childProcess.spawn = () => { launches++; throw new Error('offline spawn failure') }; syncBuiltinESMExports()
  writeFileSync(path,JSON.stringify({checkedAt:Date.now()-24*60*60*1000-1})); checkForUpdates([]); checkForUpdates([]); assert.equal(launches,2)
  // Cache storage failure is also isolated from the command.
  rmSync(join(path,'..'),{recursive:true,force:true}); mkdirSync(join(path,'..')); mkdirSync(path)
  assert.doesNotThrow(() => checkForUpdates([]))
})
