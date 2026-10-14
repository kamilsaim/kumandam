import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LgAdaptor } from '../js/adaptor/lg.js';
import { RokuAdaptor } from '../js/adaptor/roku.js';
import { adresYokla } from '../js/kesif.js';

// Sahte LG: wss 3001 açılır, kayıt → izin sorusu → registered; pointer soketi verir
function sahteLg({ reddet = false, imzaliRed = false } = {}) {
  const t = { ana: [], isaret: [], urller: [] };
  t.wsAc = async (url, o) => {
    t.urller.push(url);
    const tv = (m) => setTimeout(() => o.mesaj(JSON.stringify(m)), 1);
    if (url.includes('/pointer')) return { gonder: (m) => t.isaret.push(m), kapat() {} };
    return {
      gonder: (m) => {
        const v = JSON.parse(m);
        t.ana.push(v);
        if (v.type === 'register') {
          if (imzaliRed && v.payload.manifest.signed) { tv({ type: 'error', id: v.id, error: '403 blacklisted certificate detected' }); return; }
          tv({ type: 'response', id: v.id, payload: { pairingType: 'PROMPT' } });
          tv(reddet ? { type: 'error', id: v.id, error: '403 cancelled' } : { type: 'registered', id: v.id, payload: { 'client-key': 'abc123' } });
        } else if (v.uri?.endsWith('getPointerInputSocket')) {
          tv({ type: 'response', id: v.id, payload: { returnValue: true, socketPath: 'wss://10.0.0.8:3001/resources/x/pointer' } });
        } else if (v.type === 'request') {
          tv({ type: 'response', id: v.id, payload: { returnValue: true } });
        }
      },
      kapat() {},
    };
  };
  return t;
}

test('LG: izin sorusu, client-key, pointer soketi, tuş ve SSAP', async () => {
  const t = sahteLg();
  const a = new LgAdaptor(t, '10.0.0.8');
  const durum = [];
  const s = await a.baglan(null, (d) => durum.push(d));
  assert.deepEqual(durum, ['izin-bekleniyor']);
  assert.deepEqual(s.kimlik, { anahtar: 'abc123' });
  assert.equal(t.urller[0], 'wss://10.0.0.8:3001');
  assert.equal(t.ana[0].payload.pairingType, 'PROMPT');
  assert.ok(t.ana[0].payload.manifest.signed);

  a.tus('UP');
  assert.equal(t.isaret[0], 'type:button\nname:UP\n\n');
  a.tus('ssap://audio/volumeUp');
  a.tus('uygulama:com.webos.app.inputpicker');
  a.fare(3, -2);
  assert.equal(t.isaret.at(-1), 'type:move\ndx:3\ndy:-2\ndown:0\n\n');
  await a.youtube();
  const uriler = t.ana.map((x) => x.uri).filter(Boolean);
  assert.ok(uriler.includes('ssap://audio/volumeUp'));
  assert.deepEqual(t.ana.find((x) => x.payload?.id === 'com.webos.app.inputpicker').uri, 'ssap://system.launcher/launch');
  assert.equal(t.ana.at(-1).payload.id, 'youtube.leanback.v4');
});

test('LG: kayıtlı anahtar gönderilir; imzalı manifest reddedilirse imzasız denenir', async () => {
  const t = sahteLg({ imzaliRed: true });
  const a = new LgAdaptor(t, '10.0.0.8');
  await a.baglan({ anahtar: 'eski' });
  const kayitlar = t.ana.filter((x) => x.type === 'register');
  assert.equal(kayitlar.length, 2);
  assert.equal(kayitlar[0].payload['client-key'], 'eski');
  assert.equal(kayitlar[1].payload.manifest.signed, undefined);
  assert.ok(kayitlar[1].payload.manifest.permissions.includes('CONTROL_MOUSE_AND_KEYBOARD'));
});

test('LG: kullanıcı reddederse ws:3000 denenmeden hata', async () => {
  const t = sahteLg({ reddet: true });
  await assert.rejects(new LgAdaptor(t, '10.0.0.8').baglan(), /izin vermedi/);
  assert.equal(t.urller.length, 1);
});

test('Roku: keypress, metin, YouTube', async () => {
  const istekler = [];
  const t = { http: async (i) => { istekler.push(`${i.yontem} ${i.url}`); return { durum: 200, govde: '<device-info/>' }; } };
  const a = new RokuAdaptor(t, '10.0.0.9');
  await a.baglan();
  a.tus('Select');
  await a.yazi('a b');
  await a.youtube();
  assert.deepEqual(istekler, [
    'GET http://10.0.0.9:8060/query/device-info',
    'POST http://10.0.0.9:8060/keypress/Select',
    'POST http://10.0.0.9:8060/keypress/Lit_a',
    'POST http://10.0.0.9:8060/keypress/Lit_%20',
    'POST http://10.0.0.9:8060/keypress/Lit_b',
    'POST http://10.0.0.9:8060/launch/837',
  ]);
});

function sahte(acik, govdeler = {}) {
  return {
    portAcikMi: async (ip, port) => acik.includes(port),
    http: async ({ url }) => {
      const g = Object.entries(govdeler).find(([k]) => url.includes(k));
      if (!g) throw new Error('yok');
      return { durum: 200, govde: g[1] };
    },
  };
}

test('keşif: Android TV adı Chromecast açıklamasından', async () => {
  const xml = '<root><device><friendlyName>Salon TV</friendlyName><manufacturer>Vestel</manufacturer><modelName>55U9631</modelName></device></root>';
  const tv = await adresYokla(sahte([6466, 6467, 8008], { ':8008/': xml }), '10.0.0.3');
  assert.deepEqual([tv.nesil, tv.ad, tv.model], ['androidtv', 'Salon TV', 'Vestel 55U9631']);
});

test('keşif: Android TV açıklaması yoksa varsayılan ad', async () => {
  const tv = await adresYokla(sahte([6466]), '10.0.0.3');
  assert.deepEqual([tv.nesil, tv.ad], ['androidtv', 'Android TV']);
});

test('keşif: Roku ve LG', async () => {
  const roku = await adresYokla(sahte([8060], { ':8060/': '<device-info><friendly-device-name>Oda</friendly-device-name><model-name>Roku Express</model-name></device-info>' }), '10.0.0.4');
  assert.deepEqual([roku.nesil, roku.ad, roku.model], ['roku', 'Oda', 'Roku Express']);
  const lg = await adresYokla(sahte([3001]), '10.0.0.5');
  assert.equal(lg.nesil, 'lg');
  // 8060 açık ama Roku cevabı değilse Roku sayılmaz
  assert.equal(await adresYokla(sahte([8060], { ':8060/': 'hello' }), '10.0.0.6'), null);
});
