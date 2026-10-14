import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blokSifrele, blokCoz, ecbSifrele, ecbCoz, cbcSifrele, cbcCoz } from '../js/kripto/aes.js';
import { hexBayt, baytHex } from '../js/kripto/yardimci.js';

const ANAHTAR = hexBayt('000102030405060708090a0b0c0d0e0f');
const DUZ = hexBayt('00112233445566778899aabbccddeeff');

test('FIPS-197 C.1 blok şifreleme', () => {
  assert.equal(baytHex(blokSifrele(ANAHTAR, DUZ)), '69c4e0d86a7b0430d8cdb78070b4c55a');
});

test('blok çözme geri döner', () => {
  assert.equal(baytHex(blokCoz(ANAHTAR, hexBayt('69c4e0d86a7b0430d8cdb78070b4c55a'))), baytHex(DUZ));
});

test('ECB PKCS7: 16 bayt girdi 32 bayt olur ve geri çözülür', () => {
  const s = ecbSifrele(ANAHTAR, DUZ);
  assert.equal(s.length, 32);
  assert.equal(baytHex(ecbCoz(ANAHTAR, s, true)), baytHex(DUZ));
});

test('CBC sıfır IV, iki blok, geri çözülür', () => {
  const iki = hexBayt('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff');
  const s = cbcSifrele(ANAHTAR, iki);
  assert.equal(baytHex(s.slice(0, 16)), '69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.notEqual(baytHex(s.slice(16)), '69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.equal(baytHex(cbcCoz(ANAHTAR, s)), baytHex(iki));
});
