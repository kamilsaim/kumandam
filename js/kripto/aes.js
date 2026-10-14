// AES-128 (FIPS-197), bayt tabanlı küçük uygulama. WebCrypto ECB modunu
// desteklemediği için gerekli. Tablolar çalışma anında üretilir.

const SBOX = new Uint8Array(256);
const TERS_SBOX = new Uint8Array(256);

const xtime = (x) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 255;

function carp(a, b) {
  let s = 0;
  while (b) {
    if (b & 1) s ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return s;
}

(function tablolariKur() {
  // GF(2^8) tersi + afin dönüşüm
  for (let x = 0; x < 256; x++) {
    let ters = 0;
    if (x) for (let y = 1; y < 256; y++) if (carp(x, y) === 1) { ters = y; break; }
    let s = ters;
    for (let i = 1; i <= 4; i++) s ^= ((ters << i) | (ters >> (8 - i))) & 255;
    s ^= 0x63;
    SBOX[x] = s;
    TERS_SBOX[s] = x;
  }
})();

// 128 bit anahtardan (tur+1) tur anahtarı üretir: Uint8Array((tur+1)*16)
function anahtarGenislet(anahtar, tur = 10) {
  if (anahtar.length !== 16) throw new Error('AES-128 anahtarı 16 bayt olmalı');
  const w = new Uint8Array((tur + 1) * 16);
  w.set(anahtar);
  let rcon = 1;
  for (let i = 16; i < w.length; i += 4) {
    let t = w.slice(i - 4, i);
    if (i % 16 === 0) {
      t = Uint8Array.of(SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]);
      rcon = xtime(rcon);
    }
    for (let j = 0; j < 4; j++) w[i + j] = w[i - 16 + j] ^ t[j];
  }
  return w;
}

function turAnahtariEkle(d, w, tur) {
  for (let i = 0; i < 16; i++) d[i] ^= w[tur * 16 + i];
}

// SubBytes + ShiftRows (durum sütun sıralı: d[sütun*4 + satır])
function kaydirAlt(d) {
  const t = d.slice();
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) d[c * 4 + r] = SBOX[t[((c + r) % 4) * 4 + r]];
}

function tersKaydirAlt(d) {
  const t = d.slice();
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) d[((c + r) % 4) * 4 + r] = TERS_SBOX[t[c * 4 + r]];
}

function sutunKaristir(d) {
  for (let c = 0; c < 16; c += 4) {
    const [a0, a1, a2, a3] = d.slice(c, c + 4);
    d[c] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3;
    d[c + 1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3;
    d[c + 2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3;
    d[c + 3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3);
  }
}

function tersSutunKaristir(d) {
  for (let c = 0; c < 16; c += 4) {
    const [a0, a1, a2, a3] = d.slice(c, c + 4);
    d[c] = carp(a0, 14) ^ carp(a1, 11) ^ carp(a2, 13) ^ carp(a3, 9);
    d[c + 1] = carp(a0, 9) ^ carp(a1, 14) ^ carp(a2, 11) ^ carp(a3, 13);
    d[c + 2] = carp(a0, 13) ^ carp(a1, 9) ^ carp(a2, 14) ^ carp(a3, 11);
    d[c + 3] = carp(a0, 11) ^ carp(a1, 13) ^ carp(a2, 9) ^ carp(a3, 14);
  }
}

// Tur sayısı parametreli şifreleme; son tur her zaman MixColumns'suz.
function sifreleTur(w, blok, tur) {
  const d = Uint8Array.from(blok);
  turAnahtariEkle(d, w, 0);
  for (let r = 1; r < tur; r++) {
    kaydirAlt(d);
    sutunKaristir(d);
    turAnahtariEkle(d, w, r);
  }
  kaydirAlt(d);
  turAnahtariEkle(d, w, tur);
  return d;
}

export function blokSifrele(anahtar, blok) {
  return sifreleTur(anahtarGenislet(anahtar), blok, 10);
}

export function blokCoz(anahtar, blok) {
  const w = anahtarGenislet(anahtar);
  const d = Uint8Array.from(blok);
  turAnahtariEkle(d, w, 10);
  for (let r = 9; r >= 1; r--) {
    tersKaydirAlt(d);
    turAnahtariEkle(d, w, r);
    tersSutunKaristir(d);
  }
  tersKaydirAlt(d);
  turAnahtariEkle(d, w, 0);
  return d;
}

// Samsung'un "key transform"u: aynı anahtar takviminin ilk 4 tur anahtarıyla
// 3 turluk AES (2 tam tur + son tur).
export function aesDonusum3(anahtar, blok) {
  return sifreleTur(anahtarGenislet(anahtar, 3), blok, 3);
}

// PKCS7 dolgulu
export function ecbSifrele(anahtar, veri) {
  const dolgu = 16 - (veri.length % 16);
  const d = new Uint8Array(veri.length + dolgu);
  d.set(veri);
  d.fill(dolgu, veri.length);
  const s = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 16) s.set(blokSifrele(anahtar, d.subarray(i, i + 16)), i);
  return s;
}

// dolguyuKaldir=false: el sıkışmadaki dolgusuz veri için
export function ecbCoz(anahtar, veri, dolguyuKaldir = false) {
  if (veri.length % 16) throw new Error('ECB verisi 16 baytın katı değil');
  const s = new Uint8Array(veri.length);
  for (let i = 0; i < veri.length; i += 16) s.set(blokCoz(anahtar, veri.subarray(i, i + 16)), i);
  if (!dolguyuKaldir) return s;
  const n = s[s.length - 1];
  if (n < 1 || n > 16) throw new Error('geçersiz PKCS7 dolgusu');
  return s.subarray(0, s.length - n);
}

// Sıfır IV, dolgusuz
export function cbcSifrele(anahtar, veri) {
  if (veri.length % 16) throw new Error('CBC verisi 16 baytın katı değil');
  const s = new Uint8Array(veri.length);
  let onceki = new Uint8Array(16);
  for (let i = 0; i < veri.length; i += 16) {
    const b = veri.slice(i, i + 16);
    for (let j = 0; j < 16; j++) b[j] ^= onceki[j];
    onceki = blokSifrele(anahtar, b);
    s.set(onceki, i);
  }
  return s;
}

export function cbcCoz(anahtar, veri) {
  if (veri.length % 16) throw new Error('CBC verisi 16 baytın katı değil');
  const s = new Uint8Array(veri.length);
  let onceki = new Uint8Array(16);
  for (let i = 0; i < veri.length; i += 16) {
    const c = veri.subarray(i, i + 16);
    const b = blokCoz(anahtar, c);
    for (let j = 0; j < 16; j++) b[j] ^= onceki[j];
    s.set(b, i);
    onceki = c;
  }
  return s;
}
