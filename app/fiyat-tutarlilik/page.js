"use client";
// app/fiyat-tutarlilik/page.js
// Açılışta mevcut (son çalıştırılmış) Kıyas verisini + güncelleme tarihini gösterir.
// "Çalıştır" pipeline'ı yeniden tetikler. Referans stratejisi ve boyut(kolon)+değer filtresi canlı.
import { useEffect, useMemo, useState } from "react";
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
// Filtrelenebilir boyutlar (kolonlar). get(row, verdict) → değer.
const DIMS = [
  { key: "category", label: "Kategori", get: (r) => r.category },
  { key: "city", label: "Şehir", get: (r) => r.city },
  { key: "type", label: "Tür", get: (r) => r.type },
  { key: "unit", label: "Birim", get: (r) => (r.unit === "kisi" ? "Kişi Başı" : "Paket") },
  { key: "currency", label: "Para", get: (r) => r.currency },
  { key: "label", label: "Etiket", get: (r) => r.label },
  { key: "providerName", label: "Provider", get: (r) => r.providerName || r.providerId },
  { key: "verdict", label: "Sonuç", get: (_r, v) => v.verdict },
];
const CAP = 400;

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR");
}

export default function FiyatPage() {
  const [initLoading, setInitLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [strategy, setStrategy] = useState("max");
  const [filter, setFilter] = useState("Tutarsız");
  const [dimKey, setDimKey] = useState("");
  const [dimVal, setDimVal] = useState("");

  // Açılışta mevcut veriyi yükle.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/fiyat/data");
        const j = await r.json();
        if (j.ok && !j.empty) setData(j);
      } catch {
        /* sessiz */
      } finally {
        setInitLoading(false);
      }
    })();
  }, []);

  async function run() {
    setError("");
    setRunning(true);
    try {
      const r = await fetch("/api/fiyat/run");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Çalıştırılamadı.");
      setData(j);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setRunning(false);
    }
  }

  const rows = data?.rows || [];
  const computed = useMemo(
    () => rows.map((r) => ({ row: r, v: verdictFor(r, strategy) })),
    [rows, strategy]
  );
  const counts = useMemo(() => summarize(rows, strategy), [rows, strategy]);

  const dimDef = DIMS.find((d) => d.key === dimKey);
  const dimValues = useMemo(() => {
    if (!dimDef) return [];
    const set = new Set();
    computed.forEach(({ row, v }) => set.add(dimDef.get(row, v)));
    return [...set]
      .filter((x) => x !== "" && x != null)
      .sort((a, b) => String(a).localeCompare(String(b), "tr"));
  }, [computed, dimKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(
    () =>
      computed.filter(({ row, v }) => {
        if (filter !== "Tümü" && v.verdict !== filter) return false;
        if (dimDef && dimVal !== "" && String(dimDef.get(row, v)) !== String(dimVal)) return false;
        return true;
      }),
    [computed, filter, dimKey, dimVal] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const th = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e3e7ec", position: "sticky", top: 0, background: "#fff" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" };
  const sel = { height: 34, padding: "0 8px", borderRadius: 8, border: "1px solid #d7dce3" };

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
        eşleşen birimdeki katalog referansından düşükse <b>Tutarlı</b>, değilse <b>Tutarsız</b>.
        Birim, kampanya metnindeki &quot;Kişi Başı&quot; ifadesinden belirlenir.
      </p>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={run} disabled={running} style={{ height: 44, padding: "0 22px" }}>
          {running ? "Çalışıyor… (Qlik + Sheet)" : "Çalıştır (verileri yenile)"}
        </button>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          {initLoading
            ? "Mevcut veri yükleniyor…"
            : data
            ? <>Son güncelleme: <b>{fmtDate(data.updatedAt)}</b></>
            : "Henüz çalıştırılmadı."}
        </span>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#c0392b", color: "#c0392b", marginBottom: 16 }}>{error}</div>
      )}

      {data && rows.length > 0 && (
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
                {data.catalogRows ?? "—"} katalog · {data.campaignRows ?? "—"} kampanya satırı
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

            {/* Boyut (kolon) + değer filtresi */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>Filtre:</span>
              <select
                value={dimKey}
                onChange={(e) => { setDimKey(e.target.value); setDimVal(""); }}
                style={sel}
              >
                <option value="">Boyut seç…</option>
                {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <select
                value={dimVal}
                onChange={(e) => setDimVal(e.target.value)}
                disabled={!dimKey}
                style={{ ...sel, minWidth: 200 }}
              >
                <option value="">{dimKey ? "Değer seç…" : "—"}</option>
                {dimValues.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
              </select>
              {(dimKey || dimVal) && (
                <button
                  type="button"
                  onClick={() => { setDimKey(""); setDimVal(""); }}
                  style={{ ...sel, cursor: "pointer", color: "#5b6675", background: "#fff" }}
                >
                  Temizle
                </button>
              )}
              <span style={{ fontSize: 12.5, opacity: 0.6 }}>{shown.length} satır</span>
            </div>
          </div>

          {/* Tablo */}
          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 600 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Provider", "Kategori", "Şehir", "Tür", "Birim", "Para", "Fiyat Sonra", "Referans", "Sonuç", "Not / Intro"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, CAP).map(({ row, v }, i) => (
                  <tr key={i}>
                    <td style={td} title={`#${row.providerId}`}>{row.providerName || row.providerId}</td>
                    <td style={td}>{row.category}</td>
                    <td style={td}>{row.city}</td>
                    <td style={td}>{row.type}</td>
                    <td style={td}>{row.unit === "kisi" ? "Kişi Başı" : "Paket"}</td>
                    <td style={td}>{row.currency}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{TR(row.priceAfter)}</td>
                    <td style={td}>{TR(v.refValue)}</td>
                    <td style={{ ...td, color: VCOLOR[v.verdict], fontWeight: 700 }}>{v.verdict}</td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 360, opacity: 0.8 }}>{v.reason || row.intro}</td>
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

      {!initLoading && data && rows.length === 0 && (
        <div className="card" style={{ fontSize: 13, opacity: 0.75 }}>Veri boş.</div>
      )}
    </main>
  );
}
