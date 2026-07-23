// app/api/notlar/route.js
// ───────────────────────────────────────────────────────────────────────────
// Hub not kağıdı (Info / Plans) — oku / kaydet.
// Depo: Google Sheet'te "Notlar" sekmesi, tek satır:
//   A1:C1 = başlık, A2 = metin, B2 = son düzenleyen e-posta, C2 = ISO zaman damgası
// Sekme yoksa overwriteSheetTab ilk kayıtta oluşturur.
//
// Erişim: "notlar" anahtarı (Erişim sekmesinde "Info / Plans" ya da "notlar" kolonu).
// Aynı anahtar hem görmeyi hem düzenlemeyi verir; ileride salt-okuma istenirse
// ikinci bir anahtar eklenip POST ona bağlanabilir.
// ───────────────────────────────────────────────────────────────────────────
import { withAccess, apiOk, apiError } from "../../../lib/api";
import { readMatrixFromSheet, overwriteSheetTab } from "../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB = "Notlar";
const MAX_LEN = 20000; // Sheets hücre sınırı 50k; payload'ı da makul tutmak için.

export const GET = withAccess("notlar", async () => {
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: TAB });
  } catch {
    // Sekme henüz yok → boş not (ilk kayıtta oluşacak).
    return apiOk({ text: "", updatedBy: "", updatedAt: "" });
  }
  const row = Array.isArray(values) && values.length > 1 ? values[1] : [];
  return apiOk({
    text: String(row[0] ?? ""),
    updatedBy: String(row[1] ?? ""),
    updatedAt: String(row[2] ?? ""),
  });
});

export const POST = withAccess("notlar", async (request, { session }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Geçersiz istek gövdesi.");
  }

  const text = typeof body?.text === "string" ? body.text : null;
  if (text === null) return apiError(400, "text alanı gerekli.");
  if (text.length > MAX_LEN) return apiError(413, `Not çok uzun (en fazla ${MAX_LEN} karakter).`);

  const updatedBy = session.user.email;
  const updatedAt = new Date().toISOString();

  await overwriteSheetTab(
    [
      ["metin", "guncelleyen", "guncelleme"],
      [text, updatedBy, updatedAt],
    ],
    { tab: TAB }
  );

  return apiOk({ text, updatedBy, updatedAt });
});
