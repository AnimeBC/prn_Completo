import fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Generador de ZIP en streaming (método "store", sin compresión y sin
 * dependencias externas). Las fotos y videos ya vienen comprimidos, así que
 * "store" es perfecto y muy rápido.
 *
 * Usa "data descriptors" (bit 3) para poder emitir el CRC al final de cada
 * archivo sin tener que cargarlo entero en memoria.
 */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(crc, buf) {
  const t = crcTable();
  let c = crc;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}
function dosDateTime(d) {
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date & 0xffff, time: time & 0xffff };
}

/** entries: [{ path: '/abs/file', name: 'carpeta/archivo.ext' }] */
export function createZipStream(entries) {
  return Readable.from((async function* () {
    const central = [];
    let offset = 0;

    for (const e of entries) {
      let stat;
      try { stat = await fs.promises.stat(e.path); } catch { continue; }
      if (!stat.isFile()) continue;

      const nameBuf = Buffer.from(e.name, 'utf8');
      const { date, time } = dosDateTime(stat.mtime);

      const lfh = Buffer.alloc(30);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(20, 4);       // version needed
      lfh.writeUInt16LE(0x0808, 6);   // bit 3 (data descriptor) + UTF-8
      lfh.writeUInt16LE(0, 8);        // método: store
      lfh.writeUInt16LE(time, 10);
      lfh.writeUInt16LE(date, 12);
      lfh.writeUInt32LE(0, 14);
      lfh.writeUInt32LE(0, 18);
      lfh.writeUInt32LE(0, 22);
      lfh.writeUInt16LE(nameBuf.length, 26);
      lfh.writeUInt16LE(0, 28);

      const lfhOffset = offset;
      yield lfh;
      yield nameBuf;
      offset += 30 + nameBuf.length;

      let crc = 0xFFFFFFFF;
      let size = 0;
      for await (const chunk of fs.createReadStream(e.path, { highWaterMark: 1 << 20 })) {
        crc = crc32(crc, chunk);
        size += chunk.length;
        offset += chunk.length;
        yield chunk;
      }
      const crcFinal = (crc ^ 0xFFFFFFFF) >>> 0;

      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crcFinal, 4);
      dd.writeUInt32LE(size, 8);
      dd.writeUInt32LE(size, 12);
      yield dd;
      offset += 16;

      central.push({ nameBuf, crc: crcFinal, size, offset: lfhOffset, time, date });
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0808, 8);
      h.writeUInt16LE(0, 10);
      h.writeUInt16LE(c.time, 12);
      h.writeUInt16LE(c.date, 14);
      h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(c.size, 20);
      h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.nameBuf.length, 28);
      h.writeUInt16LE(0, 30);
      h.writeUInt16LE(0, 32);
      h.writeUInt16LE(0, 34);
      h.writeUInt16LE(0, 36);
      h.writeUInt32LE(0, 38);
      h.writeUInt32LE(c.offset, 42);
      yield h;
      yield c.nameBuf;
      cdSize += 46 + c.nameBuf.length;
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    yield eocd;
  })());
}
