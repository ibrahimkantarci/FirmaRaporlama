// düğün.com kurumsal logo — tüm sayfalarda ortak.
//
// İKİ VARLIK, ikisi de ŞEFFAF zeminli:
//   /dugun-logo.png       → pembe wordmark, AÇIK zeminler için
//   /dugun-logo-light.png → ivory wordmark, KOYU zeminler için
// Hangisinin görüneceğini CSS belirler (.theme-dark kapsamı — app/globals.css).
// İkisi de DOM'da durur; böylece tema anlık değişince ağdan yeni istek gitmez
// ve logo yanıp sönmez.
export function Brand({ subtitle = "Performans Yönetimi", logoHeight }) {
  const st = logoHeight ? { height: logoHeight } : undefined;
  return (
    <span className="brand">
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span className="brand-logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dugun-logo.png" alt="düğün.com" className="brand-logo brand-logo--on-light" style={st} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dugun-logo-light.png" alt="" aria-hidden="true" className="brand-logo brand-logo--on-dark" style={st} />
        </span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
