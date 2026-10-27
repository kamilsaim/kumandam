// Ağdaki televizyonları bulur ve türünü tespit eder.
// SSDP/multicast kullanılmaz (iOS'ta Apple izni gerekir); telefonun /24 alt ağı taranır.
// Her adreste bütün portlar aynı anda yoklanır, sonra yalnız açık olanlar ayrıntılı sorgulanır.

const PORTLAR = {
  samsungApi: 8001,
  samsungGuvenli: 8002,
  samsungEski: 55000,
  samsungEslesme: 8080,
  samsungKomut: 8000,
  androidtv: 6466,
  lgGuvenli: 3001,
  lg: 3000,
  roku: 8060,
  cast: 8008,
};

/**
 * Samsung `:8001/api/v2/` cevabından nesil ve ayrıntılar.
 * @returns {{nesil: 'sifreli'|'tizen', ad: string, model: string, duid: string, tokenGerekli: boolean} | null}
 */
export function nesilBul(api) {
  const d = api?.device;
  if (!d || !/samsung/i.test(api.type || d.type || '')) return null;
  const yil = Number(/^(\d{2})_/.exec(d.model || '')?.[1]);
  const tizen = d.OS === 'Tizen' || (yil >= 16);
  if (!tizen && yil !== 14 && yil !== 15) return null;
  return {
    nesil: tizen ? 'tizen' : 'sifreli',
    ad: (d.name || api.name || 'Samsung TV').replace(/^\[TV\]\s*/, ''),
    model: d.modelName || d.model || '',
    duid: d.duid || d.id || api.id || '',
    tokenGerekli: d.TokenAuthSupport === 'true' || d.TokenAuthSupport === true,
    ...(d.wifiMac ? { mac: d.wifiMac } : {}), // kapalıyken ağdan açmak için
  };
}

function xmlAlan(xml, ad) {
  const m = new RegExp(`<${ad}>([^<]*)</${ad}>`, 'i').exec(xml || '');
  return m ? m[1].trim() : '';
}

async function getir(tasima, url, zamanAsimi) {
  try {
    const c = await tasima.http({ yontem: 'GET', url, zamanAsimi });
    return c.durum === 200 ? c.govde : null;
  } catch {
    return null;
  }
}

/** Tek bir adresi yoklar; TV değilse null. */
export async function adresYokla(tasima, ip, zamanAsimi = 1500) {
  const adlar = Object.keys(PORTLAR);
  const acik = {};
  const sonuc = await Promise.all(adlar.map((a) => tasima.portAcikMi(ip, PORTLAR[a], zamanAsimi).catch(() => false)));
  adlar.forEach((a, i) => { acik[a] = sonuc[i]; });

  if (acik.samsungApi) {
    const govde = await getir(tasima, `http://${ip}:8001/api/v2/`, zamanAsimi);
    let api = null;
    try { api = govde && JSON.parse(govde); } catch { /* JSON değil */ }
    const tv = nesilBul(api);
    if (tv) return { ip, ...tv };
    // Model alanı yıl önekisiz gelen Samsung'lar (ör. bazı 2016+ ve bölgesel modeller): Tizen say
    const d = api?.device;
    if (d && /samsung/i.test(api.type || d.type || '') && !/^\d{2}_/.test(d.model || '')) {
      return {
        ip, nesil: 'tizen', ad: (d.name || api.name || 'Samsung TV').replace(/^\[TV\]\s*/, ''),
        model: d.modelName || d.model || '', duid: d.duid || d.id || api.id || 'tizen-' + ip,
        tokenGerekli: d.TokenAuthSupport === 'true' || d.TokenAuthSupport === true,
      };
    }
  }
  // 8001 cevap vermedi (TV yeni açılıyor) ama 8001+8002 açık: 2016+ Tizen
  if (acik.samsungApi && acik.samsungGuvenli) {
    return { ip, nesil: 'tizen', ad: 'Samsung TV', model: '', duid: 'tizen-' + ip, tokenGerekli: true };
  }
  if (acik.samsungEski) {
    return { ip, nesil: 'eski', ad: 'Samsung TV', model: '', duid: 'eski-' + ip, tokenGerekli: false };
  }
  // H/J serisi açılırken 8001 bir süre kapalı kalabiliyor (ölçüldü); şifreli eşleştirme portları açıksa yine bulunur.
  if (acik.samsungEslesme && acik.samsungKomut) {
    return { ip, nesil: 'sifreli', ad: 'Samsung TV', model: '', duid: 'sifreli-' + ip, tokenGerekli: false };
  }
  if (acik.androidtv) {
    // Chromecast yerleşik TV'ler adını :8008'de verir
    const xml = acik.cast ? await getir(tasima, `http://${ip}:8008/ssdp/device-desc.xml`, zamanAsimi) : null;
    return {
      ip, nesil: 'androidtv', ad: xmlAlan(xml, 'friendlyName') || 'Android TV',
      model: [xmlAlan(xml, 'manufacturer'), xmlAlan(xml, 'modelName')].filter(Boolean).join(' '),
      duid: 'androidtv-' + ip, tokenGerekli: false,
    };
  }
  if (acik.roku) {
    const xml = await getir(tasima, `http://${ip}:8060/query/device-info`, zamanAsimi);
    if (xml && /<device-info>/i.test(xml)) {
      const mac = xmlAlan(xml, 'ethernet-mac') || xmlAlan(xml, 'wifi-mac');
      return {
        ip, nesil: 'roku', ad: xmlAlan(xml, 'friendly-device-name') || xmlAlan(xml, 'user-device-name') || 'Roku',
        model: xmlAlan(xml, 'model-name'), duid: xmlAlan(xml, 'serial-number') || 'roku-' + ip, tokenGerekli: false,
        ...(mac ? { mac } : {}),
      };
    }
  }
  // 3000 başka cihazlarda da açık olabiliyor (evde bir Espressif akıllı cihaz LG sanıldı):
  // gerçekten WebSocket konuşuyorsa LG say.
  if ((acik.lgGuvenli && await wsAcilirMi(tasima, `wss://${ip}:3001`, zamanAsimi))
    || (acik.lg && await wsAcilirMi(tasima, `ws://${ip}:3000`, zamanAsimi))) {
    return { ip, nesil: 'lg', ad: 'LG TV', model: 'webOS', duid: 'lg-' + ip, tokenGerekli: false };
  }
  return null;
}

