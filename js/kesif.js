// Ağdaki Samsung TV'leri bulur ve neslini tespit eder.
// SSDP/multicast kullanılmaz (iOS'ta Apple izni gerekir); telefonun /24 alt ağı taranır.

const API_PORT = 8001;
const ESKI_PORT = 55000;

/**
 * `:8001/api/v2/` cevabından nesil ve ayrıntılar.
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

/** Tek bir adresi yoklar; TV değilse null. */
export async function adresYokla(tasima, ip, zamanAsimi = 1500) {
  try {
    const c = await tasima.http({ yontem: 'GET', url: `http://${ip}:${API_PORT}/api/v2/`, zamanAsimi });
    if (c.durum === 200) {
      const tv = nesilBul(JSON.parse(c.govde));
      if (tv) return { ip, ...tv };
    }
  } catch { /* 8001 kapalı ya da cevap JSON değil */ }

  if (await tasima.portAcikMi(ip, ESKI_PORT, zamanAsimi)) {
    return { ip, nesil: 'eski', ad: 'Samsung TV', model: '', duid: 'eski-' + ip, tokenGerekli: false };
  }
  // H/J serisi açılırken 8001 bir süre kapalı kalabiliyor (ölçüldü); şifreli eşleştirme portları açıksa yine bulunur.
  if (await tasima.portAcikMi(ip, 8080, zamanAsimi) && await tasima.portAcikMi(ip, 8000, zamanAsimi)) {
    return { ip, nesil: 'sifreli', ad: 'Samsung TV', model: '', duid: 'sifreli-' + ip, tokenGerekli: false };
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
