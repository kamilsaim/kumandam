// Kumandam — arayüz ve akış: tarama → eşleştirme → kumanda.
import { tasimaOlustur, yerelMi, yerelEklenti } from './tasima.js';
import { agiTara, adresYokla } from './kesif.js';
import { tusKodu } from './tuslar.js';
import { SifreliAdaptor } from './adaptor/sifreli.js';
import { TizenAdaptor } from './adaptor/tizen.js';
import { EskiAdaptor } from './adaptor/eski.js';
import { AndroidTvAdaptor } from './adaptor/androidtv.js';
import { LgAdaptor } from './adaptor/lg.js';
import { RokuAdaptor } from './adaptor/roku.js';
import { sertifikaUret, baytBase64, base64Bayt } from './kripto/sertifika.js';

const SURUM = '1.1';
const $ = (id) => document.getElementById(id);
const tasima = tasimaOlustur();
const Titresim = yerelMi() ? yerelEklenti('Haptics') : null;

// ---------- Kalıcı kayıt (yalnız bu cihazda) ----------
const depo = {
  oku(ad) { try { return JSON.parse(localStorage.getItem('kumandam.' + ad)); } catch { return null; } },
  yaz(ad, v) { try { localStorage.setItem('kumandam.' + ad, JSON.stringify(v)); } catch { /* özel mod */ } },
  sil(ad) { try { localStorage.removeItem('kumandam.' + ad); } catch { /* özel mod */ } },
};

function cihazKimligi() {
  let k = depo.oku('cihaz');
  if (!k) {
    k = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    depo.yaz('cihaz', k);
  }
  return k;
}

// ---------- Durum ----------
let tv = depo.oku('tv'); // {ip, nesil, ad, model, duid, tokenGerekli}
let adaptor = null;
let bagli = false;
let yenidenDeneme = 0;
let yenidenZamanlayici = null;

// ---------- Ekranlar ----------
function ekranGoster(ad) {
  for (const e of ['ekranTarama', 'ekranEslesme', 'ekranKumanda']) $(e).hidden = e !== ad;
}

function noktaDurumu(d) {
  $('durumNokta').className = 'nokta ' + d;
  $('ekranKumanda').classList.toggle('kopuk', d !== 'bagli');
}

let bildirimZaman;
function bildir(metin, sure = 2600) {
  const b = $('bildirim');
  b.textContent = metin;
  b.hidden = false;
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => { b.hidden = true; }, sure);
}

function titret() {
  Titresim?.impact({ style: 'LIGHT' }).catch(() => {});
}

// ---------- Tarama ----------
async function taramayiBaslat() {
  ekranGoster('ekranTarama');
  $('tvAdiMetin').textContent = 'Kumandam';
  noktaDurumu('');
  const liste = $('tvListesi');
  liste.innerHTML = '';
  $('taramaDonen').hidden = false;
  $('taramaDurum').textContent = 'Ağdaki televizyonlar aranıyor…';

  const ekle = (bulunan) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = bulunan.ad;
    b.lastChild.textContent = `${bulunan.model || 'Samsung'} · ${bulunan.ip}`;
    b.onclick = () => tvSec(bulunan);
    li.append(b);
    liste.append(li);
  };

  try {
    const bulunan = await agiTara(tasima, { eslesti: ekle });
    $('taramaDurum').textContent = bulunan.length
      ? (bulunan.length === 1 ? 'Televizyon bulundu.' : 'Hangi televizyonu kumanda edeceksin?')
      : 'Televizyon bulunamadı. Televizyon açık ve aynı Wi-Fi ağında mı? Şu an Samsung, Android TV, LG ve Roku destekleniyor.';
    if (bulunan.length === 1 && !depo.oku('tv')) tvSec(bulunan[0]);
  } catch (e) {
    $('taramaDurum').textContent = e.message;
  } finally {
    $('taramaDonen').hidden = true;
  }
}

async function elleBaglan(ip) {
  $('taramaDurum').textContent = ip + ' yoklanıyor…';
  const bulunan = await adresYokla(tasima, ip, 3000);
  if (bulunan) tvSec(bulunan);
  else $('taramaDurum').textContent = ip + ' adresinde Samsung televizyon bulunamadı.';
}

function tvSec(secilen) {
  tv = secilen;
  depo.yaz('tv', tv);
  baglan();
}

