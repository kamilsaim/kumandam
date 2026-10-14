// Vektörler: github.com/McKael/smartcrypto smartcrypto_test.go (MIT)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sunucuMerhaba, istemciMerhabaCoz, sunucuOnay, istemciOnayDogrula, komutSifrele, komutCoz,
} from '../js/adaptor/sifreli-kripto.js';
import { hexBayt, baytHex } from '../js/kripto/yardimci.js';

test('ServerHello, anahtar ve ctx referansla aynı', () => {
  const m = sunucuMerhaba('654321', '1234');
  assert.equal(baytHex(m.anahtar), '7110eda4d09e062aa5e4a390b0a572ac');
  assert.equal(baytHex(m.ctx), '63616c1be9bf978af9941d2ee880360b1ff4c376');
  assert.equal(m.merhabaHex,
    '010200000000000000008A00000006363534333231C0DEE54ED567F0310A5185DBCDCB0C3E8753B342409786699D343060AB8200AFCE6BB581E3B60779FE88F1B1BD7C39A0B14898B34F8DFA058E9D377E7050E97D51E18937F04A936B76E00CACBD95B4F5353D8A716B7AB76EC85FC0D3E75CD242E909698ED6F4BA8A3EA5FF33A232400D07CB659F496AA631B5DF86253DECE96A0000000000');
});

const ISTEMCI_MERHABA = '010100000000000000009E000000063635343332314E71727C54C92CE0DD2D599883D27D2C819BB78F3CECEA7703E155FA199988A7A50A2D647501C0D9E1C86ACD272AC1DA0099096D50BD1F13AFEDBE0BB4BC54AE9C6E2558E552ED544EB6E8837D4CBF2460B6C869956992D20E630BF31B0B36C20C318AF2B9BC1E1AB3991E4D4E6BC13765353E89045AC627501A5761EBF8982DD7BE3CDCA12D893AAE18429FAB01150A1274B56B0000000000';

test('ClientHello çözülür: SKPrime ve oturum anahtarı referansla aynı', () => {
  const anahtar = hexBayt('0c08e787853fcfccc69614c4cfb4059e');
  const s = istemciMerhabaCoz('654321', anahtar, ISTEMCI_MERHABA);
  assert.equal(baytHex(s.skPrime), '0817b063a0609dd37285c0d188a9e347f6ede809');
  assert.equal(baytHex(s.oturumAnahtari), '0dc8ef22369da598815f5fa40eb174a9');
});

test('ClientHello yanlış PIN anahtarıyla reddedilir', () => {
  const yanlis = hexBayt('0c08e787853fcfccc69614c4cfb4059f');
  assert.throws(() => istemciMerhabaCoz('654321', yanlis, ISTEMCI_MERHABA), /PIN/);
});

test('ServerAck referansla aynı', () => {
  assert.equal(sunucuOnay(hexBayt('c28727fe3c9f81a4db9b335a08e75b8a1b817652')),
    '0103000000000000000014A415F89EF3EAA64F34F06A1A908CA9B75358034A0000000000');
});

test('ClientAck doğrulama: 2 doğru, 2 yanlış', () => {
  const sk1 = hexBayt('0817b063a0609dd37285c0d188a9e347f6ede809');
  const sk2 = hexBayt('c28727fe3c9f81a4db9b335a08e75b8a1b817652');
  assert.equal(istemciOnayDogrula('01040000000000000000144B5B9260A1372B211EE9DE07531D5E1D967ECE320000000000', sk1), true);
  assert.equal(istemciOnayDogrula('010400000000000000001409A8CA739EF03F47C883B0A2D1BF701FB9EE52910000000000', sk2), true);
  assert.equal(istemciOnayDogrula('010400000000000000001409A8CA739EF03F47C883B0A2D1BF701FB9EE5291000000001', sk2), false);
  assert.equal(istemciOnayDogrula('010400000000000000001409A8CA739EF03F47C883B0A2D1BF701FB9FF56660000000000', sk2), false);
});

test('komut şifreleme bayt listesi döner ve geri çözülür', () => {
  const anahtar = hexBayt('0dc8ef22369da598815f5fa40eb174a9');
  const json = '{"method":"POST","body":{"plugin":"RemoteControl"}}';
  const liste = komutSifrele(anahtar, json);
  assert.ok(Array.isArray(liste));
  assert.equal(liste.length % 16, 0);
  assert.ok(liste.every((x) => Number.isInteger(x) && x >= 0 && x < 256));
  assert.equal(komutCoz(anahtar, liste), json);
});
