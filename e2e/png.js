// Makes PNG files on the fly, so the test fixtures stay small but the tests can still use big pictures.
const zlib = require("node:zlib");
const crypto = require("node:crypto");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encode(width, height, raw, level) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A picture full of random pixels: it cannot be compressed, so the file is about width x height x 3 bytes. */
function noisePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  crypto.randomFillSync(raw);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0; // PNG filter byte
  return encode(width, height, raw, 0);
}

/** A smooth gradient: a large picture (in pixels) that is still a small file. */
function gradientPng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const o = row + 1 + x * 3;
      raw[o] = Math.floor((x / width) * 255);
      raw[o + 1] = Math.floor((y / height) * 255);
      raw[o + 2] = 90 + ((x >> 8) % 2) * 60;
    }
  }
  return encode(width, height, raw, 1);
}

module.exports = { noisePng, gradientPng };
