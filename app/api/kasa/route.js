// app/api/kasa/route.js
// Kişisel şifreli kasa uçları. Sunucu YALNIZCA şifreli metni saklar/döner;
// içeriği çözemez (parola tarayıcıdan çıkmaz). Her kullanıcı yalnız KENDİ
// satırına erişir (session.user.email). Belirli bir araç iznine bağlı değildir:
// oturum + ana sayfa erişimi yeterli.
import { auth } from "@/auth";
import { canAccessHome } from "@/lib/access-core";
import { readKasa, saveKasa } from "@/lib/kasa-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const session = await auth();
  if (!session?.user?.email) return { error: Response.json({ ok: false, error: "Yetkisiz. Lütfen giriş yapın." }, { status: 401 }) };
  try {
    if (!(await canAccessHome(session.user.email))) {
      return { error: Response.json({ ok: false, error: "Erişiminiz kaldırılmış." }, { status: 403 }) };
    }
  } catch {
    return { error: Response.json({ ok: false, error: "Erişim doğrulanamadı." }, { status: 503 }) };
  }
  return { session };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  try {
    const blob = await readKasa(g.session.user.email);
    return Response.json({ ok: true, blob: blob ?? null });
  } catch (err) {
    console.error("[api:kasa:GET]", err);
    return Response.json({ ok: false, error: "Okunamadı." }, { status: 500 });
  }
}

export async function POST(request) {
  const g = await guard();
  if (g.error) return g.error;
  let body;
  try { body = await request.json(); } catch { body = null; }
  // Sadece şifreli alanları kabul et — düz metin ASLA beklenmez.
  const { v, salt, iv, ct } = body || {};
  if (typeof salt !== "string" || typeof iv !== "string" || typeof ct !== "string") {
    return Response.json({ ok: false, error: "Geçersiz şifreli veri." }, { status: 400 });
  }
  try {
    await saveKasa(g.session.user.email, { v: v || 1, salt, iv, ct });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api:kasa:POST]", err);
    return Response.json({ ok: false, error: "Kaydedilemedi." }, { status: 500 });
  }
}
