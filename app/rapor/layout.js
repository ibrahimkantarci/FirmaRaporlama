// Sunucu kapısı + ortak üst çubuk. "Sunum Üretimi" (rapor), "Firma Raporlama"
// aracının parçasıdır; erişim "provider" anahtarıyla denetlenir.
import { requireToolAccess } from "../../lib/access";
import { AppHeader } from "../app-header";

export const runtime = "nodejs";

export default async function RaporLayout({ children }) {
  const session = await requireToolAccess("provider");
  return (
    <>
      <AppHeader
        back={{ href: "/provider", label: "Firma Raporlama" }}
        subtitle="Sunum Üretimi"
        email={session.user.email}
      />
      {children}
    </>
  );
}
