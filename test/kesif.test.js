import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nesilBul, adresYokla, agiTara } from '../js/kesif.js';
import { tusKodu } from '../js/tuslar.js';

// UE40H6200'ün gerçek cevabı (2026-10-14)
const H6200 = {
  id: '068e7781-006e-1000-bbbf-244b03565ab8', name: '[TV]tv kamil', type: 'Samsung SmartTV',
  device: { type: 'Samsung SmartTV', duid: '068e7781-006e-1000-bbbf-244b03565ab8', model: '14_X14',
    modelName: 'UE40H6200', name: '[TV]tv kamil' },
};
// Tizen örnekleri (açık kaynak projelerdeki cevaplardan, alan adları)
const Q60 = { type: 'Samsung SmartTV', device: { type: 'Samsung SmartTV', OS: 'Tizen', model: '19_MUSEL_UHD',
  modelName: 'QE55Q60R', name: 'Salon', duid: 'uuid:abc', TokenAuthSupport: 'true' } };
const K6000 = { type: 'Samsung SmartTV', device: { type: 'Samsung SmartTV', model: '16_JAZZM_FHD',
  modelName: 'UE49K6000', name: '[TV] Samsung', duid: 'uuid:k', TokenAuthSupport: 'false' } };

test('nesilBul: H6200 → sifreli, adı sadeleşir', () => {
  assert.deepEqual(nesilBul(H6200), {
    nesil: 'sifreli', ad: 'tv kamil', model: 'UE40H6200',
    duid: '068e7781-006e-1000-bbbf-244b03565ab8', tokenGerekli: false,
  });
});

test('nesilBul: 2019 Tizen → tizen + token', () => {
  const t = nesilBul(Q60);
  assert.equal(t.nesil, 'tizen');
  assert.equal(t.tokenGerekli, true);
});

test('nesilBul: 2016 OS alanı yok → yıl ile tizen, token yok', () => {
  const t = nesilBul(K6000);
  assert.equal(t.nesil, 'tizen');
  assert.equal(t.tokenGerekli, false);
});

test('nesilBul: Samsung değilse ya da tanınmayan yıl → null', () => {
  assert.equal(nesilBul({ type: 'LG', device: { model: '19_X' } }), null);
  assert.equal(nesilBul({ type: 'Samsung SmartTV', device: { model: '13_X' } }), null);
  assert.equal(nesilBul(null), null);
});

function sahte({ api = {}, acik = [] }) {
  return {
    async http({ url }) {
      const ip = /\/\/([\d.]+):/.exec(url)[1];
      if (!api[ip]) throw new Error('bağlantı reddedildi');
      return { durum: 200, govde: JSON.stringify(api[ip]) };
    },
    // api cevabı veren adreste 8001 açıktır
    async portAcikMi(ip, port) { return acik.includes(`${ip}:${port}`) || (port === 8001 && !!api[ip]); },
    async yerelIp() { return '192.168.18.20'; },
  };
}

test('adresYokla: 8001 cevabı yok ama 55000 açık → eski', async () => {
  const tv = await adresYokla(sahte({ acik: ['10.0.0.9:55000'] }), '10.0.0.9');
  assert.equal(tv.nesil, 'eski');
});

test('adresYokla: 8001 kapalı, 8080+8000 açık → sifreli', async () => {
  const tv = await adresYokla(sahte({ acik: ['10.0.0.9:8080', '10.0.0.9:8000'] }), '10.0.0.9');
  assert.equal(tv.nesil, 'sifreli');
});

test('adresYokla: hiçbiri → null', async () => {
  assert.equal(await adresYokla(sahte({}), '10.0.0.9'), null);
});

test('agiTara: kendi adresini atlar, TV\'leri bulur', async () => {
  const t = sahte({ api: { '192.168.18.81': H6200, '192.168.18.20': Q60 }, acik: ['192.168.18.40:55000'] });
  const gelen = [];
  const bulunan = await agiTara(t, { eslesti: (x) => gelen.push(x.ip) });
  assert.deepEqual(bulunan.map((x) => x.ip).sort(), ['192.168.18.40', '192.168.18.81']);
  assert.equal(gelen.length, 2);
});

test('agiTara: yerel IP yoksa anlaşılır hata', async () => {
  const t = { ...sahte({}), yerelIp: async () => null };
  await assert.rejects(agiTara(t), /Wi-Fi/);
});

test('tusKodu: ortak ve nesle göre', () => {
  assert.equal(tusKodu('ses+', 'sifreli'), 'KEY_VOLUP');
  assert.equal(tusKodu('guc', 'sifreli'), 'KEY_POWEROFF');
  assert.equal(tusKodu('guc', 'tizen'), 'KEY_POWER');
  assert.equal(tusKodu('7', 'eski'), 'KEY_7');
  assert.throws(() => tusKodu('yok', 'tizen'), /yok/);
  assert.throws(() => tusKodu('ok', 'philips'), /bilinmeyen/);
  assert.equal(tusKodu('ses+', 'androidtv'), 24);
  assert.equal(tusKodu('0', 'androidtv'), 7);
  assert.equal(tusKodu('guc', 'lg'), 'ssap://system/turnOff');
  assert.equal(tusKodu('ok', 'roku'), 'Select');
});
