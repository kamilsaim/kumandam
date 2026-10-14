// Küçük ASN.1 DER kodlayıcı / çözücü: X.509 sertifika üretmek ve TV sertifikasından
// RSA açık anahtarını okumak için yeterli kadarı.

import { birlestir, metinBayt } from './yardimci.js';

function uzunluk(n) {
  if (n < 0x80) return Uint8Array.of(n);
  const b = [];
  while (n > 0) { b.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | b.length, ...b);
}

export function tlv(etiket, icerik) {
  return birlestir(Uint8Array.of(etiket), uzunluk(icerik.length), icerik);
}

export const sira = (...p) => tlv(0x30, birlestir(...p));
export const kume = (...p) => tlv(0x31, birlestir(...p));
export const bos = () => Uint8Array.of(0x05, 0x00);
export const utf8 = (m) => tlv(0x0c, metinBayt(m));
export const oktet = (b) => tlv(0x04, b);
export const bitDizisi = (b) => tlv(0x03, birlestir(Uint8Array.of(0), b));
export const baglam = (no, icerik) => tlv(0xa0 | no, icerik); // açık (explicit) bağlam etiketi
export const mantiksal = (d) => Uint8Array.of(0x01, 0x01, d ? 0xff : 0x00);

/** İşaretsiz büyük tamsayı baytlarından INTEGER (gerekirse başa 0x00). */
export function tamsayiBayt(b) {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  let t = b.subarray(i);
  if (t[0] & 0x80) t = birlestir(Uint8Array.of(0), t);
  return tlv(0x02, t);
}

export function tamsayi(n) {
  const b = [];
  do { b.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0);
  return tamsayiBayt(Uint8Array.from(b));
}

export function oid(metin) {
  const p = metin.split('.').map(Number);
  const b = [40 * p[0] + p[1]];
  for (const x of p.slice(2)) {
    const parca = [x & 0x7f];
    let y = Math.floor(x / 128);
    while (y > 0) { parca.unshift((y & 0x7f) | 0x80); y = Math.floor(y / 128); }
    b.push(...parca);
  }
  return tlv(0x06, Uint8Array.from(b));
}

export function zaman(tarih) {
  // 2050 öncesi UTCTime, sonrası GeneralizedTime (RFC 5280)
  const iki = (n) => String(n).padStart(2, '0');
  const y = tarih.getUTCFullYear();
  const govde = `${iki(tarih.getUTCMonth() + 1)}${iki(tarih.getUTCDate())}${iki(tarih.getUTCHours())}${iki(tarih.getUTCMinutes())}${iki(tarih.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, metinBayt(String(y % 100).padStart(2, '0') + govde)) : tlv(0x18, metinBayt(y + govde));
}

/**
 * DER çözümleme: { etiket, icerik (Uint8Array), son (bir sonraki öğenin konumu) }
 */
export function oku(b, konum = 0) {
  const etiket = b[konum];
  let i = konum + 1;
  let n = b[i++];
  if (n & 0x80) {
    const k = n & 0x7f;
    n = 0;
    for (let j = 0; j < k; j++) n = n * 256 + b[i++];
  }
  if (i + n > b.length) throw new Error('DER verisi eksik');
  return { etiket, icerik: b.subarray(i, i + n), son: i + n };
}

/** Bir SEQUENCE/SET içeriğindeki öğeler. */
export function ogeler(icerik) {
  const s = [];
  let i = 0;
  while (i < icerik.length) {
    const o = oku(icerik, i);
    s.push(o);
    i = o.son;
  }
  return s;
}
