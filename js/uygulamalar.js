// Uygulama kısayolları: her TV ailesinde uygulamayı açan istek.
// Samsung Tizen: REST :8001/api/v2/applications/<kimlik> (eski/yeni kimlikler sırayla denenir).
// Samsung 2014-15: DIAL :8080/ws/apps/<ad>. Android TV: uygulama bağlantısı (app link).
// LG: system.launcher kimliği. Roku: kanal numarası (ECP launch).
// Gerçek TV'de yalnız Samsung H/J YouTube (DIAL) denendi; diğer kimlikler açık kaynak projelerden.

export const UYGULAMALAR = [
  {
    ad: 'youtube', etiket: 'YouTube', renk: '#E62117',
    tizen: ['111299001912'], dial: 'YouTube', androidtv: 'https://www.youtube.com',
    lg: 'youtube.leanback.v4', roku: '837',
  },
  {
    ad: 'netflix', etiket: 'Netflix', renk: '#B20710',
    tizen: ['3201907018807', '11101200001'], dial: 'Netflix', androidtv: 'https://www.netflix.com/title',
    lg: 'netflix', roku: '12',
  },
  {
    ad: 'prime', etiket: 'Prime Video', renk: '#1A98FF',
    tizen: ['3201910019365', '3201512006785'], androidtv: 'https://app.primevideo.com',
    lg: 'amazon', roku: '13',
  },
  {
    ad: 'disney', etiket: 'Disney+', renk: '#113CCF',
    tizen: ['3201901017640'], androidtv: 'https://www.disneyplus.com',
    lg: 'com.disney.disneyplus-prod', roku: '291097',
  },
  {
    ad: 'spotify', etiket: 'Spotify', renk: '#1DB954',
    tizen: ['3201606009684'], androidtv: 'spotify://',
    lg: 'spotify-beehive', roku: '22297',
  },
];

/**
 * Uygulamayı açmak için sırayla denenecek istekler.
 * @returns {Array<{tur: 'http', url: string} | {tur: 'adaptor', deger: string}>} boşsa bu TV'de yok
 */
export function uygulamaIstekleri(nesil, ad, ip) {
  const u = UYGULAMALAR.find((x) => x.ad === ad);
  if (!u) return [];
  switch (nesil) {
    case 'tizen':
      return [
        ...(u.tizen || []).map((k) => ({ tur: 'http', url: `http://${ip}:8001/api/v2/applications/${k}` })),
        ...(u.dial ? [{ tur: 'http', url: `http://${ip}:8080/ws/apps/${u.dial}` }] : []),
      ];
    case 'sifreli':
      return u.dial ? [{ tur: 'http', url: `http://${ip}:8080/ws/apps/${u.dial}` }] : [];
    case 'androidtv':
    case 'lg':
    case 'roku':
      return u[nesil] ? [{ tur: 'adaptor', deger: u[nesil] }] : [];
    default:
      return []; // 2010-2013 Samsung: uygulama açma yok
  }
}

/** Bu TV türünde açılabilen uygulamalar. */
export function uygulamaListesi(nesil) {
  return UYGULAMALAR.filter((u) => uygulamaIstekleri(nesil, u.ad, '0.0.0.0').length);
}
