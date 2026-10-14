import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TizenAdaptor } from '../js/adaptor/tizen.js';
import { EskiAdaptor, kimlikPaketi, tusPaketi, cevapDurumu } from '../js/adaptor/eski.js';

function sahteWs(tvCevaplari) {
  const t = { gonderilen: [], url: null, secenek: null };
  t.wsAc = async (url, o, secenek) => {
    t.url = url;
    t.secenek = secenek;
    t.o = o;
    for (const c of tvCevaplari) queueMicrotask(() => o.mesaj(JSON.stringify(c)));
    return { gonder: (m) => t.gonderilen.push(JSON.parse(m)), kapat() {} };
  };
  return t;
}

test('Tizen 2016: ws 8001, token yok, tuş mesajı', async () => {
  const t = sahteWs([{ event: 'ms.channel.connect', data: {} }]);
  const a = new TizenAdaptor(t, '10.0.0.7', { tokenGerekli: false });
  await a.baglan();
  assert.equal(t.url, 'ws://10.0.0.7:8001/api/v2/channels/samsung.remote.control?name=S3VtYW5kYW0%3D');
  a.tus('KEY_VOLUP');
  assert.deepEqual(t.gonderilen[0], {
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: 'KEY_VOLUP', Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
});

test('Tizen 2018+: wss 8002, izin beklenir, gelen token saklanır ve sonraki adreste kullanılır', async () => {
  const t = sahteWs([{ event: 'ms.channel.connect', data: { token: '12345678' } }]);
  const a = new TizenAdaptor(t, '10.0.0.7', { tokenGerekli: true });
  const durumlar = [];
  const s = await a.baglan(null, (d) => durumlar.push(d));
  assert.deepEqual(durumlar, ['izin-bekleniyor']);
  assert.match(t.url, /^wss:\/\/10\.0\.0\.7:8002\/.*\?name=[^&]+$/);
  assert.equal(t.secenek.kendiImzaliKabul, true);
  assert.deepEqual(s.kimlik, { token: '12345678' });
  assert.match(a.adres(), /&token=12345678$/);
});

test('Tizen: izin reddi anlaşılır hata verir', async () => {
  const t = sahteWs([{ event: 'ms.channel.unauthorized' }]);
  await assert.rejects(new TizenAdaptor(t, '10.0.0.7', { tokenGerekli: true }).baglan(), /izin vermedi/);
});

test('Tizen: yazı base64 (Türkçe karakter), fare ve klavye olayı', async () => {
  const t = sahteWs([{ event: 'ms.channel.connect', data: {} }]);
  const a = new TizenAdaptor(t, '10.0.0.7');
  const olaylar = [];
  a.olay = (ad, v) => olaylar.push([ad, v]);
  await a.baglan();
  a.yazi('çay');
  assert.equal(t.gonderilen[0].params.Cmd, Buffer.from('çay').toString('base64'));
  assert.equal(t.gonderilen[0].params.TypeOfRemote, 'SendInputString');
  a.fare(3.6, -2.2);
  assert.deepEqual([t.gonderilen[1].params.Position.x, t.gonderilen[1].params.Position.y], [4, -2]);
  t.o.mesaj(JSON.stringify({ event: 'ms.remote.imeStart' }));
  assert.deepEqual(olaylar, [['klavye', true]]);
});

// Bayt düzeni elle hesaplandı: tür 0, "iphone..iapp.samsung" (20 bayt), yük
test('eski: tuş paketi bayt düzeni', () => {
  const p = tusPaketi('KEY_VOLUP');
  const ad = 'iphone..iapp.samsung';
  const kod = Buffer.from(Buffer.from('KEY_VOLUP').toString('base64'));
  const yuk = Buffer.concat([Buffer.from([0, 0, 0, kod.length, 0]), kod]);
  const beklenen = Buffer.concat([Buffer.from([0, ad.length, 0]), Buffer.from(ad), Buffer.from([yuk.length, 0]), yuk]);
  assert.equal(Buffer.from(p).toString('hex'), beklenen.toString('hex'));
});

test('eski: kimlik paketi 0x64 0x00 ile başlayan yük taşır', () => {
  const p = kimlikPaketi('192.168.1.5', 'cihaz');
  const yukBasi = 3 + 20 + 2;
  assert.deepEqual([p[yukBasi], p[yukBasi + 1]], [0x64, 0x00]);
  const ipB64 = Buffer.from('192.168.1.5').toString('base64');
  assert.equal(Buffer.from(p.subarray(yukBasi + 4, yukBasi + 4 + ipB64.length)).toString(), ipB64);
});

function cevap(yuk) {
  const ad = Buffer.from('iapp.samsung');
  return Uint8Array.from(Buffer.concat([Buffer.from([2, ad.length, 0]), ad, Buffer.from([yuk.length, 0]), Buffer.from(yuk)]));
}

test('eski: cevap durumları', () => {
  assert.equal(cevapDurumu(cevap([0x64, 0x00, 0x01, 0x00])), 'izinli');
  assert.equal(cevapDurumu(cevap([0x64, 0x00, 0x00, 0x00])), 'reddedildi');
  assert.equal(cevapDurumu(cevap([0x0a, 0x00, 0x02, 0x00, 0x00, 0x00])), 'bekliyor');
  assert.equal(cevapDurumu(cevap([0x65, 0x00])), 'zamanasimi');
  assert.equal(cevapDurumu(cevap([0x64, 0x00, 0x01, 0x00]).subarray(0, 8)), null); // eksik veri
});

test('eski adaptör: önce bekliyor sonra izinli, tuş gönderir', async () => {
  const giden = [];
  const durumlar = [];
  const t = {
    yerelIp: async () => '192.168.1.5',
    tcpAc: async (ip, port, o) => {
      assert.equal(port, 55000);
      setTimeout(() => o.veri(cevap([0x0a, 0x00, 0x02, 0x00, 0x00, 0x00])), 1);
      // izin cevabı iki parça halinde gelir
      const izin = cevap([0x64, 0x00, 0x01, 0x00]);
      setTimeout(() => o.veri(izin.subarray(0, 5)), 2);
      setTimeout(() => o.veri(izin.subarray(5)), 3);
      return { gonder: (b) => giden.push(b), kapat() {} };
    },
  };
  const a = new EskiAdaptor(t, '192.168.1.40', 'cihaz');
  await a.baglan(null, (d) => durumlar.push(d));
  assert.deepEqual(durumlar, ['izin-bekleniyor']);
  a.tus('KEY_MUTE');
  assert.equal(giden.length, 2);
  assert.equal(Buffer.from(giden[1]).toString('hex'), Buffer.from(tusPaketi('KEY_MUTE')).toString('hex'));
});
