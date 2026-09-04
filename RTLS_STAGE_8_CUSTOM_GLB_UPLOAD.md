# V8 — Arayüzden GLB Eşya Yükleme

Bu sürüm, düzenleme ekranına **SAHNEYE EKLE** butonu ekler. Kullanıcı kendi `.glb` mobilya/eşya modelini uygulama içinden seçebilir, ölçülerini kontrol edebilir, kategori belirleyebilir ve aktif kata yerleştirebilir.

## Akış

1. Düzenleme modunda sağ üstten **SAHNEYE EKLE**.
2. Tek dosyalık glTF 2.0 `.glb` seçilir.
3. Dosya tarayıcıda doğrulanır ve modelin sınır kutusundan başlangıç ölçüleri hesaplanır.
4. Ad / grup / genişlik / derinlik / yükseklik düzenlenebilir.
5. **Sahneye Ekle** ile model kameranın odak noktasına yakın şekilde aktif kata eklenir.
6. GLB binary verisi IndexedDB'de cihaz-local saklanır; layout yalnızca rastgele `customModelId` taşır.

## Güvenlik

- En fazla 32 MB GLB.
- Yalnızca binary glTF 2.0.
- Dış `http(s)`, relative buffer veya image URI kullanan modeller reddedilir.
- Draco ve KTX2/Basis modeller bu sürümde reddedilir; Meshopt desteklenir.
- Kullanıcı dosyasından script çalıştırılmaz.
- GLB verisi auth/session storage değildir; auth tokenları için proje güvenlik kuralı değişmemiştir.

## Performans

Yüklenen model bir kez parse edilip session cache'te tutulur. Aynı eşya çoğaltılırsa clone'lar geometri/material kaynaklarını paylaşır. Silinen clone ortak cache kaynaklarını dispose etmez; böylece diğer clone'lar bozulmaz.

Çok ağır GLB modeller sahne FPS'ini düşürebilir. Kalabalık personel avatar sistemi V7'deki ayrı optimize renderer'ı kullanmaya devam eder.
