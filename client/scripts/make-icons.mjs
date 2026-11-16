// Draws the DOC app icon (green tile, white steering-wheel ring and hub) as PNG files
// for the phone home screen. No dependencies: run `node scripts/make-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};

function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const mid = (size - 1) / 2;
  const ss = 3; // 3x3 samples per pixel for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let white = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const d = Math.hypot(x + (sx + 0.5) / ss - 0.5 - mid, y + (sy + 0.5) / ss - 0.5 - mid) / size;
        if ((d > 0.215 && d < 0.305) || d < 0.075) white++;
      }
      const t = white / (ss * ss);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round(11 + (255 - 11) * t);
      raw[i + 1] = Math.round(93 + (255 - 93) * t);
      raw[i + 2] = Math.round(77 + (255 - 77) * t);
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), icon(size));
  console.log('wrote', name);
}
