import { slackTarget } from './backends.js'
import { fail, result, type Result, type Source } from './model.js'

// No bundled or custom Slack executable has yet been verified against the
// secure persistence + strict requested-profile contract. No environment or
// executable-path bypass: this gate precedes backend resolution and spawning.
export function requireSafeSlackBackend(source: Source): void {
  if (source === 'slack') fail('CREDENTIAL_STORAGE_BLOCKED', 'Slack login and reads are disabled until a backend with secure persistent OS storage and strict requested-account routing is verified. Existing credentials were not accessed or changed. Teams and offline doctor --storage remain available.')
}

interface SlackStorageAssessment {
  source: 'slack'; backend: 'slk'; version: '0.2.0'; keyringVersion: '3.6.3'
  scope: 'bundled-build-contract'; target: string
  expectedStore: 'entry-local-mock' | 'linux-kernel-keyring' | 'macos-keychain'
  osStoreEnabledByBuild: boolean
  lifetime: 'entry-only' | 'until-kernel-reboot-or-expiry' | 'keychain-policy'
  secureStorageVerified: false; accountRoutingVerified: false
  plaintextFallbackCanBeDisabled: false
  requestedProfileLoadError: 'may-use-active-profile'
  accountOrCredentialStoresAccessed: false; networkOrBackendCalls: false
  accessBlocked: true
}

// Source/feature facts for the fixed binary contract. This never probes an OS
// keystore, a profile, a credential file or the existence/permissions of one.
export function inspectBundledSlackStorage(platform: string = process.platform, arch: string = process.arch): Result<SlackStorageAssessment> {
  const { target } = slackTarget(platform, arch)
  const windows = platform === 'win32', linux = platform === 'linux'
  const assessment: SlackStorageAssessment = {
    source: 'slack', backend: 'slk', version: '0.2.0', keyringVersion: '3.6.3',
    scope: 'bundled-build-contract', target,
    expectedStore: windows ? 'entry-local-mock' : linux ? 'linux-kernel-keyring' : 'macos-keychain',
    osStoreEnabledByBuild: !windows,
    lifetime: windows ? 'entry-only' : linux ? 'until-kernel-reboot-or-expiry' : 'keychain-policy',
    secureStorageVerified: false, accountRoutingVerified: false,
    plaintextFallbackCanBeDisabled: false, requestedProfileLoadError: 'may-use-active-profile',
    accountOrCredentialStoresAccessed: false, networkOrBackendCalls: false,
    accessBlocked: true,
  }
  const message = windows
    ? 'Bundled slk 0.2.0 uses an entry-local mock on Windows, so login success does not establish persisted credentials. Reads can use a plaintext file or another active profile after a requested-profile load error. Secure storage and account routing are not verified.'
    : `Bundled slk 0.2.0 uses ${linux ? 'volatile Linux kernel keyutils' : 'macOS Keychain'}, but falls back to plaintext on keyring errors and may use another active profile after a requested-profile load error. It has no keyring-only switch. This offline check cannot certify secure storage or account routing.`
  // Fail closed for the *diagnostic*: never turn build capability, file absence
  // or authentication success into a green secure-storage assertion.
  return result([assessment], [], [{ code: windows ? 'CREDENTIAL_STORAGE_UNSUPPORTED' : 'CREDENTIAL_STORAGE_UNVERIFIED', message }], 0)
}
