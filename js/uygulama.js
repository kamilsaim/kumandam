// Kumandam — arayüz ve akış: tarama → eşleştirme → kumanda.
import { tasimaOlustur, yerelMi, yerelEklenti } from './tasima.js';
import { agiTara, adresYokla, portlariTani, ipDuzelt } from './kesif.js';
import { tusKodu } from './tuslar.js';
import { SifreliAdaptor } from './adaptor/sifreli.js';
import { TizenAdaptor } from './adaptor/tizen.js';
import { EskiAdaptor } from './adaptor/eski.js';
import { AndroidTvAdaptor } from './adaptor/androidtv.js';
import { LgAdaptor } from './adaptor/lg.js';
import { RokuAdaptor } from './adaptor/roku.js';
import { sertifikaUret, baytBase64, base64Bayt } from './kripto/sertifika.js';
import { tvAnahtari, gorunenAd, listeyeEkle, listedenSil, adVer, taramayaUygula } from './kayitli.js';
import { macBayt, sihirliPaket, uyandirmaHedefleri, UYANDIRMA_PORTU } from './uyandir.js';
import { uygulamaIstekleri, uygulamaListesi } from './uygulamalar.js';
import { gunluk, raporMetni } from './gunluk.js';

const SURUM = '1.2';
const $ = (id) => document.getElementById(id);
const tasima = tasimaOlustur();
const Titresim = yerelMi() ? yerelEklenti('Haptics') : null;
const Paylas = yerelMi() ? yerelEklenti('Share') : null;
const TUR_ADI = { eski: 'Samsung', sifreli: 'Samsung', tizen: 'Samsung', androidtv: 'Android TV', lg: 'LG', roku: 'Roku' };

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
let tv = depo.oku('tv'); // {ip, nesil, ad, model, duid, tokenGerekli, mac?, takmaAd?}
let adaptor = null;
let bagli = false;
let yenidenDeneme = 0;
let yenidenZamanlayici = null;
let baglanSayac = 0; // yarıda bırakılan bağlanma denemeleri sonradan ekran değiştirmesin
let sessiz = false; // TV'nin ses durumu bilinmez; tuşa basışlardan tahmin edilir

// ---------- Kayıtlı televizyonlar ----------
function kayitliTvler() { return depo.oku('tvler') || []; }
function kayitliYaz(liste) { depo.yaz('tvler', liste); }
// 1.1'den gelen: yalnız son TV saklanıyordu, listeye taşınır
if (tv && !depo.oku('tvler')) kayitliYaz(listeyeEkle([], tv));

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
  gunluk('Bildirim: ' + metin);
}

function titret() {
  Titresim?.impact({ style: 'LIGHT' }).catch(() => {});
}

// ---------- Tarama ----------
function tvSatiri(bilgi, { agda = false, duzenle = null } = {}) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = '<span><i class="nokta"></i><b></b></span><small></small>';
  if (agda) b.querySelector('.nokta').classList.add('bagli');
  if (!duzenle) b.querySelector('.nokta').remove();
  b.querySelector('b').textContent = gorunenAd(bilgi);
  b.lastChild.textContent = `${bilgi.model || TUR_ADI[bilgi.nesil] || 'TV'} · ${bilgi.ip}`;
  b.onclick = () => tvSec(bilgi);
  li.append(b);
  if (duzenle) {
    const d = document.createElement('button');
    d.className = 'tus duzenle';
    d.setAttribute('aria-label', gorunenAd(bilgi) + ' düzenle');
    d.textContent = '✎';
    d.onclick = duzenle;
    li.append(d);
  }
  return li;
}

let agdakiler = new Set(); // bu taramada ağda görülen kayıtlı TV'lerin anahtarları
function kayitliCiz() {
  const liste = kayitliTvler();
  $('kayitliBolum').hidden = !liste.length;
  $('taramaBaslik').textContent = liste.length ? 'Yeni televizyon ekle' : 'Televizyonunu bul';
  const ul = $('kayitliListe');
  ul.innerHTML = '';
  for (const k of liste) {
    const li = tvSatiri(k, { agda: agdakiler.has(tvAnahtari(k)), duzenle: () => duzenleAc(k) });
    if (tv && tvAnahtari(tv) === tvAnahtari(k)) li.classList.add('secili');
    ul.append(li);
  }
}

