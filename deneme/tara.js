// Bu bilgisayarın ağındaki televizyonları bulur.
//   node deneme/tara.js
import { agiTara } from '../js/kesif.js';
import { nodeTasima } from './node-tasima.js';

const ip = await nodeTasima.yerelIp();
console.log(`Bu bilgisayar: ${ip} — ${ip?.replace(/\.\d+$/, '.1-254')} taranıyor…`);
const bulunan = await agiTara(nodeTasima, {
  eslesti: (tv) => console.log(`  bulundu: ${tv.ip.padEnd(15)} ${tv.nesil.padEnd(9)} ${tv.ad}${tv.model ? ' (' + tv.model + ')' : ''}`),
});
console.log(bulunan.length ? `${bulunan.length} televizyon. Kumanda için: node deneme/kumanda.js <ip>` : 'Televizyon bulunamadı.');
