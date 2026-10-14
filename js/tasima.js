// Taşıyıcı: adaptörlerin ağa çıktığı tek kapı.
// iPhone'da Swift TVSoket eklentisi (kumandam-ios/yerel/App/TVSoketPlugin.swift),
// tarayıcıda (yalnız geliştirme) fetch + WebSocket — orada TV'ye CORS yüzünden ulaşılamaz.
//
// Arayüz:
//   http({yontem, url, govde, zamanAsimi}) → {durum, govde}
//   portAcikMi(host, port, zamanAsimi) → bool
//   yerelIp() → "192.168.x.y" | null
//   wsAc(url, {mesaj, kapandi}, {kendiImzaliKabul}) → {gonder(metin), kapat()}
//   tcpAc(host, port, {veri, kapandi}) → {gonder(Uint8Array), kapat()}
//   tlsAc(host, port, {sertifika, pkcs8, pkcs1}, {veri, kapandi})
//        → {gonder(Uint8Array), kapat(), sunucuSertifika: Uint8Array (DER)}
//        İstemci sertifikalı TLS (Android TV). Sunucunun kendi imzalı sertifikası kabul edilir.

function base64Bayt(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

function baytBase64(bayt) {
  let s = '';
  for (const x of bayt) s += String.fromCharCode(x);
  return btoa(s);
}

let sayac = 0;
const yeniKimlik = () => `b${Date.now().toString(36)}${(sayac++).toString(36)}`;

function yerelTasima(P) {
  const wsDinleyici = new Map();
  const tcpDinleyici = new Map();

  P.addListener('ws', (e) => {
    const d = wsDinleyici.get(e.id);
    if (!d) return;
    if (e.tur === 'mesaj') d.mesaj(e.metin);
    else { wsDinleyici.delete(e.id); d.kapandi(e.hata); }
  });
  // TCP ve TLS aynı dinleyici tablosunu ve olay biçimini kullanır
  const baytOlayi = (e) => {
    const d = tcpDinleyici.get(e.id);
    if (!d) return;
    if (e.tur === 'veri') d.veri(base64Bayt(e.veri));
    else { tcpDinleyici.delete(e.id); d.kapandi(e.hata); }
  };
  P.addListener('tcp', baytOlayi);
  P.addListener('tls', baytOlayi);

  return {
    async http({ yontem = 'GET', url, govde, zamanAsimi = 5000 }) {
      return P.http({ yontem, url, govde: govde ?? null, zamanAsimi });
    },
    async portAcikMi(host, port, zamanAsimi = 1500) {
      return (await P.portAcikMi({ host, port, zamanAsimi })).acik;
    },
    async yerelIp() {
      return (await P.yerelIp()).ip || null;
    },
    async wsAc(url, olaylar, { kendiImzaliKabul = false } = {}) {
      // Kimliği JS üretir: TV ilk mesajı söz çözülmeden gönderse de kaybolmaz.
      const id = yeniKimlik();
      wsDinleyici.set(id, olaylar);
      try {
        await P.wsAc({ id, url, kendiImzaliKabul });
      } catch (e) {
        wsDinleyici.delete(id);
        throw e;
      }
      return {
        gonder: (metin) => { P.wsGonder({ id, metin }); },
        kapat: () => { P.wsKapat({ id }); },
      };
    },
    async tcpAc(host, port, olaylar) {
      const id = yeniKimlik();
      tcpDinleyici.set(id, olaylar);
      try {
        await P.tcpAc({ id, host, port });
      } catch (e) {
        tcpDinleyici.delete(id);
        throw e;
      }
      return {
        gonder: (bayt) => { P.tcpGonder({ id, veri: baytBase64(bayt) }); },
        kapat: () => { P.tcpKapat({ id }); },
      };
    },
    async tlsAc(host, port, s, olaylar) {
      const id = yeniKimlik();
      tcpDinleyici.set(id, olaylar);
      let c;
      try {
        c = await P.tlsAc({
          id, host, port,
          sertifika: baytBase64(s.sertifika), pkcs8: baytBase64(s.pkcs8), pkcs1: baytBase64(s.pkcs1),
        });
      } catch (e) {
        tcpDinleyici.delete(id);
        throw e;
      }
      return {
        sunucuSertifika: base64Bayt(c.sunucuSertifika || ''),
        gonder: (bayt) => { P.tlsGonder({ id, veri: baytBase64(bayt) }); },
        kapat: () => { P.tlsKapat({ id }); },
      };
    },
  };
}

function tarayiciTasima() {
  return {
    async http({ yontem = 'GET', url, govde, zamanAsimi = 5000 }) {
      const c = await fetch(url, { method: yontem, body: govde, signal: AbortSignal.timeout(zamanAsimi) });
      return { durum: c.status, govde: await c.text() };
    },
    async portAcikMi() { return false; },
    async yerelIp() { return null; },
    wsAc(url, { mesaj, kapandi }) {
      return new Promise((tamam, hata) => {
        const ws = new WebSocket(url);
        ws.onopen = () => tamam({ gonder: (m) => ws.send(m), kapat: () => ws.close() });
        ws.onmessage = (e) => mesaj(String(e.data));
        ws.onerror = () => hata(new Error('WebSocket açılamadı'));
        ws.onclose = () => kapandi();
      });
    },
    async tcpAc() { throw new Error('Tarayıcıda TCP yok'); },
    async tlsAc() { throw new Error('Tarayıcıda TLS soketi yok'); },
  };
}

export function yerelMi() {
  return !!window.Capacitor?.isNativePlatform?.();
}

export function tasimaOlustur() {
  if (yerelMi()) return yerelTasima(yerelEklenti('TVSoket'));
  return tarayiciTasima();
}

// Bundler olmadan @capacitor/core yüklenmez; yerel köprünün Plugins vekili kullanılır
// (sinerji-ios'ta SinerjiYerel aynı yolla çalışıyor). registerPlugin varsa yedek.
export function yerelEklenti(ad) {
  const C = window.Capacitor;
  return C?.Plugins?.[ad] ?? C?.registerPlugin?.(ad) ?? null;
}
