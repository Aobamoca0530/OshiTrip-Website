import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8')).version;
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Build on Windows or macOS.');
const platform = process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`;
if (process.platform === 'win32' && process.arch !== 'x64') throw new Error('Windows x64 required.');
const dist = path.join(app, '..', 'dist');
const name = `OshiTrip-Cleanup-${version}-${platform}`;
if (path.basename(name) !== name) throw new Error('Invalid version');
const output = path.join(dist, name);
await fs.mkdir(dist, { recursive: true });
// Build in a fresh folder; never recursively remove an existing output.
await fs.mkdir(output);
const quote = value => `'${value.replaceAll("'", "''")}'`;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: app, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
if (process.platform === 'win32') {
  const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  run(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', `/out:${path.join(output, 'OshiTrip-Cleanup.exe')}`, path.join(app, 'desktop/Cleanup.cs')]);
} else {
  const contents = path.join(output, 'OshiTrip Cleanup.app/Contents');
  await fs.mkdir(path.join(contents, 'MacOS'), { recursive: true });
  run('/usr/bin/xcrun', ['swiftc', 'desktop/DesktopLock.swift', 'desktop/MacCleanupCore.swift', 'desktop/MacCleanup.swift', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.5`, '-o', path.join(contents, 'MacOS/OshiTrip-Cleanup'), '-framework', 'Cocoa']);
  await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>OshiTrip-Cleanup</string><key>CFBundleIdentifier</key><string>com.oshitrip.cleanup</string><key>CFBundleName</key><string>OshiTrip Cleanup</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
}
await fs.copyFile(path.join(app, 'desktop/cleanup-guide.txt'), path.join(output, '使用说明.txt'));
// Test the destructive core only against isolated fixtures before distributing.
run(process.execPath, ['scripts/test-cleanup.mjs']);
const zip = output + '.zip';
if (process.platform === 'win32') {
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(output)}, ${quote(zip)}, [System.IO.Compression.CompressionLevel]::Optimal, $true)`]);
} else {
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', output, zip]);
}
const digest = createHash('sha256').update(await fs.readFile(zip)).digest('hex');
await fs.writeFile(zip + '.sha256', `${digest}  ${path.basename(zip)}\n`);
console.log(`Standalone cleanup package: ${zip}\nSHA256: ${digest}`);
