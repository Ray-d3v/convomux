// Synthetic contract fixture. Never contacts a service or contains real credentials.
const args = process.argv.slice(2)
const output = value => console.log(JSON.stringify(value))
const teamMessage = { id: 'M1', content: '<p>障害対応を確認</p>', from: 'U1', imdisplayname: 'Example', composetime: '2026-10-22T00:00:00Z', messagetype: 'RichText/Html' }
if (args[0] === '--profile') {
  if (args[1] !== 'work' || args[2] !== '--json' || args[3] !== '--no-color') throw Error('Unexpected Teams globals')
  const command = args.slice(4)
  if (command[0] === 'me') output({ command: 'me', data: { teams: [{ id: 'T1', tenantId: 'tenant-example', channels: [{ id: '19:example@thread.tacv2', displayName: 'General' }] }], chats: [{ id: '19:chat', topic: 'Example chat' }] } })
  else if (command[0] === 'channel' && command[1] === 'messages') output({ command: 'channel-messages', data: [teamMessage] })
  else if (command[0] === 'messages') output({ command: 'messages', data: { messages: [teamMessage] } })
  else throw Error('Unexpected Teams command')
} else throw Error('Unexpected backend invocation')
