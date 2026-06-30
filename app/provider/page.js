import Link from "next/link";
import ExportTool from "../export-tool";
import { AppHeader } from "../app-header";
import { requireToolAccess } from "../../lib/access";

export const runtime = "nodejs";

export default async function ProviderPage() {
  const session = await requireToolAccess("provider");

  return (
    <>
      <AppHeader
        back={{ href: "/", label: "Hub" }}
        subtitle="Firma Raporlama"
        email={session.user.email}
        actions={
          <Link
            href="/rapor"
            className="gbtn"
            style={{ borderColor: "var(--brand)", background: "var(--brand)", color: "#fff" }}
          >
            Sunum oluştur &rarr;
          </Link>
        }
      />
      <ExportTool />
    </>
  );
}
