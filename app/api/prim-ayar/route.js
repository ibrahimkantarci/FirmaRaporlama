// app/api/prim-ayar/route.js
// ───────────────────────────────────────────────────────────────────────────
// Prim hesaplama ayarları (ağırlıklar, ödeme eğrisi, SABİT referans eşikler).
// Depo: Google Sheet'te "Prim_Ayar" sekmesi, tek satır:
//   A1:C1 = başlık, A2 = JSON, B2 = son düzenleyen e-posta, C2 = ISO zaman damgası
//
// NEDEN SUNUCUDA: prim tutarları para kararına dönüşüyor. Ayarlar tarayıcıda
// (localStorage) kalırsa aynı sayfayı açan iki kişi FARKLI prim görür ve geçmiş
// bir ödemenin hangi eşiklerle hesaplandığı kayıt altına alınamaz. Ortak tek
// kayıt + "kim, ne zaman" damgası bu iki sorunu da çözer.
//
// Erişim: "erce" anahtarı — paneli görebilen ayarı da görür/değiştirir.
// İleride salt-okuma ayrımı istenirse POST ayrı bir anahtara bağlanabilir.
// ───────────────────────────────────────────────────────────────────────────
import { withAccess, apiOk, apiError } from "../../../lib/api";
import { readMatrixFromSheet, overwriteSheetTab } from "../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB = "Prim_Ayar";
const MAX_LEN = 20000;

export const GET = withAccess("erce", async () => {
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: TAB });
  } catch {
    // Sekme henüz yok → boş ayar (ilk kayıtta oluşacak).
    return apiOk({ ayar: null, updatedBy: "", updatedAt: "" });
  }
  const row = Array.isArray(values) && values.length > 1 ? values[1] : [];
  let ayar = null;
  try {
    ayar = row[0] ? JSON.parse(String(row[0])) : null;
  } catch {
    ayar = null; // bozuk kayıt varsayılana düşsün, hata fırlatma
  }
  return apiOk({
    ayar,
    updatedBy: String(row[1] ?? ""),
    updatedAt: String(row[2] ?? ""),
  });
});

export const POST = withAccess("erce", async (request, { session }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError("Geçersiz JSON gövdesi.", 400);
  }

  const ayar = body && typeof body === "object" ? body.ayar : null;
  if (!ayar || typeof ayar !== "object") {
    return apiError("'ayar' nesnesi gerekli.", 400);
  }

  const json = JSON.stringify(ayar);
  if (json.length > MAX_LEN) {
    return apiError(`Ayar çok büyük (${json.length} > ${MAX_LEN}).`, 413);
  }

  const email = String(session?.user?.email ?? "");
  const now = new Date().toISOString();

  await overwriteSheetTab(
    [
      ["Ayar", "Guncelleyen", "Zaman"],
      [json, email, now],
    ],
    { tab: TAB }
  );

  return apiOk({ ok: true, updatedBy: email, updatedAt: now });
});
