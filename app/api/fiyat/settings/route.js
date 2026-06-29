// app/api/fiyat/settings/route.js
// Kullanıcı bazlı arayüz ayarları (kolon seçimi/sırası, referans, sayım bazı).
// Sheet'teki "Fiyat_Ayarlar" sekmesinde e-posta başına saklanır.
import { auth } from "@/auth";
import { readUserSettings, saveUserSettings } from "../../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }
  try {
    const settings = await readUserSettings(session.user.email);
    return Response.json({ ok: true, settings });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }
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
}
