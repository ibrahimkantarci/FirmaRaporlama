import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Middleware Edge runtime'da çalışır → YALNIZ Edge-güvenli authConfig kullanılır
// (Node-only googleapis içeren auth.js'i İÇE AKTARMAZ; aksi halde Edge build kırılır).
// Yalnız oturum var mı diye bakar; Sheet tabanlı erişim kontrolü Node katmanında
// (auth signIn + hub + requireToolAccess/withAccess) yapılır.
export const { auth: middleware } = NextAuth(authConfig);

// Ana sayfa (/) giriş ekranıdır → korumadan HARİÇ ($ = kök yol).
// auth API'si ve statik dosyalar da hariç.
// Geri kalan her şey (provider, rapor, fiyat-tutarlilik, diğer API'ler) korumalı:
// giriş yapılmadan erişilirse middleware ana sayfaya yönlendirir.
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|$).*)"],
};
