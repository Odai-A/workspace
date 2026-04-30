'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const icon = path.join(root, 'electron', 'app-icon.ico');

if (!fs.existsSync(icon)) {
  console.error('Missing icon (packager would skip embedding and shortcuts would show the Electron logo):');
  console.error(' ', icon);
  console.error('Run from inventory_system: npm run desktop:icons');
  process.exit(1);
}

const cli = require.resolve('electron-packager/bin/electron-packager.js');
const args = [
  cli,
  '.',
  'Inventory System',
  '--platform=win32',
  '--arch=x64',
  '--out=release',
  '--overwrite',
  '--asar',
  '--prune=true',
  `--icon=${icon}`,
  '--ignore=^/src$|^/public$|^/\\.git$|^/release$',
];

const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status);

const outFolder = path.join(root, 'release', 'Inventory System-win32-x64');
const exePath = path.join(outFolder, 'Inventory System.exe');
const bundledIco = path.join(outFolder, 'ApplicationIcon.ico');
if (fs.existsSync(exePath)) {
  fs.copyFileSync(icon, bundledIco);
  console.log(
    'Copied ApplicationIcon.ico next to the .exe. If "Send to desktop" still shows the Electron logo, run: npm run desktop:shortcut'
  );
}
process.exit(0);
