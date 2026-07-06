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
- `Dashboard_Onboarding_Sozlesme` — onboarding sözleşme geçmişi (yeni/yenileme sınıflaması; overwrite)
- `Dashboard_Firma` / `Arama_Ham` (append) — firma performans / çağrı ham veri
- `Provider_Flag_Old` (elle+arşiv, tarihi flag) / `Provider_Flag` (güncel flag, overwrite)
- `Dashboard_Yenileme` — RENEWAL_DATA cache (açılış hızı; overwrite) · `Dashboard_Meta` — son sync zamanı

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

## Durum / sonraki adımlar (2026-07-06)

Build temiz, `main`==`origin/main` (Vercel'de). Aktif alan = **Dashboard** (`/updated-hq`; `/dashboard` legacy).

**Dashboard — İKİ gömülü HTML + pipeline enjeksiyonu:**
- `public/b2b-dashboard-updated.html` (`/updated-hq`, **takımın AKTİF geliştirdiği**) + `public/b2b-dashboard.html`
  (`/dashboard`, legacy). `public/dashboard-pipeline.js` İKİSİNE de enjekte edilir
  ([app/updated-hq/dashboard-panel.js](app/updated-hq/dashboard-panel.js) vb.).
- ⚠️ Takım updated HTML'i doğrudan commit ediyor → **HER deploy'dan önce `git pull --rebase origin main`**
  (bu oturumda 4 kez, hep temiz). Pipeline override'ları takım HTML'iyle çakışabilir → **pull sonrası
  dokunacağın fonksiyon/id'leri grep'le teyit et.**
- ⚠️ **Vendor HTML'de `firma_id` = MÜŞTERİ İD** (provider RÇİ ezilir); provider id `m.provider_id`'de
  KORUNUR. Çağrılar müşteri seviyesinde (1 müşteri çok provider ama tek PY).
- Veri: `app/api/dashboard/{run,data,status}` + `lib/dashboard-sources.js`. **7 kaynak**: onboarding,
  **onboarding_sozlesme** (f53312a1, yeni/yenileme sınıflaması), firma, cagri (xPejmm, "IB OB"=yön),
  provider_flag (statik Old, prune'landı), **provider_flag_current** (Executive Dashboard 3e66f065/
  97ca7303, latest ph_flag_date), yenileme (RENEWAL_DATA, `cacheTab:Dashboard_Yenileme`).
- **run route**: `?except=yenileme`+`?only=yenileme` İKİ PARALEL çağrı (120sn limit); `?action=prune_flag_old`
  tek-seferlik; Dashboard_Meta'ya updatedAt. **data route** PARALEL okur + sendCols kolon diyeti.

**⚠️ Doğrulama / kalan:**
1. Deploy sonrası prod'da "⟳ Qlik'ten yenile" (yeni sekmeler dolsun) + panelleri gözle doğrula.
2. Custom Pivot (Qlik pivot `pLpbvq`) hâlâ okunmuyor — düşük öncelik (UI custom pivot AYRI, yapıldı).
3. Claude **canlı veriyle mantık doğrular** (.env.local): Qlik enigma probe (proje köküne `zz*.mjs`) +
   googleapis Sheets. TUZAK: heredoc YAZMA → **Write tool**. Arama_Ham UNFORMATTED=Excel seri no.

**Not:** Qlik ID'leri `lib/qlik-sources.js`+`lib/dashboard-sources.js`'te (env değil). Deploy =
`git add -A && git commit && git push origin main` (push.bat `pause`'da takılır). Kronolojik tam devir:
memory/[[handoff-current-state]] (READ FIRST) + [[dashboard-tool]] (en alt=en yeni).
