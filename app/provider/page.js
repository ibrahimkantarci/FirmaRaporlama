import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import ExportTool from "../export-tool";

export const runtime = "nodejs";

export default async function ProviderPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          maxWidth: 640,
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
          <Link
            href="/rapor"
            style={{
              border: "1px solid #d7dce3",
              background: "#1f6feb",
              color: "#fff",
              textDecoration: "none",
              fontSize: 12.5,
              padding: "6px 12px",
              borderRadius: 8,
            }}
          >
            Sunum oluştur &rarr;
          </Link>
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
      <ExportTool />
    </>
  );
}
