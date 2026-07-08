// Dashboard veri kaynakları — Qlik app/object eşlemesi (qlik_map.xlsx'ten).
// Bu ID'ler gizli DEĞİL (gizli olan QLIK_API_KEY env'dedir); burada tutulur.
// Akış: her kaynak bir Qlik objesini okur → bir Google Sheet sekmesine yazar →
// dashboard sekmeden JSON olarak okuyup kendi mapRow(...) mantığıyla işler.
//
// Yeni sayfa eklemek: buraya { key, appId, objectId, tab, selections } ekle ve
// dashboard-pipeline.js içine ilgili enjeksiyon bloğunu koy.
import { GENERAL_APP_ID, PROVIDERS_PY_APP_ID } from "./qlik-sources";

// "PY Sonitel" app — çağrı (arama) ham verisi. Yalnız dashboard kaynağı.
const PY_SONITEL_APP = "c1b56893-6c64-45fe-8624-2d4891707f5b";

// HIZ: data route yalnız bu kolonları gönderir (payload diyeti; sekmede hepsi durur).
// Flag sekmeleri 32 kolon ama dashboard yalnız Provider ID + Date + 9 flag kullanır.
const FLAG_SEND_COLS = [
  "Date", "Provider ID", "Provider Health Flag", "Campaign Flag", "Gallery Flag",
  "Last Seen Flag", "Lead Count Flag", "Response Rate Flag", "Response Time Flag",
  "Review Flag", "CR Flag",
];
// Çağrı: pipeline'ın eşlediği 9 kolon (Kullanıcı ID/Telefon/Çalma Süresi/Kampanya kullanılmıyor).
const CAGRI_SEND_COLS = [
  "Arama Tarihi", "sonitel_call_log_id", "Arayan PY", "Müşteri ID", "Kullanıcı Adı",
  "Kullanıcı Tipi", "Konuşma Süresi", "Arama Tipi", "IB OB",
];

// HIZ: firma "Firmalar" objesi 56 kolon ama dashboard ~36 kullanıyor. Sheet'e YAZMADAN önce
// bu teyitli-kullanılmayan 20 kolon düşer (yazma + açılışta okuma küçülür). DENYLIST seçildi
// (whitelist değil) ki takım ileride FIRMA_MAP'e yeni kolon eklerse OTOMATİK korunsun (fail-safe);
// yalnız burada AÇIKÇA listelenen boş kolonlar düşer. Join kolonları (provider_segment,
// Aktif Özel Fiyat) listede olmadığından korunur. Başlıklar objedeki GERÇEK adlarla birebir
// (canlı probe 2026-07-08); "Leadpool+Multi  Teklif" iki boşluk içerir (aynen).
const FIRMA_DROP_COLS = [
  "Söz. Kodu", "Söz. Tarihi", "Söz. Tipi", "Söz. Notu", "Ürün Id", "Durduruldu",
  "Garantili Satış", "Leadpool+Multi  Teklif", "WP Teklifi", "Sonuç Kodlu Teklif",
  "Sonuç Kodsuz Teklif", "Hızlı Dönülen Teklif Sayısı", "Galeri Ziyareti",
  "Başarısız Ödeme Miktarı", "Başarısız Ödeme Adedi", "İptal Edilen Ödeme",
  "Başarılı Ödeme Sayısı", "Liste Fiyatı", "Son Başarılı Ödemeden Sonra Geçen Gün",
  "Son Başarılı Ödemenin Ödenmesi Gereken Tarihinden Geçen Gün",
];

// HIZ: onboarding sözleşme objesi 14 kolon ama pipeline yalnız 4'ünü kullanır (yeni/yenileme
// sınıflaması: Provider Id + Is Current Product + Product Start + Product End). Yazarken bunları TUT.
const SOZLESME_KEEP_COLS = ["Provider Id", "Is Current Product", "Product Start", "Product End"];

