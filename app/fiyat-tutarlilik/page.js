"use client";
// app/fiyat-tutarlilik/page.js
// Katalog vs kampanya fiyat tutarlılık denetimi. Butonla pipeline tetiklenir;
// referans stratejisi (Max/Min/Medyan/Ana) sayfada canlı değiştirilir.
import { useMemo, useState } from "react";
import Link from "next/link";
import { verdictFor, summarize } from "../../lib/fiyat";

const TR = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("tr-TR"));
const STRATS = [
  { key: "max", label: "Katalog Max (esnek)" },
  { key: "min", label: "Katalog Min (katı)" },
  { key: "median", label: "Katalog Medyan" },
  { key: "isMain", label: "Ana Katalog" },
];
const VCOLOR = { Tutarlı: "#1f7a3d", Tutarsız: "#c0392b", Karşılaştırılamaz: "#8a93a0" };
const CAP = 400; // tabloda gösterilecek azami satır

export default function FiyatPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [strategy, setStrategy] = useState("max");
  const [filter, setFilter] = useState("Tutarsız");

  async function run() {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/fiyat/run");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Çalıştırılamadı.");
      setData(j);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows || [];
  const computed = useMemo(
    () => rows.map((r) => ({ row: r, v: verdictFor(r, strategy) })),
    [rows, strategy]
  );
  const counts = useMemo(() => summarize(rows, strategy), [rows, strategy]);
  const shown = useMemo(
    () => (filter === "Tümü" ? computed : computed.filter((x) => x.v.verdict === filter)),
    [computed, filter]
  );

  const th = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e3e7ec", position: "sticky", top: 0, background: "#fff" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" };

  return (
    <main className="wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link
        href="/"
        style={{
          display: "inline-block", border: "1px solid #d7dce3", background: "#fff", color: "#5b6675",
          textDecoration: "none", fontSize: 12.5, padding: "6px 12px", borderRadius: 8, marginBottom: 12,
        }}
      >
        &larr; Performans Yönetimi
      </Link>
      <p className="eyebrow">Qlik → Google Sheets</p>
      <h1 className="title">Fiyat Tutarlılık</h1>
      <p className="lede">
        Aktif provider&apos;ların katalog ve kampanya fiyatlarını eşleştirir; kampanya fiyatı
        (Fiyat Sonra) eşleşen birimdeki katalog referansından düşükse <b>Tutarlı</b>, değilse
        <b> Tutarsız</b> sayılır. Birim, kampanya metnindeki &quot;Kişi Başı&quot; ifadesinden belirlenir.
      </p>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={run} disabled={loading} style={{ height: 44, padding: "0 22px" }}>
          {loading ? "Çalışıyor… (Qlik okunuyor + Sheet yazılıyor)" : "Çalıştır"}
        </button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          Katalog + Kampanya çekilir, 3 sekmeye yazılır (Catalog / Campaign / Kıyas).
        </span>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#c0392b", color: "#c0392b", marginBottom: 16 }}>{error}</div>
      )}

      {data && (
        <>
          {(data.catMissing?.length > 0 || data.campMissing?.length > 0) && (
            <div className="card" style={{ borderColor: "#e67e22", marginBottom: 16, fontSize: 13 }}>
              <strong>Uyarı — eşleşmeyen kolon(lar):</strong>{" "}
              {data.catMissing?.length ? `Katalog: ${data.catMissing.join(", ")}. ` : ""}
              {data.campMissing?.length ? `Kampanya: ${data.campMissing.join(", ")}.` : ""}
            </div>
          )}

          {/* Strateji + özet */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Referans:</span>
                {STRATS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStrategy(s.key)}
                    style={{
                      border: "1px solid " + (strategy === s.key ? "#1f6feb" : "#d7dce3"),
                      background: strategy === s.key ? "#1f6feb" : "#fff",
                      color: strategy === s.key ? "#fff" : "#5b6675",
                      fontSize: 12.5, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                {data.catalogRows} katalog · {data.campaignRows} kampanya satırı
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {["Tutarlı", "Tutarsız", "Karşılaştırılamaz", "Tümü"].map((k) => {
                const n = k === "Tümü" ? counts.total : counts[k];
                const active = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    style={{
                      border: "1px solid " + (active ? "#1f6feb" : "#e3e7ec"),
                      background: active ? "#eef4ff" : "#fff",
                      borderRadius: 10, padding: "8px 14px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700, color: k === "Tümü" ? "#1f2733" : VCOLOR[k] }}>{n}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{k}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tablo */}
          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 600 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Provider", "Kategori", "Tür", "Birim", "Para", "Fiyat Sonra", "Referans", "Sonuç", "Not / Intro"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, CAP).map(({ row, v }, i) => (
                  <tr key={i}>
                    <td style={td} title={`#${row.providerId}`}>{row.providerName || row.providerId}</td>
                    <td style={td}>{row.category}</td>
                    <td style={td}>{row.type}</td>
                    <td style={td}>{row.unit === "kisi" ? "Kişi Başı" : "Paket"}</td>
                    <td style={td}>{row.currency}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{TR(row.priceAfter)}</td>
                    <td style={td}>{TR(v.refValue)}</td>
                    <td style={{ ...td, color: VCOLOR[v.verdict], fontWeight: 700 }}>{v.verdict}</td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 360, opacity: 0.8 }}>
                      {v.reason || row.intro}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > CAP && (
              <div style={{ padding: 10, fontSize: 12.5, opacity: 0.7 }}>
                {shown.length} satırdan ilk {CAP} gösteriliyor. Tamamı &quot;Fiyat_Tutarlılık_Kıyas&quot; sekmesinde.
              </div>
            )}
            {shown.length === 0 && (
              <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>Bu filtrede satır yok.</div>
            )}
          </div>

          {data.sheets?.kiyas?.sheetUrl && (
            <a className="sheet-link" href={data.sheets.kiyas.sheetUrl} target="_blank" rel="noreferrer"
               style={{ display: "inline-block", marginTop: 12 }}>
              Sheet&apos;i aç &rarr;
            </a>
          )}
        </>
      )}
    </main>
  );
}
