"use client";

import { useRef } from "react";

// Mvp WP Call Query panelini (public/mvp-call-query-standalone.html) iframe ile gömer.
// Panel verisini kendi ucundan çeker (/api/mvp-call-query/data → Dashboard_Firma).
// NOT: /api/dashboard/status bilerek çağrılmıyor — o uç "updatedhq" anahtarına bağlı;
// yalnız "mvpcall" erişimi olan kullanıcı 403 alırdı. Kayıt sayısı iframe üst çubuğunda.
export default function MvpCallQueryPanel() {
  const ref = useRef(null);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <iframe
        ref={ref}
        src="/mvp-call-query-standalone.html"
        title="Mvp WP Call Query"
        style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
      />
    </div>
  );
}
