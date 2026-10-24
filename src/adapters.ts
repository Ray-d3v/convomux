import { accountFor } from './config.js'
import { backendError, run, type Runner, type RunOptions } from './process.js'
import { CmxError, array, fail, failure, id, makeRef, parseRef, record, result, safeUrl, string, text, timestamp, type Account, type Config, type Conversation, type Coverage, type Failure, type Kind, type Message, type Page, type Ref, type Result } from './model.js'

export class Adapter {
  constructor(readonly account: Account, private runner: Runner = run, private options: RunOptions = { timeout: 30000 }) {}
  private async teams(args: string[]): Promise<unknown> {
    const raw = record(await this.runner(this.account, ['--profile', this.account.profile, '--json', '--no-color', ...args], this.options))
    if (raw.error) throw backendError(JSON.stringify(raw.error), 1)
    if (!('data' in raw) || typeof raw.command !== 'string') return fail('INVALID_RESPONSE', 'Unexpected teams JSON envelope. Check the documented backend version.')
    return raw.data
  }
  private async slack(method: 'auth.test' | 'conversations.list' | 'conversations.history', params: string[] = []): Promise<Record<string, unknown>> {
    // This allowlist is internal. There is deliberately no arbitrary API passthrough command.
    const raw = record(await this.runner(this.account, ['--workspace', this.account.profile, '--output', 'json', '--raw', '--no-retry', 'api', 'call', method, ...params], this.options))
    if (raw.ok === false) throw backendError(JSON.stringify(raw), 1)
    if (raw.ok !== true) return fail('INVALID_RESPONSE', 'Unexpected slk raw JSON response. Check the documented backend version.')
    return raw
  }
  private coverage(limit: number, fetched: number, returned: number, hasMore: boolean | null, cursor: string | null, limitations: string[], ref?: string): Coverage {
    return { source: this.account.source, account: this.account.name, requestedLimit: limit, fetched, returned, hasMore, nextCursor: cursor, complete: false, limitations, ...(ref ? { ref } : {}) }
  }
  async doctor(): Promise<Page<Record<string, unknown>>> {
    if (this.account.source === 'teams') {
      const data = record(await this.teams(['me']))
      array(data.teams); array(data.chats)
      return { data: [{ source: 'teams', account: this.account.name, authenticated: true, backend: 'msteams', capabilities: ['channels', 'chats', 'bounded-history'] }], coverage: this.coverage(0, 0, 0, null, null, ['snapshot-only', 'no-global-message-search', 'no-history-cursor']) }
    }
    const data = await this.slack('auth.test')
    return { data: [{ source: 'slack', account: this.account.name, authenticated: true, backend: 'slk', userId: string(data.user_id), workspaceId: string(data.team_id), capabilities: ['channels', 'chats', 'history-cursor', 'bounded-thread'] }], coverage: this.coverage(0, 0, 0, null, null, []) }
  }
  async conversations(kind: Kind, limit: number, cursor?: string): Promise<Page<Conversation>> {
    const items: Conversation[] = []
    if (this.account.source === 'teams') {
      if (cursor) return fail('UNSUPPORTED', 'The teams CLI does not expose a conversation-list cursor.')
      const data = record(await this.teams(['me']))
      const teams = array(data.teams), chats = array(data.chats)
      const append = (raw: unknown, teamId: string | null, tenantId: string | null): void => {
        const item = record(raw)
        if (item.isDeleted === true) return
        const nativeId = id(item.id)
        const ref: Ref = { source: 'teams', account: this.account.name, kind, id: nativeId }
        const properties = item.threadProperties && typeof item.threadProperties === 'object' ? record(item.threadProperties) : {}
        items.push({ ...ref, ref: makeRef(ref), name: string(item.displayName) ?? string(item.topic) ?? string(properties.topic) ?? nativeId, teamId, tenantId })
      }
      if (kind === 'chat') for (const item of chats) append(item, null, null)
      else for (const raw of teams) {
        const team = record(raw)
        if (team.isDeleted === true) continue
        for (const item of array(team.channels)) append(item, id(team.id), string(team.tenantId))
      }
      const unique = [...new Map(items.map(c => [c.ref, c])).values()]
      return { data: unique.slice(0, limit), coverage: this.coverage(limit, unique.length, Math.min(unique.length, limit), unique.length > limit ? true : null, null, ['upstream-snapshot-not-guaranteed-complete', ...(unique.length > limit ? ['local-limit-reached'] : [])]) }
    }
    const params = [`types=${kind === 'chat' ? 'im,mpim' : 'public_channel,private_channel'}`, `limit=${limit}`, 'exclude_archived=true']
    if (cursor) params.push(`cursor=${cursor}`)
    const raw = await this.slack('conversations.list', params)
    for (const item of array(raw.channels)) {
      const c = record(item)
      const nativeId = id(c.id)
      const ref: Ref = { source: 'slack', account: this.account.name, kind, id: nativeId }
      items.push({ ...ref, ref: makeRef(ref), name: string(c.name) ?? string(c.user) ?? nativeId, teamId: string(c.context_team_id), tenantId: null })
    }
    const next = this.cursor(raw)
    const hasMore = next || items.length > limit ? true : raw.response_metadata === undefined ? null : false
    const coverage = this.coverage(limit, items.length, Math.min(items.length, limit), hasMore, next, ['archived-conversations-excluded'])
    coverage.complete = coverage.hasMore === false && !cursor
    return { data: items.slice(0, limit), coverage }
  }
  private cursor(raw: Record<string, unknown>): string | null {
    if (raw.response_metadata === undefined) return null
    const meta = record(raw.response_metadata)
    if (typeof meta.next_cursor !== 'string') return fail('INVALID_RESPONSE', 'Expected a string pagination cursor from Slack.')
    return string(meta.next_cursor)
  }
  private message(raw: unknown, ref: Ref): Message {
    const m = record(raw)
    const slack = ref.source === 'slack'
    const nativeId = id(slack ? m.ts : m.id)
    const type = string(m.messagetype) ?? ''
    return {
      ...ref, id: nativeId, ref: makeRef(ref), conversationId: ref.id,
      authorId: string(slack ? m.user ?? m.bot_id : m.from),
      authorName: string(slack ? m.username : m.imdisplayname ?? m.fromDisplayName),
      createdAt: slack ? timestamp(m.ts, true) : timestamp(m.composetime ?? m.composeTime ?? m.originalarrivaltime),
      text: text(slack ? m.text : m.content ?? m.text, !slack && (type.toLowerCase().includes('html') || /<\/?[a-z][^>]*>/iu.test(string(m.content) ?? ''))),
      threadId: string(slack ? m.thread_ts : m.replyToId ?? m.parentMessageId),
      url: safeUrl(m.permalink ?? m.webUrl),
    }
  }
  async messages(ref: Ref, limit: number, cursor?: string, thread?: string): Promise<Page<Message>> {
    if (ref.source !== this.account.source || ref.account !== this.account.name) return fail('USAGE', 'Conversation ref does not match this account.')
    let rows: unknown[], hasMore: boolean | null = null, next: string | null = null
    const limitations: string[] = []
    if (ref.source === 'teams') {
      if (cursor || thread) return fail('UNSUPPORTED', 'The teams CLI does not expose history paging or a dedicated thread fetch. Use bounded messages instead.')
      const data = await this.teams(ref.kind === 'channel' ? ['channel', 'messages', ref.id, '--limit', String(limit)] : ['messages', ref.id, '--limit', String(limit)])
      rows = ref.kind === 'channel' ? array(data) : array(record(data).messages)
      limitations.push('upstream-paging-unavailable', 'thread-coverage-unknown')
    } else if (thread) {
      if (cursor) return fail('UNSUPPORTED', 'slk thread output does not expose a continuation cursor.')
      if (!/^\d{10,}\.\d{6}$/u.test(thread)) return fail('USAGE', 'Slack thread IDs must be exact Slack timestamp strings, e.g. 1700000000.000001.')
      // msg thread preserves timestamp strings; the generic API parser coerces them to floats.
      const data = await this.runner(this.account, ['--workspace', this.account.profile, '--output', 'json', '--raw', '--no-retry', 'msg', 'thread', ref.id, thread, '--limit', String(limit)], this.options)
      rows = array(data)
      limitations.push('thread-first-page-only', 'parent-message-included', 'upstream-paging-unavailable')
    } else {
      const params = [`channel=${ref.id}`, `limit=${limit}`]
      if (cursor) params.push(`cursor=${cursor}`)
      const raw = await this.slack('conversations.history', params)
      rows = array(raw.messages)
      next = this.cursor(raw)
      hasMore = typeof raw.has_more === 'boolean' ? raw.has_more || Boolean(next) : next ? true : null
      limitations.push('thread-replies-not-expanded')
    }
    const unique = [...new Map(rows.map(row => { const m = this.message(row, ref); return [m.id, m] as const })).values()]
    unique.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id))
    if (unique.length > limit) { hasMore = true; limitations.push('local-limit-reached') }
    return { data: unique.slice(0, limit), coverage: this.coverage(limit, rows.length, Math.min(unique.length, limit), hasMore, next, limitations, makeRef(ref)) }
  }
}

