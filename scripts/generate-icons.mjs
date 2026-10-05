import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
const sourcePath = join(outDir, 'icon-source.png');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Flat purple fallback if no art source is present. */
function createFallbackPng(size) {
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      raw.push(124, 58, 237, 255);
    }
  }

  const zlib = deflateSync(Buffer.from(raw));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function resizeWithPowerShell(source, size, dest) {
  const script = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${source.replace(/'/g, "''")}')
$bmp = New-Object System.Drawing.Bitmap ${size}, ${size}
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($src, 0, 0, ${size}, ${size})
$g.Dispose()
$bmp.Save('${dest.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()
`;
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', script],
    { stdio: 'inherit' },
  );
}

if (existsSync(sourcePath)) {
  for (const size of [16, 48, 128]) {
    const dest = join(outDir, `icon${size}.png`);
    try {
      resizeWithPowerShell(sourcePath, size, dest);
    } catch {
      // Keep any existing sized icon if resize tooling fails.
      if (!existsSync(dest)) {
        writeFileSync(dest, createFallbackPng(size));
      }
    }
  }
  console.log('Icons generated from public/icons/icon-source.png');
} else {
  for (const size of [16, 48, 128]) {
    writeFileSync(join(outDir, `icon${size}.png`), createFallbackPng(size));
  }
  console.log('Icons generated (fallback solid) in public/icons/');
}
