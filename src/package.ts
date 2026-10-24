import { readFileSync } from 'node:fs'

// Read the installed manifest, so renaming the public package also updates notices.
export const packageInfo: { name: string; version: string } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
