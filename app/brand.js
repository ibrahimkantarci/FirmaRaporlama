// düğün.com kurumsal wordmark — tüm sayfalarda ortak.
// subtitle: wordmark altında küçük etiket (varsayılan "Performans Yönetimi").
export function Brand({ subtitle = "Performans Yönetimi" }) {
  return (
    <span className="brand" aria-label="düğün.com">
      <span style={{ display: "inline-flex", flexDirection: "column" }}>
        <span style={{ display: "inline-flex", alignItems: "baseline" }}>
          <span className="brand-name">düğün</span>
          <span className="brand-tld">.com</span>
        </span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
