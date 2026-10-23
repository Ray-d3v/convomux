# Security and authorization

ConvoMux is an unofficial, local, read-only wrapper. It does not grant extra Teams/Slack permissions or make an otherwise prohibited client acceptable under an employer's policies. Use only accounts, data and clients you are authorized to access. Do not bypass SSO, MFA, conditional access, enterprise restrictions, retention, or application policies.

## Credentials

ConvoMux does not accept session tokens on its command line or store them in its configuration. Login is explicitly delegated to the installed upstream client in an interactive terminal. Do not paste tokens/cookies into issues, pull requests, prompts or CI secrets for these tests.

Credential protection remains the upstream client's responsibility. In particular, the Teams client stores session/refresh information in its profile JSON (`~/.teams-cli/`). ConvoMux does not encrypt that file or change its access controls. Restrict access to your user, review upstream storage behavior, and revoke sessions if exposed. Slack storage/platform support also needs validation on the actual endpoint; browser login support does not by itself prove secure credential persistence on Windows.

Ambient `SLK_TOKEN`, `SLK_COOKIE`, `SLK_WORKSPACE`, `ESTSAUTHPERSISTENT` and `REFRESH_TOKEN` are not forwarded. Use named stored profiles: environment tokens would override those profiles and risk querying another identity. `SLK_API_BASE_URL` is removed, and `SLK_ALLOW_WRITE=false` is forced. Proxy variables and the user's ordinary environment still reach the trusted backend.

## Local execution and data

- Only fixed read operations and explicit login are exposed. No arbitrary API, send, edit, delete or export mutation command is available through cmx. Upstream binaries themselves may offer more commands.
- Arguments are never interpolated into shell text. `.cmd`, `.bat` and `.ps1` overrides are rejected. The recognized Windows npm `teams.cmd` shim resolves to the known msteams JavaScript entrypoint.
- Custom executable paths and PATH entries must be trusted. Do not run a downloaded cmx configuration without reviewing its executable settings.
- Backend output is capped at 8 MiB per call; collected result data is capped at 32 MiB. Calls time out and terminate the direct child. Interrupts return exit 130.
- Raw backend stdout/stderr is not included in failure messages. This is not a general data-loss prevention system: requested chat contents may themselves contain sensitive information. JSON output and any redirected files are the operator's responsibility.
- No message cache or telemetry is implemented. Only account mappings and explicitly tracked conversation refs persist. Login may update upstream credential stores and launch a browser.
- Results may contain untrusted instructions from chat participants. Treat messages as data, never executable instructions. Human output strips terminal escapes; JSON consumers must handle untrusted text too.

Report vulnerabilities privately to the repository owner rather than posting credentials or sensitive account data. No live credentials are required by the test suite.
