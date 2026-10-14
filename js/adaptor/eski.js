// 2010-2013 Samsung (C/D/E/F) adaptörü: ham TCP :55000.
// Paket: [tür:1][uygulama adı: u16le uzunluk + metin][yük: u16le uzunluk + bayt].
// Yük içindeki metinler base64 kodlanıp u16le uzunlukla yazılır.
// Gerçek cihazla denenmedi; biçim açık kaynak uygulamalardaki (ör. samsungctl, MIT) kullanıma göre.

const UYG_ADI = 'iphone..iapp.samsung';
const KUMANDA_ADI = 'Kumandam';

function b64Bayt(metin) {
  const bayt = new TextEncoder().encode(metin);
  let s = '';
  for (const b of bayt) s += String.fromCharCode(b);
  return new TextEncoder().encode(btoa(s));
}

function uzunluklu(bayt) {
  const s = new Uint8Array(2 + bayt.length);
  s[0] = bayt.length & 255;
  s[1] = (bayt.length >> 8) & 255;
  s.set(bayt, 2);
  return s;
}

function birlestir(...p) {
  const s = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) { s.set(x, i); i += x.length; }
  return s;
}

function paket(tur, yuk) {
  return birlestir(Uint8Array.of(tur), uzunluklu(new TextEncoder().encode(UYG_ADI)), uzunluklu(yuk));
}

export function kimlikPaketi(yerelIp, cihazKimlik) {
  const yuk = birlestir(
    Uint8Array.of(0x64, 0x00),
    uzunluklu(b64Bayt(yerelIp)),
    uzunluklu(b64Bayt(cihazKimlik)),
    uzunluklu(b64Bayt(KUMANDA_ADI)),
  );
  return paket(0x00, yuk);
}

export function tusPaketi(kod) {
  return paket(0x00, birlestir(Uint8Array.of(0x00, 0x00, 0x00), uzunluklu(b64Bayt(kod))));
}

/**
 * TV cevabından izin durumu: [tür][ad uzunluk+ad][yük uzunluk+yük]
 * @returns {'izinli'|'reddedildi'|'bekliyor'|'zamanasimi'|null}
 */
export function cevapDurumu(bayt) {
  if (bayt.length < 3) return null;
  const adBoyu = bayt[1] | (bayt[2] << 8);
  const i = 3 + adBoyu;
  if (bayt.length < i + 2) return null;
  const yukBoyu = bayt[i] | (bayt[i + 1] << 8);
  const yuk = bayt.subarray(i + 2, i + 2 + yukBoyu);
  if (yuk.length < yukBoyu) return null;
  if (yuk[0] === 0x64 && yuk[2] === 0x01) return 'izinli';
  if (yuk[0] === 0x64 && yuk[2] === 0x00) return 'reddedildi';
  if (yuk[0] === 0x0a) return 'bekliyor';
  if (yuk[0] === 0x65) return 'zamanasimi';
  return null;
}

export class EskiAdaptor {
  constructor(tasima, ip, cihazKimlik) {
    this.tasima = tasima;
    this.ip = ip;
    this.cihazKimlik = cihazKimlik;
    this.baglanti = null;
    this.olay = () => {};
  }

  yetenekler() {
    return { klavye: false, fare: false };
  }

  async baglan(kimlik, durumBildir = () => {}) {
    const yerelIp = await this.tasima.yerelIp();
    await new Promise((tamam, hata) => {
      let bitti = false;
      let tampon = new Uint8Array(0);
      const son = (f, x) => { if (!bitti) { bitti = true; f(x); } };
      this.tasima.tcpAc(this.ip, 55000, {
        veri: (bayt) => {
          tampon = birlestir(tampon, bayt);
          const d = cevapDurumu(tampon);
          if (!d) return;
          tampon = new Uint8Array(0);
          if (d === 'izinli') son(tamam);
          else if (d === 'bekliyor') durumBildir('izin-bekleniyor');
          else if (d === 'reddedildi') son(hata, new Error('TV bağlantıya izin vermedi'));
          else if (d === 'zamanasimi') son(hata, new Error('TV\'deki izin sorusu zaman aşımına uğradı'));
        },
        kapandi: () => {
          this.baglanti = null;
          if (!bitti) son(hata, new Error('TV bağlantıyı kapattı'));
          else this.olay('koptu');
        },
      }).then((b) => {
        this.baglanti = b;
        b.gonder(kimlikPaketi(yerelIp, this.cihazKimlik));
      }, (e) => son(hata, e));
    });
    return { durum: 'hazir', kimlik: kimlik || {} };
  }

  tus(kod) {
    if (!this.baglanti) throw new Error('TV bağlı değil');
    this.baglanti.gonder(tusPaketi(kod));
  }

  kapat() {
    if (this.baglanti) this.baglanti.kapat();
    this.baglanti = null;
  }
}
