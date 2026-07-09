// auth.config.js — NextAuth EDGE-GÜVENLİ temel yapılandırma.
// Middleware (Edge runtime) YALNIZ bunu kullanır; Node-only bağımlılık (googleapis vb.)
// İÇERMEZ. Sheet okuyan giriş kontrolü (signIn callback) auth.js'te (Node) eklenir.
// Bkz. NextAuth v5 "split config" deseni (Edge middleware + Node callback).
import Google from "next-auth/providers/google";

export const authConfig = {
  // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET env'leri v5 tarafından otomatik okunur.
  providers: [Google],
  pages: { signIn: "/" }, // giriş ana sayfada (Performans Yönetimi)
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60, // 90 gün
  },
  callbacks: {
    // middleware bununla korumalı sayfalara erişimi denetler (oturum var mı?).
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
