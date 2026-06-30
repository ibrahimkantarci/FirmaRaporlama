// düğün.com kurumsal logo — tüm sayfalarda ortak.
// Logo dosyası: public/dugun-logo.svg (resmi logoyla aynı isimle değiştirilebilir).
// subtitle: logonun altında küçük etiket (varsayılan "Performans Yönetimi").
export function Brand({ subtitle = "Performans Yönetimi", logoHeight = 22 }) {
  return (
    <span className="brand">
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dugun-logo.png" alt="düğün.com" className="brand-logo" style={{ height: logoHeight }} />
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
