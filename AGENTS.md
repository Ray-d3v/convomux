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
- Keep README and SECURITY in sync with behavior. The owner approved MIT for ConvoMux on 2026-10-25; preserve the root LICENSE and third-party notices. `private: true` remains deliberate until publication is separately authorized. The npm account is not yet created and the final npm name/scope is unconfirmed.
- CI covers Windows/macOS/Linux and Node 22/24 with mock backends. This does not prove real account authentication works.

## Test audit and proportional proof

- Apply the [OpenClaw test-audit authoring/retention method](https://github.com/openclaw/openclaw/blob/fe8d4597345c307f637fe0a2a5e6770226c7da9d/.agents/skills/test-audit/SKILL.md) and its proof policy as adapted in [TEST_AUDIT.md](docs/TEST_AUDIT.md). Reference revision fe8d4597345c307f637fe0a2a5e6770226c7da9d is MIT; it grants no extra push/publication, infrastructure, live-account or vault authority. Do not install/copy a global skill for this.
- Before changing proof, name the observable contract, credible regression and strongest owner. Record keeper proof before deleting duplication. Never delete safety/storage/auth/input/real-package tests merely for being slow; repair unreachable or unrelated negative controls. Remove test-only exports/default overrides when moving proof to a real boundary.
- Fast edit loop: `npm run test:focused -- test/core.test.mjs` (or the touched owner/sibling files). It typechecks/builds once, then runs only named Node tests. With current dist, `node --test --test-name-pattern="PATTERN" test/FILE.test.mjs` is narrower. Do not use another repo's pnpm/Vitest/deadcode commands here.
- The existing pre-commit `npm ci --ignore-scripts` / `npm run check` requirement remains. `check` performs a strict TS build and the full offline Node suite once; a second noEmit pass is redundant. Run final proof after the coherent batch, not unchanged full suites after every assertion edit. Measure compile and test time separately; repeat only for changed inputs, failures or a named coverage gap.
- Broad package/OS proof belongs to PR CI: retain the four native patched-backend jobs and ten exact-tgz OS/CPU x Node22/24 install jobs, both local/global prefixes, hashes/licenses/modes, corruption/override refusal and actual backend help/version. Feature pushes must not duplicate the same PR matrix; main/manual/reusable release CI remain available. Consumers still install with --ignore-scripts and no compiler.
- Rust credential proof is the exact named library test via `node scripts/test-secure-slk.mjs TARGET`. Zero/ignored/unrelated tests are failure even if Cargo exits 0. Require count/name/source/patch/target evidence before admitting a backend; never substitute a success flag. Use only mock stores and synthetic fixtures, never actual credentials/vaults. Do not repeat complete Rust/Release pipelines just to obtain green or a timing sample.
