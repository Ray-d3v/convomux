import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatch } from '../dist/cli.js'

test('delegated Slack login binds the returned safe workspace name and protects existing identities', async t => {
  const dir = await mkdtemp(join(tmpdir(),'cmx-login-')), config = join(dir,'config.json'), backend = join(dir,'ログイン fixture.mjs')
  const streams = [process.stdin,process.stderr], descriptors = streams.map(s=>Object.getOwnPropertyDescriptor(s,'isTTY'))
  streams.forEach(s=>Object.defineProperty(s,'isTTY',{configurable:true,value:true}))
  t.after(async()=>{ streams.forEach((s,i)=>descriptors[i]?Object.defineProperty(s,'isTTY',descriptors[i]):delete s.isTTY); await rm(dir,{recursive:true,force:true}) })
  const args = ['login','slack','--name','work','--workspace','company','--executable',backend,'--config',config]
  const fixture = workspace => writeFile(backend,`const a=process.argv.slice(2); if(a.join('|')!=='--output|json|--raw|auth|login|company') process.exit(1); console.log(JSON.stringify({workspace:${JSON.stringify(workspace)},authenticated:true}));`)
  await fixture('Example Workspace')
  const result = await dispatch(args)
  assert.equal(result.data[0].profile,'Example Workspace')
  const before = await readFile(config,'utf8')
  assert.equal(JSON.parse(before).accounts[0].profile,'Example Workspace')
  await dispatch(args)
  await fixture('Different Workspace')
  await assert.rejects(dispatch(args),e=>e.code==='CONFIG')
  assert.equal(await readFile(config,'utf8'),before)
  await fixture('../escape')
  await assert.rejects(dispatch(args),e=>e.code==='USAGE')
  assert.equal(await readFile(config,'utf8'),before)
})
