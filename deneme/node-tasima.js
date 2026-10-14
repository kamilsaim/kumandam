// PC'de deneme için taşıyıcı (Node 22+): uygulamadaki js/tasima.js arayüzünün Node karşılığı.
// iPhone'da Swift, Android'de Java TVSoket eklentisi aynı arayüzü sağlar.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import { pem } from '../js/kripto/sertifika.js';

const ayrinti = !!process.env.AYRINTI;

// LG wss:3001 ve Samsung wss:8002 kendi imzalı sertifika kullanır; yalnız deneme betikleri için.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.removeAllListeners('warning');

export const nodeTasima = {
  async http({ yontem = 'GET', url, govde, zamanAsimi = 5000 }) {
    const c = await fetch(url, {
      method: yontem,
      body: govde || undefined,
      headers: govde ? { 'Content-Type': govde.startsWith('{') ? 'application/json' : 'text/plain; charset=utf-8' } : undefined,
      signal: AbortSignal.timeout(zamanAsimi),
    });
    const metin = await c.text();
    if (ayrinti) console.log(`  ${yontem} ${url}\n  > ${govde || ''}\n  < ${c.status} ${metin.slice(0, 300)}`);
    return { durum: c.status, govde: metin };
  },

  portAcikMi(host, port, zamanAsimi = 1500) {
    return new Promise((tamam) => {
      const s = net.connect({ host, port });
      const bitir = (v) => { s.destroy(); tamam(v); };
      s.setTimeout(zamanAsimi, () => bitir(false));
      s.once('connect', () => bitir(true));
      s.once('error', () => bitir(false));
    });
  },

  async yerelIp() {
    for (const liste of Object.values(os.networkInterfaces())) {
      for (const a of liste || []) {
        if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
      }
    }
    return null;
  },

  wsAc(url, { mesaj, kapandi }) {
    return new Promise((tamam, hata) => {
      const ws = new WebSocket(url);
      ws.onopen = () => tamam({ gonder: (m) => { if (ayrinti) console.log('  >', String(m).slice(0, 200)); ws.send(m); }, kapat: () => ws.close() });
      ws.onmessage = (e) => { if (ayrinti) console.log('  <', String(e.data).slice(0, 200)); mesaj(String(e.data)); };
      ws.onerror = (e) => hata(new Error('WebSocket hatası: ' + (e.message || url)));
      ws.onclose = () => kapandi();
    });
  },

  tcpAc(host, port, { veri, kapandi }) {
    return new Promise((tamam, hata) => {
      const s = net.connect({ host, port }, () => tamam({ gonder: (b) => s.write(b), kapat: () => s.destroy() }));
      s.on('data', (b) => veri(new Uint8Array(b)));
      s.once('error', hata);
      s.on('close', () => kapandi());
    });
  },

  tlsAc(host, port, sertifika, { veri, kapandi }) {
    return new Promise((tamam, hata) => {
      const s = tls.connect({
        host, port, rejectUnauthorized: false,
        key: pem('PRIVATE KEY', sertifika.pkcs8), cert: pem('CERTIFICATE', sertifika.sertifika),
      }, () => {
        const sunucu = s.getPeerCertificate(true);
        tamam({
          sunucuSertifika: new Uint8Array(sunucu.raw || []),
          gonder: (b) => { if (ayrinti) console.log('  > tls', Buffer.from(b).toString('hex').slice(0, 120)); s.write(b); },
          kapat: () => s.destroy(),
        });
      });
      s.on('data', (b) => { if (ayrinti) console.log('  < tls', b.toString('hex').slice(0, 120)); veri(new Uint8Array(b)); });
      s.once('error', hata);
      s.on('close', () => kapandi());
    });
  },
};