export const DASHBOARD_SOURCES = [
  {
    key: "onboarding",
    label: "Onboarding firmaları",
    // "General" app → "Providers-Onboarding" objesi (qlik_map.xlsx)
    appId: process.env.DASHBOARD_ONBOARDING_APP_ID || GENERAL_APP_ID,
    objectId: process.env.DASHBOARD_ONBOARDING_OBJECT_ID || "dea6f184-6024-4407-aae6-7d39f461f1dd",
    tab: "Dashboard_Onboarding",
    // Qlik'te önce uygulanacak seçimler (gerekiyorsa). Örn: [{ field: "is_active", value: "1" }]
    selections: [],
  },
  {
    key: "onboarding_sozlesme",
    label: "Onboarding sözleşme geçmişi (yeni/yenileme sınıflaması)",
    // "General" app → sözleşme objesi. Kolonlar: Provider Id, Is Current Product (1/0),
    // Product Start, Product End … Seçimsizken 0 satır + 114k+ provider olduğundan,
    // yalnız onboarding provider'larına indirilir: Dashboard_Onboarding'deki "Provider Id"
    // kolonundan id'ler okunur → Qlik'te toplu seçilir (selectMultiple) → çekilir.
    appId: GENERAL_APP_ID,
    objectId: "f53312a1-67d9-4b55-8472-6e0b07b9eb4d",
    tab: "Dashboard_Onboarding_Sozlesme",
    filterByTabColumn: { tab: "Dashboard_Onboarding", col: "Provider Id", field: "provider_id" },
    // HIZ: yalnız kullanılan 4 kolonu yaz (obje 14 kolon).
    writeKeepCols: SOZLESME_KEEP_COLS,
    selections: [],
  },
  {
    key: "firma",
    label: "Firma performans (Providers-PY)",
    // "Providers - PY" app → "Firmalar" objesi (56 kolon). Dashboard: Performans +
    // Yenileme (fallback) + Alarm + Genel Analiz → S.firmalar (FIRMA_MAP + calcFlag).
    appId: PROVIDERS_PY_APP_ID,
    objectId: "4a681953-8860-4516-af1d-82aa5d84cb95",
    tab: "Dashboard_Firma",
    // Snapshot tablosu: seçimsizken satır sayısı kararsız (2355 vs 3370). En yeni
    // load_date'e sabitle → deterministik 2355 firma (güncel snapshot). clearAll dahil.
    latestDateField: "load_date",
    // Sayısal hücreleri ham sayı olarak yaz (biçimli "11.332" TL değerlerinde
    // dashboard'ın 1000× hatasını önler); tarih/yüzde metinleri korunur.
    numeric: true,
    // HIZ: kullanılmayan 20 kolonu Sheet'e yazmadan önce düş (join kolonları sonra eklenir, korunur).
    writeDropCols: FIRMA_DROP_COLS,
    // provider_segment'i AYNI Dashboard_Firma sekmesine KOLON olarak ekle (ayrı sheet YOK):
    // General app'ten provider_id + provider_segment (is_currently_listing=1) çek,
    // firma RÇİ ↔ provider_id ile join → "provider_segment" kolonu eklenir.
    // NOT: Anahtar provider_id (RÇİ ile %100 eşleşir); provider_id_master kanonik/merge
    // sonrası master id olduğundan RÇİ ile yalnız %27 eşleşiyordu (yanlış). Segment değeri
    // her iki id'de de aynı; yalnız join anahtarı provider_id olmalı.
    joinFields: {
      appId: GENERAL_APP_ID,
      selections: [{ field: "is_currently_listing", value: "1" }],
      keyField: "provider_id",
      valueField: "provider_segment",
      joinOn: "RÇİ",
      asColumn: "provider_segment",
    },
    // Aktif özel fiyat: "Executive Dashboard" app'ten (pLpbvq objesinin alanları) en güncel
    // date + has_special_offer=1 seçilir → aktif özel fiyatlı provider_id KÜMESİ. RÇİ üyeliğiyle
    // "Aktif Özel Fiyat" kolonu (Var/Yok) eklenir. Canlı doğrulandı: date=2026-07-05, 731 provider
    // aktif; Dashboard_Firma ∩ = 599/2362 (%25). Kaynak app'e SEÇİM yazılmaz (ephemeral session).
    joinMembership: {
      appId: "3e66f065-9c5d-4d10-8454-9125686c72e8",
      latestDateField: "date",
      selections: [{ field: "has_special_offer", value: "1" }],
      keyField: "provider_id",
      joinOn: "RÇİ",
      asColumn: "Aktif Özel Fiyat",
      presentValue: "Var",
      absentValue: "Yok",
    },
    selections: [],
  },
  {
    key: "cagri",
    label: "Çağrı ham veri (PY Sonitel)",
    appId: PY_SONITEL_APP,
    objectId: "xPejmm",
    tab: "Arama_Ham",
    // ARTIMLI EKLEME (append): 17k+ satırı her sefer çekmemek için yalnız
    // Arama_Ham'daki en büyük id'den YENİ olan çağrılar çekilip eklenir.
    // Yüksek-su-işareti = sonitel_call_log_id (monoton artan, tekil).
    appendById: "sonitel_call_log_id",
    sendCols: CAGRI_SEND_COLS,
    // HIZ: 13 kolonun yalnız 9'u kullanılıyor → ilk-yükleme + prune bakımı bu 9'u yazar.
    // (Append dalı mevcut BAŞLIK sırasına hizalar; prune bir kez 9 kolona indirince appendler
    // otomatik 9 kolonda kalır.) Kullanılmayan: Kullanıcı ID/Telefon/Çalma Süresi/Kampanya.
    writeKeepCols: CAGRI_SEND_COLS,
    // BAKIM (?action=prune_arama_ham): kayan pencere. Coverage panelleri max 90 gün; onboarding
    // "aranmayan firma" analizi daha geriye bakabildiğinden güvenli tampon = 180 gün. Bu kolona
    // göre yaşlandırılır (Arama Tarihi; Excel seri no VEYA "YYYY-MM-DD" — karışık, ikisi de ele alınır).
    pruneDateCol: "Arama Tarihi",
    pruneKeepDays: 180,
    selections: [],
  },
  {
    key: "provider_flag",
    label: "Provider flag geçmişi (Provider_Flag_Old)",
    // ELLE doldurulmuş statik sekme (Qlik YOK): 2025-07…2026-06, ayın 15'i, provider
    // flag geçmişi (renk Yeşil/Sarı/Turuncu/Kırmızı + binary flag'ler). Yenileme analizinde
    // "Provider ID" + ay ile eşlenir. run route atlar (static), data route sekmeyi okur.
    tab: "Provider_Flag_Old",
    static: true,
    sendCols: FLAG_SEND_COLS,
  },
  {
    key: "provider_flag_current",
    label: "Provider flag GÜNCEL (Executive Dashboard, en güncel ph_flag_date)",
    // "Executive Dashboard" app → güncel flag objesi (Provider_Flag_Old ile AYNI kolonlar).
    // ph_flag_date GÜNLÜK; run route en güncel günü seçer → ~2349 aktif provider. Aktif kullanım.
    // Run route AYRICA: bugün ≥ ayın 15'i & bu ayın snapshot'ı Provider_Flag_Old'da yoksa →
    // bu güncel snapshot'ı Old'a arşivler (tarihi veri). archiveToOld ile işaretli.
    appId: "3e66f065-9c5d-4d10-8454-9125686c72e8",
    objectId: "97ca7303-a2da-48f3-889c-3db1523a4d7e",
    tab: "Provider_Flag",
    latestDateField: "ph_flag_date",
    archiveToOld: "Provider_Flag_Old",
    sendCols: FLAG_SEND_COLS,
    // HIZ: obje 32 kolon; yalnız kullanılan 11'ini (2 anahtar + 9 flag) yaz. Arşiv de bu kırpılmış
    // kolonlarla Old'a hizalanır (Old'un ekstra kolonları zaten kullanılmıyor).
    writeKeepCols: FLAG_SEND_COLS,
    selections: [],
  },
  {
    key: "segmentation",
    label: "Firma segmentasyonu (dönem bazlı segment + özel fiyat günü)",
    // ELLE güncellenen Sheet tabı (Qlik YOK). run route ATLAR (static), data route OKUR.
    // Pipeline: provider_id(=RÇİ) + product_ended_ym(=Yenileme Ayı) ile yenileme satırına
    // "Segment" + "Özel Fiyat" kolonu ekler → Genel Analiz kırılım/filtre. Renewal KAYNAK
    // sheet'ine dokunulmaz; bu ayrı tab yalnız OKUNUR. Kolonlar: provider_id,
    // Provider Segmentation, product_started_ym, product_ended_ym, özel fiyatlı gün sayısı.
    // Canlı doğrulandı: RÇİ↔provider_id %100, (RÇİ+ay)↔product_ended_ym %99 eşleşme.
    tab: "Segmentation",
    static: true,
  },
  {
    key: "yenileme",
    label: "Yenileme analizi (ALL_new)",
    // CANLI URL kaynağı (Qlik değil): ayrı Google Sheet'in Apps Script deploy'u.
    // Qlik/Sheet yazımı YOK — /api/dashboard/data her açılışta bu URL'i CANLI çeker.
    // URL env'de (gizli): RENEWAL_DATA. Apps Script doGet ?include=allnew ile
    // data.__ALL_NEW__ (satır nesneleri) döndürür.
    urlEnv: "RENEWAL_DATA",
    urlParams: "include=allnew",
    extract: "__ALL_NEW__",
    // HIZ: Apps Script canlı fetch'i yavaş/kararsız (2-40sn) → "Qlik'ten yenile"de bu
    // sekmeye yazılır (run route), açılışta diğer sekmelerle PARALEL okunur (data route).
    // Sekme boş/yoksa canlı fetch'e düşülür. Tazelik = son "Qlik'ten yenile".
    cacheTab: "Dashboard_Yenileme",
  },
];

