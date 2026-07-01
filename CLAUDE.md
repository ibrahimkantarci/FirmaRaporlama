# CLAUDE.md — Proje Rehberi

Bu dosya, projeyi devralan herhangi bir Claude Code oturumu için giriş noktasıdır.
Detaylı belgeler: [README.md](README.md) (genel) ve
[FIYAT_TUTARLILIK.md](FIYAT_TUTARLILIK.md) (fiyat tutarlılık mantığı, derin).

## Ne işe yarar

"Performans Yönetimi" — Düğün.com için iç araç (Next.js 14 App Router, Vercel).
Qlik Cloud verisini Google Sheets'e aktarır, PowerPoint sunum üretir ve fiyat
tutarlılığını denetler. Türkçe arayüz/veri.

## Üç araç (hub mimarisi)

Ana sayfa `/` = Google girişi (çıkışta) + hub (girişte). Hub iki araca bağlanır:

1. **Provider Aktarımı & Sunum**
   - `/provider` ([app/provider/page.js](app/provider/page.js)) → `GET /api/qlik/export`:
     Engagement app'ten sözleşme verisi ("Sozlesme" sekmesi), önceki sözleşme
     bitişi − 7 gün = geçen-yıl tarihi, ana app'ten YoY tüm sütunlar → ana sekme.
     Dönüş süreleri (ort/medyan) engagement'tan; dönem toplamları gerçek Qlik
     grand total (`qGrandTotalRow`).
   - `/rapor` ([app/rapor/page.js](app/rapor/page.js)) → `POST /api/sheet/preview`
     ile Sheet'ten okur; sürükle-bırak sıralama, medyan/ortalama toggle (2 adet:
     venue + toplam), banner; `POST /api/generate-deck` (Python
     [api/generate-deck.py](api/generate-deck.py), `template.pptx`) ile `.pptx` üretir.
     Dönüş biçimi "X saat Y dakika"; toplam dönüş = Qlik grand total (yedek: Teklif
     ağırlıklı ortalama).

2. **Fiyat Tutarlılık** — `/fiyat-tutarlilik`
   ([app/fiyat-tutarlilik/page.js](app/fiyat-tutarlilik/page.js)) → `/api/fiyat/run`
   (çalıştır), `/api/fiyat/data` (açılışta son veri), `/api/fiyat/settings` (kullanıcı
   ayarları). Mantığın tamamı **FIYAT_TUTARLILIK.md**'de. Özet: aktif provider'ların
   katalog↔kampanya (yalnız İndirim) fiyatlarını `provider_id + birim + para + dönem`
   ile eşler, kademeli (Kalem→Tip→Referans) referans havuzundan Max/Min/Medyan ile
   Tutarlı/Tutarsız/Karşılaştırılamaz kararı verir.

## Dosya / rota haritası

    app/
      page.js                      / (login + hub)
      provider/page.js             /provider
      rapor/page.js                /rapor
      fiyat-tutarlilik/page.js     /fiyat-tutarlilik
      export-tool.js               provider sayfasının client aracı
      api/auth/[...nextauth]/      NextAuth
      api/qlik/export/             engagement + YoY → Sheets
      api/sheet/preview/           rapor için Sheet bloğu okuma
      api/fiyat/{run,data,settings}/  fiyat pipeline + ayarlar
    api/generate-deck.py           Python pptx (Vercel fn), api/template.pptx
    lib/qlik.js                    Qlik (enigma.js/ws) — yalnız sunucu
    lib/sheets.js                  Google Sheets (yaz/oku/overwrite/ayarlar)
    lib/fiyat.js                   fiyat eşleştirme/karar mantığı (saf)
    auth.js                        NextAuth v5 (signIn "/")
    izinli-mailler.js              erişim whitelist'i
    middleware.js                  / hariç her şeyi korur

## Ortam değişkenleri (.env.local + Vercel)

Qlik **app/object ID'leri env'de DEĞİL** — sürüm kontrollü kod config'inde:
**[lib/qlik-sources.js](lib/qlik-sources.js)** (ana rapor, engagement, fiyat) +
**[lib/dashboard-sources.js](lib/dashboard-sources.js)** (dashboard). Bu dosyalar
YETKİLİDİR (env override yok). Obje republish → ID değişir → ilgili config satırını
güncelle + `push.bat`; **Vercel'e dokunma**. (ID'ler gizli değil; sırlar API key/key'ler.)

    # Qlik bağlantı (yalnız bunlar env'de — gerçek sırlar)
    QLIK_TENANT_HOST, QLIK_API_KEY
    # Google Sheets (Service Account)
    GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB,
    GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    # Auth
    AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_TRUST_HOST
    # Erişim/yetki (opsiyonel)
    ADMIN_EMAILS  (virgülle ayrık; varsayılan ibrahim.kantarci@dugun.com)

## Sheet sekmeleri

