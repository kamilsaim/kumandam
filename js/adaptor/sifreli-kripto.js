// 2014-2015 Samsung (H/J) SmartView PIN el sıkışması ve komut şifrelemesi.
// github.com/McKael/smartcrypto (MIT, Copyright (c) 2018 Mikael Berthe) Go
// uygulamasından JS'e çevrildi.
//
// Akış: sunucuMerhaba (PIN ile) → TV ClientHello döner → istemciMerhabaCoz
// (oturum anahtarı çıkar) → sunucuOnay gönderilir → TV ClientAck döner →
// istemciOnayDogrula. Sonra her komut oturum anahtarıyla AES-ECB şifrelenir.

import { cbcSifrele, cbcCoz, ecbSifrele, ecbCoz, aesDonusum3 } from '../kripto/aes.js';
import { sha1 } from '../kripto/sha1.js';
import {
  hexBayt, baytHex, birlestir, metinBayt, baytMetin, u32be, esitMi,
} from '../kripto/yardimci.js';
import { WB_ANAHTAR, DONUSUM_ANAHTARI, ACIK_ANAHTAR, OZEL_ANAHTAR, ASAL } from './sifreli-anahtarlar.js';

const GX_BOYU = 128;

function bigIntBayt(b) {
  return BigInt('0x' + (baytHex(b) || '0'));
}

// Go'daki big.Int.Bytes() gibi: başta sıfır bayt yok
function baytBigInt(n) {
  let h = n.toString(16);
  if (h === '0') return new Uint8Array(0);
  if (h.length % 2) h = '0' + h;
  return hexBayt(h);
}

function usModu(taban, us, mod) {
  let s = 1n;
  taban %= mod;
  while (us > 0n) {
    if (us & 1n) s = (s * taban) % mod;
    taban = (taban * taban) % mod;
    us >>= 1n;
  }
  return s;
}

function buyukHex(b) {
  return baytHex(b).toUpperCase();
}

/**
 * @param {string} kullaniciId  uygulama kimliği (TV'ye app_id olarak da gider)
 * @param {string} pin          TV ekranındaki PIN
 * @returns {{merhabaHex: string, anahtar: Uint8Array, ctx: Uint8Array}}
 */
export function sunucuMerhaba(kullaniciId, pin) {
  const kimlik = metinBayt(kullaniciId);
  if (kimlik.length < 1 || kimlik.length > 96) throw new Error('kullanıcı kimliği boyu geçersiz');

  const anahtar = sha1(metinBayt(pin)).subarray(0, 16);
  const sifreli = cbcSifrele(anahtar, ACIK_ANAHTAR);
  const takas = ecbSifrele(WB_ANAHTAR, sifreli).subarray(0, GX_BOYU);

  const veri = birlestir(u32be(kimlik.length), kimlik, takas);
  const ctx = sha1(veri);
  const merhaba = birlestir(
    Uint8Array.of(0x01, 0x02, 0, 0, 0, 0, 0),
    u32be(veri.length),
    veri,
    new Uint8Array(5),
  );
  return { merhabaHex: buyukHex(merhaba), anahtar, ctx };
}

/**
 * TV'nin ClientHello mesajını çözer ve PIN'i doğrular.
 * @returns {{skPrime: Uint8Array, oturumAnahtari: Uint8Array}}
 */
export function istemciMerhabaCoz(kullaniciId, anahtar, istemciMerhabaHex) {
  const v = hexBayt(istemciMerhabaHex);
  if (v.length < 164) throw new Error('ClientHello çok kısa');
  if (!esitMi(v.subarray(0, 7), Uint8Array.of(1, 1, 0, 0, 0, 0, 0))) {
    throw new Error('ClientHello başlığı beklenmedik');
  }
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const yukBoyu = dv.getUint32(7);
  const kimlikBoyu = dv.getUint32(11);
  if (kimlikBoyu + 152 !== yukBoyu) throw new Error('ClientHello kimlik boyu geçersiz');

  let i = 15;
  const istemciKimlik = v.subarray(i, (i += kimlikBoyu));
  const kimlik = metinBayt(kullaniciId);
  if (!esitMi(istemciKimlik, kimlik)) throw new Error('TV farklı bir kullanıcı kimliği döndü');

  const wbGx = v.subarray(i, (i += GX_BOYU));
  const gx = cbcCoz(anahtar, ecbCoz(WB_ANAHTAR, wbGx));
  const sir = baytBigInt(usModu(bigIntBayt(gx), bigIntBayt(OZEL_ANAHTAR), bigIntBayt(ASAL)));

  const istemciOzet = v.subarray(i, (i += 20));
  if (v[i] !== 0 || dv.getUint32(i + 1) !== 0) throw new Error('ClientHello bayrakları sıfır değil');

  if (!esitMi(sha1(birlestir(kimlik, sir)), istemciOzet)) throw new Error('PIN yanlış');

  const skPrime = sha1(birlestir(istemciKimlik, kimlik, gx, ACIK_ANAHTAR, sir));
  const skPrimeOzet = sha1(birlestir(skPrime, Uint8Array.of(0)));
  const oturumAnahtari = aesDonusum3(DONUSUM_ANAHTARI, skPrimeOzet.subarray(0, 16));
  return { skPrime, oturumAnahtari };
}

export function sunucuOnay(skPrime) {
  return '0103000000000000000014' + buyukHex(sha1(birlestir(skPrime, Uint8Array.of(1)))) + '0000000000';
}

export function istemciOnayDogrula(istemciOnay, skPrime) {
  if (istemciOnay.length < 72) return false;
  const beklenen = buyukHex(sha1(birlestir(skPrime, Uint8Array.of(2)))) + '0000000000';
  return istemciOnay.slice(22).toUpperCase() === beklenen;
}

// Komut JSON'unu oturum anahtarıyla şifreler; TV bayt listesi (sayı dizisi) bekler.
export function komutSifrele(oturumAnahtari, json) {
  return Array.from(ecbSifrele(oturumAnahtari, metinBayt(json)));
}

export function komutCoz(oturumAnahtari, liste) {
  return baytMetin(ecbCoz(oturumAnahtari, Uint8Array.from(liste), true));
}
