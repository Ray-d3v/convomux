# Bundled Slack credential storage and strict profile selection

Checked 2026-10-24 against slk v0.2.0, commit `f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1`, its Cargo.lock, checksum-verified crate sources, and the fixed release binaries in backend-contracts.json. No real accounts, credential files, OS key stores, login or browser sessions were accessed during this investigation.

Unpatched upstream v0.2.0 cannot guarantee persistent OS-only storage or strict requested-account routing. ConvoMux now supplies an upstream-derived `0.2.0+cmx.1` patch on Windows/macOS, only after native mock-store tests, provenance and binary hashes pass. The patch removes plaintext read/write branches and requested-profile fallthrough. Missing/unverified/modified builds and overrides stay blocked; overrides must match approved native bytes. Linux kernel-only authentication is unsupported. Teams, metadata registration, help/version and offline diagnosis remain available. Existing credentials are not automatically read for investigation, migrated, deleted or changed. See [patch and CI provenance](PATCHED_BACKENDS.md).

## Safe offline diagnosis

```sh
cmx doctor --storage --json
```

This inspects packaged **source/patch/build provenance and binary hashes**, using the current Node OS/CPU. It does not read user configuration, accounts, backend profiles, credential-file existence/permissions, OS key stores, update cache or credentials; it starts no backend and makes no network requests, even in a TTY. Installed package metadata/binary bytes are checked locally. It does not inspect configured executable overrides. Omit account/config/timeout options; --source slack or no selector is accepted. Unsupported OS/CPU fails explicitly.

Exit **1** is intentional: JSON has ok:false, status:error, secureStorageVerified:false and accountRoutingVerified:false because no live store/identity is probed. Verified Windows/macOS builds report plaintextFallbackAllowed:false, strictRequestedProfileEnforced:true and accessBlocked:false with CREDENTIAL_STORAGE_UNVERIFIED. Linux or missing builds report accessBlocked:true. Diagnostics go to stderr; --json stdout remains one common object. No credential migration, deletion, chmod or revocation occurs. A failed real OS-store operation still fails closed even when the build is admitted.

## Unpatched upstream reference evidence

The table and fallback conditions below describe **unpatched v0.2.0**, not the corrected Windows/macOS binary. They explain why a newer main commit or a preflight file check cannot be used as the fix.

| Release target | Default store selected by this build | Remaining limitation |
|---|---|---|
| Windows x64 | keyring's entry-local **mock**, not Windows Credential Manager | A successful write survives only within that Entry object. A fresh entry has no credential, so later reads attempt plaintext fallback. A new login can report success without persisting credentials. |
| Linux x64/arm64 | `linux-native`: kernel keyutils keyrings | In-memory, lost at reboot and subject to kernel keyring lifetime/expiry/availability. This is not a durable Secret Service/GNOME/KWallet store. Errors permit plaintext fallback. |
| macOS x64/arm64 | `apple-native`: Keychain | Actual availability, access policy and permissions are endpoint-specific. Errors permit plaintext fallback. OS name does not establish secure storage. |

The release depends on keyring 3.6.3 with `apple-native` and `linux-native` only. `windows-native` and Secret Service persistence features are not enabled. No upstream custom default credential builder or keyring-only/fallback-disable switch was found. Windows normal mock writes succeed, so it is inaccurate to claim every Windows login writes plaintext: its usual failure is loss of persistence; reads can still consume an existing plaintext file.

## Exact fallback conditions

