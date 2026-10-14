// Bayt dizisi yardımcıları (tarayıcı ve Node'da aynı çalışır).

export function hexBayt(hex) {
  const t = hex.replace(/\s+/g, '');
  if (t.length % 2) throw new Error('hex uzunluğu tek');
  const b = new Uint8Array(t.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(t.substr(i * 2, 2), 16);
  return b;
}

export function baytHex(b) {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function birlestir(...parcalar) {
  const top = parcalar.reduce((n, p) => n + p.length, 0);
  const s = new Uint8Array(top);
  let i = 0;
  for (const p of parcalar) { s.set(p, i); i += p.length; }
  return s;
}

export function metinBayt(m) {
  return new TextEncoder().encode(m);
}

export function baytMetin(b) {
  return new TextDecoder().decode(b);
}

export function u32be(n) {
  return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

export function esitMi(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
