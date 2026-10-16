import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Tests laufen reproduzierbar in deutscher Zeitzone (inkl. Sommerzeitwechsel)
process.env.TZ ??= 'Europe/Berlin';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Erzeugt nach dem Build dist/sw.js aus sw/service-worker.js.
 * - Precache-Liste = alle Dateien im Build (App-Shell, JS, CSS, Icons, Manifest)
 * - Cache-Version = Hash über alle Dateiinhalte → jede Änderung erzeugt ein Update
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'wakelog-service-worker',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const urls: string[] = [];
      for (const f of files.sort()) {
        const rel = relative(outDir, f).split('\\').join('/');
        if (rel === 'sw.js' || rel.endsWith('.map') || rel === 'icons/icon-1024.png' || rel === 'icons/icon-master.svg') continue;
        urls.push(rel === 'index.html' ? './' : `./${rel}`);
        hash.update(rel).update(readFileSync(f));
      }
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const template = readFileSync(fileURLToPath(new URL('./sw/service-worker.js', import.meta.url)), 'utf8');
      const sw = template
        .replace('self.__WAKELOG_VERSION__', JSON.stringify(version))
        .replace('self.__WAKELOG_PRECACHE__', JSON.stringify(urls, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`\n[wakelog] sw.js erzeugt – Version ${version}, ${urls.length} Dateien im Precache`);
    },
  };
}

export default defineConfig({
  // Relative Pfade: Build läuft unter jeder Adresse/Unterordner (z. B. https://name.github.io/wakelog/)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: ['es2020', 'safari15'],
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  plugins: [serviceWorkerPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