// ---------- Bağlantı ----------
// Android TV istemci sertifikası: cihaz başına bir kez üretilir, bütün Android TV'lerde aynısı kullanılır.
const SERTIFIKA_ALANLARI = ['sertifika', 'pkcs8', 'pkcs1', 'modulus', 'us'];
async function istemciSertifikasi() {
  const kayit = depo.oku('atvSertifika');
  if (kayit) return Object.fromEntries(SERTIFIKA_ALANLARI.map((a) => [a, base64Bayt(kayit[a])]));
  bildir('İlk kullanım: güvenlik sertifikası hazırlanıyor…', 4000);
  const s = await sertifikaUret('Kumandam');
  depo.yaz('atvSertifika', Object.fromEntries(SERTIFIKA_ALANLARI.map((a) => [a, baytBase64(s[a])])));
  return s;
}

function adaptorOlustur() {
  switch (tv.nesil) {
    case 'sifreli': return new SifreliAdaptor(tasima, tv.ip, cihazKimligi());
    case 'tizen': return new TizenAdaptor(tasima, tv.ip, tv);
    case 'androidtv': return new AndroidTvAdaptor(tasima, tv.ip, istemciSertifikasi);
    case 'lg': return new LgAdaptor(tasima, tv.ip);
    case 'roku': return new RokuAdaptor(tasima, tv.ip);
    default: return new EskiAdaptor(tasima, tv.ip, cihazKimligi());
  }
}

// Eşleşme kodu: Samsung H/J 4 rakam, Android TV 6 haneli onaltılık (0-9, A-F)
function kodBicimi() {
  return tv?.nesil === 'androidtv'
    ? { uzunluk: 6, desen: /^[0-9A-F]{6}$/i, metin: 'Televizyon ekranındaki 6 haneli kodu gir (rakam ve A–F harfleri).', klavye: 'text' }
    : { uzunluk: 4, desen: /^\d{4}$/, metin: "Televizyon ekranındaki 4 haneli PIN'i gir.", klavye: 'numeric' };
}

function kimlikAnahtari() { return 'kimlik.' + (tv.duid || tv.ip); }

async function baglan() {
  clearTimeout(yenidenZamanlayici);
  adaptor?.kapat();
  bagli = false;
  $('tvAdiMetin').textContent = tv.ad;
  noktaDurumu('baglaniyor');
  adaptor = adaptorOlustur();
  adaptor.olay = adaptorOlayi;

  const kayitli = depo.oku(kimlikAnahtari());
  try {
    const s = await adaptor.baglan(kayitli, (d) => {
      if (d === 'izin-bekleniyor') eslesmeGoster('izin');
    });
    if (s.durum === 'pin-gerekli') {
      eslesmeGoster('pin');
      await adaptor.pinGoster();
      return;
    }
    if (s.kimlik) depo.yaz(kimlikAnahtari(), s.kimlik);
    bagliOldu();
  } catch (e) {
    noktaDurumu('kopuk');
    if (!$('ekranEslesme').hidden) {
      $('eslesmeHata').textContent = e.message;
      return;
    }
    if (kayitli && /izin|onay/i.test(e.message)) {
      depo.sil(kimlikAnahtari());
    }
    ekranGoster('ekranKumanda');
    yenidenBaglanmayiPlanla(e);
  }
}

function bagliOldu() {
  bagli = true;
  yenidenDeneme = 0;
  noktaDurumu('bagli');
  ekranGoster('ekranKumanda');
  const y = adaptor.yetenekler();
  // H/J'de SendInputString YouTube'da reddedildi (0001); klavye yalnız destekleyen nesilde.
  $('klavyeTus').hidden = !y.klavye;
  $('modSecici').hidden = !y.fare;
  // 2013 öncesi Samsung'da DIAL yok
  $('youtubeTus').hidden = tv.nesil === 'eski';
  if (!y.fare) modSec('yon');
}

function yenidenBaglanmayiPlanla(hata) {
  if (yenidenDeneme >= 5) {
    bildir("TV'ye ulaşılamadı. TV açık mı? Adına dokunup tekrar arayabilirsin.", 5000);
    return;
  }
  const bekle = Math.min(1000 * 2 ** yenidenDeneme, 15000);
  yenidenDeneme++;
  if (yenidenDeneme === 1 && hata) bildir("TV'ye ulaşılamadı, yeniden deneniyor…");
  yenidenZamanlayici = setTimeout(baglan, bekle);
}