let taramaSayac = 0;
async function taramayiBaslat() {
  const bu = ++taramaSayac;
  // Bağlı değilse süren deneme bırakılır; liste açıkken kumanda ekranına atlanmasın
  clearTimeout(yenidenZamanlayici);
  if (!bagli) {
    baglanSayac++;
    adaptor?.kapat();
    adaptor = null;
  }
  ekranGoster('ekranTarama');
  $('tvAdiMetin').textContent = 'Kumandam';
  noktaDurumu('');
  agdakiler = new Set();
  kayitliCiz();
  const liste = $('tvListesi');
  liste.innerHTML = '';
  $('taramaDonen').hidden = false;
  $('taramaDurum').textContent = 'Ağdaki televizyonlar aranıyor…';
  gunluk('Tarama başladı');

  const ekle = (bulunan) => {
    if (bu !== taramaSayac) return;
    // Kayıtlı TV ağda görüldüyse yeni olarak listelenmez; kaydı tazelenir (IP değişmiş olabilir)
    const s = taramayaUygula(kayitliTvler(), bulunan);
    if (s.kayitli) {
      kayitliYaz(s.liste);
      agdakiler.add(tvAnahtari(bulunan));
      kayitliCiz();
      return;
    }
    liste.append(tvSatiri(bulunan));
  };

  try {
    const bulunan = await agiTara(tasima, { eslesti: ekle });
    if (bu !== taramaSayac) return;
    gunluk(`Tarama bitti: ${bulunan.length} TV ${bulunan.map((x) => `${x.nesil}@${x.ip}`).join(' ')}`);
    const kayitliSayisi = kayitliTvler().length;
    const yeni = bulunan.filter((x) => !agdakiler.has(tvAnahtari(x)));
    $('taramaDurum').textContent = yeni.length
      ? (yeni.length === 1 ? 'Yeni bir televizyon bulundu.' : 'Hangi televizyonu kumanda edeceksin?')
      : kayitliSayisi
        ? (bulunan.length ? 'Ağda yeni televizyon yok.' : 'Ağda açık televizyon bulunamadı. Kayıtlı bir televizyona dokunursan yine de bağlanmayı dener.')
        : 'Televizyon bulunamadı. Televizyon açık ve aynı Wi-Fi ağında mı? Şu an Samsung, Android TV, LG ve Roku destekleniyor.';
    if (bulunan.length === 1 && !kayitliSayisi && !tv) tvSec(bulunan[0]);
  } catch (e) {
    $('taramaDurum').textContent = e.message;
    gunluk('Tarama hatası: ' + e.message);
  } finally {
    if (bu === taramaSayac) $('taramaDonen').hidden = true;
  }
}

async function elleBaglan(metin) {
  const ip = ipDuzelt(metin);
  if (!ip) {
    $('taramaDurum').textContent = 'IP adresi 192.168.1.50 biçiminde olmalı (4 sayı, aralarında nokta).';
    return;
  }
  $('elleIp').value = ip;
  $('taramaDurum').textContent = ip + ' yoklanıyor…';
  try {
    const bulunan = await adresYokla(tasima, ip, 4000);
    if (bulunan) {
      taramaSayac++; // süren taramanın sonucu bu seçimi ezmesin
      tvSec(bulunan);
      return;
    }
    $('taramaDurum').textContent = ip + ' inceleniyor…';
    const { portlar, ipucu } = await portlariTani(tasima, ip, 3000);
    gunluk(`Elle IP ${ip}: TV tanınmadı, açık portlar: ${portlar.join(',') || 'yok'}`);
    $('taramaDurum').textContent = !portlar.length
      ? ip + ' adresine ulaşılamadı. Televizyon açık mı, adres doğru mu, telefon aynı Wi-Fi ağında mı?'
      : ip + ' adresinde desteklenen bir televizyon bulunamadı. Açık portlar: ' + portlar.join(', ')
        + (ipucu.length ? ' (olası tür: ' + ipucu.join(', ') + ')' : '')
        + '. Bu bilgiyi geliştiriciye iletirsen destek eklenebilir.';
  } catch (e) {
    $('taramaDurum').textContent = ip + ': ' + e.message;
    gunluk(`Elle IP ${ip} hatası: ${e.message}`);
  }
}

function tvSec(secilen) {
  // Zaten bağlı olduğu TV'ye dokunduysa yeniden bağlanmadan kumandaya dön
  if (bagli && tv && tvAnahtari(tv) === tvAnahtari(secilen)) {
    $('tvAdiMetin').textContent = gorunenAd(tv);
    noktaDurumu('bagli');
    ekranGoster('ekranKumanda');
    return;
  }
  const s = taramayaUygula(kayitliTvler(), secilen);
  if (s.kayitli) kayitliYaz(s.liste);
  tv = s.kayitli || secilen;
  depo.yaz('tv', tv);
  sessizAyarla(false);
  baglan();
}

