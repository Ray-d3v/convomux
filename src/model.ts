export type Source = 'teams' | 'slack'
export type Kind = 'channel' | 'chat'
export interface Account {
  source: Source
  name: string
  profile: string
  executable?: string
}
export interface Config {
  schemaVersion: 1
  accounts: Account[]
  tracked: string[]
}
export interface Ref {
  source: Source
  account: string
  kind: Kind
  id: string
}
export interface Conversation extends Ref {
  ref: string
  name: string
  teamId: string | null
  tenantId: string | null
}
export interface Message extends Ref {
  ref: string
  id: string
  conversationId: string
  authorId: string | null
  authorName: string | null
  createdAt: string | null
  text: string
  threadId: string | null
  url: string | null
}
export interface Coverage {
  source: Source
  account: string
  ref?: string
  requestedLimit: number
  fetched: number
  returned: number
  hasMore: boolean | null
  nextCursor: string | null
  complete: boolean
  limitations: string[]
}
export interface Page<T> { data: T[]; coverage: Coverage }
export interface Failure { code: string; message: string; source?: Source; account?: string; ref?: string }
export interface Result<T> {
  schemaVersion: 1
  ok: boolean
  status: 'ok' | 'partial' | 'error'
  data: T[]
  coverage: Coverage[]
  errors: Failure[]
}
export class CmxError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'CmxError' }
}
export function fail(code: string, message: string): never { throw new CmxError(code, message) }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_RESPONSE', 'Expected a JSON object from the backend.')
  return value as Record<string, unknown>
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) return fail('INVALID_RESPONSE', 'Expected a JSON array from the backend.')
  return value
}
export function string(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
export function id(value: unknown): string {
  const result = string(value) ?? (typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null)
  if (!result || result.length > 2048 || /^[\s-]/u.test(result) || /[\x00-\x1f\x7f]/u.test(result)) return fail('INVALID_RESPONSE', 'Missing or invalid backend identifier.')
  return result
}
export function label(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(value) || value === '.' || value === '..') return fail('USAGE', 'Account/profile names must use 1–64 letters, digits, dots, underscores or hyphens.')
  return value
}
export function source(value: string): Source {
  if (value !== 'teams' && value !== 'slack') return fail('USAGE', 'Source must be teams or slack.')
  return value
}
export function storedProfile(value: string, service: Source): string {
  if (service === 'teams') return label(value)
  // slk browser login stores the service's display name, not necessarily its subdomain.
  // This also becomes part of upstream fallback filenames: exclude path/control characters.
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{Zs}._()-]{0,127}$/u.test(value) || value === '.' || value === '..') return fail('USAGE', 'Slack stored workspace names must be safe display names without path or control characters.')
  return value
}
export function makeRef(value: Ref): string {
  return [value.source, label(value.account), value.kind, encodeURIComponent(id(value.id))].join('/')
}
export function parseRef(value: string): Ref {
  const [src, account, kind, encoded, extra] = value.split('/')
  if (!src || !account || !encoded || extra !== undefined || (kind !== 'channel' && kind !== 'chat')) return fail('USAGE', 'Use a conversation ref returned by cmx channels or cmx chats.')
  let decoded: string
  try { decoded = decodeURIComponent(encoded) } catch { return fail('USAGE', 'Malformed conversation ref.') }
  const ref: Ref = { source: source(src), account: label(account), kind, id: id(decoded) }
  if (makeRef(ref) !== value) return fail('USAGE', 'Conversation ref is not in canonical form.')
  return ref
}
export function timestamp(value: unknown, seconds = false): string | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/u.test(value) ? Number(value) : NaN
  const ms = Number.isFinite(n) ? n * (seconds ? 1000 : 1) : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null
}
export function timeBound(value: string | undefined, now = Date.now()): number | undefined {
  if (value === undefined) return undefined
  const match = /^(\d+)(m|h|d)$/u.exec(value)
  if (match) {
    const unit = match[2] === 'm' ? 60000 : match[2] === 'h' ? 3600000 : 86400000
    const ms = Number(match[1]) * unit
    if (!Number.isSafeInteger(ms) || ms <= 0) return fail('USAGE', 'Relative time must be a positive duration such as 24h or 7d.')
    return now - ms
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) return fail('USAGE', 'Use 7d, 24h, 30m or an ISO timestamp with a timezone.')
  return Date.parse(value)
}
export function positive(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback
  if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > max) return fail('USAGE', `Expected an integer between 1 and ${max}.`)
  return Number(value)
}
// Deliberately a text preview, not an HTML renderer. Keep scripts/styles out of search results.
export function text(value: unknown, html = false): string {
  let s = typeof value === 'string' ? value : ''
  if (html) s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '').replace(/<\/(?:p|div|li)>|<br\s*\/?>/giu, '\n').replace(/<[^>]*>/gu, '')
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  s = s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (full: string, key: string) => {
    if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? full
    const cp = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10)
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : full
  })
  return s.replace(/\r\n/gu, '\n').trim()
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null } catch { return null }
}
export function failure(error: unknown): Failure {
  return error instanceof CmxError ? { code: error.code, message: error.message } : { code: 'INTERNAL', message: 'Unexpected failure. No backend output or credential data has been printed.' }
}
export function result<T>(data: T[], coverage: Coverage[] = [], errors: Failure[] = [], successes = 1): Result<T> {
  const status = errors.length ? (successes ? 'partial' : 'error') : 'ok'
  return { schemaVersion: 1, ok: status === 'ok', status, data, coverage, errors }
}
export function exitCode(value: Result<unknown>): number {
  if (value.status === 'ok') return 0
  if (value.errors.some(e => e.code === 'INTERRUPTED')) return 130
  if (value.status === 'partial') return 3
  return value.errors.some(e => ['USAGE', 'CONFIG', 'CONFIG_LOCKED', 'NOT_CONFIGURED'].includes(e.code)) ? 2 : 1
}
// Terminal escapes are removed only for human output. JSON remains machine-readable.
export function terminal(value: string): string {
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/gu, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '').replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu, '')
}
