import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatch } from '../dist/cli.js'
import { run } from '../dist/process.js'

test('unverified Slack login/read fail before profile, executable or credential access, including overrides', async t => {
  const dir=await mkdtemp(join(tmpdir(),'cmx-blocked-slack-')),config=join(dir,'config.json'),marker=join(dir,'must-not-exist'),backend=join(dir,'synthetic backend.mjs')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const sentinel='Synthetic existing configuration must not be parsed or changed by login.'
  await writeFile(config,sentinel)
  await writeFile(backend,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'called');process.exit(99)`)
  for(const override of [[],['--executable',backend],['--executable',join(dir,'absent')]]){
    await assert.rejects(dispatch(['login','slack','--name','work','--workspace','synthetic',...override,'--config',config]),e=>e.code==='CREDENTIAL_STORAGE_BLOCKED')
  }
  for(const executable of [undefined,backend,join(dir,'absent')]){
    await assert.rejects(run({source:'slack',name:'work',profile:'synthetic',...(executable?{executable}:{})},['--workspace','synthetic','api','call','auth.test'],{timeout:1000}),e=>e.code==='CREDENTIAL_STORAGE_BLOCKED')
  }
  assert.equal(await readFile(config,'utf8'),sentinel)
  await assert.rejects(stat(marker),e=>e.code==='ENOENT')
})
