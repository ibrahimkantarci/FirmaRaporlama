import { AppHeader } from "../app-header";
import DashboardPanel from "./dashboard-panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Dashboard: B2B yaşam döngüsü panoları (public/b2b-dashboard-updated.html).
// Rota /updated-hq kalır (link/bookmark kırılmasın), ama hub'da "Dashboard" adıyla görünür.
// Eski legacy /dashboard 2026-07-09'da kaldırıldı; bu artık TEK dashboard.
export default async function UpdatedHQPage() {
  const session = await requireToolAccess("updatedhq");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Dashboard" email={session.user.email} />
      <DashboardPanel />
    </div>
  );
}
