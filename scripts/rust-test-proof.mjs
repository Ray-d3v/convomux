import {createHash} from 'node:crypto'

export const mockTestName='auth::keyring::cmx_secure_tests::cmx_secure_storage_and_requested_profile_fail_closed'
export function mockTestProof(stdout,status){
  const summary=/^test result: ok\. 1 passed; 0 failed; 0 ignored; 0 measured; \d+ filtered out; finished in ([\d.]+)s\s*$/m.exec(stdout)
  if(status!==0||!/^running 1 test\s*$/m.test(stdout)||!stdout.split(/\r?\n/).some(line=>line===`test ${mockTestName} ... ok`)||!summary)throw Error('The exact library mock-store test must execute once and pass; zero tests is not proof')
  return {name:mockTestName,passed:1,failed:0,ignored:0,bodySeconds:Number(summary[1]),outputSha256:createHash('sha256').update(stdout).digest('hex')}
}
