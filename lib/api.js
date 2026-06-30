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
import { canAccessTool } from "./access";

export function apiOk(data = {}, init) {
  return Response.json({ ok: true, ...data }, init);
}

export function apiError(status, error) {
  return Response.json({ ok: false, error }, { status });
}

// toolKey: registry'deki araç anahtarı (erişim bu araca göre denetlenir).
// handler: (request, { session }) => Response | Promise<Response>
export function withAccess(toolKey, handler) {
  return async function (request, ctx) {
    const session = await auth();
    if (!session?.user?.email) return apiError(401, "Yetkisiz. Lütfen giriş yapın.");

    let allowed = false;
    try {
      allowed = await canAccessTool(session.user.email, toolKey);
    } catch (err) {
      // Erişim kaynağı (Sheet) okunamadıysa: güvenli tarafta kal → reddet.
      return apiError(503, "Erişim doğrulanamadı. Lütfen tekrar deneyin.");
    }
    if (!allowed) return apiError(403, "Bu araca erişim yetkiniz yok.");

    try {
      return await handler(request, { ...ctx, session });
    } catch (err) {
      // İç hata ayrıntısını istemciye sızdırma; logla, genel mesaj dön.
      console.error(`[api:${toolKey}]`, err);
      return apiError(500, "Beklenmedik bir hata oluştu.");
    }
  };
}
