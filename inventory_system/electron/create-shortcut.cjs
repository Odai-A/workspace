'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFolder = path.join(root, 'release', 'Inventory System-win32-x64');
const exe = path.join(outFolder, 'Inventory System.exe');
const ico = path.join(outFolder, 'ApplicationIcon.ico');
const ps1 = path.join(__dirname, 'create-shortcut.ps1');

if (!fs.existsSync(exe)) {
  console.error('Packaged app not found. Run from inventory_system: npm run desktop:pack');
  process.exit(1);
}
if (!fs.existsSync(ico)) {
  console.error('Missing ApplicationIcon.ico. Run: npm run desktop:pack');
  process.exit(1);
}

function resolveWindowsDesktop() {
  const oneDrive = process.env.OneDrive;
  if (oneDrive) {
    const od = path.join(oneDrive, 'Desktop');
    if (fs.existsSync(od)) return od;
  }
  const profile = process.env.USERPROFILE || '';
  if (profile) {
    const classic = path.join(profile, 'Desktop');
    if (fs.existsSync(classic)) return classic;
    return classic;
  }
  return '';
}

const desktopDir = process.platform === 'win32' ? resolveWindowsDesktop() : path.join(process.env.HOME || '', 'Desktop');
if (!desktopDir || !fs.existsSync(desktopDir)) {
  console.error('Desktop folder not found. Checked OneDrive\\Desktop and user Desktop.');
  process.exit(1);
}

const lnk = path.join(desktopDir, 'Inventory System.lnk');

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ps1,
    '-TargetExe',
    exe,
    '-IconIco',
    ico,
    '-ShortcutPath',
    lnk,
  ],
  { stdio: 'inherit' }
);

console.log('Created:', lnk);
console.log('This shortcut points IconLocation at ApplicationIcon.ico so Windows does not pick the wrong icon index from the .exe.');
