import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { izinliMailler } from "./izinli-mailler";

// İzinli e-postalar izinli-mailler.js dosyasından gelir (env'e bağımlı değil).
const allowed = izinliMailler.map((e) => e.trim().toLowerCase()).filter(Boolean);

// Liste boşken: canlıda KİMSE giremez (fail-closed), yerelde herkes (test kolay).
const isDev = process.env.NODE_ENV !== "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET env'leri v5 tarafından
  // otomatik okunur.
  providers: [Google],
  pages: { signIn: "/login" },

  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60, // 90 gün
  },

  callbacks: {
    // Whitelist: yalnızca izinli e-postalar giriş yapabilir.
    signIn({ user }) {
      const email = (user?.email || "").toLowerCase();
      if (allowed.length === 0) return isDev;
      return allowed.includes(email);
    },
    // middleware bununla korumalı sayfalara erişimi denetler.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
