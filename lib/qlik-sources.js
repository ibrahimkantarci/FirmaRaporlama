// lib/qlik-sources.js
// ───────────────────────────────────────────────────────────────────────────
// QLIK APP/OBJECT ID'LERİ — TEK GERÇEK KAYNAK (single source of truth).
// Bu ID'ler GİZLİ DEĞİLDİR (qlik_map.xlsx'te ve repoda zaten görünür); bu yüzden
// env/Vercel yerine sürüm kontrollü olarak BURADA tutulur ve burası YETKİLİDİR
// (env ile geçersiz kılınmaz — eski/yanlış bir env değeri prod'u bozamasın diye).
//
// Bir Qlik objesi/uygulaması "republish" edilince ID DEĞİŞİR → uygulama
// "Object not found" (code -2) hatası verir. Düzeltmek için: aşağıdaki ilgili
// ID'yi güncelle + push.bat çalıştır. VERCEL'E DOKUNMAYA GEREK YOK.
//
// Env'de kalan TEK Qlik değişkenleri (gerçek bağlantı sırları):
//   QLIK_TENANT_HOST, QLIK_API_KEY
//
// ID doğrulama tekniği: bkz. memory/qlik-object-ids (enigma.js ile getObject +
// doc.getAllInfos() → mevcut obje ID'lerini ve kolon başlıklarını listele).
// ───────────────────────────────────────────────────────────────────────────

// "General" app — engagement, fiyat (katalog/kampanya) ve dashboard onboarding
// objelerini barındırır.
const GENERAL_APP = "ce318523-86fc-4e8d-bcf5-55bc22fb56e8";

// "Providers - PY" app — ana YoY rapor tablosunu barındırır.
const PROVIDERS_PY_APP = "670d9666-a22a-4177-8dfb-6f7013190c10";

export const QLIK_SOURCES = {
  // Firma Raporlama — ana rapor (bu yıl + geçen yıl tüm sütunlar; RÇİ ile eşleşir)
  main: {
    appId: PROVIDERS_PY_APP,
    objectId: "b450a147-eb35-4c31-ba7e-f2a8841eb68d", // 55 kolonlu tablo
  },
  // Engagement — sözleşme tablosu + provider dönüş süreleri (ort/medyan)
  engagement: {
    appId: GENERAL_APP,
    objectId: "f53312a1-67d9-4b55-8472-6e0b07b9eb4d",
  },
  // Fiyat Tutarlılık — katalog + kampanya objeleri (ikisi de General app'te)
  fiyat: {
    appId: GENERAL_APP,
    catalogObjectId: "d6ea8904-0390-4c77-9026-87a94d1153ea",
    campaignObjectId: "d42a0869-b5c5-4bdf-b9f6-c7c084d365dd",
  },
};

// Dashboard kaynakları (lib/dashboard-sources.js) için paylaşılan General app ID.
export const GENERAL_APP_ID = GENERAL_APP;
