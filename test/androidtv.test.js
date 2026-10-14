import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, X509Certificate, createPrivateKey } from 'node:crypto';
import tls from 'node:tls';
import { sha256 } from '../js/kripto/sha256.js';
import { kodla, coz, cercevele, ayikla, varint, metin } from '../js/protobuf.js';
import { sertifikaUret, rsaAcikAnahtar, pem } from '../js/kripto/sertifika.js';
import { AndroidTvAdaptor, eslesmeSirri } from '../js/adaptor/androidtv.js';
import { baytHex, hexBayt, metinBayt } from '../js/kripto/yardimci.js';

test('SHA-256 Node ile aynı (boş, abc, çok blok)', () => {
  for (const g of [new Uint8Array(0), metinBayt('abc'), Uint8Array.from({ length: 1000 }, (_, i) => i & 255)]) {
    assert.equal(baytHex(sha256(g)), createHash('sha256').update(g).digest('hex'));
  }
});

test('protobuf: pairing_request bayt düzeni elle hesaplananla aynı', () => {
  const b = kodla({ 1: 2, 2: 200, 10: { 1: 'atvremote', 2: 'Kumandam' } });
  // 08 02 | 10 c8 01 | 52 15 | 0a 09 "atvremote" | 12 08 "Kumandam"
  const beklenen = '0802' + '10c801' + '5215' + '0a09' + Buffer.from('atvremote').toString('hex') + '1208' + Buffer.from('Kumandam').toString('hex');
  assert.equal(baytHex(b), beklenen);
});

test('protobuf: çöz, iç mesaj, negatif int32, tekrarlanan alan', () => {
  const b = kodla({ 1: -1, 3: [{ 1: 7 }, { 1: 8 }], 4: 'çay' });
  assert.equal(baytHex(varint(-1)), 'ffffffffffffffffff01');
  const m = coz(b);
  assert.equal(m[1][0], -1);
  assert.deepEqual(m[3].map((x) => coz(x)[1][0]), [7, 8]);
  assert.equal(metin(m[4][0]), 'çay');
});

test('protobuf: akıştan çerçeve ayıklama, parça parça gelen veri', () => {
  const a = cercevele({ 1: 1 });
  const b = cercevele({ 2: 'x'.repeat(200) }); // 2 baytlık uzunluk varint'i
  const akis = new Uint8Array([...a, ...b]);
  let r = ayikla(akis.subarray(0, a.length + 1));
  assert.equal(r.mesajlar.length, 1);
  r = ayikla(new Uint8Array([...r.kalan, ...akis.subarray(a.length + 1)]));
  assert.equal(r.mesajlar.length, 1);
  assert.equal(r.kalan.length, 0);
});

test('sertifika: Node X509 okur, kendini doğrular, modulus/üs eşleşir', async () => {
  const s = await sertifikaUret('Kumandam');
  const x = new X509Certificate(Buffer.from(s.sertifika));
  assert.match(x.subject, /CN=Kumandam/);
  assert.equal(x.verify(x.publicKey), true);
  const jwk = x.publicKey.export({ format: 'jwk' });
  assert.equal(Buffer.from(s.modulus).toString('base64url'), jwk.n);
  const okunan = rsaAcikAnahtar(s.sertifika);
  assert.equal(baytHex(okunan.modulus), baytHex(s.modulus));
  assert.equal(baytHex(okunan.us), '010001');
  // PKCS#1 çıkarımı Node'un okuyabildiği bir RSA anahtarı
  const k = createPrivateKey({ key: Buffer.from(s.pkcs1), format: 'der', type: 'pkcs1' });
  assert.equal(k.asymmetricKeyType, 'rsa');
});

test('sertifika: TLS istemci sertifikası olarak gerçek el sıkışmada kabul edilir', async () => {
  const istemci = await sertifikaUret('Kumandam');
  const sunucu = await sertifikaUret('TV');
  const gorulen = await new Promise((tamam, hata) => {
    const srv = tls.createServer({
      key: pem('PRIVATE KEY', sunucu.pkcs8), cert: pem('CERTIFICATE', sunucu.sertifika),
      requestCert: true, rejectUnauthorized: false,
    }, (soket) => {
      const c = soket.getPeerCertificate(true);
      soket.end();
      srv.close();
      tamam(c.raw);
    });
    srv.listen(0, '127.0.0.1', () => {
      const s = tls.connect({
        host: '127.0.0.1', port: srv.address().port, rejectUnauthorized: false,
        key: pem('PRIVATE KEY', istemci.pkcs8), cert: pem('CERTIFICATE', istemci.sertifika),
      });
      s.on('error', hata);
      s.on('data', () => {});
    });
  });
  assert.equal(Buffer.from(gorulen).toString('hex'), baytHex(istemci.sertifika));
});

// Python referansındaki hesabın Node ile bağımsız karşılığı
function referansSir(istemci, sunucu, kod) {
  const h = createHash('sha256');
  h.update(Buffer.from(istemci.modulus));
  h.update(Buffer.from('010001', 'hex'));
  h.update(Buffer.from(sunucu.modulus));
  h.update(Buffer.from('010001', 'hex'));
  h.update(Buffer.from(kod.slice(2), 'hex'));
  return h.digest();
}

