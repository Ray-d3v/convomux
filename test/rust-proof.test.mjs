import test from 'node:test'
import assert from 'node:assert/strict'
import {mockTestProof} from '../scripts/rust-test-proof.mjs'

test('native build proof rejects zero, ignored, failed or unrelated tests despite a successful process exit',()=>{
  const success='running 1 test\ntest auth::keyring::cmx_secure_tests::cmx_secure_storage_and_requested_profile_fail_closed ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 12 filtered out; finished in 0.01s\n'
  assert.equal(mockTestProof(success,0).passed,1)
  for(const [stdout,status] of [
    ['running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n',0],
    [success.replace(' ... ok',' ... ignored').replace('1 passed; 0 failed; 0 ignored','0 passed; 0 failed; 1 ignored'),0],
    [success.replace('cmx_secure_storage_and_requested_profile_fail_closed','unrelated_test'),0],
    [success,101],
  ])assert.throws(()=>mockTestProof(stdout,status),/must execute once and pass/)
})
