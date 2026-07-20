import { AppHeader } from "../app-header";
import ErcePanel from "./panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Erce İçin — bağımsız hub aracı. Ana dashboard'u paylaşmadan yalnızca
// Erce'nin 5 board'unu (public/erce-standalone.html) gösterir:
// verimlilik, yenileme yüzdesi, dokunma oranı, flag durumu, decay.
// Kendi erişim anahtarı "erce" ile korunur. Aynı canlı Qlik veri hattını
// (api/dashboard/*) kullanır.
export default async function ErcePage() {
  const session = await requireToolAccess("erce");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Erce İçin" email={session.user.email} />
      <ErcePanel />
    </div>
  );
}
