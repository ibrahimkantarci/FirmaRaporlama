// lib/access.js
// ───────────────────────────────────────────────────────────────────────────
// Auth'a bağlı erişim KAPISI (sunucu sayfaları için) + çekirdeğin re-export'u.
// Saf mantık (Sheet matrisi, admin, canAccessHome/canAccessTool) lib/access-core.js'te
// (auth import etmez). Burası yalnız oturum gerektiren requireToolAccess'i ekler.
// Mevcut importlar (`from "../lib/access"`) çalışmaya devam etsin diye çekirdek re-export edilir.
// ───────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessTool, canAccessHome } from "./access-core";

export * from "./access-core";

// Sunucu sayfaları için kapı: oturum + Ana Sayfa erişimi + araç erişimi.
//  - Oturum yoksa → hub'a (giriş).
//  - Ana Sayfa erişimi iptal edilmişse → hub'a (orada oturum düşürülür, hard-revoke).
//  - Araç erişimi yoksa → hub'a (denied bilgisi ile).
// Erişim varsa session'ı döndürür.
export async function requireToolAccess(toolKey) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!(await canAccessHome(session.user.email))) redirect("/");
  const ok = await canAccessTool(session.user.email, toolKey);
  if (!ok) redirect("/?denied=" + encodeURIComponent(toolKey));
  return session;
}
