"use client";
// Erişimi iptal edilmiş (Ana Sayfa = 0) ama hâlâ geçerli oturumu (JWT) olan kullanıcı hub'a
// geldiğinde otomatik çıkış yaptırır → aktif oturum hard-revoke. signOut server action'ı prop
// olarak gelir (app/actions.js). Kısa bir bilgi gösterip formu otomatik gönderir.
import { useEffect, useRef } from "react";

export default function RevokedSignOut({ action }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try { ref.current?.requestSubmit(); } catch {}
    }, 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <h1 className="title" style={{ fontSize: 20 }}>Erişiminiz kaldırıldı</h1>
        <p className="lede" style={{ marginBottom: 20 }}>
          Bu hesabın erişimi kaldırılmış. Çıkış yapılıyor…
        </p>
        <form action={action} ref={ref}>
          <button className="brand-btn" type="submit">Çıkış yap</button>
        </form>
      </div>
    </main>
  );
}
