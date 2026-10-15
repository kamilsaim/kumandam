import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tvAnahtari, gorunenAd, listeyeEkle, listedenSil, adVer, taramayaUygula } from '../js/kayitli.js';
import { macBayt, sihirliPaket, uyandirmaHedefleri } from '../js/uyandir.js';
import { uygulamaIstekleri, uygulamaListesi } from '../js/uygulamalar.js';
import { gunluk, raporMetni } from '../js/gunluk.js';
import { nesilBul, adresYokla } from '../js/kesif.js';
import { LgAdaptor } from '../js/adaptor/lg.js';
import { RokuAdaptor } from '../js/adaptor/roku.js';

// ---------- Kayıtlı TV'ler ----------
const SALON = { ip: '192.168.1.20', nesil: 'sifreli', ad: 'tv kamil', model: 'UE40H6200', duid: 'uuid-1' };
const ODA = { ip: '192.168.1.30', nesil: 'androidtv', ad: 'Android TV', model: '', duid: 'androidtv-192.168.1.30' };

test('kayıtlı: anahtar duid, yoksa IP; görünen ad takma ad öncelikli', () => {
  assert.equal(tvAnahtari(SALON), 'uuid-1');
  assert.equal(tvAnahtari({ ip: '1.2.3.4' }), '1.2.3.4');
  assert.equal(gorunenAd(SALON), 'tv kamil');
  assert.equal(gorunenAd({ ...SALON, takmaAd: 'Salon' }), 'Salon');
});

test('kayıtlı: ekleme son kullanılanı başa alır, tekrar eklemede çoğalmaz', () => {
  let l = listeyeEkle([], SALON, 1);
  l = listeyeEkle(l, ODA, 2);
  assert.deepEqual(l.map(tvAnahtari), ['androidtv-192.168.1.30', 'uuid-1']);
  l = listeyeEkle(l, SALON, 3);
  assert.deepEqual(l.map(tvAnahtari), ['uuid-1', 'androidtv-192.168.1.30']);
  assert.equal(l[0].sonKullanim, 3);
});

test('kayıtlı: yeniden eklemede takma ad ve MAC kaybolmaz', () => {
  let l = listeyeEkle([], { ...SALON, mac: 'aa:bb:cc:dd:ee:ff' }, 1);
  l = adVer(l, 'uuid-1', '  Salon  ');
  l = listeyeEkle(l, { ...SALON, ip: '192.168.1.21' }, 2);
  assert.equal(l[0].takmaAd, 'Salon');
  assert.equal(l[0].mac, 'aa:bb:cc:dd:ee:ff');
  assert.equal(l[0].ip, '192.168.1.21');
});

test('kayıtlı: boş ad takma adı kaldırır; sil yalnız o TV\'yi çıkarır', () => {
  let l = adVer(listeyeEkle([], SALON), 'uuid-1', 'Salon');
  l = adVer(l, 'uuid-1', '   ');
  assert.equal('takmaAd' in l[0], false);
  l = listeyeEkle(l, ODA);
  assert.deepEqual(listedenSil(l, 'uuid-1').map(tvAnahtari), ['androidtv-192.168.1.30']);
});

test('kayıtlı: taramada IP değişen kayıtlı TV güncellenir, yeni TV kayıtlı sayılmaz', () => {
  const l = adVer(listeyeEkle([], SALON, 5), 'uuid-1', 'Salon');
  const s = taramayaUygula(l, { ...SALON, ip: '192.168.1.99' });
  assert.equal(s.kayitli.ip, '192.168.1.99');
  assert.equal(s.kayitli.takmaAd, 'Salon');
  assert.equal(s.kayitli.sonKullanim, 5);
  assert.equal(s.liste[0].ip, '192.168.1.99');
  assert.equal(taramayaUygula(l, ODA).kayitli, null);
});

