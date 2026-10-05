import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = join(root, 'dist');
const storeDir = join(root, 'store');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json missing — run npm run build first');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = String(manifest.version || '0.0.0');
const zipName = `chillywait-${version}.zip`;
const zipPath = join(storeDir, zipName);

mkdirSync(storeDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// Zip contents of dist so manifest.json is at the archive root (Store requirement).
if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path (Join-Path '${dist}' '*') -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: dist, stdio: 'inherit' });
}

console.log(`Store package ready: store/${zipName}`);
