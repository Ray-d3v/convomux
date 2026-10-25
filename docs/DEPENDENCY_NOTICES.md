# Dependency notice follow-up

The twelve initially flagged entries are now supplemented from public, pinned sources. None requires the owner to find missing public license text. This does not choose ConvoMux's own license or assert which Cargo.lock packages are linked into each upstream binary.

The first collector only recognized license-like basenames. That incorrectly missed crc-catalog's existing `LICENSES/MIT.txt` and `LICENSES/Apache-2.0.txt`. The collector now recognizes SPDX license directories and `.license` sidecars; an offline synthetic-crate regression failed before the repair and passed afterward.

| Component | Public evidence and completed supplement |
|---|---|
| crc-catalog 2.4.0 | Both texts already exist in the checksum-verified crate's LICENSES directory. Retained them, original Cargo metadata, README and VCS record. No substituted license. |
| difflib 0.4.0 | All 7 original manifest/source/test files match Git blobs at `f035fb8e656f27119e23eca9d5b996df14f3885e`. Copied that revision's actual MIT LICENSE, including its Kevin B. Knapp copyright, and retained published author metadata for Dima Kudosh. Neither attribution was replaced. |
| linux-keyutils 0.2.4 | Exact crate VCS revision `2e81f726ffd3c0165e11fcdbde279b5d8638f47d` has no standalone license files. Its README explicitly offers Apache-2.0 or MIT and links the standard texts. Retained that actual README, original Cargo manifest/author metadata and VCS record; included verbatim Apache-2.0 and MIT canonical texts from SPDX revision `31ba1a50e5397e00a304dbadc76531740e89ee48`. Standard template placeholders remain unchanged and are not presented as upstream copyright statements. No author/year was invented. |
| valuable 0.1.1 | Copied the repository-root MIT LICENSE at the exact crate VCS revision `9efc29b6e58cef28f6566a47aa7e142a55fead77`, preserving Valuable Contributors attribution. |
| wasip2 1.0.2+wasi-0.2.9 | Copied all three offered root texts (Apache-2.0, Apache-2.0 WITH LLVM-exception, MIT) from wasi-rs revision `06ce201370fcde0d1b0d47cac8ecb1b0b312c9f9`, as recorded in the published crate. |
| wasip3 0.4.0+wasi-0.3.0-rc-2026-01-06 | Same exact wasi-rs revision and all three texts; preserved the LLVM exception. |
| wasm-encoder 0.244.0 | Copied all three offered root texts from the published crate's wasm-tools revision `d4e317f22c3bace76cb3205003bcc34b4929037d`. |
| wasmparser 0.244.0 | Same exact wasm-tools revision and all three texts. |
| wit-component 0.244.0 | Same exact wasm-tools revision and all three texts. |
| wit-parser 0.244.0 | Same exact wasm-tools revision and all three texts. |
| winapi-i686-pc-windows-gnu 0.4.0 | All 1,390 original manifest, source/build and import-library files match Git blobs at `9497609ef44cc9bcd16cd2411c0ee6ccaf5483aa` (generated normalized Cargo.toml excluded). Copied both root licenses and retained the actual published Rust license header and author metadata. |
| winapi-x86_64-pc-windows-gnu 0.4.0 | All 1,419 original files match the same exact revision. Preserved both license texts and the published header/author metadata. |

For the three older crates without a VCS record, the source comparison maps `Cargo.toml.orig` to the repository's original `Cargo.toml`; all other published files use the corresponding repository path. The source archives remain fixed by their Cargo.lock SHA-256 values. The current 0.3.9 winapi tag was not used: it did not match the complete 0.4.0 import-library archives. Investigation located the matching publication commit instead.

`vendor/licenses/slk-notice-sources.json` records all fixed URLs, revisions, Git blob SHA-1 values and SHA-256 values. `backends:notices` verifies the crate checksum, any published VCS revision, and each supplemental text's SHA-256 and Git blob before including it. All 362 inventory entries now have retained notices/attribution material; the generated text distinguishes original published files from supplemental upstream or canonical text. No downloaded source is executed. The inventory includes build/dev and other-target dependencies rather than silently assuming they are all linked.

Public sources: [linux-keyutils's exact README](https://github.com/landhb/linux-keyutils/blob/2e81f726ffd3c0165e11fcdbde279b5d8638f47d/README.md#license), [difflib's matched revision](https://github.com/DimaKudosh/difflib/tree/f035fb8e656f27119e23eca9d5b996df14f3885e), [winapi's matched revision](https://github.com/retep998/winapi-rs/tree/9497609ef44cc9bcd16cd2411c0ee6ccaf5483aa), and the complete URL/hash list in the supplemental manifest.

The owner approved MIT for ConvoMux on 2026-10-25; the root LICENSE does not replace any third-party license or attribution. The npm account is not yet created and the final package name/scope remains unconfirmed. `private:true` stays in force. Account registration, name/scope rights, Trusted Publishing configuration and publication still need separate owner action/authorization; a public repository does not grant that authorization. These are release tasks, not missing dependency text.

Target endpoint validation is separate: Windows VCRUNTIME/UCRT availability, browser detection, authorized live login/SSO/MFA and upstream credential storage still need an authorized operator's endpoint test. Public source inspection cannot establish those results. No credentials were requested and no live login was performed.
