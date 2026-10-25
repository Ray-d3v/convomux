# Distribution and owner release steps

No package, tag or GitHub Release was published by this change. The owner approved MIT for ConvoMux on 2026-10-25; see the root [LICENSE](../LICENSE), using the [standard MIT text](https://opensource.org/license/mit). Copyright (c) 2026 Ray uses the existing initial Git author name in commits 25aea33 and 712119d, not an inferred legal entity. Third-party licenses/notices are retained separately.

The owner does not yet have an npm account. The final npm package name/scope and their authority/availability are unconfirmed; package.json currently contains the candidate `@ray-d3v/convomux`. `private:true` remains. A public GitHub repository and MIT licensing do not authorize npm publication, account registration or permission changes.

## Reproduce a candidate

Node 22/24 and npm are sufficient for consumers and ordinary source checks. Native backend compilation is confined to the trusted CI/development matrix with pinned Rust 1.98.0 and Git. Generate universal release tarballs in the standard Linux package job after its same-run native patched builds pass. Windows npm pack loses Unix executable modes. For local release reproduction, first run equivalent trusted native builds and place their target artifacts in .upstream/secure-build; the commands below then validate and bundle them. No consumer install compiles or downloads backend code.

```sh
npm ci --ignore-scripts
npm run check
npm run backends:prepare
npm run backends:notices
npm run backends:verify
npm pack
npm run package:smoke
```

Only backends:prepare accesses fixed upstream release archives. Hashes are checked before parsing. Archive parsers accept exactly the expected root filename, reject traversal, links (tar), duplicate names and unexpected files, and write bytes as regular files instead of honoring archive paths/permissions. Archive and binary sizes are bounded. No downloaded script is executed. Every binary is checked again by its extracted SHA-256 before packing; licenses also have fixed hashes. Missing files fail prepack. `npm pack --ignore-scripts` can bypass lifecycle checks, so CI additionally inspects and installs the actual tarball.

backends:notices is a separate source-attribution refresh step, unnecessary for ordinary builds because its results are committed. It downloads the fixed release Cargo.lock and all 362 registry source archives, verifies every crate checksum before parsing, and collects actual notice text plus declared license metadata. The twelve initially flagged entries are supplemented from exact public sources recorded in slk-notice-sources.json, including Git blob/SHA-256 checks. No source is compiled/executed and no dependency entry remains without retained notice/attribution material. The full inventory includes dev/build and target-specific packages. [Dependency evidence](DEPENDENCY_NOTICES.md) explains the public facts and distinguishes ConvoMux owner decisions. backends:verify and package:smoke hash-check the committed inventory, source manifest, lock and notice text in the final tgz.

The universal tgz contains all five slk binaries and bundled msteams/semver dependency trees. It is larger than an architecture-specific optional package, but needs no extra npm scope ownership, optional-dependency resolution or postinstall download. `--ignore-scripts` and offline installation from the prepared tgz work. An update replaces the entire tested combination; configs and sessions stay in user directories. Development node_modules, archives and generated binaries are ignored by Git; CI prepares binaries deterministically.

package:smoke writes `.upstream/package/ray-d3v-convomux-0.1.0.tgz` on Linux, then tests local and global temporary prefixes with empty npm cache, `--offline --ignore-scripts`, an isolated home and a new PATH directory containing only Node. It runs the actual installed cmx shim and native backends. It checks all packaged binary/license hashes, Unix executable modes, and a missing-backend diagnostic. After success it writes SHA256SUMS, INSTALL.md and the release/dependency evidence documents beside the tgz; all are included in the downloadable convomux-package artifact. Native --existing jobs verify that sidecar before installation. It never authenticates. Pass an existing CI tgz as `npm run package:smoke -- PATH` to check that exact artifact on Windows or other targets. No install hook or runtime chmod workaround is used.

## Install a reviewed local candidate

Before npm publication, use the generated file, not the registry name:

The PR description links the exact successful workflow artifact, SHA-256 and [candidate install/update guide](INSTALL_CANDIDATE.md). Browser download needs a signed-in GitHub account; Git is not required. Download/unzip the artifact and compare its SHA256SUMS with the PR digest before installation. Artifacts have finite retention; regenerate a candidate with the CI workflow when expired, without publishing a Release.

```sh
npm install -g --ignore-scripts ./ray-d3v-convomux-0.1.0.tgz
cmx --help
```

Use the same command with the next reviewed tgz to update. If the global prefix is not writable, choose a user-owned prefix, for example `npm install -g --prefix "$HOME/.local" --ignore-scripts ./candidate.tgz` (POSIX; put `$HOME/.local/bin` on PATH). On PowerShell use `npm install -g --prefix "$env:LOCALAPPDATA\npm" --ignore-scripts .\candidate.tgz` and put that prefix on the user's PATH. This PATH setting is for cmx/Node, never for teams/slk. Do not default to administrator/sudo installation.

After the owner confirms the final name/scope and separately authorizes and performs publication, registry install/update will be `npm install -g <confirmed-package-name>@latest`. No registry name is currently advertised as available. Update package.json to the confirmed name before publishing; it controls the notifier and release scripts.

## Owner prerequisites before publishing

1. **Review secure backend support and authorize endpoint validation separately.** The managed patch enforces persistent OS storage, no plaintext read/write fallback and strict requested-profile failure on Windows/macOS; Linux kernel-only authentication is unsupported. Missing/unverified builds remain blocked. Review [patch/provenance](PATCHED_BACKENDS.md), final native matrix results and legacy plaintext incompatibility. Any future Secret Service/Linux support or migration requires separate design/validation. Authorize endpoint login/SSO/MFA, Chrome discovery, actual store availability and minimum Windows VCRUNTIME/UCRT checks independently; this task performed none and redistributed no Microsoft runtime.
2. **Create the owner account and resolve publication rights separately.** MIT for ConvoMux is approved and the root LICENSE must be packed; do not relicense third-party components. The npm account is not yet created and the final package name/scope is unconfirmed. The owner must separately authorize/register their own npm account, verify email and configure 2FA, then confirm name/scope authority and availability and set the final package.json name/version. Public dependency notice lookup is complete; review THIRD_PARTY_NOTICES.md and DEPENDENCY_NOTICES.md. Keep private:true until publication is explicitly authorized. For a new package, initial registration/publication is an owner action using their own login/2FA only after separate publication approval. Then configure Trusted Publisher: owner `Ray-d3v`, repo `convomux`, workflow `publish.yml`, environment `npm-publish` (adjust if renamed), with environment protection/reviewers. Current [npm requirements](https://docs.npmjs.com/trusted-publishers/) are npm >=11.5.1, Node >=22.14.0 and GitHub-hosted runners (checked 2026-10-24); the workflow uses Node 24, OIDC and no stored npm token.
3. **Review the final candidate and explicitly authorize publication later.** Commit the reviewed publication policy/manifest/version changes (MIT is already approved; no backend change is required for licensing), require all OS/CPU and Node 22/24 checks plus exact tgz/hash/native installation checks to pass, then enable repository variable `NPM_PUBLISH_ENABLED=true`. Only an explicitly authorized owner dispatches the manual publish workflow. It runs reusable CI and publishes the same verified artifact with public access/provenance, rejects private/missing-license/UNLICENSED manifests/version mismatches, and creates no release tag. This task does not enable or dispatch publication, register a package, create a tag/Release, or merge the PR.

GitHub repository visibility and npm private/license flags are separate. A public repository does not authorize changing either field. Standard GitHub-hosted Actions and the public npm registry require no dedicated server or paid service for this public-repository workflow.
