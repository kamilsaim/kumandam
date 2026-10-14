// İstemci sertifikası (Android TV eşleştirmesi için): RSA-2048 anahtarı WebCrypto ile üretilir,
// kendinden imzalı X.509 sertifika burada DER olarak kurulup WebCrypto ile imzalanır.
// WebCrypto: tarayıcı/WKWebView/Android WebView'da window.crypto, Node'da globalThis.crypto.

import { birlestir, baytHex } from './yardimci.js';
import {
  sira, kume, bos, utf8, bitDizisi, baglam, mantiksal, oktet, tamsayi, tamsayiBayt, oid, zaman, oku, ogeler,
} from './asn1.js';

const RSA_OID = '1.2.840.113549.1.1.1';
const SHA256_RSA_OID = '1.2.840.113549.1.1.11';

function b64urlBayt(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const ikili = atob(b64);
  return Uint8Array.from(ikili, (c) => c.charCodeAt(0));
}

export function baytBase64(b) {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function base64Bayt(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function pem(etiket, der) {
  const b64 = baytBase64(der).replace(/.{64}/g, '$&\n');
  return `-----BEGIN ${etiket}-----\n${b64}${b64.endsWith('\n') ? '' : '\n'}-----END ${etiket}-----\n`;
}

/**
 * @param {string} ad  sertifikada görünen ad (CN)
 * @returns {Promise<{sertifika: Uint8Array, pkcs8: Uint8Array, pkcs1: Uint8Array, modulus: Uint8Array, us: Uint8Array}>}
 */
export async function sertifikaUret(ad = 'Kumandam', alt = globalThis.crypto.subtle) {
  const anahtar = await alt.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await alt.exportKey('spki', anahtar.publicKey));
  const pkcs8 = new Uint8Array(await alt.exportKey('pkcs8', anahtar.privateKey));
  const jwk = await alt.exportKey('jwk', anahtar.publicKey);

  const isim = sira(kume(sira(oid('2.5.4.3'), utf8(ad))));
  const simdi = new Date();
  const bitis = new Date(simdi.getTime() + 10 * 365 * 24 * 3600 * 1000);
  const seri = Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  seri[0] &= 0x7f;
  const imzaAlg = sira(oid(SHA256_RSA_OID), bos());
  const uzantilar = baglam(3, sira(
    sira(oid('2.5.29.19'), oktet(sira(mantiksal(true)))), // basicConstraints CA:TRUE
  ));
  const tbs = sira(
    baglam(0, tamsayi(2)), // v3
    tamsayiBayt(seri),
    imzaAlg,
    isim,
    sira(zaman(simdi), zaman(bitis)),
    isim,
    spki,
    uzantilar,
  );
  const imza = new Uint8Array(await alt.sign('RSASSA-PKCS1-v1_5', anahtar.privateKey, tbs));
  const sertifika = sira(tbs, imzaAlg, bitDizisi(imza));

  return {
    sertifika,
    pkcs8,
    pkcs1: pkcs1Cikar(pkcs8),
    modulus: b64urlBayt(jwk.n),
    us: b64urlBayt(jwk.e),
  };
}

/** PKCS#8 PrivateKeyInfo içindeki PKCS#1 RSAPrivateKey (iOS SecKeyCreateWithData bunu ister). */
export function pkcs1Cikar(pkcs8) {
  const [, , anahtarOktet] = ogeler(oku(pkcs8).icerik);
  return anahtarOktet.icerik;
}

/** X.509 sertifikasından RSA açık anahtarının modulus ve üssü (baştaki sıfırlar atılmış). */
export function rsaAcikAnahtar(sertifikaDer) {
  const [tbs] = ogeler(oku(sertifikaDer).icerik);
  const alanlar = ogeler(tbs.icerik);
  const ilk = alanlar[0].etiket === 0xa0 ? 1 : 0; // [0] version varsa atla
  const spki = alanlar[ilk + 5];
  const [alg, bit] = ogeler(spki.icerik);
  const algOid = baytHex(ogeler(alg.icerik)[0].icerik);
  if (algOid !== '2a864886f70d010101') throw new Error('TV sertifikası RSA değil');
  const rsa = oku(bit.icerik.subarray(1)); // BIT STRING'in ilk baytı kullanılmayan bit sayısı
  const [n, e] = ogeler(rsa.icerik);
  const kirp = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; return b.subarray(i); };
  return { modulus: kirp(n.icerik), us: kirp(e.icerik) };
}

export { birlestir };
