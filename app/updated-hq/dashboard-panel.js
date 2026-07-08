"use client";

import { useEffect, useRef, useState } from "react";

// Updated HQ panelini (public/b2b-dashboard-updated.html) iframe ile gömer.
// Aynı Qlik veri uçlarını (api/dashboard/*) kullanır. Üst çubukta "son güncelleme"
// (verinin Qlik'ten en son çekildiği tarih+saat) gösterilir.
function fmtTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DashboardPanel() {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.updatedAt) setUpdatedAt(d.updatedAt);
      })
      .catch(() => {});
  }, []);

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

  // Yanıt JSON değilse (ör. Vercel zaman aşımı düz-metin sayfası) okunabilir hata üret.
  async function parseJson(r) {
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      throw new Error(`Sunucu yanıtı JSON değil (HTTP ${r.status}): ${t.slice(0, 70)}…`);
    }
  }

  async function refresh() {
    setBusy(true);
    setErr("");
    try {
      // İKİ PARALEL istek: Qlik kaynakları + yenileme cache'i (Apps Script). Tek istekte
      // toplam süre Vercel fonksiyon limitini aşıyordu; bölününce her biri kendi 120sn
      // bütçesinde çalışır. Yenileme cache'i güncellenemezse ölümcül değil (eski cache /
      // canlı fallback devrede kalır).
      // ⚠️ Qlik KAYNAKLARI PARALEL BÖLÜNEMEZ: birden çok kaynak aynı Qlik app'ini kullanıp
      // seçim (clearAll/select) yapıyor (General: onboarding+sözleşme+firma joinFields; Executive:
      // provider_flag_current+firma joinMembership). İki paralel istek aynı app'e seçim atınca
      // Qlik "Exclusive request aborted" verir. O yüzden TÜM Qlik kaynakları TEK sıralı çağrıda;
      // yalnız yenileme (Apps Script, Qlik değil) ayrı paralel çağrıda.
      const [main, yen] = await Promise.allSettled([
        fetch("/api/dashboard/run?except=yenileme", { method: "POST" }).then(parseJson),
        fetch("/api/dashboard/run?only=yenileme", { method: "POST" }).then(parseJson),
      ]);
      if (main.status === "rejected") throw main.reason;
      if (!main.value.ok) throw new Error(main.value.error || "Bilinmeyen hata");
      if (main.value.updatedAt) setUpdatedAt(main.value.updatedAt);
      if (yen.status === "rejected" || (yen.value && yen.value.ok === false)) {
        console.warn("[dashboard] yenileme cache güncellenemedi:", yen.status === "rejected" ? yen.reason : yen.value);
      }
      const w = ref.current?.contentWindow;
      if (w) w.location.reload();
    } catch (e) {
      setErr(e?.message || String(e));
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
        <span style={{ fontSize: 12.5, color: err ? "#dc2626" : "#71717a" }}>
          {busy
            ? "Qlik'ten çekiliyor…"
            : err
            ? "Hata: " + err
            : updatedAt
            ? "Son güncelleme: " + fmtTs(updatedAt)
            : "Son güncelleme bilinmiyor — “Qlik'ten yenile” ile çekin"}
        </span>
      </div>
      <iframe
        ref={ref}
        src="/b2b-dashboard-updated.html"
        title="Updated HQ"
        onLoad={injectPipeline}
        style={{ flex: 1, width: "100%", border: "none", minHeight: 0 }}
      />
    </div>
  );
}
