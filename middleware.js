export { auth as middleware } from "@/auth";

// login, auth API'si ve statik dosyalar hariç her şeyi koru.
// (Bunları hariç tutmazsan login'e sonsuz yönlendirme döngüsü olur.)
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
