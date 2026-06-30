import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import ExportTool from "../export-tool";
import { Brand } from "../brand";

export const runtime = "nodejs";

export default async function ProviderPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      <div className="appbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" className="gbtn">&larr; Hub</Link>
          <Brand subtitle="Firma Raporlama" />
        </div>
        <div className="appbar-actions">
          <span className="appbar-mail">{session.user.email}</span>
          <Link href="/rapor" className="gbtn" style={{ borderColor: "var(--brand)", background: "var(--brand)", color: "#fff" }}>
            Sunum oluştur &rarr;
          </Link>
          <form action={doSignOut}>
            <button className="gbtn" type="submit">Çıkış</button>
          </form>
        </div>
      </div>
      <ExportTool />
    </>
  );
}
