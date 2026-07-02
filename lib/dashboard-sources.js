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
    selections: [],
  },
  {
    key: "provider_segment",
    label: "Provider segment (All Provider — aktif)",
    // "General" app'te bir NESNE değil, veri modeli ALANLARI: 2 alanlık geçici
    // hypercube (fetchFieldsData). is_currently_listing=1 → yalnız aktif provider
    // (113.998 → 2355). Dashboard_Firma ile provider_id_master ↔ RÇİ üzerinden
    // birleştirilir (pipeline.js). Sadece bu 2 kolon yazılır.
    appId: GENERAL_APP_ID,
    fields: ["provider_id_master", "provider_segment"],
    tab: "Dashboard_Provider_Segment",
    selections: [{ field: "is_currently_listing", value: "1" }],
  },
  {
    key: "provider_flag",
    label: "Provider flag geçmişi (Provider_Flag_Old)",
    // ELLE doldurulmuş statik sekme (Qlik YOK): 2025-07…2026-06, ayın 15'i, provider
    // flag geçmişi (renk Yeşil/Sarı/Turuncu/Kırmızı + binary flag'ler). Yenileme analizinde
    // "Provider ID" + ay ile eşlenir. run route atlar (static), data route sekmeyi okur.
    tab: "Provider_Flag_Old",
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
