import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { canAccessHome, isAdmin } from "./lib/access-core";

// Sheet okunamazsa: canlıda KİMSE giremez (fail-closed), yerelde herkes (test kolay).
const isDev = process.env.NODE_ENV !== "production";

// Tam yapılandırma (Node runtime): Edge-güvenli authConfig + Sheet okuyan giriş kontrolü.
// Uygulama (server component / API / server actions) bunu kullanır; middleware KULLANMAZ
// (o auth.config'i kullanır — googleapis Edge'de çalışmaz).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // GİRİŞ KAPISI: kimin giriş yapabileceği artık "Erişim" sekmesi "Ana Sayfa" kolonundan
    // gelir (izinli-mailler.js EMEKLİ). Güvenlik invaryantı:
    //  - ADMIN_EMAILS (env, Sheet DIŞINDA) her zaman girer → Sheet çökse bile kilitlenme YOK.
    //  - Diğerleri: "Ana Sayfa" = 1 ise girer. Sheet okunamazsa canlıda reddet (fail-closed).
    // Aktif oturumun iptali hub (app/page.js) + requireToolAccess/withAccess'te (Node) yapılır.
    async signIn({ user }) {
      const email = (user?.email || "").toLowerCase();
      if (!email) return false;
      if (isAdmin(email)) return true;
      try {
        return await canAccessHome(email);
      } catch {
        return isDev;
      }
    },
  },
});
