// Synthetic contract fixture. Never contacts a service or contains real credentials.
const args = process.argv.slice(2)
const output = value => console.log(JSON.stringify(value))
const teamMessage = { id: 'M1', content: '<p>障害対応を確認</p>', from: 'U1', imdisplayname: 'Example', composetime: '2026-10-22T00:00:00Z', messagetype: 'RichText/Html' }
const slackMessage = { ts: `${Date.parse('2026-10-22T00:00:00Z') / 1000}.000001`, user: 'U2', text: '障害復旧を確認' }
if (args[0] === '--profile') {
  if (args[1] !== 'work' || args[2] !== '--json' || args[3] !== '--no-color') throw Error('Unexpected Teams globals')
  const command = args.slice(4)
  if (command[0] === 'me') output({ command: 'me', data: { teams: [{ id: 'T1', tenantId: 'tenant-example', channels: [{ id: '19:example@thread.tacv2', displayName: 'General' }] }], chats: [{ id: '19:chat', topic: 'Example chat' }] } })
  else if (command[0] === 'channel' && command[1] === 'messages') output({ command: 'channel-messages', data: [teamMessage] })
  else if (command[0] === 'messages') output({ command: 'messages', data: { messages: [teamMessage] } })
  else throw Error('Unexpected Teams command')
} else {
  const prefix = ['--workspace', 'company', '--output', 'json', '--raw', '--no-retry']
  if (!prefix.every((arg, i) => args[i] === arg)) throw Error('Unexpected Slack globals')
  if (process.env.CMX_TEST_SLACK_FAIL === '1') {
    output({ ok: false, error: 'invalid_auth', token: 'xoxc-fake-never-log-this' }); process.exitCode = 1
  } else if (args[6] === 'msg' && args[7] === 'thread') output([slackMessage])
  else if (args[6] !== 'api' || args[7] !== 'call') throw Error('Unexpected Slack command')
  else if (args[8] === 'auth.test') output({ ok: true, user_id: 'U2', team_id: 'T2' })
  else if (args[8] === 'conversations.list') output({ ok: true, channels: [{ id: args.includes('types=im,mpim') ? 'D123' : 'C123', name: 'General' }], response_metadata: { next_cursor: '' } })
  else if (args[8] === 'conversations.history') output({ ok: true, messages: [slackMessage], has_more: false, response_metadata: { next_cursor: '' } })
  else throw Error('Unexpected Slack API method')
}
