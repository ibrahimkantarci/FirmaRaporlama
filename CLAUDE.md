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
    auth.js                        NextAuth v5 tam config (Node): signIn = Sheet "Ana Sayfa" kontrolü
    auth.config.js                 NextAuth Edge-güvenli temel (middleware bunu kullanır)
    lib/access-core.js             erişim matrisi çekirdeği (auth'suz): canAccessHome/Tool, admin
    middleware.js                  / hariç her şeyi korur (Edge; auth.config)

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
- `Segmentation` — ELLE güncellenen firma segmentasyonu (provider_id, Provider Segmentation, product_started/
  ended_ym, özel fiyatlı gün sayısı); `static:true` kaynak, run route atlar, data route okur. (Not: "Aktif
  Özel Fiyat" AYRI sekme değil — `Dashboard_Firma`'ya run route joinMembership ile KOLON olarak eklenir.)

## Kimlik / erişim

- Giriş ana sayfada (Google). **Kim giriş yapabilir artık Sheet'ten** (2026-07-09; `izinli-mailler.js`
  EMEKLİ): "Erişim" sekmesinde **"Ana Sayfa"** kolonu = 1 → giriş+hub açık. `auth.js` `signIn` callback'i
  `canAccessHome`'a sorar ([lib/access-core.js](lib/access-core.js)). Deploysuz yönetim (Sheet edit yeter).
  **Kilitlenme koruması:** `ADMIN_EMAILS` (env, Sheet DIŞINDA) her zaman girer; Sheet okunamazsa non-admin
  fail-closed; "Ana Sayfa" kolonu hiç yoksa listelenen herkes girer (geçiş fallback'i). **Hard-revoke:** Ana
  Sayfa=0 yapılınca aktif oturum (JWT 90g) da düşer — hub (`app/page.js` → RevokedSignOut) +
  `requireToolAccess`/`withAccess` her istekte `canAccessHome`'u kontrol eder (~cache TTL 30sn).
- ⚠️ **Edge/Node split (NextAuth v5):** middleware Edge'de çalışır → `auth.config.js` (googleapis YOK);
  Sheet okuyan `signIn` yalnız `auth.js`'te (Node). `auth.js`↔`access.js` döngüsü `access-core.js` ile kırıldı.
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

## Durum / sonraki adımlar (2026-07-08)

Build temiz, `main`==`origin/main` (Vercel'de). **4 araç:** provider, fiyat, **updatedhq (hub'da "Dashboard")**,
ozelfiyat. ⚠️ **Legacy `/dashboard` KALDIRILDI (2026-07-09):** eski `public/b2b-dashboard.html` + `app/dashboard/`
silindi; "dashboard" araç anahtarı emekli. Rota `/updated-hq` KALDI (link kırılmasın) ama hub'da "Dashboard"
adıyla görünür (key hâlâ `updatedhq`; sayfa + `/api/dashboard/*` artık `["updatedhq","ozelfiyat"]` ile korunuyor).
Erişim: "Erişim" sekmesindeki **"Dashboard" kolonu** → updatedhq'ya eşleşir (headerToToolKey title match); eski
"Updated HQ" kolonu artık ölü (elle silinecek).

**Dashboard — TEK gömülü HTML + pipeline enjeksiyonu:**
- `public/b2b-dashboard-updated.html` (`/updated-hq`, **takımın AKTİF geliştirdiği tek dashboard**).
  `public/dashboard-pipeline.js` buna (+ ozel-fiyat standalone'a) enjekte edilir
  ([app/updated-hq/dashboard-panel.js](app/updated-hq/dashboard-panel.js) vb.).
- ⚠️ Takım updated HTML'i doğrudan commit ediyor → **HER deploy'dan önce `git pull --rebase origin main`**
  (bu oturumda 4 kez, hep temiz). Pipeline override'ları takım HTML'iyle çakışabilir → **pull sonrası
  dokunacağın fonksiyon/id'leri grep'le teyit et.**
- ⚠️ **Vendor HTML'de `firma_id` = MÜŞTERİ İD** (provider RÇİ ezilir); provider id `m.provider_id`'de
  KORUNUR. Çağrılar müşteri seviyesinde (1 müşteri çok provider ama tek PY).
- Veri: `app/api/dashboard/{run,data,status}` + `lib/dashboard-sources.js`. **8 kaynak**: onboarding,
  **onboarding_sozlesme** (f53312a1, yeni/yenileme sınıflaması), **firma** (joinFields provider_segment +
  **joinMembership** "Aktif Özel Fiyat" — Executive Dashboard 3e66f065: en güncel date + has_special_offer=1
  → provider_id kümesi → RÇİ üyeliği Var/Yok), cagri (xPejmm, "IB OB"=yön), provider_flag (statik Old,
  prune'landı), **provider_flag_current** (Executive Dashboard 3e66f065/97ca7303, latest ph_flag_date),
  yenileme (RENEWAL_DATA, `cacheTab:Dashboard_Yenileme`), **segmentation** (elle "Segmentation" tabı,
  `static:true`; pipeline'da yenileme satırına Segment+Özel Fiyat join'lenir → Genel Analiz kırılım/filtre).
- **run route**: `?except=yenileme`+`?only=yenileme` İKİ PARALEL çağrı (120sn limit). ⚠️ **Qlik kaynakları
  DAHA FAZLA paralel BÖLÜNEMEZ** — app paylaşırlar (General: onboarding+sözleşme+firma[joinFields]; Executive:
  provider_flag_current+firma[joinMembership]) → 2 paralel istek aynı app'e seçim atınca Qlik **"Exclusive
  request aborted"** verir. `except=yenileme` = TÜM Qlik SIRALI tek çağrı; yalnız yenileme (Apps Script) ayrı.
  `?action=prune_flag_old` tek-seferlik; Dashboard_Meta'ya updatedAt. joinFields (key→value) + **joinMembership**
  (küme-üyeliği, latestDateField+selections). **data route** PARALEL okur + sendCols kolon diyeti.

**5. araç (takım ekledi):** **`/ozel-fiyat`** = "Özel Fiyat Dinamik - Pelda İçin" (`ozelfiyat` erişim anahtarı;
`withAccess` çoklu-anahtar `["dashboard","ozelfiyat"]`; pelda.cirpan whitelist). `public/ozel-fiyat-standalone.html`
= yalnız Özel Fiyat paneli, aynı `dashboard-pipeline.js` iframe'e enjekte, aynı `/api/dashboard/*`. Kaynağı =
Dashboard_Firma "Aktif Özel Fiyat"=Var firmaları (benim joinMembership kolonum). Özel Fiyat panelinde raw firma
listesi (Provider/Customer ID+Name, Ürün, İl, Kategori, Teklif) + çağrı grafiği paket-bitiş bağımlı & tarih
aralığı filtresi (ana dashboard + standalone SENKRON — ikisine de aynı edit).

**Önceki oturum (2026-07-06) eklenenler:** Çağrı "PY'nin Aradığı Flag Dağılımı" 3-dilimli bar; Onboarding
no-provider dışlama + "mezun-olmamış/toplam" metrik + teklif5 "75/136 firma" + modal firma-tipi filtresi;
Performans kolon-kayması fix + Firma portföyü raw tablo & Segment lead dağılımı KALDIRILDI + Custom Pivot'a Firma
başına/Toplam & Gün başına/Toplam toggle; PY sırası standart (`orderedPY`); Genel Analiz kırılım sadeleştirme;
**Segmentasyon** (8. kaynak) + **Aktif Özel Fiyat** (joinMembership, pLpbvq ÇÖZÜLDÜ). Detay: [[dashboard-tool]].

**⚠️ Doğrulama / kalan:**
1. Deploy sonrası prod'da "⟳ Qlik'ten yenile" (yeni sekmeler/kolonlar dolsun — ör. Aktif Özel Fiyat) + gözle
   doğrula. ⚠️ Kullanıcı deploy BİTMEDEN bakıp "gelmedi" diyebilir → önce Vercel "Deployment completed" teyit.
2. ✅ **pLpbvq ÇÖZÜLDÜ** (obje değil alanları okunuyor: date/has_special_offer/provider_id + fetchFieldsData).
3. Claude **canlı veriyle mantık doğrular** (.env.local): Qlik enigma probe (proje köküne `zz*.mjs`, çalıştır→SİL) +
   googleapis Sheets. TUZAK: heredoc YAZMA → **Write tool**. Arama_Ham/Segmentation tarih UNFORMATTED=Excel seri no.
4. ✅ **ÇÖZÜLDÜ (2026-07-08) — run route optimizasyonu (A+B):** (A) İstek-kapsamlı `docPool` +
   `withPooledDoc` → her app 1× açılır (**7→4 app-open**; General 3×→1×, Executive 2×→1×). Overwrite
   dalı artık KOŞULSUZ `clearAll` (paylaşılan doc'ta seçim sızmasın; onboarding'in seçimi yoktu).
   (B) `applyWriteTrim` → Sheet'e yazmadan kolon kırpar: firma `writeDropCols` (DENYLIST 20 boş kolon,
   fail-safe) 58→38, provider_flag_current `writeKeepCols` 32→11, onboarding_sozlesme `writeKeepCols`
   14→4 → run yazma + dashboard açılış okuma küçülür. Canlı doğrulandı (abort yok, clearAll izolasyon,
   kolon adları eşleşti). Detay: memory/[[dashboard-column-audit]]. Kalan: lean Performans objesi (Qlik ekibi).
5. **Qlik API sınırları:** hypercube okuma bizim sayfalama = `CELL_LIMIT=10000` hücre/istek (lib/qlik.js; Qlik hard
   limiti değil, ayarlanabilir). Qlik Cloud REST + engine-session/rate limitleri plana bağlı (Management Console →
   tenant limits). Bizim gerçek darboğaz: Vercel 120sn fn timeout + Qlik eşzamanlı-seçim serileştirmesi (Exclusive
   request aborted) — bunlar Qlik satır-çekme limiti DEĞİL.

**Not:** Qlik ID'leri `lib/qlik-sources.js`+`lib/dashboard-sources.js`'te (env değil). Deploy =
`git add -A && git commit && git push origin main` (push.bat `pause`'da takılır). Kronolojik tam devir:
memory/[[handoff-current-state]] (READ FIRST) + [[dashboard-tool]] (en alt=en yeni).
