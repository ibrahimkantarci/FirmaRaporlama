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
