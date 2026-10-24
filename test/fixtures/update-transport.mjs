// Offline transport fixture loaded only by tests via Node's --import option.
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'

https.get = (url, options, callback) => {
  const receipt={url,options,destroyed:false}
  const record=()=>writeFileSync(process.env.CMX_TEST_RECEIPT,JSON.stringify(receipt))
  record()
  const request = new EventEmitter()
  request.destroy = () => { receipt.destroyed=true;record();request.emit('close') }
  setImmediate(() => {
    const mode = process.env.CMX_TEST_RESPONSE
    if (mode === 'failure') { request.emit('error',new Error('offline')); request.emit('close'); return }
    if (mode === 'timeout') { request.emit('timeout'); return }
    const response = new EventEmitter(); response.statusCode = mode === '404' ? 404 : 200; response.resume=()=>request.emit('close')
    callback(response)
    // All statuses can carry a valid body. The worker owns status admission,
    // JSON validity and size rejection; this fixture does not decide them.
    response.emit('data',Buffer.from(mode==='invalid'?'{':JSON.stringify({latest:'99.0.0',...(mode==='oversized'?{padding:'x'.repeat(65536)}:{})})))
    if(!receipt.destroyed)response.emit('end')
    request.emit('close')
  })
  return request
}
syncBuiltinESMExports()
