# Performans Yönetimi

Qlik Cloud verisini Google Sheets'e aktaran, PowerPoint sunum üreten ve fiyat
tutarlılığını denetleyen iç araç (Next.js 14 App Router, Vercel).

Tüm sayfalar Google girişi (izinli e-posta listesi) arkasındadır. Giriş ana
sayfadadır; giriş yapılmadan hiçbir araca/endpoint'e erişilemez.

## Araçlar

Ana sayfa (`/`) = giriş + "Performans Yönetimi" hub'ı. Hub iki araca bağlanır:

### 1) Provider Aktarımı & Sunum
- `/provider` — müşteri ID gir → `GET /api/qlik/export`.
  Engagement uygulamasından sözleşme verisini çeker ("Sozlesme" sekmesi),
  önceki sözleşme bitişinden 7 gün öncesini geçen-yıl tarihi seçer, ana
  uygulamadan bu yıl + geçen yıl tüm sütunları çekip YoY olarak ana sekmeye yazar.
  Dönüş süreleri (ortalama + medyan) engagement objesinden gelir.
- `/rapor` — `POST /api/sheet/preview` ile Sheet'ten okur, düzenlenir
  (sürükle-bırak sıralama, medyan/ortalama seçici), `POST /api/generate-deck`
  (Python, `api/generate-deck.py`) ile `template.pptx` üstüne basıp `.pptx` indirir.

### 2) Fiyat Tutarlılık
- `/fiyat-tutarlilik` — açılışta son veriyi `GET /api/fiyat/data` ile gösterir;
  "Çalıştır" `GET /api/fiyat/run` ile pipeline'ı tetikler.
  Katalog + kampanya objelerini (aktif provider filtreli) okur, üç sekmeye yazar
  (`Fiyat_Tutarlılık_Catalog/Campaign/Kıyas`). Kampanya birimi metinden
  (Kişi Başı/Paket) belirlenir; `provider_id` + birim + para birimi ile eşleşip
  kampanya fiyatı katalog referansından düşükse Tutarlı, değilse Tutarsız sayılır.
  Referans (Max/Min/Medyan/Ana) ve boyut filtresi sayfada canlı değişir.

## Mimari

    Tarayıcı → /api/* (sunucu) → Qlik Engine (enigma.js/ws) + Google Sheets API

API key ve Google kimlik bilgileri yalnızca sunucu tarafında (env) tutulur.
Qlik bağlantısı `lib/qlik.js`, Sheets `lib/sheets.js`, fiyat mantığı `lib/fiyat.js`.

## Kurulum

1. `npm install`
2. `.env.local` doldur (aşağıdaki değişkenler) ve `npm run dev`

### Ortam değişkenleri

    # Qlik (ana uygulama)
    QLIK_TENANT_HOST, QLIK_APP_ID, QLIK_OBJECT_ID, QLIK_API_KEY
    # Engagement (sözleşme/dönüş süresi) — aynı tenant + API key
    ENGAGEMENT_APP_ID, ENGAGEMENT_OBJECT_ID
    # Fiyat Tutarlılık (FIYAT_APP_ID yoksa ENGAGEMENT_APP_ID kullanılır)
    FIYAT_CATALOG_OBJECT_ID, FIYAT_CAMPAIGN_OBJECT_ID  (ops: FIYAT_APP_ID)
    # Google Sheets (Service Account)
    GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB,
    GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    # Auth (NextAuth v5)
    AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_TRUST_HOST

İzinli e-postalar `izinli-mailler.js` dosyasında. Google Sheet, Service
Account e-postasına **Editör** olarak paylaşılmalıdır.

## Vercel

Repo'yu bağla, tüm env değişkenlerini ekle. Python fonksiyonu (`api/generate-deck.py`,
`template.pptx` dahil) `vercel.json` ile yapılandırılmıştır; `requirements.txt`
`python-pptx` kurar. `.env.local` deploy edilmez.
