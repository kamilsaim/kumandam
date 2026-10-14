# Kumandam

Reklamsız, ücretsiz TV kumandası. iPhone uygulaması **Kumandam TV** olarak TestFlight'ta; iOS kabuğu
gizli `kamilsaim/kumandam-ios` reposunda, bu repo arayüzü ve TV protokollerini içerir.

Şu an Samsung Smart TV'ler:

| Nesil | Protokol | Durum |
|---|---|---|
| 2014–2015 (H/J) | PIN el sıkışması + şifreli socket.io | Gerçek TV'de doğrulandı (UE40H6200) |
| 2016+ Tizen | WebSocket :8001 / güvenli :8002 + token | Yazıldı, gerçek cihazda denenmedi |
| 2010–2013 (C/D/E/F) | Ham TCP :55000 | Yazıldı, gerçek cihazda denenmedi |

## Yapı

```
index.html, css/stil.css
js/uygulama.js        akış ve arayüz: tarama → eşleştirme → kumanda
js/kesif.js           telefonun alt ağını tarar, TV neslini tespit eder
js/tuslar.js          ortak tuş adları → Samsung KEY_* kodları
js/tasima.js          ağ katmanı: iPhone'da TVSoket (Swift), tarayıcıda fetch/WebSocket
js/kripto/            saf JS AES-128 ve SHA-1
js/adaptor/           sifreli (2014–15), tizen (2016+), eski (≤2013)
test/                 node --test
```

Adaptörler ağa yalnız `tasima.js` arayüzüyle çıkar; bu sayede aynı kod PC'de Node ile de çalışır.
Yeni bir TV markası eklemek: `js/adaptor/` altına adaptör, `kesif.js`'e tanıma kuralı, gerekirse
`tuslar.js`'e tuş tablosu.

## Test

```
npm test
```

TestFlight iş akışı derlemeden önce bu testleri çalıştırır.

## Yayın

`kumandam-ios` → Actions → "iOS - TestFlight" → Run workflow. Arayüz bu reponun seçilen dalından alınır.

## Lisans notu

`js/adaptor/sifreli-kripto.js` ve `sifreli-anahtarlar.js`, [McKael/smartcrypto](https://github.com/McKael/smartcrypto)
(MIT, Copyright (c) 2018 Mikael Berthe) Go uygulamasından çevrildi.
