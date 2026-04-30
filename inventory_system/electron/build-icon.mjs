import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, '..', 'public', 'assets', 'images', 'logo.png');
const outIco = path.join(__dirname, 'app-icon.ico');
const outPng = path.join(__dirname, 'app-icon.png');

if (!fs.existsSync(logoPath)) {
  console.error('Missing logo at', logoPath);
  process.exit(1);
}

fs.copyFileSync(logoPath, outPng);
const ico = await pngToIco(logoPath);
fs.writeFileSync(outIco, ico);
console.log('Wrote', outIco, 'and', outPng);
