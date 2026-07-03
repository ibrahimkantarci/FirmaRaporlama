// app/api/dashboard/status/route.js
// Hafif durum ucu: dashboard verisinin son çekilme (Qlik sync) zamanını döner.
// run route her başarılı çalıştırmada Dashboard_Meta'ya updated_at yazar; burada okunur.
import { withAccess } from "../../../../lib/api";
import { readMatrixFromSheet } from "../../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAccess("dashboard", async () => {
  let updatedAt = null;
  try {
    const m = await readMatrixFromSheet({ tab: "Dashboard_Meta" });
    if (Array.isArray(m) && m.length >= 2 && m[1] && m[1][0]) updatedAt = String(m[1][0]);
  } catch {
    updatedAt = null; // sekme henüz yoksa
  }
  return Response.json({ ok: true, updatedAt });
});
