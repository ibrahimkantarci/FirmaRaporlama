// düğün.com kurumsal logo — tüm sayfalarda ortak.
// Logo yüksekliği ve alt etiket tasarım sistemindeki ölçülere bağlıdır
// (.brand-logo / .brand-sub — app/globals.css). Boyutu buradan zorlamıyoruz ki
// appbar içindeki hizalama her sayfada aynı kalsın.
export function Brand({ subtitle = "Performans Yönetimi", logoHeight }) {
  return (
    <span className="brand">
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dugun-logo.png"
          alt="düğün.com"
          className="brand-logo"
          style={logoHeight ? { height: logoHeight } : undefined}
        />
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
