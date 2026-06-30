// Sunucu kapısı + ortak üst çubuk. "Fiyat Tutarlılık" sayfası client bileşen
// olduğundan erişim denetimini ve AppHeader'ı burada (layout) yaparız.
import { requireToolAccess } from "../../lib/access";
import { AppHeader } from "../app-header";

export const runtime = "nodejs";

export default async function FiyatLayout({ children }) {
  const session = await requireToolAccess("fiyat");
  return (
    <>
      <AppHeader back={{ href: "/", label: "Hub" }} subtitle="Fiyat Tutarlılık" email={session.user.email} />
      {children}
    </>
  );
}
