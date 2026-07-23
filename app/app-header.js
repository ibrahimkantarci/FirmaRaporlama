// app/app-header.js
// Tüm sayfalarda ortak üst marka çubuğu (sunucu bileşeni).
//   subtitle — wordmark altındaki küçük etiket
//   email    — sağda gösterilen kullanıcı e-postası (opsiyonel)
//   back     — { href, label } geri bağlantısı (hub'da yok → null)
//   actions  — Çıkış'tan önce eklenecek ek butonlar (ReactNode, opsiyonel)
//
// Hizalama: sol grup (geri · ayraç · logo) ve sağ grup (e-posta · ayraç · eylemler)
// aynı kontrol yüksekliğini (--h-sm) paylaşır; ölçüler globals.css'teki
// .appbar / .gbtn token'larından gelir, burada sabit px yok.
import Link from "next/link";
import { Brand } from "./brand";
import { signOutAction } from "./actions";

export function AppHeader({ subtitle = "Performans Yönetimi", email, back = null, actions = null }) {
  return (
    <header className="appbar">
      <div className="appbar-left">
        {back && (
          <>
            <Link href={back.href} className="gbtn" aria-label={back.label + " sayfasına dön"}>
              <span aria-hidden="true">&larr;</span> {back.label}
            </Link>
            <span className="appbar-sep" aria-hidden="true" />
          </>
        )}
        <Brand subtitle={subtitle} />
      </div>
      <div className="appbar-actions">
        {email && <span className="appbar-mail" title={email}>{email}</span>}
        {actions}
        {(email || actions) && <span className="appbar-sep" aria-hidden="true" />}
        <form action={signOutAction}>
          <button className="gbtn" type="submit">Çıkış</button>
        </form>
      </div>
    </header>
  );
}
