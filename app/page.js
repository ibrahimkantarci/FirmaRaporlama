import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const runtime = "nodejs";

const tools = [
  {
    href: "/provider",
    title: "Provider Aktarımı & Sunum",
    desc: "Müşteri verisini Qlik'ten Google Sheet'e aktar; oradan düzenleyip PowerPoint sunum üret.",
  },
  {
    href: "/fiyat-tutarlilik",
    title: "Fiyat Tutarlılık",
    desc: "Katalog ve kampanya fiyatlarını eşleştirip kampanyaların katalogla tutarlı olup olmadığını denetler.",
  },
];

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="wrap" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 13,
          color: "#5b6675",
          marginBottom: 8,
        }}
      >
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
      </header>

      <p className="eyebrow">Düğün.com</p>
      <h1 className="title">Performans Yönetimi</h1>
      <p className="lede">Bir araç seç.</p>

      <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
        {tools.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card"
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              transition: "border-color .15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>{t.title}</h3>
              <span style={{ color: "#1f6feb", fontSize: 20 }}>&rarr;</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, opacity: 0.75 }}>{t.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
