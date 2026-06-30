import { AppHeader } from "../app-header";
import DashboardPanel from "./dashboard-panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// B2B Lifecycle dashboard'u tam ekran göm. Dashboard kendi içinde bağımsız bir
// HTML/JS uygulamasıdır (public/b2b-dashboard.html) — stilleri iframe içinde
// izole kalır. Üstte ortak uygulama çubuğu durur; panel kalan yüksekliği doldurur.
export default async function DashboardPage() {
  const session = await requireToolAccess("dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Dashboard" email={session.user.email} />
      <DashboardPanel />
    </div>
  );
}
