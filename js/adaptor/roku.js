// Roku adaptörü (External Control Protocol, HTTP :8060). Eşleştirme yok.
// Gerçek cihazda henüz denenmedi.

export class RokuAdaptor {
  constructor(tasima, ip) {
    this.tasima = tasima;
    this.ip = ip;
    this.olay = () => {};
  }

  yetenekler() {
    return { klavye: true, fare: false };
  }

  async post(yol) {
    const c = await this.tasima.http({ yontem: 'POST', url: `http://${this.ip}:8060/${yol}`, govde: '', zamanAsimi: 4000 });
    if (c.durum >= 300) throw new Error(`Roku ${c.durum} döndü`);
  }

  async baglan(kimlik) {
    const c = await this.tasima.http({ yontem: 'GET', url: `http://${this.ip}:8060/query/device-info`, zamanAsimi: 4000 });
    if (c.durum !== 200) throw new Error('Roku cevap vermedi');
    return { durum: 'hazir', kimlik: kimlik || {} };
  }

  tus(kod) {
    const yol = kod.startsWith('launch/') ? kod : 'keypress/' + kod;
    this.post(yol).catch((e) => this.olay('hata', e.message));
  }

  async yazi(metin) {
    for (const ch of metin) await this.post('keypress/Lit_' + encodeURIComponent(ch));
  }

  async youtube() {
    await this.uygulamaAc('837');
  }

  async uygulamaAc(kanal) {
    await this.post('launch/' + kanal);
  }

  kapat() {}
}
