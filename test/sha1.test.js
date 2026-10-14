import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha1 } from '../js/kripto/sha1.js';
import { baytHex, metinBayt } from '../js/kripto/yardimci.js';

test('SHA-1 "abc"', () => {
  assert.equal(baytHex(sha1(metinBayt('abc'))), 'a9993e364706816aba3e25717850c26c9cd0d89d');
});

test('SHA-1 boş girdi', () => {
  assert.equal(baytHex(sha1(new Uint8Array(0))), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
});

test('SHA-1 çok bloklu girdiler Node ile aynı', () => {
  for (const n of [55, 56, 63, 64, 65, 1000]) {
    const g = Uint8Array.from({ length: n }, (_, i) => (i * 7) & 255);
    assert.equal(baytHex(sha1(g)), createHash('sha1').update(g).digest('hex'), `n=${n}`);
  }
});