export const SOURCE_BY_KEY = Object.fromEntries(DASHBOARD_SOURCES.map((s) => [s.key, s]));

// ── Henüz bağlanmamış kaynaklar (qlik_map.xlsx referansı — xlsx silindi) ─────
// İlgili sayfanın transform mantığı netleşince yukarıdaki diziye eklenecek.
//   App "General"            ce318523-86fc-4e8d-bcf5-55bc22fb56e8  (= GENERAL_APP_ID)
//     └ obj Providers-Onboarding  dea6f184-6024-4407-aae6-7d39f461f1dd  ✓ bağlı (üstte)
//   App "Providers - PY"     670d9666-a22a-4177-8dfb-6f7013190c10  (= ana rapor app)
//     └ obj Firmalar              4a681953-8860-4516-af1d-82aa5d84cb95  ✓ bağlı (key: firma)
//   App "PY Sonitel"         c1b56893-6c64-45fe-8624-2d4891707f5b  (= PY_SONITEL_APP)
//     └ obj Py Aramaları Ham Veri xPejmm                                ✓ bağlı (key: cagri, append)
//   App "Executive Dashboard" 3e66f065-9c5d-4d10-8454-9125686c72e8
//     └ obj Custom Pivot         pLpbvq  (PIVOT — fetchObjectData düz tablo okur; özel okuyucu gerekir)
