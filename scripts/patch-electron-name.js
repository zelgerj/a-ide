/**
 * Patch the Electron.app Info.plist so macOS shows "A-IDE" in the menu bar
 * instead of "Electron" during development.
 *
 * Runs automatically via postinstall.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const APP_NAME = 'A-IDE'
const plist = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist'
)

if (!fs.existsSync(plist)) {
  console.log('Electron plist not found, skipping name patch')
  process.exit(0)
}

try {
  const cmd = (key, val) =>
    `/usr/libexec/PlistBuddy -c "Set :${key} ${val}" "${plist}"`

  execSync(cmd('CFBundleName', APP_NAME))
  execSync(cmd('CFBundleDisplayName', APP_NAME))
  console.log(`Patched Electron.app bundle name → ${APP_NAME}`)
} catch (e) {
  console.warn('Failed to patch Electron plist:', e.message)
}
