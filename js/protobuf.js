// Küçük protobuf kodlayıcı/çözücü (Android TV kumanda protokolü için yeterli kadarı).
// Mesajlar düz nesne olarak yazılır: { alanNo: değer } — değer sayı (varint), metin, bayt,
// iç içe nesne (iç mesaj) ya da bunların dizisi (tekrarlanan alan).
// Akış çerçevesi: her mesajın önünde varint uzunluk.

import { birlestir, metinBayt, baytMetin } from './kripto/yardimci.js';

export function varint(n) {
  const b = [];
  let x = BigInt(n);
  if (x < 0n) x += 1n << 64n; // int32 negatifleri 10 bayt
  do {
    let bayt = Number(x & 0x7fn);
    x >>= 7n;
    if (x > 0n) bayt |= 0x80;
    b.push(bayt);
  } while (x > 0n);
  return Uint8Array.from(b);
}

function anahtar(no, tur) {
  return varint((no << 3) | tur);
}

/** @param {Record<number, any>} mesaj */
export function kodla(mesaj) {
  const parcalar = [];
  const alanlar = Object.keys(mesaj).map(Number).sort((a, b) => a - b);
  for (const no of alanlar) {
    const degerler = Array.isArray(mesaj[no]) ? mesaj[no] : [mesaj[no]];
    for (const d of degerler) {
      if (d === undefined || d === null) continue;
      if (typeof d === 'number' || typeof d === 'boolean' || typeof d === 'bigint') {
        parcalar.push(anahtar(no, 0), varint(typeof d === 'boolean' ? Number(d) : d));
      } else {
        const b = typeof d === 'string' ? metinBayt(d) : d instanceof Uint8Array ? d : kodla(d);
        parcalar.push(anahtar(no, 2), varint(b.length), b);
      }
    }
  }
  return birlestir(...parcalar);
}

function varintOku(b, i) {
  let x = 0n;
  let kaydir = 0n;
  for (;;) {
    if (i >= b.length) throw new RangeError('varint eksik');
    const bayt = b[i++];
    x |= BigInt(bayt & 0x7f) << kaydir;
    if (!(bayt & 0x80)) break;
    kaydir += 7n;
  }
  return { deger: x, son: i };
}

/**
 * Çözer: { alanNo: [değerler] }. Varint → Number, uzunluklu → Uint8Array
 * (iç mesaj ya da metin olduğuna çağıran karar verir: coz(...) / metin(...)).
 */
export function coz(b) {
  const s = {};
  let i = 0;
  while (i < b.length) {
    const k = varintOku(b, i);
    i = k.son;
    const no = Number(k.deger >> 3n);
    const tur = Number(k.deger & 7n);
    let deger;
    if (tur === 0) {
      const v = varintOku(b, i);
      i = v.son;
      deger = Number(BigInt.asIntN(64, v.deger));
    } else if (tur === 2) {
      const u = varintOku(b, i);
      const n = Number(u.deger);
      deger = b.subarray(u.son, u.son + n);
      i = u.son + n;
    } else if (tur === 5) {
      deger = b.subarray(i, i + 4); i += 4;
    } else if (tur === 1) {
      deger = b.subarray(i, i + 8); i += 8;
    } else {
      throw new Error('desteklenmeyen protobuf türü ' + tur);
    }
    (s[no] ||= []).push(deger);
  }
  return s;
}

export const metin = (b) => (b ? baytMetin(b) : '');

/** Mesajı varint uzunlukla çerçeveler. */
export function cercevele(mesaj) {
  const b = mesaj instanceof Uint8Array ? mesaj : kodla(mesaj);
  return birlestir(varint(b.length), b);
}

/**
 * Akış tamponundan tam mesajları ayıklar.
 * @returns {{mesajlar: Uint8Array[], kalan: Uint8Array}}
 */
export function ayikla(tampon) {
  const mesajlar = [];
  let i = 0;
  for (;;) {
    let u;
    try { u = varintOku(tampon, i); } catch { break; }
    const n = Number(u.deger);
    if (u.son + n > tampon.length) break;
    mesajlar.push(tampon.slice(u.son, u.son + n));
    i = u.son + n;
  }
  return { mesajlar, kalan: tampon.slice(i) };
}
