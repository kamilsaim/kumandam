// Android TV / Google TV adaptörü (Google "Android TV Remote" protokolü v2).
// Eşleştirme :6467 (TLS + istemci sertifikası, TV'de 6 haneli onaltılık kod), kumanda :6466.
// Mesajlar varint uzunluk önekli protobuf. Akış ve alan numaraları
// github.com/tronikos/androidtvremote2 (Apache-2.0) polo.proto / remotemessage.proto'ya göre.
//
// Kimlik: istemci sertifikası cihaz başına bir kez üretilir (sertifikaSaglayici) ve her TV'de
// aynısı kullanılır; TV o sertifikayı eşleşmede tanır. Gerçek TV'de henüz denenmedi.

import { kodla, coz, metin, cercevele, ayikla } from '../protobuf.js';
import { sha256 } from '../kripto/sha256.js';
import { hexBayt, birlestir } from '../kripto/yardimci.js';
import { rsaAcikAnahtar } from '../kripto/sertifika.js';

const ESLESME_PORT = 6467;
const KUMANDA_PORT = 6466;
const ISTEMCI_ADI = 'Kumandam';
const DURUM_TAMAM = 200;

// remote.py Feature: PING | KEY | IME | POWER | VOLUME | APP_LINK
const OZELLIKLER = 1 | 2 | 4 | 32 | 64 | 512;
const YON = { SHORT: 3, START_LONG: 1, END_LONG: 2 };

const dis = (ek) => ({ 1: 2, 2: DURUM_TAMAM, ...ek }); // OuterMessage: protocol_version 2, status OK

/** Eşleşme sırrı: SHA-256(istemci n, e, sunucu n, e, kod[2:]); ilk bayt kod[0:2] olmalı. */
export function eslesmeSirri(istemci, sunucu, kod) {
  const ust = (e) => { // Python: bytes.fromhex(f"0{e:X}") — başa tek 0 eklenmiş onaltılık
    let h = '0' + Array.from(e, (x) => x.toString(16).padStart(2, '0')).join('').replace(/^0+/, '').toUpperCase();
    if (h.length % 2) h = '0' + h;
    return hexBayt(h);
  };
  const ozet = sha256(birlestir(istemci.modulus, ust(istemci.us), sunucu.modulus, ust(sunucu.us), hexBayt(kod.slice(2))));
  if (ozet[0] !== parseInt(kod.slice(0, 2), 16)) throw new Error('Kod yanlış');
  return ozet;
}

export class AndroidTvAdaptor {
  /**
   * @param {object} tasima
   * @param {string} ip
   * @param {() => Promise<{sertifika, pkcs8, pkcs1, modulus, us}>} sertifikaSaglayici
   */
  constructor(tasima, ip, sertifikaSaglayici) {
    this.tasima = tasima;
    this.ip = ip;
    this.sertifikaSaglayici = sertifikaSaglayici;
    this.eslesme = null;
    this.kanal = null;
    this.ime = { sayac: 0, alan: 0 };
    this.olay = () => {};
  }

  yetenekler() {
    return { klavye: true, fare: false };
  }

  async tlsAc(port, isle) {
    const s = await this.sertifikaSaglayici();
    let tampon = new Uint8Array(0);
    let kapandi = () => {};
    // TV ilk mesajı bağlantı nesnesi dönmeden gönderebilir: işleme, bağlantı hazır olunca
    let hazirla;
    const hazir = new Promise((r) => { hazirla = r; });
    const b = await this.tasima.tlsAc(this.ip, port, s, {
      veri: (bayt) => hazir.then((bag) => {
        const a = ayikla(birlestir(tampon, bayt));
        tampon = a.kalan;
        for (const m of a.mesajlar) isle(coz(m), bag);
      }),
      kapandi: (h) => hazir.then(() => kapandi(h)),
    });
    hazirla(b);
    return { b, s, kapanisa: (f) => { kapandi = f; } };
  }

  // ---------- Eşleştirme ----------