function adaptorOlayi(ad, deger) {
  if (ad === 'koptu') {
    bagli = false;
    noktaDurumu('kopuk');
    yenidenBaglanmayiPlanla();
  } else if (ad === 'klavye' && deger && adaptor.yetenekler().klavye) {
    klavyeAc();
  } else if (ad === 'hata') {
    bildir(deger);
  }
}

// ---------- Eşleştirme ----------
function eslesmeGoster(tur) {
  ekranGoster('ekranEslesme');
  $('eslesmeHata').textContent = '';
  $('pinForm').hidden = tur !== 'pin';
  $('izinBekle').hidden = tur !== 'izin';
  $('eslesmeBaslik').textContent = tv.ad + ' ile eşleş';
  if (tur === 'pin') {
    const k = kodBicimi();
    const g = $('pinGiris');
    g.maxLength = k.uzunluk;
    g.inputMode = k.klavye;
    g.setAttribute('autocapitalize', k.klavye === 'text' ? 'characters' : 'off');
    g.classList.toggle('pin-uzun', k.uzunluk > 4);
    $('pinAciklama').textContent = k.metin;
    g.value = '';
    g.focus();
  }
}

let pinGonderiliyor = false;
async function pinGonder(pin) {
  // 4. rakamda otomatik gönderilir; ardından gelen "Eşleştir" basışı ikinci kez göndermesin
  if (pinGonderiliyor) return;
  pinGonderiliyor = true;
  $('eslesmeHata').textContent = '';
  try {
    const kimlik = await adaptor.pinGir(pin);
    depo.yaz(kimlikAnahtari(), kimlik);
    await baglan();
  } catch (e) {
    $('eslesmeHata').textContent = /PIN|Kod yanlış/.test(e.message) ? 'Kod tutmadı. Ekrandakini tekrar gir.' : e.message;
    $('pinGiris').value = '';
  } finally {
    pinGonderiliyor = false;
  }
}

// ---------- Tuşlar ----------
function tusGonder(ad) {
  if (!bagli) {
    bildir('TV bağlı değil');
    return;
  }
  try {
    adaptor.tus(tusKodu(ad, tv.nesil));
    titret();
  } catch (e) {
    bildir(e.message);
  }
}

