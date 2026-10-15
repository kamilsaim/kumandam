// Kayıtlı televizyonlar: bağlanılan her TV listeye girer, ad verilebilir, silinebilir.
// Liste düz dizi; saklama uygulama.js'te (localStorage 'kumandam.tvler').
// Eşleşme bilgisi ayrıca 'kumandam.kimlik.<anahtar>' altında durur; anahtar ikisinde aynı.

/** TV'nin kalıcı anahtarı: Samsung/Roku'da cihaz kimliği, diğerlerinde IP'den türetilmiş kimlik. */
export function tvAnahtari(tv) {
  return tv.duid || tv.ip;
}

/** Listede görünen ad: kullanıcının verdiği ad, yoksa TV'nin kendi adı. */
export function gorunenAd(tv) {
  return tv?.takmaAd || tv?.ad || 'Televizyon';
}

/** TV'yi ekler ya da günceller; son kullanılan başa gelir. Kullanıcının verdiği ad ve bilinen MAC korunur. */
export function listeyeEkle(liste, tv, zaman = Date.now()) {
  const a = tvAnahtari(tv);
  const eski = liste.find((x) => tvAnahtari(x) === a);
  const yeni = { ...eski, ...tv, sonKullanim: zaman };
  if (eski?.takmaAd && !tv.takmaAd) yeni.takmaAd = eski.takmaAd;
  if (eski?.mac && !tv.mac) yeni.mac = eski.mac;
  return [yeni, ...liste.filter((x) => tvAnahtari(x) !== a)];
}

export function listedenSil(liste, anahtar) {
  return liste.filter((x) => tvAnahtari(x) !== anahtar);
}

/** Boş ad verilirse TV'nin kendi adına döner. */
export function adVer(liste, anahtar, ad) {
  const temiz = String(ad || '').trim().slice(0, 40);
  return liste.map((x) => {
    if (tvAnahtari(x) !== anahtar) return x;
    const y = { ...x, takmaAd: temiz };
    if (!temiz) delete y.takmaAd;
    return y;
  });
}

/**
 * Taramada bulunan TV kayıtlıysa (aynı anahtar) IP değişikliği gibi güncel bilgileri kayda işler.
 * @returns {{liste: Array, kayitli: object|null}} kayitli: eşleşen kayıt (güncellenmiş) ya da null
 */
export function taramayaUygula(liste, bulunan) {
  const a = tvAnahtari(bulunan);
  const eski = liste.find((x) => tvAnahtari(x) === a);
  if (!eski) return { liste, kayitli: null };
  const guncel = { ...eski, ...bulunan, takmaAd: eski.takmaAd, sonKullanim: eski.sonKullanim };
  if (!guncel.takmaAd) delete guncel.takmaAd;
  if (eski.mac && !bulunan.mac) guncel.mac = eski.mac;
  return { liste: liste.map((x) => (tvAnahtari(x) === a ? guncel : x)), kayitli: guncel };
}
