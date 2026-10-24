import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { run } from '../dist/process.js'

test('unverified Slack CLI/API overrides are refused without changing settings or executing code', async t => {
  const dir=await mkdtemp(join(tmpdir(),'cmx-blocked-slack-')),config=join(dir,'config.json'),marker=join(dir,'must-not-exist'),backend=join(dir,'synthetic backend.mjs')
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const sentinel='Synthetic existing configuration must not be parsed or changed by login.'
  await writeFile(config,sentinel)
  await writeFile(backend,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'called');process.exit(99)`)
  const native=join(dir,process.platform==='win32'?'unverified.exe':'unverified-native')
  await writeFile(native,'synthetic unverified native bytes')
  // Never exercise a real bundled auth command, even when a valid native build is present.
  for(const override of [['--executable',backend],['--executable',join(dir,'absent')]]){
    const output=spawnSync(process.execPath,[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),'login','slack','--name','work','--workspace','synthetic',...override,'--config',config,'--json'],{encoding:'utf8',timeout:6000,env:{...process.env,CMX_NO_UPDATE_NOTIFIER:'1'}})
    assert.equal(output.error,undefined);assert.equal(output.status,1)
    assert.equal(JSON.parse(output.stdout).errors[0].code,'CREDENTIAL_STORAGE_BLOCKED')
  }
  for(const executable of [backend,native,join(dir,'absent')]){
    await assert.rejects(run({source:'slack',name:'work',profile:'synthetic',...(executable?{executable}:{})},['--workspace','synthetic','api','call','auth.test'],{timeout:1000}),e=>e.code==='CREDENTIAL_STORAGE_BLOCKED')
  }
  assert.equal(await readFile(config,'utf8'),sentinel)
  await assert.rejects(stat(marker),e=>e.code==='ENOENT')
})
