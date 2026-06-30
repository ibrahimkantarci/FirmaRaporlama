import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Brand } from "../brand";

export const runtime = "nodejs";

// B2B Lifecycle dashboard'u tam ekran göm. Dashboard kendi içinde bağımsız bir
// HTML/JS uygulamasıdır (public/b2b-dashboard.html) — stilleri iframe içinde
// izole kalır. Üstte ince bir uygulama çubuğu (geri + e-posta + çıkış) durur.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="appbar" style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" className="gbtn">&larr; Hub</Link>
          <Brand subtitle="Dashboard" />
        </div>
        <div className="appbar-actions">
          <span className="appbar-mail">{session.user.email}</span>
          <form action={doSignOut}>
            <button className="gbtn" type="submit">Çıkış</button>
          </form>
        </div>
      </div>

      <iframe
        src="/b2b-dashboard.html"
        title="B2B Lifecycle Dashboard"
        style={{ flex: 1, width: "100%", border: "none" }}
      />
    </div>
  );
}
