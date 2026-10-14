// SHA-1 (FIPS 180-4). WebCrypto eşzamansız olduğu ve el sıkışma adımları
// eşzamanlı yazıldığı için küçük bir saf JS uygulaması.

export function sha1(veri) {
  const bitUzunluk = veri.length * 8;
  const dolguluUzunluk = (((veri.length + 8) >> 6) + 1) << 6;
  const m = new Uint8Array(dolguluUzunluk);
  m.set(veri);
  m[veri.length] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(dolguluUzunluk - 8, Math.floor(bitUzunluk / 2 ** 32));
  dv.setUint32(dolguluUzunluk - 4, bitUzunluk >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));

  for (let o = 0; o < dolguluUzunluk; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  const s = new Uint8Array(20);
  const sv = new DataView(s.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => sv.setUint32(i * 4, h));
  return s;
}
