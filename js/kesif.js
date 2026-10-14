// Ağdaki televizyonları bulur ve türünü tespit eder.
// SSDP/multicast kullanılmaz (iOS'ta Apple izni gerekir); telefonun /24 alt ağı taranır.
// Her adreste bütün portlar aynı anda yoklanır, sonra yalnız açık olanlar ayrıntılı sorgulanır.

const PORTLAR = {
  samsungApi: 8001,
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
    try {
      const tv = govde && nesilBul(JSON.parse(govde));
      if (tv) return { ip, ...tv };
    } catch { /* JSON değil */ }
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
      return {
        ip, nesil: 'roku', ad: xmlAlan(xml, 'friendly-device-name') || xmlAlan(xml, 'user-device-name') || 'Roku',
        model: xmlAlan(xml, 'model-name'), duid: xmlAlan(xml, 'serial-number') || 'roku-' + ip, tokenGerekli: false,
      };
    }
  }
  if (acik.lgGuvenli || acik.lg) {
    return { ip, nesil: 'lg', ad: 'LG TV', model: 'webOS', duid: 'lg-' + ip, tokenGerekli: false };
  }
  return null;
}

/**
 * Telefonun alt ağını tarar. eslesti(tv) her bulunan TV için çağrılır.
 * @returns {Promise<Array>} bulunan TV'ler
 */
export async function agiTara(tasima, { yerelIp, eslesti = () => {}, paralel = 32, zamanAsimi = 1500 } = {}) {
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
