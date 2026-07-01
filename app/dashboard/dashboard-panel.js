"use client";

import { useRef, useState } from "react";

// Dashboard'u (public/b2b-dashboard.html) iframe ile gömer.
// - iframe her yüklendiğinde pipeline script'ini iframe içine enjekte eder
//   (vendor HTML'e dokunmadan; aynı kökten olduğu için contentDocument erişilebilir).
// - "Qlik'ten yenile": /api/dashboard/run → Sheet'i tazele → iframe'i reload et.
export default function DashboardPanel() {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function injectPipeline() {
    const ifr = ref.current;
    if (!ifr) return;
    let doc;
    try {
      doc = ifr.contentDocument;
    } catch {
      return; // farklı köken (beklenmez)
    }
    if (!doc || !doc.body) return;
    const s = doc.createElement("script");
    s.src = "/dashboard-pipeline.js?v=" + Date.now(); // cache-bust
    doc.body.appendChild(s);
  }

  async function refresh() {
    setBusy(true);
    setMsg("Qlik'ten çekiliyor…");
    try {
      const r = await fetch("/api/dashboard/run", { method: "POST" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Bilinmeyen hata");
      // Her kaynağın satır sayısını özetle (onboarding, firma, …).
      const parts = Object.keys(d)
        .filter((k) => d[k] && typeof d[k] === "object" && d[k].rows != null)
        .map((k) => `${k}: ${d[k].rows}`);
      setMsg("Yenilendi" + (parts.length ? " · " + parts.join(" · ") : ""));
      const w = ref.current?.contentWindow;
      if (w) w.location.reload(); // reload → onLoad → injectPipeline → /api/dashboard/data
    } catch (e) {
      setMsg("Hata: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

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
        <button
          onClick={refresh}
          disabled={busy}
          className="gbtn"
          style={{ borderColor: "var(--brand)", color: busy ? "#a1a1aa" : "var(--brand)", fontWeight: 600 }}
        >
          {busy ? "Yenileniyor…" : "⟳ Qlik'ten yenile"}
        </button>
        <span style={{ fontSize: 12.5, color: "#71717a" }}>
          {msg || "Açılışta son Qlik verisi yüklenir · manuel Excel yükleme de çalışır."}
        </span>
      </div>
      <iframe
        ref={ref}
        src="/b2b-dashboard.html"
        title="B2B Lifecycle Dashboard"
        onLoad={injectPipeline}
        style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
      />
    </div>
  );
}