- `GOOGLE_SHEET_TAB` (ana) — engagement YoY blokları (`Müşteri: <id>` meta satırı, append)
- `Sozlesme` — engagement sözleşme tablosu (append)
- `Fiyat_Tutarlılık_Catalog` / `_Campaign` / `_Kıyas` — fiyat pipeline (overwrite)
- `Fiyat_Ayarlar` — kullanıcı bazlı UI ayarları (e-posta → JSON)
- `Erişim` — araç erişim matrisi (satır = e-posta, sütun = araç adı, hücre ✓/1/x)
- `Dashboard_Onboarding` — dashboard onboarding pipeline (overwrite)

## Kimlik / erişim

- Giriş ana sayfada (Google). Whitelist: **[izinli-mailler.js](izinli-mailler.js)** —
  üye eklemek için e-posta ekle + `push.bat`. Liste boşsa canlıda kimse giremez.
  (Bu = kimlik DOĞRULAMA: kim giriş yapabilir.)
- Middleware `/` hariç tüm sayfa ve API'leri korur; girişsiz erişim `/`'a yönlenir.
- **Araç erişimi (YETKİLENDİRME — RBAC):** per-kullanıcı × per-araç matrisi Google
  Sheet'te **"Erişim"** sekmesinde (satır = e-posta, sütun = araç adı, hücre ✓/1/x/evet).
  Araç tanımları tek kaynaktan: **[lib/registry.js](lib/registry.js)** (`TOOLS`,
  `toolKeyForPath`). Erişim mantığı: **[lib/access.js](lib/access.js)** (cache'li Sheet
  okuma + admin fail-safe). Koruma katmanları: sayfalar `requireToolAccess(key)`
  (client sayfalar `layout.js` ile), API'ler `withAccess(key, handler)`
  (**[lib/api.js](lib/api.js)**). Hub yalnız erişilebilen araçları gösterir.
  `ADMIN_EMAILS` env'indeki adresler Sheet boş/bozuk olsa bile tam erişir
  (kilitlenme yok; varsayılan **ibrahim.kantarci@dugun.com**).

## Konvansiyonlar / tuzaklar

- **Türkçe İ:** küçük harfe çevirirken `toLocaleLowerCase("tr")` kullan (regex eşleşmeleri için kritik).
- **Fiyatlar qNum'dan okunur** (`fetchObjectData(..., {withNum:true})`); biçimli qText
  ("1.500" gibi) güvenilmez.
- **Qlik yalnız sunucu** (`runtime = "nodejs"`); enigma.js + ws Edge'de çalışmaz.
- `withQlikDoc(appId, cb)` herhangi bir app'i açar; engagement ve fiyat aynı app'tedir.
- Build kontrolü: `npm run build`. Python: `python -m py_compile api/generate-deck.py`.
- **Deploy:** `push.bat` (git add -A → commit → push; Vercel otomatik deploy).
  Silmeleri de stage'ler. Yeni env değişkenlerini Vercel'e de eklemeyi unutma.

## Durum / sonraki adımlar (2026-07-01)

Dört araç kurulu, build temiz, her şey commit+push edilmiş (Vercel'de).

**Dashboard pipeline (aktif çalışma alanı):** `/dashboard` gömülü vendor HTML'i
(`public/b2b-dashboard.html`) DEĞİŞTİRİLMEZ — tüm veri + özel render
`public/dashboard-pipeline.js`'e (iframe'e enjekte, [app/dashboard/dashboard-panel.js](app/dashboard/dashboard-panel.js))
+ `app/api/dashboard/{run,data}` + `lib/dashboard-sources.js`'e konur. Bağlı kaynaklar:
onboarding, firma (Providers-PY), çağrı (PY Sonitel, artımlı append), yenileme
(harici canlı URL `RENEWAL_DATA`). Kalan: **Custom Pivot** (pivot obje, özel okuyucu gerekir).

**⚠️ Kullanıcının yapması gerekenler / doğrulama:**
1. Çağrı `Arama_Ham` sekmesi eski hatalı kodda kazara çift yüklendi → sekmeyi SİL/temizle
   + "Qlik'ten yenile" → temiz tam yükleme (17.813). Fix deployda.
2. Prod'da doğrula (Claude tarayıcı/creds ile test edemedi): Firma Raporlama,
   Fiyat (yalnız güncel kampanya/katalog), dashboard yenile, **Genel Analiz yenileme paneli (YENİ, test edilmedi)**.

**Not:** Qlik app/object ID'leri artık `lib/qlik-sources.js` + `lib/dashboard-sources.js`'te
(env'de DEĞİL). Yeni Qlik objesi eklerken kolon başlıkları aday listeleriyle eşlenir;
eşleşmezse "eşleşmeyen kolon" uyarısı — gerçek başlığı ekle. Detaylı devir: memory/[[handoff-current-state]].
