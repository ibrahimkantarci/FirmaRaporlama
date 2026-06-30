// app/api/fiyat/settings/route.js
// Kullanıcı bazlı arayüz ayarları (kolon seçimi/sırası, referans, sayım bazı).
// Sheet'teki "Fiyat_Ayarlar" sekmesinde e-posta başına saklanır.
import { withAccess } from "../../../../lib/api";
import { readUserSettings, saveUserSettings } from "../../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAccess("fiyat", async (request, { session }) => {
  try {
    const settings = await readUserSettings(session.user.email);
    return Response.json({ ok: true, settings });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
});

export const POST = withAccess("fiyat", async (request, { session }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    await saveUserSettings(session.user.email, body || {});
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
});