export async function collect<T>(tasks: { account: Account; ref?: string; work: () => Promise<Page<T>> }[], maxBytes = 32 * 1024 * 1024): Promise<Result<T>> {
  const data: T[] = [], coverage: Coverage[] = [], errors: Failure[] = []
  let successes = 0, bytes = 0, exhausted = false
  const blocked = new Map<string, string>()
  // Serialize calls: teams-api refreshes and rewrites its profile during reads.
  for (const task of tasks) {
    const key = `${task.account.source}/${task.account.name}`
    try {
      const block = blocked.get(key)
      if (block) throw new CmxError(block, 'Further requests for this account were skipped after an authentication, secure-storage, platform or rate-limit failure.')
      if (exhausted) fail('NOT_ATTEMPTED', 'Not fetched because the aggregate result limit was reached.')
      const page = await task.work()
      bytes += Buffer.byteLength(JSON.stringify(page.data))
      if (bytes > maxBytes) { exhausted = true; fail('OUTPUT_LIMIT', 'Aggregate results exceeded 32 MiB. Select fewer conversations or a smaller --limit.') }
      data.push(...page.data); coverage.push(page.coverage); successes++
    }
    catch (error) {
      const item = failure(error)
      if (['AUTHENTICATION', 'RATE_LIMITED', 'CREDENTIAL_STORAGE_BLOCKED', 'CREDENTIAL_STORAGE_UNAVAILABLE', 'CREDENTIAL_PROFILE_UNAVAILABLE'].includes(item.code) || item.code === 'UNSUPPORTED' && task.account.source === 'slack') blocked.set(key, item.code)
      errors.push({ ...item, source: task.account.source, account: task.account.name, ...(task.ref ? { ref: task.ref } : {}) })
    }
  }
  return result(data, coverage, errors, successes)
}
export function filterMessages(page: Page<Message>, query?: string, since?: number, until?: number): Page<Message> {
  const normalized = query?.normalize('NFKC').toLowerCase()
  let unknownDates = 0
  const data = page.data.filter(m => {
    if (since !== undefined || until !== undefined) {
      if (!m.createdAt) { unknownDates++; return false }
      const time = Date.parse(m.createdAt)
      if ((since !== undefined && time < since) || (until !== undefined && time > until)) return false
    }
    return normalized === undefined || m.text.normalize('NFKC').toLowerCase().includes(normalized)
  })
  return { data, coverage: { ...page.coverage, returned: data.length, complete: false, limitations: [...page.coverage.limitations, 'filters-apply-to-fetched-page-only', ...(unknownDates ? [`unknown-timestamps-excluded:${unknownDates}`] : [])] } }
}
export async function search(config: Config, accounts: Account[], query: string, limit: number, options: RunOptions, since?: number, until?: number, runner: Runner = run): Promise<Result<Message>> {
  if (!query.trim() || query.length > 1000) return fail('USAGE', 'Search requires 1–1000 non-empty characters.')
  const refs = config.tracked.map(parseRef).filter(ref => accounts.some(a => a.source === ref.source && a.name === ref.account))
  if (!refs.length) return fail('NOT_CONFIGURED', 'No tracked conversations match. Run cmx track add <ref> first.')
  const response = await collect(refs.map(ref => {
    const account = accountFor(config, ref.source, ref.account)
    return { account, ref: makeRef(ref), work: async () => {
      const page = filterMessages(await new Adapter(account, runner, options).messages(ref, limit), query, since, until)
      page.coverage.limitations.push('tracked-conversations-only', 'literal-substring-search')
      return page
    } }
  }))
  response.data.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.ref.localeCompare(b.ref) || a.id.localeCompare(b.id))
  return response
}