// ---------- Wake-on-LAN ----------
test('uyandır: MAC biçimleri ve sihirli paket', () => {
  assert.deepEqual([...macBayt('AA:bb-CC:dd:EE:01')], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
  assert.deepEqual([...macBayt('aabbccddee01')], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
  assert.equal(macBayt('00:00:00:00:00:00'), null);
  assert.equal(macBayt('aa:bb'), null);
  const p = sihirliPaket('aa:bb:cc:dd:ee:01');
  assert.equal(p.length, 102);
  assert.deepEqual([...p.slice(0, 6)], [255, 255, 255, 255, 255, 255]);
  for (let i = 0; i < 16; i++) assert.deepEqual([...p.slice(6 + i * 6, 12 + i * 6)], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
  assert.throws(() => sihirliPaket(''), /MAC/);
});

test('uyandır: hedefler TV IP\'si, genel yayın ve alt ağ yayını', () => {
  assert.deepEqual(uyandirmaHedefleri('192.168.1.20', '192.168.1.5'), ['192.168.1.20', '255.255.255.255', '192.168.1.255']);
  assert.deepEqual(uyandirmaHedefleri('10.0.0.7', null), ['10.0.0.7', '255.255.255.255', '10.0.0.255']);
});

test('keşif: Samsung wifiMac ve Roku MAC kaydedilir', async () => {
  const tv = nesilBul({ type: 'Samsung SmartTV', device: { OS: 'Tizen', model: '19_X', name: 'Salon', duid: 'u', wifiMac: '64:1C:AE:00:11:22' } });
  assert.equal(tv.mac, '64:1C:AE:00:11:22');
  const tasima = {
    portAcikMi: async (_ip, port) => port === 8060,
    http: async () => ({ durum: 200, govde: '<device-info><serial-number>X1</serial-number><wifi-mac>d8:31:34:aa:bb:cc</wifi-mac></device-info>' }),
  };
  assert.equal((await adresYokla(tasima, '10.0.0.9')).mac, 'd8:31:34:aa:bb:cc');
});

// ---------- Uygulama kısayolları ----------
test('uygulamalar: Tizen REST kimlikleri sırayla, sonra DIAL', () => {
  const i = uygulamaIstekleri('tizen', 'netflix', '10.0.0.5');
  assert.deepEqual(i.map((x) => x.url), [
    'http://10.0.0.5:8001/api/v2/applications/3201907018807',
    'http://10.0.0.5:8001/api/v2/applications/11101200001',
    'http://10.0.0.5:8080/ws/apps/Netflix',
  ]);
});

test('uygulamalar: Samsung H/J yalnız DIAL (YouTube, Netflix); 2010-13 Samsung\'da hiç yok', () => {
  assert.deepEqual(uygulamaListesi('sifreli').map((u) => u.ad), ['youtube', 'netflix']);
  assert.deepEqual(uygulamaListesi('eski'), []);
});

test('uygulamalar: Android TV, LG, Roku adaptöre gider', () => {
  assert.deepEqual(uygulamaIstekleri('androidtv', 'youtube', 'x'), [{ tur: 'adaptor', deger: 'https://www.youtube.com' }]);
  assert.deepEqual(uygulamaIstekleri('lg', 'disney', 'x'), [{ tur: 'adaptor', deger: 'com.disney.disneyplus-prod' }]);
  assert.deepEqual(uygulamaIstekleri('roku', 'netflix', 'x'), [{ tur: 'adaptor', deger: '12' }]);
  assert.equal(uygulamaListesi('roku').length, 5);
});

test('Roku: uygulamaAc launch/<kanal> gönderir', async () => {
  const istekler = [];
  const r = new RokuAdaptor({ http: async (x) => { istekler.push(x); return { durum: 200, govde: '' }; } }, '10.0.0.3');
  await r.uygulamaAc('12');
  assert.equal(istekler[0].url, 'http://10.0.0.3:8060/launch/12');
});

test('LG: uygulamaAc launcher isteği, macBul önce kablolu MAC', async () => {
  const giden = [];
  const lg = new LgAdaptor({}, '10.0.0.8');
  lg.ana = {
    gonder: (m) => {
      const v = JSON.parse(m);
      giden.push(v);
      const payload = v.uri.endsWith('getinfo')
        ? { returnValue: true, wiredInfo: { macAddress: '38:8c:50:00:00:01' }, wifiInfo: { macAddress: '38:8c:50:00:00:02' } }
        : { returnValue: true };
      setTimeout(() => lg.bekleyen.get(v.id)?.tamam(payload), 1);
    },
  };
  await lg.uygulamaAc('netflix');
  assert.equal(giden[0].uri, 'ssap://system.launcher/launch');
  assert.deepEqual(giden[0].payload, { id: 'netflix' });
  assert.equal(await lg.macBul(), '38:8c:50:00:00:01');
});

// ---------- Günlük ----------
test('günlük: rapor TV bilgisini ve olayları içerir, 200 satırla sınırlı', () => {
  for (let i = 0; i < 250; i++) gunluk('olay ' + i);
  const r = raporMetni({ surum: '1.2', platform: 'ios', cihaz: 'iPhone', tv: SALON, bagli: false, kayitliSayisi: 2 });
  assert.match(r, /Kumandam 1\.2/);
  assert.match(r, /UE40H6200 · tür sifreli · 192\.168\.1\.20/);
  assert.match(r, /olay 249$/);
  assert.doesNotMatch(r, /olay 49\n/);
  assert.equal(r.split('\n').filter((x) => / olay \d+$/.test(x)).length, 200);
});
