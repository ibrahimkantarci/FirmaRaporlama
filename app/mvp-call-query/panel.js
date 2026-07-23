"use client";

import { useRef, useState, useEffect } from "react";

// Mvp WP Call Query panelini (public/mvp-call-query-standalone.html) iframe ile gömer.
// Şu an bağlı bir veri kaynağı yok; kaynak bağlanınca burada /api/mvp-call-query
// uçları çağrılıp iframe içine pipeline script'i enjekte edilecek (erce panelindeki
// injectPipeline kalıbının aynısı).
function fmtTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function MvpCallQueryPanel() {
  const ref = useRef(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.updatedAt) setUpdatedAt(d.updatedAt);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid #e4e4e7",
          background: "#fafafa",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12.5, color: "#71717a" }}>
          {updatedAt ? "Son güncelleme: " + fmtTs(updatedAt) : "Veri kaynağı henüz bağlanmadı"}
        </span>
      </div>
      <iframe
        ref={ref}
        src="/mvp-call-query-standalone.html"
        title="Mvp WP Call Query"
        style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
      />
    </div>
  );
}
