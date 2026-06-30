import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          maxWidth: 760,
          margin: "0 auto",
          padding: "14px 20px 0",
          fontSize: 13,
          color: "#5b6675",
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

      <main className="wrap" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <p className="eyebrow">Düğün.com</p>
        <h1 className="title">Dashboard</h1>
        <p className="lede">Performans göstergeleri panolar halinde burada gösterilecek.</p>

        {/* PLACEHOLDER — hazırlanan dashboard HTML'i buraya yerleştirilecek.
            Sonraki adım: pano verisini besleyecek pipeline (Qlik → API → bu sayfa). */}
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
            color: "#5b6675",
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Yapım aşamasında</p>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, opacity: 0.75 }}>
              Dashboard içeriği hazırlandığında buraya eklenecek.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
