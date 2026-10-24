import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fail, type Source } from './model.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const targets: Record<string, string> = {
  'win32-x64': 'slk.exe', 'darwin-arm64': 'slk', 'darwin-x64': 'slk',
  'linux-x64': 'slk', 'linux-arm64': 'slk',
}
export function slackTarget(platform: string, arch: string): { target: string; binary: string } {
  const target = `${platform}-${arch}`, binary = targets[target]
  if (!binary) return fail('UNSUPPORTED', `Bundled Slack is unavailable for ${target}. Supported: ${Object.keys(targets).join(', ')}. Use a trusted absolute --executable override if available.`)
  return { target, binary }
}
export async function bundledBackend(source: Source, platform: string, arch: string): Promise<string> {
  if (source === 'slack') {
    const { target, binary } = slackTarget(platform, arch)
    return join(root, 'vendor', 'slk', target, binary)
  }
  try {
    const dist = dirname(fileURLToPath(import.meta.resolve('msteams')))
    const manifest = JSON.parse(await readFile(join(dist, '..', 'package.json'), 'utf8')) as { version?: string; bin?: { teams?: string } }
    if (manifest.version !== '0.2.1' || manifest.bin?.teams !== 'dist/cli/index.mjs') throw new Error('Backend contract mismatch')
    return join(dist, 'cli', 'index.mjs')
  } catch { return fail('DEPENDENCY_MISSING', 'The packaged msteams 0.2.1 entry is missing or incompatible. Reinstall ConvoMux from a verified package.') }
}
