# Distribution and owner release steps

No package, tag or GitHub Release was published by this change. The proposed npm name is read from package.json (`@ray-d3v/convomux`); ownership/availability is not assumed.

## Reproduce a candidate

Node 22/24 and npm are sufficient. From a trusted checkout:

```sh
npm ci --ignore-scripts
npm run check
npm run backends:prepare
npm run backends:verify
npm pack
npm run package:smoke
```

Only backends:prepare accesses fixed upstream release archives. Hashes are checked before parsing. Archive parsers accept exactly the expected root filename, reject traversal, links (tar), duplicate names and unexpected files, and write bytes as regular files instead of honoring archive paths/permissions. Archive and binary sizes are bounded. No downloaded script is executed. Every binary is checked again by its extracted SHA-256 before packing; licenses also have fixed hashes. Missing files fail prepack. `npm pack --ignore-scripts` can bypass lifecycle checks, so CI additionally inspects and installs the actual tarball.

The universal tgz contains all five slk binaries and bundled msteams/semver dependency trees. It is larger than an architecture-specific optional package, but needs no extra npm scope ownership, optional-dependency resolution or postinstall download. `--ignore-scripts` and offline installation from the prepared tgz work. An update replaces the entire tested combination; configs and sessions stay in user directories. Development node_modules, archives and generated binaries are ignored by Git; CI prepares binaries deterministically.

package:smoke writes `.upstream/package/ray-d3v-convomux-0.1.0.tgz`, then tests local and global temporary prefixes with empty npm cache, `--offline --ignore-scripts`, an isolated home and PATH containing Node only. It runs the actual installed cmx shim and native backends. It checks all packaged binary/license hashes and a missing-backend diagnostic. It never authenticates. Pass an existing tgz as `npm run package:smoke -- PATH` to check that exact artifact.

## Install a reviewed local candidate

Before npm publication, use the generated file, not the registry name:

```sh
npm install -g --ignore-scripts ./ray-d3v-convomux-0.1.0.tgz
cmx --help
```

Use the same command with the next reviewed tgz to update. If the global prefix is not writable, choose a user-owned prefix, for example `npm install -g --prefix "$HOME/.local" --ignore-scripts ./candidate.tgz` (POSIX; put `$HOME/.local/bin` on PATH). On PowerShell use `npm install -g --prefix "$env:LOCALAPPDATA\npm" --ignore-scripts .\candidate.tgz` and put that prefix on the user's PATH. This PATH setting is for cmx/Node, never for teams/slk. Do not default to administrator/sudo installation.

After the owner actually publishes, the one-command registry install/update will be `npm install -g @ray-d3v/convomux@latest`. This is not currently advertised as available. If the owner chooses another name, package.json controls the notifier and release scripts.

## Owner prerequisites before publishing

1. Confirm npm scope/name rights and public distribution policy; select ConvoMux's license explicitly and add its text. Keep private:true and UNLICENSED until that decision. Resolve the slk binary transitive license/NOTICE review described in THIRD_PARTY_NOTICES.md. Review the plaintext credential fallback and browser prerequisites against deployment policy; verify live login yourself on authorized accounts.
2. Review CI results for all native OS/CPU runners and both Node versions. Help/version is packaging proof, not login or account authorization proof. Review minimum OS/runtime limitations on deployment endpoints. In particular, the Windows executable imports VCRUNTIME140.dll and Windows/UCRT DLLs; verify availability with the supported Node installation, or resolve authorized runtime redistribution before claiming a minimal Node/npm-only Windows installation. No Microsoft runtime was copied from the developer machine or redistributed by this task.
3. Choose a new package version if 0.1.0 is already registered. For a new npm package, perform the initial package registration/publication manually with the owner's npm login and required 2FA; no token is stored in this repo. Configure the package's Trusted Publisher with owner `Ray-d3v`, repository `convomux`, workflow filename `publish.yml`, environment `npm-publish` (adjust if renamed).
4. Current npm requirements: npm CLI >=11.5.1, Node >=22.14.0 and GitHub-hosted runners. See https://docs.npmjs.com/trusted-publishers/ (checked 2026-10-24). The workflow uses Node 24, OIDC `id-token: write`, public access/provenance, and no long-lived npm token. Configure GitHub environment protection/required reviewers and repository variable `NPM_PUBLISH_ENABLED=true` only after release decisions and npm setup are complete.
5. Commit the reviewed manifest/license/version changes. The manual publish workflow runs the reusable CI suite first, including native tarball tests, then publishes that same verified artifact. It rejects private/UNLICENSED manifests and version mismatches. No release-tag creation is built into it. Dispatch only when publication is intended; this task does not dispatch it.

GitHub repository visibility and npm private/license flags are separate. A public repository does not authorize changing either field. Standard GitHub-hosted Actions and the public npm registry require no dedicated server or paid service for this public-repository workflow.
