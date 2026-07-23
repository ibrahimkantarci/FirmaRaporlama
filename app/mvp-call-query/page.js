import { AppHeader } from "../app-header";
import MvpCallQueryPanel from "./panel";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

// Mvp WP Call Query — bağımsız hub aracı. "Erce İçin" (/erce) aracından tamamen ayrı;
// kendi rotası, kendi erişim anahtarı ("mvpcall") ve kendi standalone paneli var.
// Erişim için "Erişim" sekmesinde "Mvp WP Call Query" veya "mvpcall" başlıklı kolon gerekir.
export default async function MvpCallQueryPage() {
  const session = await requireToolAccess("mvpcall");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Mvp WP Call Query" email={session.user.email} />
      <MvpCallQueryPanel />
    </div>
  );
}
