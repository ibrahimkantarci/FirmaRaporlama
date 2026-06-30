// Dashboard veri kaynakları — Qlik app/object eşlemesi (qlik_map.xlsx'ten).
// Bu ID'ler gizli DEĞİL (gizli olan QLIK_API_KEY env'dedir); burada tutulur.
// Akış: her kaynak bir Qlik objesini okur → bir Google Sheet sekmesine yazar →
// dashboard sekmeden JSON olarak okuyup kendi mapRow(...) mantığıyla işler.
//
// Yeni sayfa eklemek: buraya { key, appId, objectId, tab, selections } ekle ve
// dashboard-pipeline.js içine ilgili enjeksiyon bloğunu koy.
import { GENERAL_APP_ID } from "./qlik-sources";

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
];

export const SOURCE_BY_KEY = Object.fromEntries(DASHBOARD_SOURCES.map((s) => [s.key, s]));

// ── Henüz bağlanmamış kaynaklar (qlik_map.xlsx referansı — xlsx silindi) ─────
// İlgili sayfanın transform mantığı netleşince yukarıdaki diziye eklenecek.
//   App "General"            ce318523-86fc-4e8d-bcf5-55bc22fb56e8  (= GENERAL_APP_ID)
//     └ obj Providers-Onboarding  dea6f184-6024-4407-aae6-7d39f461f1dd  ✓ bağlı (üstte)
//   App "Providers - PY"     670d9666-a22a-4177-8dfb-6f7013190c10  (= ana rapor app)
//     └ obj Firmalar              4a681953-8860-4516-af1d-82aa5d84cb95  → Performans/Yenileme
//   App "PY Sonitel"         c1b56893-6c64-45fe-8624-2d4891707f5b
//     └ obj Py Aramaları Ham Veri xPejmm                                → Çağrı Analizi
//   App "Executive Dashboard" 3e66f065-9c5d-4d10-8454-9125686c72e8
//     └ obj Custom Pivot         pLpbvq  (PIVOT — fetchObjectData düz tablo okur; özel okuyucu gerekir)
