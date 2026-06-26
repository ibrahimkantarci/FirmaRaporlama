# Fiyat Tutarlılık — Mantık Dokümanı

Bu doküman, "Fiyat Tutarlılık" aracının baştan sona nasıl çalıştığını anlatır:
veriyi nereden çeker, katalog ile kampanyayı nasıl eşleştirir, hangi referans
tiplerini kullanır, kararı (Tutarlı/Tutarsız/Karşılaştırılamaz) nasıl verir,
sayım tipleri nasıl hesaplanır ve çıktılar (sekmeler, kartlar) neye karşılık gelir.

İlgili kod: `lib/fiyat.js` (mantık), `lib/qlik.js` (okuma), `app/api/fiyat/run`
(pipeline), `app/api/fiyat/data` (okuma), `app/fiyat-tutarlilik/page.js` (arayüz).

---

## 1. Genel Akış

1. Kullanıcı **"Çalıştır"** der → `GET /api/fiyat/run` tetiklenir.
2. Qlik'ten iki obje okunur (aktif provider filtreli):
   - **Katalog** objesi (`FIYAT_CATALOG_OBJECT_ID`)
   - **Kampanya** objesi (`FIYAT_CAMPAIGN_OBJECT_ID`)
   - İkisi de `FIYAT_APP_ID` uygulamasındadır (tanımlı değilse `ENGAGEMENT_APP_ID`).
3. Veriler işlenir ve **3 sekmeye** yazılır (her seferinde **sıfırdan**, üzerine):
   - `Fiyat_Tutarlılık_Catalog` — ham katalog
   - `Fiyat_Tutarlılık_Campaign` — ham kampanya
   - `Fiyat_Tutarlılık_Kıyas` — eşleştirme + sonuç
4. Sonuç satırları sayfaya döner; sayfa kartları, filtreleri ve tabloyu gösterir.
5. Sayfa açıldığında son veri `GET /api/fiyat/data` ile Kıyas sekmesinden okunur
   (yeniden çalıştırmaya gerek kalmadan) ve **son güncelleme tarihi** gösterilir.

---

## 2. Veri Kaynakları ve Filtreler

Her iki tablo da okunurken Qlik'te şu seçimler uygulanır:

| Tablo    | Uygulanan seçim                                  | Anlamı                          |
|----------|--------------------------------------------------|---------------------------------|
| Katalog  | `is_currently_listing = 1`                       | Aktif (yayında) provider'lar    |
| Kampanya | `is_currently_listing = 1` ve `campaign_status = 1` | Aktif provider + geçerli kampanya |

> Fiyatlar Qlik'in **ham sayısal değerinden (qNum)** okunur; metin biçimi
> ("1.500" gibi Türkçe binlik) güvenilmez olduğu için kullanılmaz.

### Kullanılan kolonlar

Kolonlar, hem dostça başlık hem de alan adıyla eşlenir (hangisi gelirse):

- **Katalog:** `Provider Id`/`catalog_provider_id`, `Option Type Name`/`cat_item_opt_type`,
  `Price`, `Currency`/`c_catalog_currency`, `Price Period`/`c_catalog_price_week_period`,
  `Is Main`/`is_catalog_main`, `Catalog Name`/`catalog_name`, `Category`/`provider_category_name`.
- **Kampanya:** `Provider ID`/`provider_id`, `Type`/`campaign_type`, `Intro`/`campaing_intro`,
  `Price After`/`campaign_price_after`, `Currency`/`campaing_currency`, `Category`/`provider_category_name`.

Eşleşmeyen kolon olursa arayüzde **"eşleşmeyen kolon(lar)"** uyarısı çıkar.

---

## 3. Eşleştirme Mantığı

Amaç: bir kampanyanın indirimli fiyatını, **aynı providerın aynı türdeki katalog
fiyatıyla** karşılaştırmak. Bunun için üç şey hizalanmalı:

### 3.1 Birim (en kritik adım)

Katalog fiyatları iki farklı ölçektedir:
- **Kişi Başı** (kişi başına; medyan ~1.000 TL)
- **Paket** (toplam paket; medyan ~70.000 TL)

