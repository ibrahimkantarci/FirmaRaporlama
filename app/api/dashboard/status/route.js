// app/api/dashboard/status/route.js
// Hafif durum ucu: dashboard verisinin son çekilme (Qlik sync) zamanını döner.
// run route her başarılı çalıştırmada Dashboard_Meta'ya updated_at yazar; burada okunur.
import { withAccess } from "../../../../lib/api";
import { readMatrixFromSheet } from "../../../../lib/sheets";
import { qlikKeyFingerprint } from "../../../../lib/qlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAccess(["updatedhq","ozelfiyat"], async (request) => {
  let updatedAt = null;
  try {
    const m = await readMatrixFromSheet({ tab: "Dashboard_Meta" });
    if (Array.isArray(m) && m.length >= 2 && m[1] && m[1][0]) updatedAt = String(m[1][0]);
  } catch {
    updatedAt = null; // sekme henüz yoksa
  }
  // TEŞHİS (?diag=1): prod'daki Qlik anahtarının maskeli parmak izi — anahtar SIZDIRILMAZ.
  // Lokaldeki değerle karşılaştırmak için (Vercel'de kırpılma/boşluk var mı?).
  let qlik;
  try {
    if (new URL(request.url).searchParams.get("diag") === "1") qlik = qlikKeyFingerprint();
  } catch {}
  return Response.json(qlik ? { ok: true, updatedAt, qlik } : { ok: true, updatedAt });
});
