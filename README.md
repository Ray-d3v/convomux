# ConvoMux

One CLI for team conversations. Command: `cmx`.

ConvoMux is a read-only CLI that normalizes Microsoft Teams and Slack conversations behind a common interface. It reuses existing clients rather than reimplementing their authentication or private APIs.

## Initial scope

- Teams adapter using `nakasyou/teams-api` (`msteams` / `teams`).
- Slack adapter using `osodevops/slack-cli` (`slk`).
- Conversation discovery, bounded message retrieval, tracked-conversation search, and JSON output.
- Explicit coverage, partial failures, timeouts, and credential-safe diagnostics.
- No AI dependency, message mutations, background sync, or cloud service.

This repository is being bootstrapped. Implementation and tested setup instructions follow in the next commit. No live account access has been verified.
