export { auth as middleware } from "@/auth";

// Ana sayfa (/) giriş ekranıdır → korumadan HARİÇ ($ = kök yol).
// auth API'si, eski /login ve statik dosyalar da hariç.
// Geri kalan her şey (provider, rapor, fiyat-tutarlilik, diğer API'ler) korumalı:
// giriş yapılmadan erişilirse middleware ana sayfaya yönlendirir.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|$).*)"],
};
