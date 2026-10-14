// Arayüzdeki ortak tuş adları → her TV ailesinin kendi tuş kodu.
// Samsung: KEY_* metinleri; Android TV: Android KEYCODE_* sayıları;
// LG: pointer soketi tuş adları ya da "ssap://…" / "uygulama:<id>"; Roku: ECP tuş adları.

const SAMSUNG = {
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
for (let i = 0; i <= 9; i++) SAMSUNG[String(i)] = 'KEY_' + i;

// android.view.KeyEvent kodları
const ANDROID = {
  guc: 26, kaynak: 178, smarthub: 3, menu: 82, ev: 3, geri: 4, cik: 4, info: 165, rehber: 172, araclar: 176,
  yukari: 19, asagi: 20, sol: 21, sag: 22, ok: 23,
  'ses+': 24, 'ses-': 25, sessiz: 164, 'kanal+': 166, 'kanal-': 167, kanalListesi: 172, oncekiKanal: 229,
  gerisar: 89, oynat: 126, duraklat: 127, durdur: 86, ilerisar: 90,
  kirmizi: 183, yesil: 184, sari: 185, mavi: 186,
};
for (let i = 0; i <= 9; i++) ANDROID[String(i)] = 7 + i;

const LG = {
  guc: 'ssap://system/turnOff', kaynak: 'uygulama:com.webos.app.inputpicker', smarthub: 'HOME', menu: 'MENU',
  ev: 'HOME', geri: 'BACK', cik: 'EXIT', info: 'INFO', rehber: 'GUIDE', araclar: 'MENU',
  yukari: 'UP', asagi: 'DOWN', sol: 'LEFT', sag: 'RIGHT', ok: 'ENTER',
  'ses+': 'VOLUMEUP', 'ses-': 'VOLUMEDOWN', sessiz: 'MUTE', 'kanal+': 'CHANNELUP', 'kanal-': 'CHANNELDOWN',
  kanalListesi: 'LIST', oncekiKanal: 'BACK',
  gerisar: 'REWIND', oynat: 'PLAY', duraklat: 'PAUSE', durdur: 'STOP', ilerisar: 'FASTFORWARD',
  kirmizi: 'RED', yesil: 'GREEN', sari: 'YELLOW', mavi: 'BLUE',
};
for (let i = 0; i <= 9; i++) LG[String(i)] = String(i);

const ROKU = {
  guc: 'PowerOff', kaynak: 'InputTuner', smarthub: 'Home', menu: 'Info', ev: 'Home', geri: 'Back', cik: 'Home',
  info: 'Info', rehber: 'Info', araclar: 'Info',
  yukari: 'Up', asagi: 'Down', sol: 'Left', sag: 'Right', ok: 'Select',
  'ses+': 'VolumeUp', 'ses-': 'VolumeDown', sessiz: 'VolumeMute', 'kanal+': 'ChannelUp', 'kanal-': 'ChannelDown',
  kanalListesi: 'Info', oncekiKanal: 'InstantReplay',
  gerisar: 'Rev', oynat: 'Play', duraklat: 'Play', durdur: 'Back', ilerisar: 'Fwd',
};
for (let i = 0; i <= 9; i++) ROKU[String(i)] = 'Lit_' + i;

const TABLOLAR = {
  eski: { ...SAMSUNG, ev: 'KEY_CONTENTS' },
  sifreli: { ...SAMSUNG, ev: 'KEY_CONTENTS' },
  // Tizen'de KEY_POWEROFF bazı modellerde çalışmaz; KEY_POWER aç/kapa yapar.
  tizen: { ...SAMSUNG, guc: 'KEY_POWER', smarthub: 'KEY_HOME' },
  androidtv: ANDROID,
  lg: LG,
  roku: ROKU,
};

export const NESILLER = Object.keys(TABLOLAR);

export function tusKodu(ad, nesil) {
  const tablo = TABLOLAR[nesil];
  if (!tablo) throw new Error('bilinmeyen TV türü: ' + nesil);
  const kod = tablo[ad];
  if (kod === undefined) throw new Error('bu TV\'de yok: ' + ad);
  return kod;
}

export function tusVarMi(ad, nesil) {
  return TABLOLAR[nesil]?.[ad] !== undefined;
}
