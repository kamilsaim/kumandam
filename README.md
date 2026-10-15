# Kumandam

Reklamsız, ücretsiz TV kumandası. iPhone uygulaması **Kumandam TV** olarak TestFlight'ta; iOS kabuğu
gizli `kamilsaim/kumandam-ios` reposunda, bu repo arayüzü ve TV protokollerini içerir.

Android kabuğu gizli `kamilsaim/kumandam-android` reposunda (PC'de derlenir). Sürüm: **1.2**.

| TV | Protokol | Durum |
|---|---|---|
| Samsung 2014–2015 (H/J) | PIN el sıkışması + şifreli socket.io | Gerçek TV'de doğrulandı (UE40H6200) |
| Samsung 2016+ Tizen | WebSocket :8001 / güvenli :8002 + token | Yazıldı, gerçek cihazda denenmedi |
| Samsung 2010–2013 (C/D/E/F) | Ham TCP :55000 | Yazıldı, gerçek cihazda denenmedi |
| Android TV / Google TV | TLS + istemci sertifikası, protobuf (:6467 eşleşme, :6466 kumanda) | Yazıldı, gerçek cihazda denenmedi |
| LG webOS | SSAP WebSocket + pointer soketi | Yazıldı, gerçek cihazda denenmedi |
| Roku | ECP HTTP :8060 | Yazıldı, gerçek cihazda denenmedi |

Özellikler: otomatik TV bulma, eşleşme, bütün kumanda tuşları, dokunmatik alan / fare, klavye,
kayıtlı TV listesi (ad ver, sil, geç), uygulama kısayolları (YouTube, Netflix, Prime Video, Disney+, Spotify),
kapalı TV'yi Wake-on-LAN ile açma, sorun bildir (olay günlüğünü paylaşır), sessiz göstergesi.

## Yapı

```
index.html, css/stil.css
js/uygulama.js        akış ve arayüz: tarama → eşleştirme → kumanda
js/kesif.js           telefonun alt ağını tarar, TV türünü tespit eder (MAC varsa alır)
js/tuslar.js          ortak tuş adları → her TV ailesinin tuş kodu
js/tasima.js          ağ katmanı: telefonda TVSoket (Swift / Java), tarayıcıda fetch/WebSocket
js/kayitli.js         kayıtlı TV listesi (ekle, ad ver, sil, taramayla güncelle)
js/uygulamalar.js     uygulama kısayolları: TV türüne göre açma istekleri
js/uyandir.js         Wake-on-LAN sihirli paketi ve hedef adresler
js/gunluk.js          sorun bildirmek için bellek içi olay günlüğü
js/protobuf.js        Android TV için küçük protobuf kodlayıcı
js/kripto/            saf JS AES-128, SHA-1, SHA-256, ASN.1, sertifika üretimi
js/adaptor/           sifreli (2014–15), tizen (2016+), eski (≤2013), androidtv, lg, roku
test/                 node --test (65 test)
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

## Yol haritası

- Yeni markaları gerçek TV'lerde doğrulamak (Android TV, LG, Roku, Tizen).
- 1.3: Android TV'de sesli komut (Google Asistan; protokolde RemoteVoice* mesajları var).
- Sonra: Android olmayan eski Vestel, Hisense VIDAA.