İkisini karıştırmak yanlış "Tutarsız" üretir. Bu yüzden birim eşlenir:

- **Katalog birimi:** `Option Type Name` içinde "kişi" geçiyorsa → `kisi`, değilse → `paket`.
- **Kampanya birimi:** `Intro` metninde "kişi başı" geçiyorsa → `kisi`, değilse → `paket`.
  (Analizde doğrulandı: "Kişi Başı" yazan kampanyaların medyan fiyatı ~1.150 TL,
  yazmayanların ~60.000 TL — net ayrım.)

### 3.2 Anahtarlar

Kampanya, katalog fiyatlarıyla şu üçlüye göre eşleşir:

    provider_id  +  birim (kisi/paket)  +  para birimi (Currency)

Yani her kampanya için, **aynı provider'ın aynı birimde ve aynı para birimindeki**
katalog fiyatları "referans havuzu" olur.

### 3.3 Referans havuzu ve aday referanslar

Katalogdan provider→birim→para bazında fiyat listesi kurulur ve şu aday
referanslar hesaplanır:

| Aday        | Tanım                                              |
|-------------|----------------------------------------------------|
| `Ref Min`   | Aynı birimdeki en düşük katalog fiyatı             |
| `Ref Max`   | Aynı birimdeki en yüksek katalog fiyatı            |
| `Ref Medyan`| Aynı birimdeki katalog fiyatlarının medyanı        |
| `Ref Ana`   | `Is Main = 1` katalog satır(lar)ının fiyatı (medyanı) |
| `Ref Adet`  | Havuzdaki katalog fiyatı sayısı                    |

Bu aday referansların **hepsi** Kıyas satırına yazılır; karar verirken hangisinin
kullanılacağı arayüzde canlı seçilir (bkz. Bölüm 4).

> Not: Kampanyanın kendi **"Fiyat Önce"** değeri referans olarak KULLANILMAZ.
> (Veride %72'si herhangi bir katalog fiyatına eşleşmiyor — yani şişirilmiş bir
> çapa olabilir.) Karşılaştırma daima gerçek katalog fiyatına göre yapılır.

### 3.4 Dönem (hafta içi / hafta sonu)

Katalog fiyatları döneme göre değişir (hafta içi genelde daha ucuz). Bu yüzden
referans havuzu, kampanyanın dönemine göre daraltılır.

- **Kampanya dönemi** `Intro`'dan okunur:
  "hafta sonu" → `weekend`, "hafta içi" → `weekday`, ikisi de/hiçbiri yoksa → `all`.
- **Katalog dönemi** `Price Period` alanından gelir (`weekday`/`weekend`/`all`).

Eşleme:

| Kampanya dönemi | Referans alınan katalog satırları |
|-----------------|-----------------------------------|
| `weekend`       | `weekend` + `all`                 |
| `weekday`       | `weekday` + `all`                 |
| `all` (işaret yok) | tüm dönemler (daraltma yok)    |

**Fallback:** Kampanya hafta içi/sonu olduğu halde provider'ın o döneme (ve `all`'a)
uygun katalog fiyatı yoksa, daraltma yapılmaz ve **tüm dönemlere düşülür** (satır
karşılaştırılabilir kalır). Kampanyanın dönemi Kıyas'taki **"Dönem"** kolonunda görünür.

---

## 4. Referans Tipleri (karar referansı)

Seçilen referans, kampanyanın **"Fiyat Sonra"** değerinin karşılaştırılacağı katalog
fiyatını belirler. Dört seçenek vardır:

| Referans               | Kullanılan değer     | Davranış                                                                 |
|------------------------|----------------------|--------------------------------------------------------------------------|
| **Katalog Max (esnek)**| `Ref Max`            | En müsamahalı. Yalnız kampanya, providerın EN YÜKSEK eşdeğer fiyatından bile pahalıysa "Tutarsız". En az yanlış alarm. |
| **Katalog Min (katı)** | `Ref Min`            | En sıkı. Kampanya, EN UCUZ eşdeğerden pahalıysa "Tutarsız". Çok satır yakalar ama gürültülü (lüks kampanya vs. ucuz menü). |
| **Katalog Medyan**     | `Ref Medyan`         | Orta yol. Aşırı uçlardan etkilenmez.                                      |
| **Ana Katalog**        | `Ref Ana`            | Providerın `Is Main` (ana) katalog fiyatını referans alır.               |

