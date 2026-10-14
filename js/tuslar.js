// Arayüzdeki ortak tuş adları → Samsung tuş kodları.
// Kodlar tüm nesillerde büyük ölçüde aynı; farklı olanlar nesle göre ezilir.

const ORTAK = {
  guc: 'KEY_POWEROFF',
  kaynak: 'KEY_SOURCE',
  smarthub: 'KEY_CONTENTS',
  menu: 'KEY_MENU',
  ev: 'KEY_HOME',
  geri: 'KEY_RETURN',
  cik: 'KEY_EXIT',
  info: 'KEY_INFO',
  rehber: 'KEY_GUIDE',
  araclar: 'KEY_TOOLS',
  yukari: 'KEY_UP',
  asagi: 'KEY_DOWN',
  sol: 'KEY_LEFT',
  sag: 'KEY_RIGHT',
  ok: 'KEY_ENTER',
  'ses+': 'KEY_VOLUP',
  'ses-': 'KEY_VOLDOWN',
  sessiz: 'KEY_MUTE',
  'kanal+': 'KEY_CHUP',
  'kanal-': 'KEY_CHDOWN',
  kanalListesi: 'KEY_CH_LIST',
  oncekiKanal: 'KEY_PRECH',
  gerisar: 'KEY_REWIND',
  oynat: 'KEY_PLAY',
  duraklat: 'KEY_PAUSE',
  durdur: 'KEY_STOP',
  ilerisar: 'KEY_FF',
  kirmizi: 'KEY_RED',
  yesil: 'KEY_GREEN',
  sari: 'KEY_YELLOW',
  mavi: 'KEY_CYAN',
};
for (let i = 0; i <= 9; i++) ORTAK[String(i)] = 'KEY_' + i;

const NESLE_GORE = {
  // Tizen'de KEY_POWEROFF bazı modellerde çalışmaz; KEY_POWER aç/kapa yapar.
  tizen: { guc: 'KEY_POWER', ev: 'KEY_HOME', smarthub: 'KEY_HOME' },
  sifreli: { ev: 'KEY_CONTENTS' },
  eski: { ev: 'KEY_CONTENTS' },
};

export const NESILLER = ['eski', 'sifreli', 'tizen'];

export function tusKodu(ad, nesil) {
  const kod = NESLE_GORE[nesil]?.[ad] ?? ORTAK[ad];
  if (!kod) throw new Error('bilinmeyen tuş: ' + ad);
  return kod;
}

export function tusAdlari() {
  return Object.keys(ORTAK);
}
