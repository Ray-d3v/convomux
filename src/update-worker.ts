// Uses simple-update-notifier's public npm dist-tags endpoint pattern; see THIRD_PARTY_NOTICES.md.
// A separate bounded worker preserves CLI latency and never reads npm auth configuration.
import { get } from 'node:https'
import { readFileSync } from 'node:fs'
import { packageInfo } from './package.js'
import { newerStable, updateCachePath, writeUpdateCache, type UpdateCache } from './updates.js'

const deadline = setTimeout(() => process.exit(0), 4000)
try {
  const checkedAt = Number(process.argv[2]), path = updateCachePath()
  const request = get(`https://registry.npmjs.org/-/package/${packageInfo.name}/dist-tags`, { headers: { accept: 'application/json' }, timeout: 3000 }, response => {
    let body = '', bytes = 0
    if (response.statusCode !== 200) { response.resume(); return }
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 65536) { request.destroy(); return }
      body += chunk.toString('utf8')
    })
    response.on('error', () => {})
    response.on('end', () => {
      try {
        const data = JSON.parse(body) as { latest?: unknown }
        const previous = JSON.parse(readFileSync(path, 'utf8')) as UpdateCache
        if (previous.checkedAt === checkedAt && newerStable(data.latest, packageInfo.version)) writeUpdateCache(path, { checkedAt, latest: data.latest })
      } catch { /* Invalid response, unpublished package or unwritable cache. */ }
    })
  })
  request.on('timeout', () => request.destroy())
  request.on('error', () => {})
  request.on('close', () => clearTimeout(deadline))
} catch { clearTimeout(deadline) }
