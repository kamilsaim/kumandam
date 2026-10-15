// Wake-on-LAN: kapalı (bekleme) TV'yi ağdan açar.
// Sihirli paket: 6 × 0xFF, ardından MAC adresi 16 kez; UDP 9'a gönderilir.
// iPhone'da yayın (broadcast) adresine gönderim Apple izni ister; bu yüzden TV'nin kendi IP'sine
// doğrudan da gönderilir. TV'nin "ağdan açma" ayarı kapalıysa hiçbiri işe yaramaz.

export const UYANDIRMA_PORTU = 9;

/** "AA:BB:CC:DD:EE:FF", "aa-bb-…" ya da "aabbccddeeff" → 6 bayt; geçersizse null. */
export function macBayt(mac) {
  const h = String(mac || '').replace(/[^0-9a-f]/gi, '');
  if (h.length !== 12 || /^0+$/.test(h)) return null;
  return Uint8Array.from({ length: 6 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

export function sihirliPaket(mac) {
  const m = macBayt(mac);
  if (!m) throw new Error('Geçersiz MAC adresi');
  const p = new Uint8Array(102).fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) p.set(m, 6 + i * 6);
  return p;
}

/** Paketin gönderileceği adresler: TV'nin IP'si, genel yayın ve telefonun /24 alt ağının yayın adresi. */
export function uyandirmaHedefleri(tvIp, yerelIp) {
  const h = [tvIp, '255.255.255.255'];
  const m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(yerelIp || tvIp || '');
  if (m) h.push(m[1] + '.255');
  return [...new Set(h.filter(Boolean))];
}
