import { AppHeader } from "../app-header";
import DashboardPanel from "./dashboard-panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Updated HQ: canlı /dashboard'a dokunmadan üzerinde çalışılan sandbox kopya.
// Aynı Qlik veri hattını (api/dashboard/*) kullanır, ama kendi HTML dosyası
// (public/b2b-dashboard-updated.html) üzerinden render eder. Buradaki
// değişiklikler onaylandıktan sonra /dashboard'a taşınır.
export default async function UpdatedHQPage() {
  const session = await requireToolAccess("dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Updated HQ" email={session.user.email} />
      <DashboardPanel />
    </div>
  );
}
