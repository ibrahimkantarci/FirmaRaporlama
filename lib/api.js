// lib/api.js
// ───────────────────────────────────────────────────────────────────────────
// API rotaları için ortak sarmalayıcı ve yanıt yardımcıları (DRY + güvenlik).
// Her korumalı uç:
//   1) Oturum doğrular (401),
//   2) Araç erişimini kontrol eder (403),
//   3) Beklenmedik hatalarda iç ayrıntıyı sızdırmadan 500 döner.
// Kullanım:
//   export const GET = withAccess("fiyat", async (request, { session }) => { ... })
// ───────────────────────────────────────────────────────────────────────────
import { auth } from "@/auth";
// access-core'dan (auth'suz çekirdek) al — api.js zaten auth'u ayrı import ediyor.
import { canAccessTool, canAccessHome } from "./access-core";

export function apiOk(data = {}, init) {
  return Response.json({ ok: true, ...data }, init);
}

export function apiError(status, error) {
  return Response.json({ ok: false, error }, { status });
}

// toolKey: registry'deki araç anahtarı (erişim bu araca göre denetlenir).
//   Birden fazla araç anahtarı da verilebilir (dizi): kullanıcının HERHANGİ
//   birine erişimi varsa yeterlidir. Ör. dashboard veri uçları hem "dashboard"
//   hem "ozelfiyat" sahiplerine açık (Özel Fiyat aracı aynı veriyi kullanır).
// handler: (request, { session }) => Response | Promise<Response>
export function withAccess(toolKey, handler) {
  const keys = Array.isArray(toolKey) ? toolKey : [toolKey];
  return async function (request, ctx) {
    const session = await auth();
    if (!session?.user?.email) return apiError(401, "Yetkisiz. Lütfen giriş yapın.");

    let allowed = false;
    try {
      // Önce Ana Sayfa (giriş) erişimi — iptal edilmişse hiçbir araca izin verme (hard-revoke).
      if (!(await canAccessHome(session.user.email))) return apiError(403, "Erişiminiz kaldırılmış.");
      for (const k of keys) {
        if (await canAccessTool(session.user.email, k)) { allowed = true; break; }
      }
    } catch (err) {
      // Erişim kaynağı (Sheet) okunamadıysa: güvenli tarafta kal → reddet.
      return apiError(503, "Erişim doğrulanamadı. Lütfen tekrar deneyin.");
    }
    if (!allowed) return apiError(403, "Bu araca erişim yetkiniz yok.");

    try {
      return await handler(request, { ...ctx, session });
    } catch (err) {
      // İç hata ayrıntısını istemciye sızdırma; logla, genel mesaj dön.
      console.error(`[api:${keys.join("/")}]`, err);
      return apiError(500, "Beklenmedik bir hata oluştu.");
    }
  };
}
