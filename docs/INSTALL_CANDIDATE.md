# Install or update the reviewed ConvoMux candidate

This is an unpublished review candidate. The npm registry package name is not advertised as available. Node.js 22/24 and npm are required; the package includes the fixed Teams/Slack components. You do not install teams/slk, Rust, Bun or Git or compile anything.

1. Open the artifact download linked in the draft PR's description. Sign in to GitHub if asked; public repository Actions artifact downloads require a signed-in account. Download **convomux-package**, then unzip it with the ordinary OS archive tool. The ZIP contains `ray-d3v-convomux-0.1.0.tgz`, `SHA256SUMS`, this guide, RELEASING.md and DEPENDENCY_NOTICES.md. Artifact retention is finite; use the current successful run linked by the PR. No GitHub Release was published.
2. Open a terminal in the extracted folder. Compare SHA256SUMS with the exact digest in the PR description, then verify the actual tgz. Do not run a downloaded installer script.

PowerShell:

```powershell
$expectedHash = ((Get-Content -LiteralPath .\SHA256SUMS -Raw).Trim() -split '\s+')[0]
$actualHash = (Get-FileHash -LiteralPath .\ray-d3v-convomux-0.1.0.tgz -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'ConvoMux SHA-256 mismatch' }
npm install -g --ignore-scripts .\ray-d3v-convomux-0.1.0.tgz
cmx --version
cmx --help
```

Linux:

```sh
sha256sum -c SHA256SUMS &&
npm install -g --ignore-scripts ./ray-d3v-convomux-0.1.0.tgz &&
cmx --version &&
cmx --help
```

On macOS replace `sha256sum -c SHA256SUMS` with `shasum -a 256 -c SHA256SUMS` in the same chain. If the checksum differs, stop; the chain does not install the package after a failed verification.

To update, download the next reviewed artifact linked by the PR, verify **its new digest**, and run the same `npm install -g --ignore-scripts <new-file.tgz>` command. The review filename/version can remain 0.1.0 during this draft; the source commit and SHA-256 identify the exact candidate. No uninstall, account reset or backend install is required. `cmx config path` shows the existing user configuration outside the installation directory; npm replacement does not delete that configuration or upstream user credential stores.

If the global prefix is not writable, choose a user-owned prefix. PowerShell example:

```powershell
npm install -g --prefix "$env:LOCALAPPDATA\npm" --ignore-scripts .\ray-d3v-convomux-0.1.0.tgz
```

Put that prefix on the user PATH if necessary. On POSIX use `--prefix "$HOME/.local"` and put `$HOME/.local/bin` on PATH. This PATH entry is for cmx/Node, never for teams/slk. Administrator/sudo installation is not the default procedure.

The candidate has native packaging checks for Windows x64, macOS arm64/x64 and Linux x64/arm64. Help/version checks do not establish live login. Slack browser login needs a discoverable installed Chrome/Chromium and an interactive desktop; Windows native runtime requirements and upstream plaintext credential fallback are documented in README/SECURITY. Complete authorized SSO/MFA personally. Do not submit tokens or profile files to the PR.

After the owner actually publishes and confirms the final npm name, registry installation/update will use `npm install -g <confirmed-package-name>@latest`. The task does not perform publication. See [release owner steps](RELEASING.md) and [dependency notice evidence](DEPENDENCY_NOTICES.md).
