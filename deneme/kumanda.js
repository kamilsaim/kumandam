// PC'den etkileşimli kumanda: TV türünü bulur, gerekirse eşleşir, sonra komut bekler.
//   node deneme/kumanda.js <ip>        (ayrıntılı kayıt için önce: set AYRINTI=1 / $env:AYRINTI=1)
// Komutlar: ses+  ses-  sessiz  kanal+  kanal-  yukari  asagi  sol  sag  ok  geri  ev  menu  guc  0-9 …
//           yaz <metin>   youtube   fare <dx> <dy>   tikla   kod <ham kod>   cik
// Eşleşme ve sertifika deneme/kayit.json'da tutulur (git'e girmez).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { adresYokla } from '../js/kesif.js';
import { tusKodu } from '../js/tuslar.js';
import { SifreliAdaptor } from '../js/adaptor/sifreli.js';
import { TizenAdaptor } from '../js/adaptor/tizen.js';
import { EskiAdaptor } from '../js/adaptor/eski.js';
import { AndroidTvAdaptor } from '../js/adaptor/androidtv.js';
import { LgAdaptor } from '../js/adaptor/lg.js';
import { RokuAdaptor } from '../js/adaptor/roku.js';
import { sertifikaUret, baytBase64, base64Bayt } from '../js/kripto/sertifika.js';
import { nodeTasima } from './node-tasima.js';

const KAYIT = fileURLToPath(new URL('./kayit.json', import.meta.url));
const kayit = existsSync(KAYIT) ? JSON.parse(readFileSync(KAYIT, 'utf8')) : {};
const kaydet = () => writeFileSync(KAYIT, JSON.stringify(kayit, null, 2));
const CIHAZ = (kayit.cihaz ||= '7e509404-9d7c-46b4-8f6a-e2a9668ad184');

const ALANLAR = ['sertifika', 'pkcs8', 'pkcs1', 'modulus', 'us'];
async function sertifika() {
  if (kayit.sertifika) return Object.fromEntries(ALANLAR.map((a) => [a, base64Bayt(kayit.sertifika[a])]));
  console.log('İstemci sertifikası üretiliyor…');
  const s = await sertifikaUret('Kumandam');
  kayit.sertifika = Object.fromEntries(ALANLAR.map((a) => [a, baytBase64(s[a])]));
  kaydet();
  return s;
}

const ip = process.argv[2];
if (!ip) {
  console.log('kullanım: node deneme/kumanda.js <ip>   (TV\'leri bulmak için: node deneme/tara.js)');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const tv = await adresYokla(nodeTasima, ip, 3000);
if (!tv) {
  console.log(`${ip}: desteklenen bir televizyon bulunamadı.`);
  process.exit(1);
}
console.log(`${tv.ad} — tür: ${tv.nesil}${tv.model ? ', model: ' + tv.model : ''}`);

const a = {
  sifreli: () => new SifreliAdaptor(nodeTasima, ip, CIHAZ),
  tizen: () => new TizenAdaptor(nodeTasima, ip, tv),
  eski: () => new EskiAdaptor(nodeTasima, ip, CIHAZ),
  androidtv: () => new AndroidTvAdaptor(nodeTasima, ip, sertifika),
  lg: () => new LgAdaptor(nodeTasima, ip),
  roku: () => new RokuAdaptor(nodeTasima, ip),
}[tv.nesil]();
a.olay = (ad, d) => console.log(`[olay] ${ad}${d !== undefined ? ' ' + d : ''}`);

kayit.tv ||= {};
try {
  let s = await a.baglan(kayit.tv[ip], (d) => console.log(`[durum] ${d} — TV'de "İzin ver"e basın`));
  if (s.durum === 'pin-gerekli') {
    await a.pinGoster();
    const kod = (await rl.question('TV ekranındaki kodu yazın: ')).trim();
    kayit.tv[ip] = await a.pinGir(kod);
    kaydet();
    console.log('Eşleşme tamam.');
    s = await a.baglan(kayit.tv[ip]);
  }
  if (s.kimlik) { kayit.tv[ip] = s.kimlik; kaydet(); }
} catch (e) {
  console.error('HATA:', e.message);
  process.exit(1);
}
console.log('Bağlandı. Komut yazın (cik ile çıkış):');

for (;;) {
  const satir = (await rl.question('> ')).trim();
  if (!satir) continue;
  const [komut, ...arg] = satir.split(/\s+/);
  try {
    if (komut === 'cik') break;
    else if (komut === 'yaz') { await a.yazi(arg.join(' ')); await a.yaziBitir?.(); }
    else if (komut === 'youtube') await a.youtube?.();
    else if (komut === 'fare') a.fare(Number(arg[0]), Number(arg[1]));
    else if (komut === 'tikla') a.tikla();
    else if (komut === 'kod') a.tus(tv.nesil === 'androidtv' ? Number(arg[0]) : arg[0]);
    else a.tus(tusKodu(komut, tv.nesil));
    console.log('  gönderildi');
  } catch (e) {
    console.log('  HATA:', e.message);
  }
}
a.kapat();
rl.close();
process.exit(0);
