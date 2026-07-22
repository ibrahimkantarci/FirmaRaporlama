import { AppHeader } from "../app-header";
import ErcePanel from "./panel";
import ErceGate from "./gate";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Erce İçin — bağımsız hub aracı. Ana dashboard'u paylaşmadan yalnızca
// Erce'nin 5 board'unu (public/erce-standalone.html) gösterir:
// verimlilik, yenileme yüzdesi, dokunma oranı, flag durumu, decay.
// Kendi erişim anahtarı "erce" ile korunur. Aynı canlı Qlik veri hattını
// (api/dashboard/*) kullanır. Ek olarak ErceGate ile parola kapısı: "erce"
// erişimi olsa bile parolayı bilmeyen kullanıcı paneli göremez.
export default async function ErcePage() {
  const session = await requireToolAccess("erce");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Erce İçin" email={session.user.email} />
      <ErceGate>
        <ErcePanel />
      </ErceGate>
    </div>
  );
}