function tuslariBagla() {
  for (const b of document.querySelectorAll('[data-tus]')) {
    const ad = b.dataset.tus;
    if (!('tekrar' in b.dataset)) {
      b.addEventListener('click', () => tusGonder(ad));
      continue;
    }
    // Basılı tutunca tekrar: ilk basış hemen, 400 ms sonra 150 ms'de bir
    let bekleme, aralik;
    const birak = () => { clearTimeout(bekleme); clearInterval(aralik); b.classList.remove('basili'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('basili');
      tusGonder(ad);
      bekleme = setTimeout(() => { aralik = setInterval(() => tusGonder(ad), 150); }, 400);
    });
    for (const o of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(o, birak);
  }
}

// ---------- Sekmeler ----------
function sekmeSec(ad) {
  for (const b of document.querySelectorAll('[data-sekme]')) b.setAttribute('aria-selected', String(b.dataset.sekme === ad));
  for (const s of ['rakam', 'medya', 'dokunmatik']) $('sekme-' + s).hidden = s !== ad;
}

// ---------- Dokunmatik alan ----------
let mod = 'yon';
function modSec(yeni) {
  mod = yeni;
  for (const b of document.querySelectorAll('[data-mod]')) b.setAttribute('aria-pressed', String(b.dataset.mod === mod));
  $('dokunmatikIpucu').textContent = mod === 'yon'
    ? 'Kaydır: yön · Dokun: OK · Basılı tut: geri'
    : 'Sürükle: imleç · Dokun: tıkla';
}

function dokunmatigiBagla() {
  const alan = $('dokunmatik');
  let bas = null;
  let son = null;
  let uzunBasma;
  let hareketVar = false;

  alan.addEventListener('pointerdown', (e) => {
    alan.setPointerCapture(e.pointerId);
    alan.classList.add('aktif');
    bas = son = { x: e.clientX, y: e.clientY };
    hareketVar = false;
    if (mod === 'yon') uzunBasma = setTimeout(() => { tusGonder('geri'); bas = null; }, 600);
  });

  alan.addEventListener('pointermove', (e) => {
    if (!bas) return;
    const dx = e.clientX - son.x;
    const dy = e.clientY - son.y;
    if (mod === 'fare') {
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        hareketVar = true;
        if (bagli) adaptor.fare(dx * 2, dy * 2);
        son = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    const tx = e.clientX - bas.x;
    const ty = e.clientY - bas.y;
    if (Math.max(Math.abs(tx), Math.abs(ty)) >= 40) {
      clearTimeout(uzunBasma);
      hareketVar = true;
      tusGonder(Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'sag' : 'sol') : (ty > 0 ? 'asagi' : 'yukari'));
      bas = { x: e.clientX, y: e.clientY }; // uzun kaydırma birden çok adım
    }
  });

  const bitir = () => {
    clearTimeout(uzunBasma);
    alan.classList.remove('aktif');
    if (bas && !hareketVar) {
      if (mod === 'yon') tusGonder('ok');
      else if (bagli) { adaptor.tikla(); titret(); }
    }
    bas = null;
  };
  alan.addEventListener('pointerup', bitir);
  alan.addEventListener('pointercancel', () => { clearTimeout(uzunBasma); alan.classList.remove('aktif'); bas = null; });
}

// ---------- Klavye ----------
function klavyeAc() {
  $('klavyeKatman').hidden = false;
  $('klavyeGiris').value = '';
  $('klavyeGiris').focus();
}

function klavyeKapat() {
  $('klavyeKatman').hidden = true;
  $('klavyeGiris').blur();
}

// ---------- YouTube (DIAL) ----------
async function youtubeAc() {
  if (!tv) return;
  try {
    if (adaptor?.youtube) {
      // Android TV, LG, Roku: kendi uygulama başlatma komutu
      await adaptor.youtube();
    } else {
      // Samsung: DIAL
      const c = await tasima.http({ yontem: 'POST', url: `http://${tv.ip}:8080/ws/apps/YouTube`, govde: '', zamanAsimi: 6000 });
      if (c.durum < 200 || c.durum >= 300) throw new Error(String(c.durum));
    }
    titret();
    bildir('YouTube açılıyor…');
  } catch (e) {
    bildir('YouTube açılamadı' + (e.message ? ' (' + e.message + ')' : ''));
  }
}

// ---------- Başlat ----------
function olaylariBagla() {
  tuslariBagla();
  dokunmatigiBagla();
  for (const b of document.querySelectorAll('[data-sekme]')) b.onclick = () => sekmeSec(b.dataset.sekme);
  for (const b of document.querySelectorAll('[data-mod]')) b.onclick = () => modSec(b.dataset.mod);

  $('tvAdi').onclick = taramayiBaslat;
  $('tekrarAra').onclick = taramayiBaslat;
  $('baskaTv').onclick = () => { adaptor?.kapat(); taramayiBaslat(); };
  $('elleForm').onsubmit = (e) => { e.preventDefault(); const ip = $('elleIp').value.trim(); if (ip) elleBaglan(ip); };

  $('pinForm').onsubmit = (e) => { e.preventDefault(); const p = $('pinGiris').value.trim(); if (kodBicimi().desen.test(p)) pinGonder(p); };
  $('pinGiris').oninput = () => { const p = $('pinGiris').value.trim(); if (kodBicimi().desen.test(p)) pinGonder(p); };
  $('pinYenile').onclick = () => adaptor?.pinGoster().catch((e) => { $('eslesmeHata').textContent = e.message; });

  $('youtubeTus').onclick = youtubeAc;
  $('surumMetin').textContent = 'Sürüm ' + SURUM + ' · reklamsız ve ücretsiz';
  $('hakkindaTus').onclick = () => { $('hakkindaKatman').hidden = false; };
  $('hakkindaKapat').onclick = () => { $('hakkindaKatman').hidden = true; };
  $('hakkindaKatman').onclick = (e) => { if (e.target === $('hakkindaKatman')) $('hakkindaKatman').hidden = true; };
  $('klavyeTus').onclick = klavyeAc;
  $('klavyeKapat').onclick = klavyeKapat;
  $('klavyeForm').onsubmit = (e) => {
    e.preventDefault();
    const m = $('klavyeGiris').value;
    if (!m || !bagli) return;
    try {
      adaptor.yazi(m);
      adaptor.yaziBitir?.();
      titret();
      klavyeKapat();
    } catch (err) { bildir(err.message); }
  };

  // Uygulama arka plandan dönünce bağlantıyı tazele
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tv && !bagli && $('ekranEslesme').hidden) {
      yenidenDeneme = 0;
      baglan();
    }
  });
}

// Yerel ağ izni notu yalnız iPhone'da
$('iosNot').hidden = window.Capacitor?.getPlatform?.() !== 'ios';
olaylariBagla();
if (tv) baglan(); else taramayiBaslat();
