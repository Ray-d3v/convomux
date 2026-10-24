// npm pack on Windows records Unix payloads as 0644, even after chmod(0755).
// The consumer must never need a postinstall hook or writable install directory.
if (process.platform === 'win32') throw new Error('Build universal release tarballs on Linux CI to preserve Unix executable modes. On Windows, test/install the CI tgz with npm run package:smoke -- PATH. Local build/check remain supported.')