Karşılaştırma (her satır için):

    R = seçilen referans değeri
    Fiyat Sonra < R   →  Tutarlı
    Fiyat Sonra ≥ R   →  Tutarsız

Referans değiştirildiğinde sayfa **yeniden çalıştırmadan** kararları anında yeniden hesaplar.

---

## 5. Karar (Sonuç) ve Nedenler

Her kampanya satırı üç sonuçtan birini alır:

| Sonuç                | Koşul                                                                 |
|----------------------|----------------------------------------------------------------------|
| **Tutarlı**          | Karşılaştırılabilir ve `Fiyat Sonra < Referans`.                     |
| **Tutarsız**         | Karşılaştırılabilir ve `Fiyat Sonra ≥ Referans`.                     |
| **Karşılaştırılamaz**| Karşılaştırma yapılamadı (aşağıdaki nedenlerden biri).               |

**Karşılaştırılamaz nedenleri** (`Neden` kolonu):

- `Fiyat yok (Hediye/Taksit)` — kampanyada sayısal `Fiyat Sonra` yok (İndirim
  dışı kampanyalar fiyat taşımaz).
- `Provider katalogda yok` — provider aktif katalogda bulunamadı.
- `Aynı birim/para biriminde katalog fiyatı yok` — provider katalogda var ama
  kampanyanın birim/para birimine uygun katalog fiyatı yok.
- `Referans fiyat yok` — seçilen referans için değer yok (örn. **Ana Katalog**
  seçildi ama providerın o birimde `Is Main` fiyatı yok).

> Önemli: Referans tipi değiştikçe bazı satırlar "Referans fiyat yok" nedeniyle
> Karşılaştırılamaz'a düşebilir (özellikle Ana Katalog'da).

---

## 6. Sayım (Counting) Tipleri

Kartlardaki sayılar, seçilen **"Sayım bazı"na** göre hesaplanır.

### 6.1 Kampanya bazlı (varsayılan)

Her kampanya tek başına sayılır. Kartlar: kaç kampanya Tutarlı/Tutarsız/
Karşılaştırılamaz. Yüzde = kampanya sayısı / toplam kampanya.

### 6.2 Provider bazlı (3 alt mod)

Önce her provider için kampanyaları gruplanır:
- `karşılaştırılabilir` = o providerın Tutarlı + Tutarsız kampanya sayısı
  (Karşılaştırılamaz kampanyalar sayılmaz).
- Provider'ın **skoru** moda göre hesaplanır:

| Alt mod                                   | Provider skoru                              |
|-------------------------------------------|---------------------------------------------|
| **Provider — en az 1 tutarlı** (esnek)    | En az bir Tutarlı kampanya varsa **1**, yoksa **0** |
| **Provider — oran (1/3)** (orantılı)      | `tutarlı / karşılaştırılabilir` (kesirli, örn. 1/3 = 0,33) |
| **Provider — tutarsız varsa tutarsız** (katı) | Hiç Tutarsız yoksa **1**, en az bir Tutarsız varsa **0** |

