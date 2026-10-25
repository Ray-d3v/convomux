# ConvoMux test audit (2026-10-24)

Baseline: task branch commit `6cfa1267cb24542d5948d40884e024ae170ea513`, not unrelated main. No baseline test was deleted for failing or being slow. Existing service/account/vault/publication restrictions stay in force.

## Method and authority

Applied the user-requested [OpenClaw test-audit](https://github.com/openclaw/openclaw/blob/fe8d4597345c307f637fe0a2a5e6770226c7da9d/.agents/skills/test-audit/SKILL.md), its audit checklist/CAMPAIGN, writing-tests, boundary-scenarios and openclaw-testing proof policy at fixed revision `fe8d4597345c307f637fe0a2a5e6770226c7da9d`. Required reference files and LICENSE were Git-blob/SHA-256 verified in a task-local read-only snapshot. Upstream license is MIT; the method is adapted and linked, not installed or copied as a new global/repository skill. ConvoMux's own license is unchanged. OpenClaw-specific commands, infrastructure, push/land and live-data authority do not transfer here.

Three independent read-only owner reviews inspected all 47 declarations, complete production owners/callers, fixtures, history and CI routing before edits. R=retain; F=repair an assertion/control; C=move useful proof to named keeper; D=delete only with remaining proof. No deletion-count goal applies.

## Existing cost evidence

| Measurement | Observed baseline | Limits |
|---|---:|---|
| MSI Node full test body | 5.014 s, 47 declarations: 45 pass, 2 Unix-only skips | One sample; not pure CPU time |
| MSI `npm run build` | 2.066 s wall | Includes npm/compiler startup |
| MSI `npm run check` | 9.134 s wall | Includes two TS passes and Node tests |
| CI Windows Node24 test body | 4.984 s | Saved run 40104370182 |
| CI standalone TS build example | 1 s step wall | Includes command startup; native macOS arm64 verifier job |
| Cold macOS x64 Rust test-target compilation | 350 s | **Ran zero tests**, not successful storage proof |
| Cold macOS x64 Rust normal release compilation | 270 s | Separate binary build |
| Warm macOS x64 Rust test-target / release compilation | 46.31 s / 211 s | Cached dependencies; still zero tests |
| CI total elapsed critical path | 615 s | Parallel run 40104370182 |
| CI Node/Rust/package/native job sums | 133 / 805 / 51 / 670 runner-seconds | Includes setup/cache/downloads; sums are not elapsed time |
| Active implementation time / queue-only time | Unmeasured | Do not attribute to tests |

The main observed costs are compilation and real multi-platform package installation, not Node test quantity. Source-proven duplication: feature push and PR each launch 21 jobs; check invokes TS twice; package creates an unused root tgz through prepack before smoke creates the tested tgz. Planned cleanup preserves the real package matrix and manual prepack guard. No repeated heavy run is used solely for timing.

## Baseline proof defect: Rust selected the wrong target

`src/main.rs` imports the slk library; the injected test lives under lib.rs -> auth. `cargo test --bin slk cmx_secure` reported 0 tests/0 filtered out, yet the receipt asserted mockStorageTestsPassed. The compile/help/package results remain real; the storage-test claim and candidate admission evidence are withdrawn. Fix requires --lib with the exact qualified test, an explicit count/name proof, and rejection of old receipts lacking it. Valid profile fixtures must be positively checked; Linux's earlier persistence refusal is not requested-profile branch proof. No real native store is used.

## Owner ledger recorded before cutover

Each short name below uniquely identifies its baseline declaration. The right column states the credible regression and remaining owner proof.

| Owner / baseline test | Mark | Contract / disposition |
|---|:---:|---|
| core: refs/native IDs/account isolation | F | Pin independent encoded ref; compare same native ID with only source changed |
| core: time bounds | R | Duration arithmetic, timezone and malformed/overflow rejection |
| core: HTML/Japanese/entities/scripts | R | Literal sanitized output; not supplied by fixture logic |
| core: ANSI/OSC/bidi output | R | Prevent terminal control leakage |
| core: Teams globals/tenant | R | Dependency-visible argument ordering and actual envelope interpretation |
| core: Teams channel/chat history | R | Different response shapes, deduplication/fetched counts, paging rejection |
| core: schema mismatch | R | Malformed upstream data rejects; injected auth body stays redacted |
| core: Slack raw history/cursor/timestamps | F | Missing --raw must fail; old indexOf order test accepted -1 |
| core: Slack channel/DM types | F | Add channel row beside existing chat row; retain explicit empty cursor completion |
| core: Slack thread | R | Exact timestamp transport, parent inclusion and unknown paging |
| core: partial empty success | R | Empty success still counts and retains exit 3; separate interrupt precedence |
| core: aggregate bytes | R | Retain earlier data, reject overflow, skip subsequent requests |
| core: tracked literal search | F | Keep literal/NFKC/date semantics; add actual excluded-account fetch control |
| core: config schema/identities/credential fields | R | Injected token/dangling ref/duplicate account rejection owns credential exclusion |
| core: config file updates/locks | F | Keep private mode/idempotence/binding/locks; drop token-not-present assertion with no token input; name only exercised proof |
| core: shell metachar transport | R | Real child receives independently selected payload unchanged |
| core: timeout/output/redaction | F | Add actual stderr overflow row; stdout, timeout and redaction remain |
| core: aborted/invalid JSON child | R | Actual process cancellation and parser isolation |
| core: credential/endpoint env filtering | R | Independent account-routing environment contract |
| core: Node entry/shims/resolver | R | Real resolver/override wiring; target table alone cannot replace |
| core: config symlink | R | Actual Unix filesystem rejection, not a mock decision |
| core: missing cursor metadata | R | Unknown is not complete; wrong cursor type rejects |
| core: per-account stop | R | Security/rate/platform failure skips that account, preserves Teams |
| core: interrupt after partial data | R | Exit 130 takes precedence over partial 3 |
| CLI: help/version without config | R | Public parser/bootstrap and JSON version shape |
| CLI: Teams subprocess + blocked Slack | R | Keep successful Teams flow and structured Slack rejection |
| CLI: JSON bounded search | R | Keeper for JSON framing, source identity, partial status and coverage |
| CLI: second blocked search/secret flag | C | Move partial/source assertions into JSON search; fixture secret branch is unreachable before .mjs rejection |
| CLI: invalid arguments/write commands | F | Retain usage envelope; title must not claim unobserved child nonexecution |
| CLI: cursor selectors/Teams paging | F | Keep ambiguous selector and Teams refusal; drop Slack status row that stops at script admission rather than paging |
| CLI: dates/global-search/empty query | R | Dispatch combination validation differs from date parser |
| CLI: account/tracking operations | R | Real local command wiring and idempotence |
| CLI: noninteractive Teams login | R | Public login refusal before prompt |
| CLI: missing Teams backend | R | Structured dependency failure through CLI |
| CLI: human output/scope diagnostics | R | Stdout data versus stderr warning |
| CLI: synthetic npm symlink | D | Stronger keeper is exact-tgz offline global install and actual npm shim in every native package job |
| login: blocked overrides | F | Keep real CLI/config sentinel/process marker; replace dispatch-only test export with public subprocess boundary |
| storage: secure error diagnostics | R | Stable safe codes, no raw failure body |
| storage: provenance admission table | R | Real validator sees independently altered external records; actual positive delivery owned by native package jobs |
| storage: offline build facts | R | Never claims live identity/store verification; native package owns successful prepared-build admission |
| storage: TTY/no-I/O diagnosis | R | Observed forbidden filesystem/network/spawn calls; cache/notifier must stay inactive |
| distribution: target selection | R | Exact OS/CPU mapping and rejection of unsupported architectures |
| distribution: archive boundary | R | Real parsers reject hash mismatch/unsafe files/links/missing bytes |
| notices: SPDX directories | R | Collector output retains real notice text and excludes executable source |
| updates: SemVer policy | R | Independent stable/prerelease/current comparison; no copied SDK internals |
| updates: real worker offline transport | F | Valid oversized/404 body and actual request destruction must exercise intended guards |
| updates: notifier lifecycle | F | Observe stdout as well as stderr; keep daily cache/no-network/TTY/environment/failure policy |

Before deleting the obsolete Slack subprocess fixture, retain adapter Slack JSON/cursor/thread proof in core, redaction in core/storage, actual patched backend proof in Rust and package jobs, and CLI mixed-source partial results. The fixture's old Slack response/secret flag cannot be reached because all CLI Slack fixture paths are .mjs; do not pretend it proves authentication failure.

Test-only surface: dispatch is imported only by login.test; real CLI proof permits unexporting it. render/main have no imported callers. Adapter runner, process runner, provenance validation and archive/notice helpers have real production/tooling callers or an independent boundary with no stronger keeper, so do not remove them blindly. Make the SemVer comparator's current version an explicit business input at actual production call sites rather than an optional test-only override.

## Cutover and preservation evidence

The focused owner/sibling run passed 43 declarations (42 pass, one Unix-only skip on MSI) in 4.350 s test-body time. The final whole Node run passed 46 declarations (45 pass, one skip): two redundant declarations removed, one zero-test-proof regression added. No test file was removed. Source/app, test/support and tooling line counts are recorded separately in the PR evidence; runtime proof validation added for a real defect is not misreported as pruning savings.

Physical lines including blanks, documentation excluded: runtime TS 966→972 (+6, mandatory actual-proof validation); tests/fixtures 662→662 (net 0); build/CI tooling 597→633 (+36, exact library-test runner/proof protocol). Rust patch test controls are counted separately from runtime TS. Three unnecessary CLI export modifiers and the comparator's optional test-only current-version default were removed. The final workspace/raw/thread prefix assertions passed as two direct targeted tests in 0.115 s. The npm file-focused command is intended for file arguments; use the documented direct Node command for name patterns.

Six deliberate controls were caught by intended assertions: missing API --raw (0.165 s), disabled response-size guard (0.541 s), disabled HTTP-status admission (0.363 s), removed timeout cancellation (4.660 s), notice sent to stdout (0.178 s), and zero-test success accepted (isolated parser copy). Compiled code was restored byte-for-byte after each control. Only the affected owner ran; no Rust/Release pipeline was repeated for these measurements. Raw and thread fixtures also pin the actual requested-workspace prefix: otherwise even a corrected backend may select its default active profile when no workspace is supplied.

All three independent read-only preservation reviewers found no lost substantive contract. Uncertain seams (search runner, aggregate-byte budget, simulated target parameters) remain because no cheaper stronger replacement exists. Provenance validation has real runtime/build callers. Live-provider capability fields are not counted as real delivery proof. The remaining native Rust execution and exact tgz matrix must pass after the actual --lib fix; previous zero-test green runs are not reused as storage proof.

Single-sample MSI timings after edits: standalone build 1.664 s versus 2.066 s before; whole check 17.886 s versus 9.134 s; Node body 10.764 s versus 5.014 s. **No measured wall-time speedup is claimed.** Unchanged child-process cases also took roughly 2–3 times longer in that later sample; host/cache/load causes were not isolated. The after check followed npm ci. Do not rerun until a favorable sample appears. Deterministic work reductions are TS passes 2→1, packs 2→1 and feature-PR matrices 2→1 (42→21 jobs), not a latency promise. A representative earlier focused run is reported separately, not substituted for the final sample.

Real OS store/SSO, Linux persistent-store support and publication remain outside this audit. Current artifacts lacking count/name/target/source/patch-bound test proof are intentionally rejected until fresh native CI supplies it.
