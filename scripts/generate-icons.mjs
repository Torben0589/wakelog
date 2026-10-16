// Erzeugt alle App-Icons aus assets-src/icon-master.svg.
// Nur nötig, wenn das Icon geändert wird:  npm i -D sharp && npm run icons
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const master = await readFile(new URL('assets-src/icon-master.svg', root), 'utf8');
const out = new URL('public/icons/', root);
await mkdir(out, { recursive: true });

// Maskable: Motiv auf 82 % verkleinert, damit es in der Safe-Zone (80 %-Kreis) bleibt.
const inner = master.replace(/^[\s\S]*?<rect id="background"[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
const defs = master.match(/<defs>[\s\S]*?<\/defs>/)[0];
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
<rect width="1024" height="1024" fill="url(#bg)"/><g transform="translate(512 512) scale(0.82) translate(-512 -512)">${inner}</g></svg>`;

// Favicon: abgerundete Ecken (Browser-Tab), transparent außerhalb der Rundung erlaubt.
const favicon = master
  .replace('<rect id="background" width="1024" height="1024"', '<rect id="background" width="1024" height="1024" rx="228"')
  .replace(/<!--[\s\S]*?-->\s*/, '');

const jobs = [
  ['icon-192.png', master, 192],
  ['icon-512.png', master, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', master, 180],
  ['icon-1024.png', master, 1024], // für native App-Hülle (Xcode/Capacitor)
  ['favicon-32.png', favicon, 32],
];
for (const [name, svg, size] of jobs) {
  let img = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  // iOS/App-Icons: keine Transparenz
  if (name !== 'favicon-32.png') img = img.flatten({ background: '#0A1631' });
  await img.png({ compressionLevel: 9 }).toFile(new URL(name, out).pathname);
  console.log('✓', name, `${size}×${size}`);
}
await writeFile(new URL('favicon.svg', out), favicon);
await writeFile(new URL('icon-master.svg', out), master);
console.log('✓ favicon.svg, icon-master.svg');
