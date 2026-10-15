// Sorun bildirmek için olay günlüğü: yalnız bellekte, son 200 satır.
// Hiçbir yere kendiliğinden gönderilmez; kullanıcı "Sorun bildir"e basınca paylaşım metnine girer.

const EN_COK = 200;
const satirlar = [];

export function gunluk(metin) {
  const z = new Date();
  const saat = [z.getHours(), z.getMinutes(), z.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
  satirlar.push(`${saat} ${metin}`);
  if (satirlar.length > EN_COK) satirlar.splice(0, satirlar.length - EN_COK);
}

export function gunlukSatirlari() {
  return [...satirlar];
}

/** Paylaşılacak rapor metni. */
export function raporMetni({ surum, platform, cihaz, tv, bagli, kayitliSayisi }) {
  return [
    `Kumandam ${surum} — sorun kaydı`,
    `Tarih: ${new Date().toISOString()}`,
    `Telefon: ${platform} · ${cihaz}`,
    tv ? `TV: ${tv.ad || '?'} · ${tv.model || '?'} · tür ${tv.nesil} · ${tv.ip}${tv.mac ? ' · MAC biliniyor' : ''}` : 'TV: seçilmedi',
    `Bağlı: ${bagli ? 'evet' : 'hayır'} · kayıtlı TV: ${kayitliSayisi}`,
    '',
    'Ne oldu? (buraya yaz)',
    '',
    '--- Son olaylar ---',
    ...satirlar,
  ].join('\n');
}
