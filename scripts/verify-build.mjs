import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const files = readdirSync(join(dist, 'assets'));
const bad = files.filter((f) => f.includes('fetch-hook'));

if (bad.length > 0) {
  console.error('Build verification failed: fetch-hook still in dist:', bad);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
console.log(`Build OK — ChillYWait v${manifest.version}, no fetch-hook`);
