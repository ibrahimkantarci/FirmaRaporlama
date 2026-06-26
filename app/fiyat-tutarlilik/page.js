"use client";
// app/fiyat-tutarlilik/page.js
// Açılışta mevcut Kıyas verisini + güncelleme tarihini gösterir; "Çalıştır" pipeline'ı tetikler.
// Referans stratejisi, sayım bazı (kampanya/provider) ve çoklu boyut+değer filtreleri canlı.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { verdictFor, summarize } from "../../lib/fiyat";

const TR = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("tr-TR"));
const STRATS = [
  { key: "max", label: "Katalog Max (esnek)" },
  { key: "min", label: "Katalog Min (katı)" },
  { key: "median", label: "Katalog Medyan" },
  { key: "isMain", label: "Ana Katalog" },
];
const BASES = [
  { key: "campaign", label: "Kampanya bazlı" },
  { key: "optimistic", label: "Provider — en az 1 tutarlı" },
  { key: "proportional", label: "Provider — oran (1/3)" },
  { key: "strict", label: "Provider — tutarsız varsa tutarsız" },
];
const VCOLOR = { Tutarlı: "#1f7a3d", Tutarsız: "#c0392b", Karşılaştırılamaz: "#8a93a0" };
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
const SEL = { height: 34, padding: "0 8px", borderRadius: 8, border: "1px solid #d7dce3", background: "#fff", fontSize: 12.5 };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR");
}
const fmtCount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Checkbox'lı çoklu seçim açılır menüsü.
function MultiSelect({ options, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const toggle = (val) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  const label = selected.length === 0 ? "Değer seç…" : `${selected.length} seçili`;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{ ...SEL, minWidth: 170, textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}
      >
        {label} ▾
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid #d7dce3", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", maxHeight: 260, overflow: "auto", minWidth: 220, padding: 6 }}>
          {options.length === 0 && <div style={{ padding: 8, fontSize: 12.5, opacity: 0.6 }}>—</div>}
          {options.map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 6px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Provider başına {comparable, tutarli, tutarsiz} özetini kurar.
function providerAgg(computed) {
  const m = new Map();
  for (const { row, v } of computed) {
    const pid = row.providerId || row.providerName;
    if (!m.has(pid)) m.set(pid, { comparable: 0, tutarli: 0, tutarsiz: 0 });
    const g = m.get(pid);
    if (v.verdict === "Tutarlı") { g.comparable++; g.tutarli++; }
    else if (v.verdict === "Tutarsız") { g.comparable++; g.tutarsiz++; }
  }
  return m;
}
function provScore(g, mode) {
  if (g.comparable === 0) return null; // karşılaştırılamaz
  if (mode === "optimistic") return g.tutarli > 0 ? 1 : 0;
  if (mode === "strict") return g.tutarsiz > 0 ? 0 : 1;
  return g.tutarli / g.comparable; // proportional
}
function provBucketLabel(g, mode) {
  if (g.comparable === 0) return "Karşılaştırılamaz";
  if (mode === "proportional") return `${g.tutarli}/${g.comparable} tutarlı`;
  const s = provScore(g, mode);
  return s === 1 ? "Tutarlı" : "Tutarsız";
}

export default function FiyatPage() {
  const [initLoading, setInitLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [strategy, setStrategy] = useState("max");
  const [basis, setBasis] = useState("campaign");
  const [cardFilter, setCardFilter] = useState("Tutarsız");
  const [filters, setFilters] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/fiyat/data");
        const j = await r.json();
        if (j.ok && !j.empty) setData(j);
      } catch { /* sessiz */ } finally { setInitLoading(false); }
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
  const computed = useMemo(() => rows.map((r) => ({ row: r, v: verdictFor(r, strategy) })), [rows, strategy]);
  const provAgg = useMemo(() => providerAgg(computed), [computed]);

  // Kart sayımları: kampanya bazlı (campaign) ya da provider bazlı (3 mod).
  const counts = useMemo(() => {
    if (basis === "campaign") return summarize(rows, strategy);
    let T = 0, F = 0, K = 0;
    for (const g of provAgg.values()) {
      const s = provScore(g, basis);
      if (s == null) { K++; continue; }
      T += s; F += 1 - s;
    }
    return { Tutarlı: T, Tutarsız: F, Karşılaştırılamaz: K, total: provAgg.size };
  }, [basis, rows, strategy, provAgg]);

  // Her boyutun ayrık değerleri (filtre menüleri için).
  const dimValuesAll = useMemo(() => {
    const sets = {}; DIMS.forEach((d) => (sets[d.key] = new Set()));
    computed.forEach(({ row, v }) => DIMS.forEach((d) => sets[d.key].add(d.get(row, v))));
    const out = {};
    for (const k in sets) out[k] = [...sets[k]].filter((x) => x !== "" && x != null).map(String).sort((a, b) => a.localeCompare(b, "tr"));
    return out;
  }, [computed]);

  const shown = useMemo(
    () => computed.filter(({ row, v }) => {
      if (cardFilter !== "Tümü" && v.verdict !== cardFilter) return false;
      for (const f of filters) {
        if (!f.dim || !f.values.length) continue;
        const dd = DIMS.find((d) => d.key === f.dim);
        if (!f.values.includes(String(dd.get(row, v)))) return false;
      }
      return true;
    }),
    [computed, cardFilter, filters]
  );

  // Provider bazlı modda tabloyu provider'a göre grupla.
  const isProv = basis !== "campaign";
  const tableItems = useMemo(() => {
    const src = isProv
      ? [...shown].sort((a, b) => String(a.row.providerName || a.row.providerId).localeCompare(String(b.row.providerName || b.row.providerId), "tr"))
      : shown;
    const out = [];
    let n = 0, lastProv = null;
    for (const item of src) {
      if (n >= CAP) break;
      if (isProv && item.row.providerId !== lastProv) {
        lastProv = item.row.providerId;
        const g = provAgg.get(item.row.providerId);
        out.push({ type: "group", row: item.row, bucket: g ? provBucketLabel(g, basis) : "" });
      }
      out.push({ type: "row", ...item });
      n++;
    }
    return out;
  }, [shown, isProv, basis, provAgg]);

  const addFilter = () => setFilters((f) => [...f, { id: ++idRef.current, dim: "", values: [] }]);
  const updateFilter = (id, patch) => setFilters((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeFilter = (id) => setFilters((f) => f.filter((x) => x.id !== id));

  const th = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e3e7ec", position: "sticky", top: 0, background: "#fff" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" };

  return (
    <main className="wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link href="/" style={{ display: "inline-block", border: "1px solid #d7dce3", background: "#fff", color: "#5b6675", textDecoration: "none", fontSize: 12.5, padding: "6px 12px", borderRadius: 8, marginBottom: 12 }}>
        &larr; Performans Yönetimi
      </Link>
      <p className="eyebrow">Qlik → Google Sheets</p>
      <h1 className="title">Fiyat Tutarlılık</h1>
      <p className="lede">
        Aktif provider&apos;ların katalog ve kampanya fiyatlarını eşleştirir; kampanya fiyatı
        eşleşen birimdeki katalog referansından düşükse <b>Tutarlı</b>, değilse <b>Tutarsız</b>.
      </p>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={run} disabled={running} style={{ height: 44, padding: "0 22px" }}>
          {running ? "Çalışıyor… (Qlik + Sheet)" : "Çalıştır (verileri yenile)"}
        </button>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          {initLoading ? "Mevcut veri yükleniyor…" : data ? <>Son güncelleme: <b>{fmtDate(data.updatedAt)}</b></> : "Henüz çalıştırılmadı."}
        </span>
      </div>

      {error && <div className="card" style={{ borderColor: "#c0392b", color: "#c0392b", marginBottom: 16 }}>{error}</div>}

      {data && rows.length > 0 && (
        <>
          {(data.catMissing?.length > 0 || data.campMissing?.length > 0) && (
            <div className="card" style={{ borderColor: "#e67e22", marginBottom: 16, fontSize: 13 }}>
              <strong>Uyarı — eşleşmeyen kolon(lar):</strong>{" "}
              {data.catMissing?.length ? `Katalog: ${data.catMissing.join(", ")}. ` : ""}
              {data.campMissing?.length ? `Kampanya: ${data.campMissing.join(", ")}.` : ""}
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            {/* Yan yana açılır menüler: Referans + Sayım bazı */}
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
                Referans:
                <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={SEL}>
                  {STRATS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
                Sayım bazı:
                <select value={basis} onChange={(e) => setBasis(e.target.value)} style={SEL}>
                  {BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>
              <span style={{ fontSize: 13, opacity: 0.7, marginLeft: "auto" }}>
                {data.catalogRows ?? "—"} katalog · {data.campaignRows ?? "—"} kampanya satırı
              </span>
            </div>

            {/* Sayı kartları (sayı + %) */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {["Tutarlı", "Tutarsız", "Karşılaştırılamaz", "Tümü"].map((k) => {
                const n = k === "Tümü" ? counts.total : counts[k];
                const pctv = counts.total ? (n / counts.total) * 100 : 0;
                const active = cardFilter === k;
                return (
                  <button key={k} type="button" onClick={() => setCardFilter(k)}
                    style={{ border: "1px solid " + (active ? "#1f6feb" : "#e3e7ec"), background: active ? "#eef4ff" : "#fff", borderRadius: 10, padding: "8px 14px", cursor: "pointer", textAlign: "left", minWidth: 110 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k === "Tümü" ? "#1f2733" : VCOLOR[k] }}>
                      {fmtCount(n)}
                      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6, marginLeft: 6 }}>{pctv.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{k}{isProv && k !== "Tümü" ? " (provider)" : ""}</div>
                  </button>
                );
              })}
            </div>

            {/* Çoklu boyut + çoklu değer filtreleri */}
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {filters.map((f) => (
                <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={f.dim} onChange={(e) => updateFilter(f.id, { dim: e.target.value, values: [] })} style={SEL}>
                    <option value="">Boyut…</option>
                    {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                  <MultiSelect
                    options={f.dim ? dimValuesAll[f.dim] || [] : []}
                    selected={f.values}
                    onChange={(values) => updateFilter(f.id, { values })}
                    disabled={!f.dim}
                  />
                  <button type="button" onClick={() => removeFilter(f.id)} title="Filtreyi kaldır"
                    style={{ ...SEL, cursor: "pointer", color: "#c0392b", borderColor: "#f0c4c0" }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addFilter} style={{ ...SEL, cursor: "pointer", color: "#1f6feb" }}>+ Filtre ekle</button>
                {filters.length > 0 && (
                  <button type="button" onClick={() => setFilters([])} style={{ ...SEL, cursor: "pointer", color: "#5b6675" }}>Tümünü temizle</button>
                )}
                <span style={{ fontSize: 12.5, opacity: 0.6 }}>{shown.length} kampanya satırı</span>
              </div>
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
                {tableItems.map((it, i) =>
                  it.type === "group" ? (
                    <tr key={`g${i}`}>
                      <td colSpan={10} style={{ padding: "6px 8px", background: "#f6f8fb", fontWeight: 700, borderBottom: "1px solid #e3e7ec" }}>
                        {it.row.providerName || it.row.providerId}
                        <span style={{ fontWeight: 500, opacity: 0.65, marginLeft: 8, fontSize: 12 }}>· {it.bucket}</span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td style={td} title={`#${it.row.providerId}`}>{it.row.providerName || it.row.providerId}</td>
                      <td style={td}>{it.row.category}</td>
                      <td style={td}>{it.row.city}</td>
                      <td style={td}>{it.row.type}</td>
                      <td style={td}>{it.row.unit === "kisi" ? "Kişi Başı" : "Paket"}</td>
                      <td style={td}>{it.row.currency}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{TR(it.row.priceAfter)}</td>
                      <td style={td}>{TR(it.v.refValue)}</td>
                      <td style={{ ...td, color: VCOLOR[it.v.verdict], fontWeight: 700 }}>{it.v.verdict}</td>
                      <td style={{ ...td, whiteSpace: "normal", maxWidth: 360, opacity: 0.8 }}>{it.v.reason || it.row.intro}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {shown.length > CAP && (
              <div style={{ padding: 10, fontSize: 12.5, opacity: 0.7 }}>
                {shown.length} satırdan ilk {CAP} gösteriliyor. Tamamı &quot;Fiyat_Tutarlılık_Kıyas&quot; sekmesinde.
              </div>
            )}
            {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>Bu filtrede satır yok.</div>}
          </div>

          {data.sheets?.kiyas?.sheetUrl && (
            <a className="sheet-link" href={data.sheets.kiyas.sheetUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12 }}>
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
