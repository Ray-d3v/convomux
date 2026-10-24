// Offline transport fixture loaded only by tests via Node's --import option.
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'

https.get = (url, options, callback) => {
  writeFileSync(process.env.CMX_TEST_RECEIPT,JSON.stringify({url,options}))
  const request = new EventEmitter()
  request.destroy = () => request.emit('close')
  setImmediate(() => {
    const mode = process.env.CMX_TEST_RESPONSE
    if (mode === 'failure') { request.emit('error',new Error('offline')); request.emit('close'); return }
    if (mode === 'timeout') { request.emit('timeout'); return }
    const response = new EventEmitter(); response.statusCode = mode === '404' ? 404 : 200; response.resume=()=>request.emit('close')
    callback(response)
    if (response.statusCode === 200) {
      response.emit('data',Buffer.from(mode === 'invalid' ? '{' : mode === 'oversized' ? 'x'.repeat(65537) : JSON.stringify({latest:'99.0.0'})))
      response.emit('end'); request.emit('close')
    }
  })
  return request
}
syncBuiltinESMExports()