test('eşleşme sırrı referansla aynı; ilk bayt koddan farklıysa "Kod yanlış"', async () => {
  const i = await sertifikaUret('A');
  const s = await sertifikaUret('B');
  const kuyruk = 'C0FFEE'.slice(2);
  const ilk = referansSir(i, s, '00' + kuyruk)[0].toString(16).padStart(2, '0').toUpperCase();
  const kod = ilk + kuyruk;
  assert.equal(baytHex(eslesmeSirri(i, s, kod)), referansSir(i, s, kod).toString('hex'));
  const yanlis = ((parseInt(ilk, 16) + 1) & 255).toString(16).padStart(2, '0') + kuyruk;
  assert.throws(() => eslesmeSirri(i, s, yanlis), /Kod yanlış/);
});

// Sahte Android TV: tlsAc ile konuşan, gerçek akışı taklit eden taşıyıcı
function sahteTv(sunucuSertifika) {
  const t = { gelen: [], portlar: [] };
  t.tlsAc = async (ip, port, s, o) => {
    t.portlar.push(port);
    const tvGonder = (m) => queueMicrotask(() => o.veri(cercevele(m)));
    const b = {
      sunucuSertifika,
      gonder: (bayt) => {
        for (const m of ayikla(bayt).mesajlar) {
          const d = coz(m);
          t.gelen.push({ port, d });
          if (port === 6467) {
            if (d[10]) tvGonder({ 1: 2, 2: 200, 11: { 1: 'TV' } });
            else if (d[20]) tvGonder({ 1: 2, 2: 200, 20: { 1: { 1: 3, 2: 6 }, 3: 1 } });
            else if (d[30]) tvGonder({ 1: 2, 2: 200, 31: new Uint8Array(0) });
            else if (d[40]) tvGonder({ 1: 2, 2: 200, 41: { 1: coz(d[40][0])[1][0] } });
          }
        }
      },
      kapat: () => {},
    };
    if (port === 6466) {
      tvGonder({ 1: { 1: 0x27f, 2: { 1: 'Model', 2: 'Vestel' } } });
      setTimeout(() => tvGonder({ 2: { 1: 0x27f } }), 1);
      setTimeout(() => tvGonder({ 8: { 1: 5 } }), 2);
      setTimeout(() => tvGonder({ 40: { 1: 1 } }), 3);
    }
    return b;
  };
  return t;
}

test('Android TV adaptörü: eşleşme akışı ve sır mesajı', async () => {
  const istemci = await sertifikaUret('Kumandam');
  const tv = await sertifikaUret('TV');
  const t = sahteTv(tv.sertifika);
  const a = new AndroidTvAdaptor(t, '10.0.0.3', async () => istemci);
  assert.deepEqual(await a.baglan(), { durum: 'pin-gerekli' });
  await a.pinGoster();
  const kuyruk = 'ABCD';
  const ilk = referansSir(istemci, tv, '00' + kuyruk)[0].toString(16).padStart(2, '0');
  const kimlik = await a.pinGir((ilk + kuyruk).toLowerCase());
  assert.deepEqual(kimlik, { eslesti: true });
  const sira = t.gelen.map((g) => Object.keys(g.d).filter((k) => !['1', '2'].includes(k))[0]);
  assert.deepEqual(sira, ['10', '20', '30', '40']);
  const sir = coz(t.gelen[3].d[40][0])[1][0];
  assert.equal(baytHex(sir), referansSir(istemci, tv, ilk + kuyruk).toString('hex'));
  await assert.rejects(a.pinGir('12345'), /6 haneli/);
});

test('Android TV adaptörü: kumanda kanalı yapılandırma, ping, tuş, yazı, YouTube', async () => {
  const istemci = await sertifikaUret('Kumandam');
  const t = sahteTv(new Uint8Array(0));
  const a = new AndroidTvAdaptor(t, '10.0.0.3', async () => istemci);
  await a.baglan({ eslesti: true });
  assert.deepEqual(t.portlar, [6466]);
  const yanit = (alan) => t.gelen.find((g) => g.d[alan]);
  const ayar = coz(yanit(1).d[1][0]);
  assert.equal(ayar[1][0], 0x27f & (1 | 2 | 4 | 32 | 64 | 512));
  assert.equal(metin(coz(ayar[2][0])[5][0]), 'atvremote');
  assert.ok(yanit(2));
  assert.equal(coz(yanit(9).d[9][0])[1][0], 5);

  a.tus(24);
  const tus = coz(t.gelen.at(-1).d[10][0]);
  assert.deepEqual([tus[1][0], tus[2][0]], [24, 3]);
  a.yazi('merhaba');
  const ime = coz(t.gelen.at(-1).d[21][0]);
  assert.equal(metin(coz(coz(ime[3][0])[2][0])[3][0]), 'merhaba');
  await a.youtube();
  assert.equal(metin(coz(t.gelen.at(-1).d[90][0])[1][0]), 'https://www.youtube.com');
});
