import { slackTarget } from './backends.js'
import { result, type Result } from './model.js'
import { packagedSecureBuild, secureSlkContract } from './secure-slk.js'
export { authorizeSlack as requireSafeSlackBackend } from './secure-slk.js'

interface SlackStorageAssessment {
  source: 'slack'; backend: 'slk'; version: string; keyringVersion: '3.6.3'
  scope: 'bundled-build-contract'; target: string
  expectedStore: 'entry-local-mock' | 'windows-credential-manager' | 'linux-kernel-keyring' | 'macos-keychain'
  osStoreEnabledByBuild: boolean
  lifetime: 'entry-only' | 'until-kernel-reboot-or-expiry' | 'keychain-policy' | 'until-os-store-delete'
  secureStorageVerified: false; accountRoutingVerified: false
  plaintextFallbackCanBeDisabled: false
  plaintextFallbackAllowed: boolean; strictRequestedProfileEnforced: boolean
  requestedProfileLoadError: 'may-use-active-profile' | 'fails-without-active-profile'
  accountOrCredentialStoresAccessed: false; networkOrBackendCalls: false
  accessBlocked: boolean
}

// Source/feature facts for the fixed binary contract. This never probes an OS
// keystore, a profile, a credential file or the existence/permissions of one.
export async function inspectBundledSlackStorage(platform: string = process.platform, arch: string = process.arch): Promise<Result<SlackStorageAssessment>> {
  const { target } = slackTarget(platform, arch)
  const windows = platform === 'win32', linux = platform === 'linux'
  let patched = false
  try { await packagedSecureBuild(target); patched = true } catch { /* fail closed, no OS store was probed */ }
  const assessment: SlackStorageAssessment = {
    source: 'slack', backend: 'slk', version: patched ? secureSlkContract.patchedVersion : '0.2.0', keyringVersion: '3.6.3',
    scope: 'bundled-build-contract', target,
    expectedStore: windows ? patched ? 'windows-credential-manager' : 'entry-local-mock' : linux ? 'linux-kernel-keyring' : 'macos-keychain',
    osStoreEnabledByBuild: patched || !windows,
    lifetime: windows ? patched ? 'until-os-store-delete' : 'entry-only' : linux ? 'until-kernel-reboot-or-expiry' : 'keychain-policy',
    secureStorageVerified: false, accountRoutingVerified: false,
    plaintextFallbackCanBeDisabled: false, plaintextFallbackAllowed: !patched, strictRequestedProfileEnforced: patched,
    requestedProfileLoadError: patched ? 'fails-without-active-profile' : 'may-use-active-profile',
    accountOrCredentialStoresAccessed: false, networkOrBackendCalls: false,
    accessBlocked: !patched,
  }
  const message = patched
    ? 'The patched backend binary/source provenance is verified and requires persistent OS storage with no plaintext or requested-profile fallback. Actual OS-store availability and real account identity were not probed; store errors fail closed. This offline diagnostic does not certify live credentials.'
    : linux ? 'Slack login and reads are unsupported with the pinned volatile Linux kernel store: persistent OS storage is required. No plaintext file or alternate active profile is attempted.' : windows
    ? 'Bundled slk 0.2.0 uses an entry-local mock on Windows, so login success does not establish persisted credentials. Reads can use a plaintext file or another active profile after a requested-profile load error. Secure storage and account routing are not verified.'
    : `Bundled slk 0.2.0 uses ${linux ? 'volatile Linux kernel keyutils' : 'macOS Keychain'}, but falls back to plaintext on keyring errors and may use another active profile after a requested-profile load error. It has no keyring-only switch. This offline check cannot certify secure storage or account routing.`
  // Fail closed for the *diagnostic*: never turn build capability, file absence
  // or authentication success into a green secure-storage assertion.
  return result([assessment], [], [{ code: !patched && (windows || linux) ? 'CREDENTIAL_STORAGE_UNSUPPORTED' : 'CREDENTIAL_STORAGE_UNVERIFIED', message }], 0)
}
