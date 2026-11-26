// =============================================================
// Gera icon-192.png e icon-512.png (o Android exige PNG para instalar)
// sem nenhuma biblioteca: desenha pixel a pixel e grava o PNG.
// Rodar: node ferramentas/gerar-icones.js
// =============================================================
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function draw(size) {
  const s = size / 512; // desenho feito em escala 512
  const BG = [5, 13, 31], FIELD = [16, 44, 92], LINE = [245, 197, 66], BALL = [244, 247, 251];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      let c = BG;
      const inField = X >= 56 && X <= 456 && Y >= 96 && Y <= 416;
      const border = inField && (X < 66 || X > 446 || Y < 106 || Y > 406);
      const d = Math.hypot(X - 256, Y - 256);
      if (inField) c = FIELD;
      if (border) c = LINE;
      if (inField && Math.abs(X - 256) < 4) c = LINE;
      if (Math.abs(d - 56) < 4) c = LINE;
      if (d < 34) c = BALL;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(ROOT, `icon-${size}.png`), draw(size));
  console.log(`icon-${size}.png criado`);
}
