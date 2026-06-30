import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

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
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid #e4e4e7",
          background: "#fff",
          fontSize: 13,
          color: "#5b6675",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            border: "1px solid #d7dce3",
            background: "#fff",
            color: "#5b6675",
            textDecoration: "none",
            fontSize: 12.5,
            padding: "6px 12px",
            borderRadius: 8,
          }}
        >
          &larr; Performans Yönetimi
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
            {session.user.email}
          </span>
          <form action={doSignOut}>
            <button
              type="submit"
              style={{
                border: "1px solid #e3e7ec",
                background: "#fff",
                color: "#5b6675",
                font: "inherit",
                fontSize: 12.5,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Çıkış
            </button>
          </form>
        </div>
      </header>

      <iframe
        src="/b2b-dashboard.html"
        title="B2B Lifecycle Dashboard"
        style={{ flex: 1, width: "100%", border: "none" }}
      />
    </div>
  );
}
