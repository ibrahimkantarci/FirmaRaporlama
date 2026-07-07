import { AppHeader } from "../app-header";
import OzelFiyatPanel from "./panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Özel Fiyat — bağımsız hub aracı. Ana dashboard'u paylaşmadan yalnızca
// Özel Fiyat sayfasını (public/ozel-fiyat-standalone.html) gösterir.
// Kendi erişim anahtarı "ozelfiyat" ile korunur; böylece yalnızca bu araca
// yetkili kişiler (ör. Pelda) tüm dashboard'a erişmeden burayı görebilir.
// Aynı canlı Qlik veri hattını (api/dashboard/*) kullanır.
export default async function OzelFiyatPage() {
  const session = await requireToolAccess("ozelfiyat");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Özel Fiyat" email={session.user.email} />
      <OzelFiyatPanel />
    </div>
  );
}