// ---------- Kayıtlı TV düzenleme ----------
let duzenlenen = null;
function duzenleAc(k) {
  duzenlenen = k;
  $('duzenleBilgi').textContent = [k.ad, k.model || TUR_ADI[k.nesil], k.ip].filter(Boolean).join(' · ');
  $('duzenleAd').value = k.takmaAd || '';
  $('duzenleSil').classList.remove('emin');
  $('duzenleSil').textContent = 'Listeden sil';
  $('duzenleKatman').hidden = false;
}

function duzenleKapat() {
  $('duzenleKatman').hidden = true;
  $('duzenleAd').blur();
  duzenlenen = null;
}

function duzenleKaydet() {
  if (!duzenlenen) return;
  const a = tvAnahtari(duzenlenen);
  const liste = adVer(kayitliTvler(), a, $('duzenleAd').value);
  kayitliYaz(liste);
  if (tv && tvAnahtari(tv) === a) {
    tv = liste.find((x) => tvAnahtari(x) === a) || tv;
    depo.yaz('tv', tv);
  }
  duzenleKapat();
  kayitliCiz();
}

function duzenleSil() {
  if (!duzenlenen) return;
  const b = $('duzenleSil');
  if (!b.classList.contains('emin')) { // yanlışlıkla silinmesin: ikinci basışta siler
    b.classList.add('emin');
    b.textContent = 'Emin misin? Sil';
    return;
  }
  const a = tvAnahtari(duzenlenen);
  kayitliYaz(listedenSil(kayitliTvler(), a));
  depo.sil('kimlik.' + a); // eşleşme de unutulur
  gunluk('Kayıtlı TV silindi: ' + duzenlenen.nesil);
  if (tv && tvAnahtari(tv) === a) {
    clearTimeout(yenidenZamanlayici);
    adaptor?.kapat();
    adaptor = null;
    bagli = false;
    tv = null;
    depo.sil('tv');
  }
  duzenleKapat();
  kayitliCiz();
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

function kimlikAnahtari() { return 'kimlik.' + tvAnahtari(tv); }

async function baglan() {
  const bu = ++baglanSayac;
  clearTimeout(yenidenZamanlayici);
  adaptor?.kapat();
  bagli = false;
  $('tvAdiMetin').textContent = gorunenAd(tv);
  noktaDurumu('baglaniyor');
  const yeni = adaptorOlustur();
  adaptor = yeni;
  // Kapatılmış eski bağlantının geç gelen 'koptu' olayı yeniden bağlanmayı başlatıp tarama ekranından atmasın
  yeni.olay = (ad, deger) => { if (adaptor === yeni) adaptorOlayi(ad, deger); };
  gunluk(`Bağlanılıyor: ${tv.nesil} ${tv.model || ''} @${tv.ip}`);

  const kayitli = depo.oku(kimlikAnahtari());
  try {
    const s = await adaptor.baglan(kayitli, (d) => {
      if (d === 'izin-bekleniyor' && bu === baglanSayac) eslesmeGoster('izin');
    });
    if (bu !== baglanSayac) return;
    if (s.durum === 'pin-gerekli') {
      eslesmeGoster('pin');
      await adaptor.pinGoster();
      return;
    }
    if (s.kimlik) depo.yaz(kimlikAnahtari(), s.kimlik);
    bagliOldu();
  } catch (e) {
    if (bu !== baglanSayac) return;
    noktaDurumu('kopuk');
    gunluk('Bağlantı hatası: ' + e.message);
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
  gunluk('Bağlandı');
  // Bağlanılan her TV kayıtlı listeye girer (son kullanılan başta)
  kayitliYaz(listeyeEkle(kayitliTvler(), tv));
  const y = adaptor.yetenekler();
  // H/J'de SendInputString YouTube'da reddedildi (0001); klavye yalnız destekleyen nesilde.
  $('klavyeTus').hidden = !y.klavye;
  $('modSecici').hidden = !y.fare;
  // 2013 öncesi Samsung'da uygulama açma yok
  $('uygulamaTus').hidden = !uygulamaListesi(tv.nesil).length;
  if (!y.fare) modSec('yon');
  macOgren();
}

// LG MAC adresini bağlıyken söyler; kapalıyken açabilmek için saklanır
async function macOgren() {
  if (macBayt(tv.mac) || !adaptor.macBul) return;
  const a = adaptor;
  try {
    const mac = await a.macBul();
    if (a !== adaptor || !macBayt(mac)) return;
    tv = { ...tv, mac };
    depo.yaz('tv', tv);
    kayitliYaz(listeyeEkle(kayitliTvler(), tv));
    gunluk('MAC öğrenildi');
  } catch (e) {
    gunluk('MAC öğrenilemedi: ' + e.message);
  }
}

// ---------- Kapalı TV'yi açma (Wake-on-LAN) ----------
async function tvyiUyandir() {
  const paket = sihirliPaket(tv.mac);
  const yerel = await tasima.yerelIp().catch(() => null);
  let giden = 0;
  for (const h of uyandirmaHedefleri(tv.ip, yerel)) {
    try {
      await tasima.udpGonder(h, UYANDIRMA_PORTU, paket);
      giden++;
    } catch (e) {
      gunluk(`Uyandırma ${h}: ${e.message}`);
    }
  }
  gunluk(`Uyandırma paketi ${giden} adrese gitti`);
  if (!giden) {
    bildir('TV açılamadı: ağ paketi gönderilemedi');
    return;
  }
  bildir('TV açılıyor… birkaç saniye sürebilir', 5000);
  clearTimeout(yenidenZamanlayici);
  yenidenDeneme = 0;
  yenidenZamanlayici = setTimeout(baglan, 4000); // TV'nin ağa gelmesini bekle
}

function yenidenBaglanmayiPlanla(hata) {
  if (!$('ekranTarama').hidden) return; // kullanıcı TV listesinde
  if (yenidenDeneme >= 5) {
    bildir(macBayt(tv?.mac)
      ? "TV'ye ulaşılamadı. TV kapalıysa güç tuşuyla açmayı dene."
      : "TV'ye ulaşılamadı. TV açık mı? Adına dokunup tekrar arayabilirsin.", 5000);
    return;
  }
  const bekle = Math.min(1000 * 2 ** yenidenDeneme, 15000);
  yenidenDeneme++;
  if (yenidenDeneme === 1 && hata) bildir("TV'ye ulaşılamadı, yeniden deneniyor…");
  yenidenZamanlayici = setTimeout(baglan, bekle);
}

function adaptorOlayi(ad, deger) {
  if (ad === 'koptu' || ad === 'hata') gunluk(`Olay: ${ad}${deger ? ' ' + deger : ''}`);
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
  $('eslesmeBaslik').textContent = gorunenAd(tv) + ' ile eşleş';
  gunluk('Eşleşme ekranı: ' + tur);
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
    gunluk('Eşleşme hatası: ' + e.message);
    $('eslesmeHata').textContent = /PIN|Kod yanlış/.test(e.message) ? 'Kod tutmadı. Ekrandakini tekrar gir.' : e.message;
    $('pinGiris').value = '';
  } finally {
    pinGonderiliyor = false;
  }
}

// ---------- Tuşlar ----------
function tusGonder(ad) {
  if (!bagli) {
    // Kapalı TV: MAC biliniyorsa güç tuşu ağdan açar
    if (ad === 'guc' && macBayt(tv?.mac)) {
      titret();
      tvyiUyandir();
      return;
    }
    bildir('TV bağlı değil');
    return;
  }
  try {
    adaptor.tus(tusKodu(ad, tv.nesil));
    titret();
    // Sessiz aç/kapa; ses tuşları TV'lerde sessizi kaldırır
    if (ad === 'sessiz') sessizAyarla(!sessiz);
    else if (ad === 'ses+' || ad === 'ses-') sessizAyarla(false);
  } catch (e) {
    bildir(e.message);
  }
}

function sessizAyarla(durum) {
  sessiz = durum;
  $('sessizTus').setAttribute('aria-pressed', String(durum));
  $('sessizTus').setAttribute('aria-label', durum ? 'Sesi aç' : 'Sessiz');
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

// ---------- Uygulamalar ----------
function uygulamalariGoster() {
  if (!tv) return;
  const kutu = $('uygulamaListesi');
  kutu.innerHTML = '';
  for (const u of uygulamaListesi(tv.nesil)) {
    const b = document.createElement('button');
    b.className = 'uygulama';
    b.textContent = u.etiket;
    b.style.background = u.renk;
    b.onclick = () => uygulamaBaslat(u);
    kutu.append(b);
  }
  $('uygulamaKatman').hidden = false;
}

async function uygulamaBaslat(u) {
  $('uygulamaKatman').hidden = true;
  if (!bagli) {
    bildir('TV bağlı değil');
    return;
  }
  let son;
  // Samsung Tizen'de birden çok kimlik var (eski/yeni); ilk tutan kullanılır
  for (const i of uygulamaIstekleri(tv.nesil, u.ad, tv.ip)) {
    try {
      if (i.tur === 'adaptor') {
        await adaptor.uygulamaAc(i.deger);
      } else {
        const c = await tasima.http({ yontem: 'POST', url: i.url, govde: '', zamanAsimi: 6000 });
        if (c.durum < 200 || c.durum >= 300) throw new Error(String(c.durum));
      }
      titret();
      bildir(u.etiket + ' açılıyor…');
      return;
    } catch (e) {
      son = e;
      gunluk(`${u.etiket} açılamadı (${i.url || i.deger}): ${e.message}`);
    }
  }
  bildir(u.etiket + ' açılamadı' + (son?.message ? ' (' + son.message + ')' : ''));
}

// ---------- Sorun bildir ----------
async function sorunBildir() {
  const metin = raporMetni({
    surum: SURUM,
    platform: window.Capacitor?.getPlatform?.() || 'web',
    cihaz: navigator.userAgent,
    tv,
    bagli,
    kayitliSayisi: kayitliTvler().length,
  });
  const panoya = async (onEk) => {
    try {
      await navigator.clipboard.writeText(metin);
      bildir(onEk + 'Sorun kaydı panoya kopyalandı; WhatsApp ya da e-postaya yapıştırabilirsin.', 5000);
    } catch {
      bildir('Sorun kaydı paylaşılamadı');
    }
  };
  try {
    if (Paylas) await Paylas.share({ title: 'Kumandam sorun kaydı', text: metin, dialogTitle: 'Sorun kaydını gönder' });
    else if (navigator.share) await navigator.share({ title: 'Kumandam sorun kaydı', text: metin });
    else await panoya('');
  } catch (e) {
    // Kullanıcı paylaşım penceresini kapattıysa bir şey yapma
    if (e?.name !== 'AbortError' && !/cancel|abort|iptal/i.test(e?.message || '')) await panoya('Paylaşılamadı. ');
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
  $('baskaTv').onclick = taramayiBaslat;
  $('elleForm').onsubmit = (e) => { e.preventDefault(); const ip = $('elleIp').value.trim(); if (ip) elleBaglan(ip); };
  // Türkçe sayı klavyesinde nokta yerine virgül var: yazarken noktaya çevir
  $('elleIp').oninput = () => {
    const g = $('elleIp');
    const yeni = g.value.replace(/[,\s]/g, '.').replace(/[^\d.]/g, '');
    if (yeni !== g.value) g.value = yeni;
  };

  $('pinForm').onsubmit = (e) => { e.preventDefault(); const p = $('pinGiris').value.trim(); if (kodBicimi().desen.test(p)) pinGonder(p); };
  $('pinGiris').oninput = () => { const p = $('pinGiris').value.trim(); if (kodBicimi().desen.test(p)) pinGonder(p); };
  $('pinYenile').onclick = () => adaptor?.pinGoster().catch((e) => { $('eslesmeHata').textContent = e.message; });

  $('uygulamaTus').onclick = uygulamalariGoster;
  $('uygulamaKapat').onclick = () => { $('uygulamaKatman').hidden = true; };
  $('uygulamaKatman').onclick = (e) => { if (e.target === $('uygulamaKatman')) $('uygulamaKatman').hidden = true; };
  $('duzenleForm').onsubmit = (e) => { e.preventDefault(); duzenleKaydet(); };
  $('duzenleKapat').onclick = duzenleKapat;
  $('duzenleSil').onclick = duzenleSil;
  $('duzenleKatman').onclick = (e) => { if (e.target === $('duzenleKatman')) duzenleKapat(); };
  for (const b of document.querySelectorAll('[data-sorun]')) b.onclick = sorunBildir;

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
    if (document.visibilityState === 'visible' && tv && !bagli && $('ekranEslesme').hidden && $('ekranTarama').hidden) {
      yenidenDeneme = 0;
      baglan();
    }
  });
}

window.addEventListener('error', (e) => gunluk('JS hatası: ' + e.message));
window.addEventListener('unhandledrejection', (e) => gunluk('Yakalanmayan hata: ' + (e.reason?.message || e.reason)));

// Yerel ağ izni notu yalnız iPhone'da
$('iosNot').hidden = window.Capacitor?.getPlatform?.() !== 'ios';
olaylariBagla();
gunluk(`Kumandam ${SURUM} açıldı (${window.Capacitor?.getPlatform?.() || 'web'})`);
if (tv) baglan(); else taramayiBaslat();