// Tanınmayan cihazda neyin açık olduğunu göstermek için (elle IP girişinde): bilinen TV portları
const TANI_PORTLARI = {
  80: '', 443: '', 1925: 'Philips', 1926: 'Philips', 3000: 'LG', 3001: 'LG', 6466: 'Android TV', 6467: 'Android TV',
  7345: '', 8000: 'Samsung', 8001: 'Samsung', 8002: 'Samsung', 8008: 'Chromecast', 8009: 'Chromecast',
  8060: 'Roku', 8080: '', 9080: '', 10002: 'Sharp', 36669: 'Hisense', 55000: 'Samsung/Panasonic', 56789: 'Vestel',
  56790: 'Vestel',
};

/**
 * Adreste hangi bilinen portların açık olduğunu döndürür.
 * @returns {Promise<{portlar: number[], ipucu: string[]}>}
 */
export async function portlariTani(tasima, ip, zamanAsimi = 2000) {
  const liste = Object.keys(TANI_PORTLARI).map(Number);
  const acik = await Promise.all(liste.map((p) => tasima.portAcikMi(ip, p, zamanAsimi).catch(() => false)));
  const portlar = liste.filter((_, i) => acik[i]);
  const ipucu = [...new Set(portlar.map((p) => TANI_PORTLARI[p]).filter(Boolean))];
  return { portlar, ipucu };
}

/** "192,168,1,5" ya da boşluklu yazımı düzeltir; geçerli IPv4 değilse null. */
export function ipDuzelt(metin) {
  const s = String(metin || '').trim().replace(/[,\s]+/g, '.').replace(/\.{2,}/g, '.');
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m || m.slice(1).some((x) => Number(x) > 255)) return null;
  return m.slice(1).map(Number).join('.');
}

async function wsAcilirMi(tasima, url, zamanAsimi) {
  let ws;
  const ac = tasima.wsAc(url, { mesaj() {}, kapandi() {} }, { kendiImzaliKabul: true })
    .then((w) => { ws = w; return true; }, () => false);
  const sonuc = await Promise.race([ac, new Promise((r) => setTimeout(() => r(false), zamanAsimi))]);
  ac.then((tamam) => { if (tamam) ws?.kapat(); });
  return sonuc;
}

/**
 * Telefonun alt ağını tarar. eslesti(tv) her bulunan TV için çağrılır.
 * @returns {Promise<Array>} bulunan TV'ler
 */
// 32/1500 ölçümde beklemedeki Samsung'u kaçırdı; 40/2000 ~14 sn'de buluyor (192.168.18.0/24, 2026-10-14).
export async function agiTara(tasima, { yerelIp, eslesti = () => {}, paralel = 40, zamanAsimi = 2000 } = {}) {
  const ip = yerelIp || (await tasima.yerelIp());
  const m = /^(\d+\.\d+\.\d+)\.(\d+)$/.exec(ip || '');
  if (!m) throw new Error('Wi-Fi ağına bağlı değilsiniz');
  const onek = m[1];
  const kendi = Number(m[2]);

  const adresler = [];
  for (let i = 1; i <= 254; i++) if (i !== kendi) adresler.push(`${onek}.${i}`);

  const bulunan = [];
  let sira = 0;
  async function isci() {
    while (sira < adresler.length) {
      const hedef = adresler[sira++];
      const tv = await adresYokla(tasima, hedef, zamanAsimi);
      if (tv) { bulunan.push(tv); eslesti(tv); }
    }
  }
  await Promise.all(Array.from({ length: paralel }, isci));
  return bulunan;
}