In [`src/auth/keyring.rs`](https://github.com/osodevops/slack-cli/blob/f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1/src/auth/keyring.rs):

- **Write:** failure of `Entry::new` or `set_password` causes serialization to be written directly to `cred_<workspace>.json`. There is no file encryption. Unix chmod 0600 happens **after** the write; a chmod failure does not undo the already-written plaintext. Initial/existing file permissions still matter. Windows gets no corresponding Unix mode operation.
- **Read:** failure of `Entry::new` or any `get_password` error, including missing entry, causes a plaintext file read. Successful keyring retrieval followed by invalid JSON returns a parse error instead of taking this file branch.
- Successful OS-store writes do **not** remove old plaintext files. File absence today cannot prevent a later fallback. Checking only mode 0600 cannot certify encryption or prevent the write-before-chmod interval.

The root is `SLK_CONFIG_DIR` when set (including relative or empty values); otherwise `dirs::config_dir()/slk`: Windows roaming Known Folder, macOS `~/Library/Application Support/slk`, Linux absolute `$XDG_CONFIG_HOME/slk` or `~/.config/slk`. cmx retains the trusted backend's local config behavior. The diagnostic does not resolve or inspect these locations. Do not send those files, debug logs or account names to an issue or PR.

Separately, [`src/auth/mod.rs::resolve_credentials`](https://github.com/osodevops/slack-cli/blob/f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1/src/auth/mod.rs) ignores an error loading the explicitly requested workspace and then attempts `profiles.active`. Thus `--workspace` and cmx's environment-token filtering do **not** guarantee that a failed requested-profile load stops rather than using another identity. A prior status check is subject to state changes and cannot enforce this property. cmx does not expose an arbitrary API command, but its normal read commands use this same upstream resolver.

## Evidence and limits

- All 58 Rust source files from the fixed revision were checked against Git blob hashes. The release Cargo features and dependency lock were inspected, rather than inferring behavior from README comments. See [Cargo.toml](https://github.com/osodevops/slack-cli/blob/f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1/Cargo.toml) and [config path code](https://github.com/osodevops/slack-cli/blob/f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1/src/config/mod.rs).
- keyring 3.6.3 source archive SHA-256: `eebcc3aff044e5944a8fbaf69eb277d11986064cba30c468730e8b9909fb551c`. Its platform default selection, mock implementation and keyutils implementation were read. [Published keyring documentation](https://docs.rs/keyring/3.6.3/keyring/) and [keyutils source](https://docs.rs/crate/keyring/3.6.3/source/src/keyutils.rs) describe the store selection/lifetime. linux-keyutils 0.2.4, dirs 6.0.0 and dirs-sys 0.5.0 source archives were also checksum-verified against Cargo.lock.
- SHA-verified Windows release bytes contain `MockCredential`, Linux x64 bytes contain `KeyutilsCredential`, and macOS arm64 bytes contain `MacCredential`, consistent with those defaults. Static indicators are corroboration, not proof of endpoint store availability. All five binaries remain hash-checked by packaging/CI.
- The actual Windows x64 binary (`5091144841f858b1b6b8a8f9aa2bad9faef1db9668dddd2b2f00a969ad965886`) was exercised with its mock-only build, a newly created temporary config root, literal synthetic credential data and a loopback-only HTTP server. A requested missing profile caused it to use the synthetic active profile's plaintext file. Removing that test-owned file caused failure without an HTTP request. No native store, real identity, real Slack endpoint or login was invoked. This controlled upstream research command is not added as a cmx API passthrough.
- Regression tests exercise all five target contracts and a real CLI process with a synthetic home plus filesystem/subprocess/network tripwires, including forced interactive TTY and absent updater-disable variables. Native package jobs check the installed diagnostic's nonzero result alongside the existing real help/version checks. OS keyring failure/write behavior is source-verified, not induced against real endpoints. macOS/Linux live credential behavior has not been exercised.

## Policy/backend decision before secure use

The approved fix retains upstream authentication and existing keyring implementations, enables Windows native storage, requires UntilDelete persistence, removes plaintext read/write methods, and immediately errors when an explicit requested profile cannot be loaded. It is implemented as a small source patch with pinned hashes and native mock-only tests, not a preflight-only claim. Linux's kernel keyring fails this persistence requirement and remains unsupported for authenticated use.

The approved stop remains in force wherever the package lacks a verified supported native build. Latest public main `66c0f26492cb049ea287f6463d8a19eb97ec7cb9` and Release v0.2.0 have identical storage/resolver/config blobs; no fixed public replacement was found. Windows/macOS admission is conditional on the managed patch/provenance/hash checks; it does not authorize real login in this task or certify an endpoint store. Copying/deleting credentials, changing endpoint permissions and real sessions remain outside authorization. Future Linux persistent-store support needs its own OS dependency/build validation.

Teams uses its own profile JSON and is not covered by this Slack diagnosis. The main project license, npm scope rights and publication still require independent owner decisions; see [the three owner steps](RELEASING.md#owner-prerequisites-before-publishing).
