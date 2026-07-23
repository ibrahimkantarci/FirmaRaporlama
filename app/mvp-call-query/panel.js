"use client";

import { useEffect, useRef, useState } from "react";

// Mvp WP Call Query panelini (public/mvp-call-query-standalone.html) iframe ile gömer.
// Panel verisini kendi ucundan çeker (/api/mvp-call-query/data → Dashboard_Firma).
//
// CACHE: public/ altındaki statik HTML Vercel CDN + tarayıcı tarafından agresif
// cache'lenir; src sabit olursa panelde yapılan değişiklik kullanıcıya GÜNLERCE
// yansımayabilir. src'yi mount'tan SONRA (useEffect) zaman damgasıyla veriyoruz:
// her açılışta taze kopya gelir ve sunucu/istemci HTML'i farklı olmadığı için
// hydration uyuşmazlığı da olmaz.
//
// NOT: /api/dashboard/status bilerek çağrılmıyor — o uç "updatedhq" anahtarına bağlı;
// yalnız "mvpcall" erişimi olan kullanıcı 403 alırdı. Kayıt sayısı iframe üst çubuğunda.
export default function MvpCallQueryPanel() {
  const ref = useRef(null);
  const [src, setSrc] = useState("");

  useEffect(() => {
    setSrc("/mvp-call-query-standalone.html?v=" + Date.now());
  }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {src ? (
        <iframe
          ref={ref}
          src={src}
          title="Mvp WP Call Query"
          style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#a1a1aa", fontSize: 13 }}>
          Yükleniyor…
        </div>
      )}
    </div>
  );
}
