// 2016+ Samsung Tizen adaptörü.
// 2016-17: ws://ip:8001, eşleştirme yok. 2018+: wss://ip:8002 (TV'nin kendi imzalı sertifikası),
// ilk bağlantıda TV "İzin ver" sorar, gelen token saklanır.
// Gerçek Tizen TV ile denenmedi; mesaj biçimleri açık kaynak uygulamalardaki ortak kullanıma göre.

const KANAL = '/api/v2/channels/samsung.remote.control';
const UYG_ADI = 'Kumandam';

function b64(metin) {
  const bayt = new TextEncoder().encode(metin);
  let s = '';
  for (const b of bayt) s += String.fromCharCode(b);
  return btoa(s);
}

export class TizenAdaptor {
  /**
   * @param {object} tasima
   * @param {string} ip
   * @param {{tokenGerekli: boolean}} tv
   */
  constructor(tasima, ip, tv = {}) {
    this.tasima = tasima;
    this.ip = ip;
    this.tokenGerekli = !!tv.tokenGerekli;
    this.ws = null;
    this.kimlik = null; // { token }
    this.klavyeAcik = false;
    this.olay = () => {}; // ('klavye', bool) | ('koptu')
  }

  yetenekler() {
    return { klavye: true, fare: true };
  }

  adres() {
    const ad = encodeURIComponent(b64(UYG_ADI));
    if (!this.tokenGerekli) return `ws://${this.ip}:8001${KANAL}?name=${ad}`;
    const token = this.kimlik?.token ? `&token=${encodeURIComponent(this.kimlik.token)}` : '';
    return `wss://${this.ip}:8002${KANAL}?name=${ad}${token}`;
  }

  /**
   * Bağlanır. Token gereken TV'de ilk seferde TV'de "İzin ver" sorusu çıkar;
   * kullanıcı izin verene kadar söz bekler (durumBildir('izin-bekleniyor') çağrılır).
   */
  async baglan(kimlik, durumBildir = () => {}) {
    if (kimlik) this.kimlik = kimlik;
    if (this.tokenGerekli && !this.kimlik?.token) durumBildir('izin-bekleniyor');

    await new Promise((tamam, hata) => {
      let bitti = false;
      const son = (f, x) => { if (!bitti) { bitti = true; f(x); } };
      const wsSoz = this.tasima.wsAc(this.adres(), {
        mesaj: (m) => {
          let v;
          try { v = JSON.parse(m); } catch { return; }
          switch (v.event) {
            case 'ms.channel.connect':
              if (v.data?.token) this.kimlik = { ...this.kimlik, token: v.data.token };
              son(tamam);
              break;
            case 'ms.channel.unauthorized':
              son(hata, new Error('TV bağlantıya izin vermedi'));
              break;
            case 'ms.channel.timeOut':
              son(hata, new Error('TV\'deki izin sorusu zaman aşımına uğradı'));
              break;
            case 'ms.remote.imeStart':
              this.klavyeAcik = true;
              this.olay('klavye', true);
              break;
            case 'ms.remote.imeEnd':
              this.klavyeAcik = false;
              this.olay('klavye', false);
              break;
            default:
          }
        },
        kapandi: () => {
          this.ws = null;
          if (!bitti) son(hata, new Error('TV bağlantıyı kapattı'));
          else this.olay('koptu');
        },
      }, { kendiImzaliKabul: true });
      wsSoz.then((ws) => { this.ws = ws; }, (e) => son(hata, e));
    });
    return { durum: 'hazir', kimlik: this.kimlik || {} };
  }

  gonder(params) {
    if (!this.ws) throw new Error('TV bağlı değil');
    this.ws.gonder(JSON.stringify({ method: 'ms.remote.control', params }));
  }

  /** @param {string} kod  @param {'Click'|'Press'|'Release'} tur */
  tus(kod, tur = 'Click') {
    this.gonder({ Cmd: tur, DataOfCmd: kod, Option: 'false', TypeOfRemote: 'SendRemoteKey' });
  }

  yazi(metin) {
    this.gonder({ Cmd: b64(metin), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' });
  }

  yaziBitir() {
    this.gonder({ TypeOfRemote: 'SendInputEnd' });
  }

  fare(dx, dy) {
    this.gonder({
      Cmd: 'Move',
      Position: { x: Math.round(dx), y: Math.round(dy), Time: String(Date.now()) },
      TypeOfRemote: 'ProcessMouseDevice',
    });
  }

  tikla() {
    this.gonder({ Cmd: 'LeftClick', TypeOfRemote: 'ProcessMouseDevice' });
  }

  kapat() {
    if (this.ws) this.ws.kapat();
    this.ws = null;
  }
}
