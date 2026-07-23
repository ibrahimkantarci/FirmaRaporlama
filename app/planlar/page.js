import { AppHeader } from "../app-header";
import Planner from "./planner";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Black hole plan uygulaması — not kağıdındaki black hole ikonundan açılır.
// Erişim not kağıdıyla aynı anahtar ("notlar"): kağıdı gören planları da görür.
export default async function PlanlarPage() {
  const session = await requireToolAccess("notlar");

  return (
    // theme-dark SAYFANIN TAMAMINA veriliyor (yalnız panele değil): AppHeader da
    // aynı token'ları çözsün, açık header koyu içeriğin üstünde asılı kalmasın.
    <div className="theme-dark" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Planlar" email={session.user.email} />
      <Planner email={session.user.email} />
    </div>
  );
}
