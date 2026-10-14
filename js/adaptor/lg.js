// LG webOS adaptörü (SSAP). Ana kanal: wss://ip:3001 (2018+), olmazsa ws://ip:3000.
// İlk bağlantıda TV "İzin ver" sorar; gelen client-key saklanır.
// Yön/OK/rakam gibi tuşlar ayrı "pointer" soketinden gider; ses, kanal, güç, medya SSAP isteğiyle.
// Akış github.com/hobbyquaker/lgtv2 (MIT) ile aynı. Gerçek TV'de henüz denenmedi.

import { LG_ESLESME, imzasizEslesme } from './lg-eslesme.js';

export class LgAdaptor {
  constructor(tasima, ip) {
    this.tasima = tasima;
    this.ip = ip;
    this.ana = null;
    this.isaretci = null;
    this.kimlik = null; // { anahtar }
    this.sayac = 0;
    this.bekleyen = new Map();
    this.olay = () => {};
  }

  yetenekler() {
    return { klavye: true, fare: true };
  }

  async baglan(kimlik, durumBildir = () => {}) {
    if (kimlik) this.kimlik = kimlik;
    let son;
    for (const url of [`wss://${this.ip}:3001`, `ws://${this.ip}:3000`]) {
      try {
        await this.anaKanal(url, durumBildir);
        son = null;
        break;
      } catch (e) {
        son = e;
        if (/izin|reddet/.test(e.message)) break; // kullanıcı reddettiyse diğer portu deneme
      }
    }
    if (son) throw son;
    const cevap = await this.istek('ssap://com.webos.service.networkinput/getPointerInputSocket');
    this.isaretci = await this.tasima.wsAc(cevap.socketPath, {
      mesaj: () => {},
      kapandi: () => { this.isaretci = null; },
    }, { kendiImzaliKabul: true });
    return { durum: 'hazir', kimlik: this.kimlik };
  }

  anaKanal(url, durumBildir) {
    return new Promise((tamam, hata) => {
      let kayitli = false;
      const kaydol = (ws, eslesme) => {
        const yuk = { ...eslesme };
        if (this.kimlik?.anahtar) yuk['client-key'] = this.kimlik.anahtar;
        ws.gonder(JSON.stringify({ type: 'register', id: 'kayit', payload: yuk }));
      };
      let imzasizDenendi = false;
      const wsSoz = this.tasima.wsAc(url, {
        mesaj: (m) => wsSoz.then((ws) => {
          let v;
          try { v = JSON.parse(m); } catch { return; }
          if (v.id === 'kayit') {
            if (v.type === 'registered') {
              kayitli = true;
              this.kimlik = { anahtar: v.payload?.['client-key'] };
              tamam();
            } else if (v.type === 'response' && v.payload?.pairingType === 'PROMPT') {
              durumBildir('izin-bekleniyor');
            } else if (v.type === 'error') {
              if (!imzasizDenendi && /blacklisted certificate/i.test(v.error || '')) {
                imzasizDenendi = true;
                kaydol(ws, imzasizEslesme());
              } else {
                hata(new Error(/cancel|reject|denied/i.test(v.error || '') ? 'TV bağlantıya izin vermedi' : 'LG: ' + v.error));
              }
            }
            return;
          }
          const b = this.bekleyen.get(v.id);
          if (b) {
            this.bekleyen.delete(v.id);
            if (v.type === 'error' || v.payload?.returnValue === false) b.hata(new Error(v.error || v.payload?.errorText || 'LG hatası'));
            else b.tamam(v.payload || {});
          }
        }),
        kapandi: () => {
          this.ana = null;
          if (!kayitli) hata(new Error('TV bağlantıyı kapattı'));
          else this.olay('koptu');
        },
      }, { kendiImzaliKabul: true });
      wsSoz.then((ws) => {
        this.ana = ws;
        kaydol(ws, LG_ESLESME);
      }, hata);
    });
  }

  istek(uri, payload) {
    if (!this.ana) return Promise.reject(new Error('TV bağlı değil'));
    const id = 'i' + (++this.sayac);
    return new Promise((tamam, hata) => {
      this.bekleyen.set(id, { tamam, hata });
      this.ana.gonder(JSON.stringify({ type: 'request', id, uri, ...(payload ? { payload } : {}) }));
      setTimeout(() => {
        if (this.bekleyen.delete(id)) hata(new Error('TV cevap vermedi'));
      }, 6000);
    });
  }

  isaret(m) {
    if (!this.isaretci) throw new Error('TV bağlı değil');
    this.isaretci.gonder(m);
  }

  /** @param {string} kod  pointer tuş adı (UP, ENTER, 5…) ya da "ssap://…" ya da "uygulama:<id>" */
  tus(kod) {
    if (kod.startsWith('ssap://')) {
      this.istek(kod).catch((e) => this.olay('hata', e.message));
    } else if (kod.startsWith('uygulama:')) {
      this.istek('ssap://system.launcher/launch', { id: kod.slice(9) }).catch((e) => this.olay('hata', e.message));
    } else {
      this.isaret(`type:button\nname:${kod}\n\n`);
    }
  }

  yazi(metin) {
    this.istek('ssap://com.webos.service.ime/insertText', { text: metin, replace: 0 }).catch(() => {});
  }

  yaziBitir() {
    this.istek('ssap://com.webos.service.ime/sendEnterKey').catch(() => {});
  }

  fare(dx, dy) {
    this.isaret(`type:move\ndx:${Math.round(dx)}\ndy:${Math.round(dy)}\ndown:0\n\n`);
  }

  tikla() {
    this.isaret('type:click\n\n');
  }

  async youtube() {
    await this.istek('ssap://system.launcher/launch', { id: 'youtube.leanback.v4' });
  }

  kapat() {
    this.isaretci?.kapat();
    this.ana?.kapat();
    this.isaretci = this.ana = null;
  }
}
