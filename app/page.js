import { auth, signIn } from "@/auth";
import Link from "next/link";
import { Brand } from "./brand";
import { AppHeader } from "./app-header";
import { TOOLS } from "../lib/registry";
import { allowedToolKeys, canAccessHome } from "../lib/access";
import { signOutAction } from "./actions";
import RevokedSignOut from "./revoked-signout";

export const runtime = "nodejs";

const ReportIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3h18M4 3v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V3" />
    <path d="M8 13v-3M12 13V7M16 13v-5" />
    <path d="M9 21l3-3 3 3" />
  </svg>
);

const PriceIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h6.9a2 2 0 0 1 1.4.6l7.5 7.5a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.6" />
  </svg>
);

const DashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
    <rect x="3" y="14" width="8" height="7" rx="1.5" />
  </svg>
);

// İkonlar araç anahtarına göre eşlenir (veri tarafı registry'de, görsel burada).
const ICONS = { provider: ReportIcon, fiyat: PriceIcon, dashboard: DashIcon };

export default async function Home({ searchParams }) {
  const session = await auth();

  // Giriş yapılmamışsa: kurumsal giriş ekranı.
  if (!session?.user) {
    async function googleSignIn() {
      "use server";
      await signIn("google", { redirectTo: "/" });
    }
    return (
      <main
        style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <Brand subtitle={null} logoHeight={38} />
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <h1 className="title" style={{ fontSize: 21 }}>Giriş yap</h1>
            <p className="lede" style={{ marginBottom: 22 }}>
              Devam etmek için izinli bir Google hesabıyla giriş yap.
            </p>
            <form action={googleSignIn}>
              <button className="brand-btn" type="submit">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" opacity=".9" />
                  <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" opacity=".7" />
                  <path fill="#fff" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" opacity=".5" />
                  <path fill="#fff" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" opacity=".8" />
                </svg>
                Google ile giriş yap
              </button>
            </form>
          </div>
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#a1a1aa" }}>
            düğün.com · iç araç
          </p>
        </div>
      </main>
    );
  }

  // HARD-REVOKE: giriş yapmış ama "Ana Sayfa" erişimi (Sheet) kaldırılmışsa → otomatik çıkış.
  // (Oturum JWT ve 90 gün; iptal edilen kişinin aktif oturumu burada düşer, ~cache TTL içinde.)
  if (!(await canAccessHome(session.user.email))) {
    return <RevokedSignOut action={signOutAction} />;
  }

  // YETKİLENDİRME: kullanıcı yalnızca erişebildiği araçları görür.
  const allowed = await allowedToolKeys(session.user.email);
  const visibleTools = TOOLS.filter((t) => allowed.has(t.key));
  const denied = searchParams?.denied;

  return (
    <>
      <AppHeader email={session.user.email} />

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 22px 64px" }}>
        <p className="eyebrow">Performans Yönetimi</p>
        <h1 className="title" style={{ fontSize: 30 }}>Bir araç seç</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          Raporlama, fiyat denetimi ve performans panoları — hepsi tek yerde.
        </p>

        {denied && (
          <div className="note warn" style={{ marginTop: 18 }}>
            Bu araca erişim yetkiniz yok. Erişim için yöneticinizle iletişime geçin.
          </div>
        )}

        {visibleTools.length === 0 ? (
          <div className="card" style={{ marginTop: 22, textAlign: "center", color: "#71717a" }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Henüz erişiminiz yok</p>
            <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
              Hesabınıza bir araç erişimi tanımlandığında burada görünecek. Yöneticinizle iletişime geçin.
            </p>
          </div>
        ) : (
          <div className="tool-grid">
            {visibleTools.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className="tool-card"
                style={{ "--tool-accent": t.accent, "--tool-soft": t.soft }}
              >
                <span className="tool-ic">{ICONS[t.key]}</span>
                <h3 className="tool-title">
                  {t.title}
                  <span className="tool-arrow">&rarr;</span>
                </h3>
                <p className="tool-desc">{t.desc}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
