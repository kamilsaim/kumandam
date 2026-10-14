import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SifreliAdaptor } from '../js/adaptor/sifreli.js';
import { komutCoz } from '../js/adaptor/sifreli-kripto.js';
import { hexBayt } from '../js/kripto/yardimci.js';

// İstekleri kaydeden, sırayla hazır cevap veren sahte taşıyıcı
function sahteTasima(cevaplar) {
  const kayit = [];
  const gonderilen = [];
  let olaylar;
  return {
    kayit, gonderilen,
    tvMesaj: (m) => olaylar.mesaj(m),
    async http(istek) {
      kayit.push(istek);
      const c = cevaplar.shift();
      if (!c) throw new Error('beklenmeyen istek: ' + istek.url);
      return c;
    },
    async wsAc(url, o) {
      kayit.push({ yontem: 'WS', url });
      olaylar = o;
      queueMicrotask(() => o.mesaj('1::'));
      return {
        gonder: (m) => {
          gonderilen.push(m);
          // gerçek TV gibi ad alanı katılımını onayla
          if (m === '1::/com.samsung.companion') queueMicrotask(() => o.mesaj('1::/com.samsung.companion'));
        },
        kapat() {},
      };
    },
  };
}

test('pinGoster: önce PIN sayfası, sonra step=0', async () => {
  const t = sahteTasima([{ durum: 200, govde: '' }, { durum: 200, govde: '{"auth_data":""}' }]);
  await new SifreliAdaptor(t, '10.0.0.5', 'cihaz-1').pinGoster();
  assert.deepEqual(t.kayit.map((k) => `${k.yontem} ${k.url}`), [
    'POST http://10.0.0.5:8080/ws/apps/CloudPINPage',
    'GET http://10.0.0.5:8080/ws/pairing?step=0&app_id=12345&device_id=cihaz-1&type=1',
  ]);
});

test('pinGir: step=0 sonra step=1; TV kısa hata kodu dönerse "PIN yanlış"', async () => {
  // UE40H6200'ün yanlış kimlik/PIN'de gerçekten döndüğü cevap
  const kisa = JSON.stringify({ auth_data: JSON.stringify({ auth_type: 'SPC', request_id: '1', GeneratorClientHello: '019A000000000000000000' }) });
  const t = sahteTasima([{ durum: 200, govde: '{"auth_data":""}' }, { durum: 200, govde: kisa }]);
  const a = new SifreliAdaptor(t, '10.0.0.5', 'cihaz-1');
  await assert.rejects(a.pinGir('1234'), /PIN yanlış ya da süresi doldu/);
  assert.match(t.kayit[0].url, /step=0&.*&type=1$/);
  assert.match(t.kayit[1].url, /step=1&/);
  const govde = JSON.parse(t.kayit[1].govde);
  assert.equal(govde.auth_Data.auth_type, 'SPC');
  // kullanıcı kimliği '654321' (6 bayt → uzunluk 0x8A); '12345' TV'de reddedildi
  assert.match(govde.auth_Data.GeneratorServerHello, /^010200000000000000008A00000006363534333231/);
});

test('baglan + tus: socket.io el sıkışması ve şifreli callCommon çerçevesi', async () => {
  const t = sahteTasima([{ durum: 200, govde: 'abc123:60:60:websocket,xhr-polling' }]);
  const a = new SifreliAdaptor(t, '10.0.0.5', 'cihaz-1');
  const kimlik = { anahtarHex: '0dc8ef22369da598815f5fa40eb174a9', oturumId: 3 };
  const s = await a.baglan(kimlik);
  assert.equal(s.durum, 'hazir');
  assert.match(t.kayit[0].url, /^http:\/\/10\.0\.0\.5:8000\/socket\.io\/1\/\?t=\d+$/);
  assert.equal(t.kayit[1].url, 'ws://10.0.0.5:8000/socket.io/1/websocket/abc123');
  assert.equal(t.gonderilen[0], '1::/com.samsung.companion');

  t.tvMesaj('2::');
  await new Promise((r) => setImmediate(r));
  assert.equal(t.gonderilen[1], '2::');

  a.tus('KEY_VOLUP');
  const cerceve = t.gonderilen[2];
  assert.ok(cerceve.startsWith('5::/com.samsung.companion:'));
  const olay = JSON.parse(cerceve.slice('5::/com.samsung.companion:'.length));
  assert.equal(olay.name, 'callCommon');
  assert.equal(olay.args[0].Session_Id, 3);
  const liste = JSON.parse(olay.args[0].body);
  const komut = JSON.parse(komutCoz(hexBayt(kimlik.anahtarHex), liste));
  assert.equal(komut.body.param3, 'KEY_VOLUP');
  assert.equal(komut.body.api, 'SendRemoteKey');
});

test('kimlik yoksa baglan pin ister', async () => {
  const a = new SifreliAdaptor(sahteTasima([]), '10.0.0.5', 'cihaz-1');
  assert.deepEqual(await a.baglan(), { durum: 'pin-gerekli' });
});
