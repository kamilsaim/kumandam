// 2014-2015 Samsung (H/J) adaptörü.
// Eşleştirme: HTTP :8080 (PIN sayfası + 3 adımlı el sıkışma).
// Komutlar: socket.io 0.9 :8000, "callCommon" olayı, gövde oturum anahtarıyla şifreli.
// Ağa yalnızca taşıyıcı (tasima) üzerinden çıkar.

import { sunucuMerhaba, istemciMerhabaCoz, sunucuOnay, istemciOnayDogrula, komutSifrele } from './sifreli-kripto.js';
import { hexBayt, baytHex } from '../kripto/yardimci.js';

const UYG_KIMLIK = '12345';
// El sıkışmadaki kullanıcı kimliği. UE40H6200 '12345' ile kısa hata kodu (019A…) döndü,
// referans uygulamalardaki '654321' ile tam ClientHello döndü (2026-10-14 ölçüm).
const KULLANICI_KIMLIK = '654321';
const AD_ALANI = '/com.samsung.companion';

function authData(cevap) {
  const dis = JSON.parse(cevap.govde);
  return typeof dis.auth_data === 'string' && dis.auth_data ? JSON.parse(dis.auth_data) : dis.auth_data;
}

export class SifreliAdaptor {
  /**
   * @param {object} tasima   taşıyıcı (http, wsAc)
   * @param {string} ip
   * @param {string} cihazKimlik  telefon için sabit bir uuid
   */
  constructor(tasima, ip, cihazKimlik) {
    this.tasima = tasima;
    this.ip = ip;
    this.cihazKimlik = cihazKimlik;
    this.ws = null;
    this.kimlik = null; // { anahtarHex, oturumId }
  }

  yetenekler() {
    return { klavye: false, fare: false };
  }

  eslesmeAdresi(adim) {
    return `http://${this.ip}:8080/ws/pairing?step=${adim}&app_id=${UYG_KIMLIK}&device_id=${this.cihazKimlik}`;
  }

  async istek(yontem, url, govde) {
    const c = await this.tasima.http({ yontem, url, govde, zamanAsimi: 5000 });
    if (c.durum < 200 || c.durum >= 300) throw new Error(`TV ${c.durum} döndü: ${yontem} ${url}`);
    return c;
  }

  /** TV ekranında PIN'i gösterir ve el sıkışmayı başlatır. */
  async pinGoster() {
    await this.istek('POST', `http://${this.ip}:8080/ws/apps/CloudPINPage`);
    await this.istek('GET', this.eslesmeAdresi(0) + '&type=1');
  }

  /** PIN ile el sıkışmayı bitirir; saklanacak kimliği döner. */
  async pinGir(pin) {
    await this.istek('GET', this.eslesmeAdresi(0) + '&type=1');
    const merhaba = sunucuMerhaba(KULLANICI_KIMLIK, pin);
    const c1 = await this.istek('POST', this.eslesmeAdresi(1), JSON.stringify({
      auth_Data: { auth_type: 'SPC', GeneratorServerHello: merhaba.merhabaHex },
    }));
    const a1 = authData(c1);
    // Yanlış PIN ya da süresi dolmuş PIN sayfasında TV kısa bir hata kodu döner (örn. 019A000000000000000000).
    if (!a1 || !a1.GeneratorClientHello || a1.GeneratorClientHello.length < 328) {
      throw new Error('PIN yanlış ya da süresi doldu');
    }
    const { skPrime, oturumAnahtari } = istemciMerhabaCoz(KULLANICI_KIMLIK, merhaba.anahtar, a1.GeneratorClientHello);

    const c2 = await this.istek('POST', this.eslesmeAdresi(2), JSON.stringify({
      auth_Data: { auth_type: 'SPC', request_id: a1.request_id, ServerAckMsg: sunucuOnay(skPrime) },
    }));
    const a2 = authData(c2);
    if (!a2 || !istemciOnayDogrula(a2.ClientAckMsg || '', skPrime)) throw new Error('TV onayı doğrulanamadı');

    await this.pinKapat();
    this.kimlik = { anahtarHex: baytHex(oturumAnahtari), oturumId: Number(a2.session_id) };
    return this.kimlik;
  }

  async pinKapat() {
    try {
      await this.tasima.http({ yontem: 'DELETE', url: `http://${this.ip}:8080/ws/apps/CloudPINPage/run`, zamanAsimi: 3000 });
    } catch { /* PIN sayfası zaten kapalıysa önemli değil */ }
  }

  /** Kayıtlı kimlikle komut kanalını açar. */
  async baglan(kimlik) {
    if (kimlik) this.kimlik = kimlik;
    if (!this.kimlik) return { durum: 'pin-gerekli' };

    const el = await this.istek('GET', `http://${this.ip}:8000/socket.io/1/?t=${Date.now()}`);
    const sid = el.govde.split(':')[0];
    if (!sid) throw new Error('socket.io oturumu alınamadı');

    await new Promise((tamam, hata) => {
      let acildi = false;
      // TV ilk mesajı wsAc sözü çözülmeden gönderebilir; cevaplar söz üzerinden gider.
      const wsSoz = this.tasima.wsAc(`ws://${this.ip}:8000/socket.io/1/websocket/${sid}`, {
        mesaj: (m) => wsSoz.then((ws) => {
          // Önce TV "1::" der, biz ad alanına katılırız; TV "1::/com.samsung.companion"
          // ile onaylamadan gönderilen ilk komut kaybolabiliyor.
          if (m === '1::') {
            ws.gonder('1::' + AD_ALANI);
          } else if (m.startsWith('1::' + AD_ALANI) && !acildi) {
            acildi = true;
            tamam();
          } else if (m.startsWith('2::')) {
            ws.gonder('2::');
          }
        }),
        kapandi: () => {
          this.ws = null;
          if (!acildi) hata(new Error('komut kanalı açılamadı'));
        },
      });
      wsSoz.then((ws) => { this.ws = ws; }, hata);
    });
    return { durum: 'hazir', kimlik: this.kimlik };
  }

  komutCercevesi(kod) {
    const json = JSON.stringify({
      method: 'POST',
      body: {
        plugin: 'RemoteControl', param1: 'uuid:' + UYG_KIMLIK, param2: 'Click',
        param3: kod, param4: false, api: 'SendRemoteKey', version: '1.000',
      },
    });
    const govde = '[' + komutSifrele(hexBayt(this.kimlik.anahtarHex), json).join(', ') + ']';
    return `5::${AD_ALANI}:` + JSON.stringify({
      name: 'callCommon',
      args: [{ Session_Id: this.kimlik.oturumId, body: govde }],
    });
  }

  /** @param {string} kod  Samsung tuş kodu, örn. KEY_VOLUP */
  tus(kod) {
    if (!this.ws) throw new Error('TV bağlı değil');
    this.ws.gonder(this.komutCercevesi(kod));
  }

  kapat() {
    if (this.ws) this.ws.kapat();
    this.ws = null;
  }
}
