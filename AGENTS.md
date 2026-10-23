# ConvoMux development contract

- Project: ConvoMux. Executable: `cmx`. Initial scope is read-only Teams/Slack access, not AI.
- Reuse `msteams` / `slk`; inspect their current source contracts before changing adapter arguments. Never implement token extraction or private API authentication in this repo.
- Use TypeScript strict mode and Node.js built-ins where sufficient. No `any` or new dependency without a concrete need. Keep runtime dependencies minimal.
- Run `npm ci --ignore-scripts` and `npm run check` before committing. Tests must be offline, synthetic, and independent of credentials or backend installations.
- Maintain tests for argument ordering, response envelopes, timestamps, partial errors, bounds, and Windows-safe execution.
- Use argument arrays and `shell: false`. Never expose arbitrary API/shell passthrough or add message mutations without an explicit scope decision.
- stdout is one JSON object for `--json` (except help); stderr is diagnostics. Never include raw backend failures, session tokens, cookies, profile file contents, or account data in fixtures/logs.
- Do not call a bounded result complete. Keep source/account identity, fetched scope, paging limitations, and partial failures in the JSON contract. Increment schemaVersion for incompatible changes.
- Keep backend calls sequential within an invocation: Teams refresh operations rewrite its profile. Do not introduce background sync or unbounded exports.
- Configuration must stay credential-free and use atomic, lock-protected updates. Executable overrides are trusted local code, not remote configuration.
- Keep README and SECURITY in sync with behavior. `private: true` and `UNLICENSED` are deliberate until the owner decides release/license policy.
- CI covers Windows/macOS/Linux and Node 22/24 with mock backends. This does not prove real account authentication works.
