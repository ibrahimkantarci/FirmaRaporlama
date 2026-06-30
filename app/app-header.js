// app/app-header.js
// Tüm sayfalarda ortak üst marka çubuğu (sunucu bileşeni).
//   subtitle — wordmark altındaki küçük etiket
//   email    — sağda gösterilen kullanıcı e-postası (opsiyonel)
//   back     — { href, label } geri bağlantısı (hub'da yok → null)
//   actions  — Çıkış'tan önce eklenecek ek butonlar (ReactNode, opsiyonel)
import Link from "next/link";
import { Brand } from "./brand";
import { signOutAction } from "./actions";

export function AppHeader({ subtitle = "Performans Yönetimi", email, back = null, actions = null }) {
  return (
    <div className="appbar">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {back && (
          <Link href={back.href} className="gbtn">
            &larr; {back.label}
          </Link>
        )}
        <Brand subtitle={subtitle} />
      </div>
      <div className="appbar-actions">
        {email && <span className="appbar-mail">{email}</span>}
        {actions}
        <form action={signOutAction}>
          <button className="gbtn" type="submit">Çıkış</button>
        </form>
      </div>
    </div>
  );
}