Kart toplamları:

    Tutarlı  = Σ skor               (tüm karşılaştırılabilir provider'lar)
    Tutarsız = Σ (1 − skor)
    Karşılaştırılamaz = hiç karşılaştırılabilir kampanyası olmayan provider sayısı
    Toplam (Tümü) = toplam provider sayısı

Her zaman: `Tutarlı + Tutarsız + Karşılaştırılamaz = Toplam provider`.
Orantılı modda Tutarlı/Tutarsız **kesirli** olabilir (örn. 412,7).

#### Örnek (4 provider)

| Provider | Karşılaştırılabilir | Tutarlı | Tutarsız |
|----------|---------------------|---------|----------|
| A        | 3                   | 2       | 1        |
| B        | 2                   | 0       | 2        |
| C        | 1                   | 1       | 0        |
| D        | 0 (hepsi Karş.)     | 0       | 0        |

| Mod         | Tutarlı | Tutarsız | Karş. | Toplam |
|-------------|---------|----------|-------|--------|
| Esnek       | 2,00    | 1,00     | 1     | 4      |
| Orantılı    | 1,67    | 1,33     | 1     | 4      |
| Katı        | 1,00    | 2,00     | 1     | 4      |

(Esnek: A,C en az 1 tutarlı → 2; B → tutarsız. Katı: A,B tutarsız içerir → 0;
C temiz → 1. Orantılı: A=2/3, B=0, C=1 → 1,67.)

---

## 7. Kartlar, Yüzdeler ve Tablo

- Her kartta **sayı + yüzde** gösterilir (örn. `2017  56,6%`).
- Yüzde, toplam üzerinden hesaplanır (kampanya modunda toplam kampanya, provider
  modunda toplam provider).
- Bir karta tıklamak tabloyu o **kampanya sonucuna** göre filtreler (kampanya
  seviyesinde). Provider modunda tablo **provider'a göre gruplanır**: her grup
  başlığında provider adı ve provider seviyesindeki etiketi görünür
  (örn. `· 2/3 tutarlı`, `· Tutarsız`, `· Karşılaştırılamaz`).
- Tablo en çok 400 satır gösterir; tamamı `Fiyat_Tutarlılık_Kıyas` sekmesindedir.

---

## 8. Filtreler (Çoklu Boyut + Çoklu Değer)

- İstediğin kadar **filtre satırı** eklenir ("+ Filtre ekle").
- Her satır: bir **boyut** (kolon) seç → o boyutun değerlerinden **birden çok**
  seçeneği işaretle.
- Mantık: **satırlar arası VE**, **satır içi VEYA**.
  (Örn. *Kategori ∈ {Kır Düğünü, Otel Düğünü}* **VE** *Şehir ∈ {İstanbul}*.)
- Boyutlar: Kategori, Şehir, Tür, Birim, **Dönem**, Para, Etiket, Provider, Sonuç.
  ("Sonuç" boyutu seçilen referansa göre canlı değişir.)

---

## 9. Kıyas Sekmesi Kolonları

`Fiyat_Tutarlılık_Kıyas` sekmesi şu yapıdadır:

1. **Meta satırı:** `Güncelleme: <tarih>`, `Katalog satır: <n>`, `Kampanya satır: <m>`
2. **Başlık satırı** + veri satırları:

`Provider Id`, `Provider Adı`, `Kategori`, `Şehir`, `Kampanya Id`, `Tür`,
`Etiket`, `Birim`, `Dönem`, `Para`, `Fiyat Önce`, `Fiyat Sonra`, `Ref Min`, `Ref Max`,
`Ref Medyan`, `Ref Ana`, `Ref Adet`, `Sonuç`, `Neden`, `Intro`.

> Sayfa, açılışta bu sekmeyi okuyup satırları yeniden kurar; bu sayede referans
> ve sayım seçimleri yeniden çalıştırmadan canlı değişir.

---

## 10. Varsayımlar ve Sınırlar

- **Birim metinden çıkarılır.** Kampanya birimi `Intro`'daki "Kişi Başı"
  ifadesine dayanır; ifade yoksa "Paket" varsayılır.
- **Tam ürün/menü eşleşmesi yapılmaz.** Kampanya metni ile katalog menü adı
  çoğunlukla birebir tutmadığı (~%27) için kampanya, belirli bir menüye değil,
  **aynı birimdeki katalog fiyat aralığına** eşlenir. Referans tipi bu yüzden seçilebilir.
- **Para birimi eşleşmeli.** Farklı para birimindeki katalog fiyatları referans olmaz.
- **Yalnız İndirim kampanyaları karşılaştırılır.** Hediye/Taksit kampanyalarında
  fiyat olmadığı için Karşılaştırılamaz olurlar.
- **Fiyat Önce güvenilmez** olduğu için referans olarak kullanılmaz.
- **Hafta içi/sonu (Dönem)** kampanya metninden okunur ve referans havuzunu
  daraltır (bkz. 3.4); uygun dönem yoksa tüm dönemlere düşülür.