  /** TV ekranında 6 haneli kodu gösterir; bağlantı pinGir'e kadar açık kalır. */
  async pinGoster() {
    this.eslesme?.b.kapat();
    this.eslesme = null;
    let bekleyen = null;
    const bekle = () => new Promise((tamam, hata) => { bekleyen = { tamam, hata }; });
    const bitir = (f, x) => { const b = bekleyen; bekleyen = null; b?.[f](x); };

    const e = await this.tlsAc(ESLESME_PORT, (m) => {
      if (m[2]?.[0] !== DURUM_TAMAM) {
        bitir('hata', new Error(m[2]?.[0] === 402 ? 'Kod yanlış' : `TV eşleşmeyi reddetti (${m[2]?.[0]})`));
        return;
      }
      if (m[11]) { // pairing_request_ack → seçenekler
        e.b.gonder(cercevele(dis({ 20: { 1: { 1: 3, 2: 6 }, 3: 1 } })));
      } else if (m[20]) { // options → yapılandırma
        e.b.gonder(cercevele(dis({ 30: { 1: { 1: 3, 2: 6 }, 2: 1 } })));
      } else if (m[31]) { // configuration_ack → TV kodu gösteriyor
        bitir('tamam');
      } else if (m[41]) { // secret_ack
        bitir('tamam');
      }
    });
    e.kapanisa(() => bitir('hata', new Error('TV eşleşme bağlantısını kapattı')));
    this.eslesme = { ...e, bekle };

    const s = bekle();
    e.b.gonder(cercevele(dis({ 10: { 1: 'atvremote', 2: ISTEMCI_ADI } })));
    await s;
  }

  /** @param {string} kod TV'deki 6 haneli onaltılık kod */
  async pinGir(kod) {
    kod = String(kod).trim().toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(kod)) throw new Error('Kod 6 haneli olmalı (0-9, A-F)');
    if (!this.eslesme) await this.pinGoster();
    const { b, s, bekle } = this.eslesme;
    const sunucu = rsaAcikAnahtar(b.sunucuSertifika);
    const sir = eslesmeSirri(s, sunucu, kod);
    const cevap = bekle();
    b.gonder(cercevele(dis({ 40: { 1: sir } })));
    await cevap;
    b.kapat();
    this.eslesme = null;
    return { eslesti: true };
  }

  // ---------- Kumanda ----------

  async baglan(kimlik) {
    if (!kimlik?.eslesti) return { durum: 'pin-gerekli' };
    let hazir = false;
    await new Promise((tamam, hata) => {
      let yedek;
      const ok = () => { if (!hazir) { hazir = true; clearTimeout(yedek); tamam(); } };
      this.tlsAc(KUMANDA_PORT, (m, bag) => this.mesajIsle(m, ok, bag)).then((k) => {
        this.kanal = k.b;
        k.kapanisa((h) => {
          this.kanal = null;
          if (!hazir) hata(new Error('TV bağlantıya izin vermedi, yeniden eşleşmek gerekiyor' + (h ? ` (${h})` : '')));
          else this.olay('koptu');
        });
      }, hata);
      // remote_start gelmezse (TV beklemedeyken) yapılandırmadan sonra yine hazır say
      yedek = setTimeout(() => { if (this.kanal) ok(); }, 4000);
    });
    return { durum: 'hazir', kimlik };
  }

  mesajIsle(m, hazir, bag = this.kanal) {
    const gonder = (x) => bag?.gonder(cercevele(x));
    if (m[1]) { // remote_configure
      const ayar = coz(m[1][0]);
      gonder({ 1: { 1: (ayar[1]?.[0] ?? OZELLIKLER) & OZELLIKLER, 2: { 3: 1, 4: '1', 5: 'atvremote', 6: '1.0.0' } } });
    } else if (m[2]) { // remote_set_active
      gonder({ 2: { 1: OZELLIKLER } });
      setTimeout(hazir, 300);
    } else if (m[8]) { // ping
      gonder({ 9: { 1: coz(m[8][0])[1]?.[0] ?? 0 } });
    } else if (m[40]) { // remote_start
      hazir();
    } else if (m[21]) { // ime_batch_edit: sayaçlar
      const d = coz(m[21][0]);
      this.ime = { sayac: d[1]?.[0] ?? 0, alan: d[2]?.[0] ?? 0 };
    } else if (m[22]) { // ime_show_request: klavye açıldı
      this.olay('klavye', true);
    }
  }

  gonder(mesaj) {
    if (!this.kanal) throw new Error('TV bağlı değil');
    this.kanal.gonder(cercevele(mesaj));
  }

  /** @param {number} kod Android KEYCODE_* */
  tus(kod, yon = 'SHORT') {
    this.gonder({ 10: { 1: kod, 2: YON[yon] } });
  }

  yazi(m) {
    const n = m.length - 1;
    this.gonder({ 21: { 1: this.ime.sayac, 2: this.ime.alan, 3: [{ 1: 1, 2: { 1: n, 2: n, 3: m } }] } });
  }

  uygulamaAc(baglanti) {
    this.gonder({ 90: { 1: baglanti } });
  }

  async youtube() {
    this.uygulamaAc('https://www.youtube.com');
  }

  kapat() {
    this.kanal?.kapat();
    this.kanal = null;
    this.eslesme?.b.kapat();
    this.eslesme = null;
  }
}

export { metin, kodla };
