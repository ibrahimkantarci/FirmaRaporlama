import { AppHeader } from "../app-header";
import Planner from "./planner";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Black hole plan uygulaması — not kağıdındaki black hole ikonundan açılır.
// Erişim not kağıdıyla aynı anahtar ("notlar"): kağıdı gören planları da görür.
export default async function PlanlarPage() {
  const session = await requireToolAccess("notlar");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Planlar" email={session.user.email} />
      <Planner email={session.user.email} />
    </div>
  );
}
