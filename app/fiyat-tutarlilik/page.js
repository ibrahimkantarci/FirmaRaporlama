"use client";
// app/fiyat-tutarlilik/page.js
// Katalog↔kampanya fiyat tutarlılık denetimi. Referans/sayım/çoklu filtre canlı;
// kolon seç/sırala (sürükle), Sorumlu PY, provider_id'ye göre gruplama,
// "yalnız tutarsız provider" analiz görünümü (toggle).
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import Link from "next/link";
import { verdictFor, upperCategory } from "../../lib/fiyat";
import { Brand } from "../brand";

const TR = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("tr-TR"));
const STRATS = [
  { key: "max", label: "Katalog Max (esnek)", info: "Kampanya fiyatı, provider'ın aynı birimdeki EN YÜKSEK katalog fiyatından düşükse Tutarlı. En müsamahalı; yalnızca açık ihlalleri yakalar, en az yanlış alarm." },
  { key: "min", label: "Katalog Min (katı)", info: "EN DÜŞÜK katalog fiyatından düşükse Tutarlı. En sıkı; daha çok satır yakalar ama gürültülü olabilir (lüks kampanya vs. ucuz menü)." },
  { key: "median", label: "Katalog Medyan", info: "Medyan katalog fiyatına göre karar verir. Orta yol; aşırı uçlardan etkilenmez." },
];
const BASES = [
  { key: "campaign", label: "Kampanya bazlı", info: "Her kampanya tek tek sayılır." },
  { key: "optimistic", label: "Provider — en az 1 tutarlı", info: "Provider'ın en az bir Tutarlı kampanyası varsa Tutarlı sayılır (iyimser)." },
  { key: "proportional", label: "Provider — oran (1/3)", info: "Provider, tutarlı kampanya oranı kadar sayılır (örn. 3 kampanyadan 1'i tutarlı → 1/3 = 0,33). Kart sayıları kesirli olabilir." },
  { key: "strict", label: "Provider — tutarsız varsa tutarsız", info: "Provider'ın bir tane bile Tutarsız kampanyası varsa Tutarsız sayılır (katı). Hiç tutarsızı yoksa Tutarlı." },
];
const VCOLOR = { Tutarlı: "#1f7a3d", Tutarsız: "#c0392b", Karşılaştırılamaz: "#8a93a0" };
const periodLabel = (p) => (p === "weekend" ? "Hafta Sonu" : p === "weekday" ? "Hafta İçi" : "Tümü");

// Kampanya tablosu kolonları (seçilebilir + sürüklenebilir).
const COLUMNS = [
  { key: "provider", label: "Provider", get: (r) => r.providerName || r.providerId },
  { key: "providerId", label: "Provider Id", get: (r) => r.providerId },
  { key: "responsiblePY", label: "Sorumlu PY", get: (r) => r.responsiblePY },
  { key: "category", label: "Kategori", get: (r) => r.category },
  { key: "upperCategory", label: "Üst Kategori", get: (r) => r.upperCategory || upperCategory(r.category) },
  { key: "city", label: "Şehir", get: (r) => r.city },
  { key: "unit", label: "Birim", get: (r) => (r.unit === "kisi" ? "Kişi Başı" : "Paket") },
  { key: "period", label: "Dönem", get: (r) => periodLabel(r.period) },
  { key: "currency", label: "Para", get: (r) => r.currency },
  { key: "priceAfter", label: "Fiyat Sonra", get: (r, v, row) => TR(row.priceAfter), bold: true },
  { key: "reference", label: "Referans", get: (r, v) => TR(v.refValue) },
  { key: "matchTier", label: "Eşleşme", get: (r) => r.matchTier },
  { key: "verdict", label: "Sonuç", get: (r, v) => v.verdict, verdict: true },
  { key: "intro", label: "Not / Intro", get: (r, v, row) => v.reason || row.intro, wrap: true },
];
const DEFAULT_ORDER = COLUMNS.map((c) => c.key);

// Filtrelenebilir boyutlar.
const DIMS = [
  { key: "category", label: "Kategori", get: (r) => r.category },
  { key: "upperCategory", label: "Üst Kategori", get: (r) => r.upperCategory || upperCategory(r.category) },
  { key: "city", label: "Şehir", get: (r) => r.city },
  { key: "responsiblePY", label: "Sorumlu PY", get: (r) => r.responsiblePY },
  { key: "unit", label: "Birim", get: (r) => (r.unit === "kisi" ? "Kişi Başı" : "Paket") },
  { key: "period", label: "Dönem", get: (r) => periodLabel(r.period) },
  { key: "currency", label: "Para", get: (r) => r.currency },
  { key: "matchTier", label: "Eşleşme", get: (r) => r.matchTier },
  { key: "label", label: "Etiket", get: (r) => r.label },
  { key: "providerName", label: "Provider", get: (r) => r.providerName || r.providerId },
  { key: "verdict", label: "Sonuç", get: (_r, v) => v.verdict },
];
const CAP = 400;
const SEL = { height: 34, padding: "0 8px", borderRadius: 8, border: "1px solid #d7dce3", background: "#fff", fontSize: 12.5 };
const POP = { position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid #d7dce3", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.12)", maxHeight: 280, overflow: "auto", minWidth: 200, padding: 6 };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR");
}
const fmtCount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function useClickOutside(onOut) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOut]);
  return ref;
}

function MultiSelect({ options, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        style={{ ...SEL, minWidth: 170, textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
        {selected.length === 0 ? "Değer seç…" : `${selected.length} seçili`} ▾
      </button>
      {open && (
        <div style={{ ...POP, minWidth: 220 }}>
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

// Kolon seç/gizle menüsü (sürükleme tablo başlıklarında).
function ColumnPicker({ order, hidden, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...SEL, cursor: "pointer" }}>Kolonlar ▾</button>
      {open && (
        <div style={POP}>
          {order.map((k) => {
            const col = COLUMNS.find((c) => c.key === k);
            return (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 6px", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!hidden.includes(k)} onChange={() => onToggle(k)} />
                {col.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Açıklama balonu: seçeneklerin (label + info) mantığını Türkçe gösterir.
function InfoPopover({ title, items }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="Açıklama"
        style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #c7d0db", background: "#fff", color: "#5b6675", fontSize: 12, fontWeight: 700, lineHeight: "1", cursor: "pointer", padding: 0 }}>i</button>
      {open && (
        <div style={{ ...POP, minWidth: 320, maxWidth: 380, padding: 12, fontSize: 12.5, lineHeight: 1.45 }}>
          {title && <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>}
          {items.map((it) => (
            <div key={it.key} style={{ marginBottom: 8 }}>
              <b>{it.label}</b>
              <div style={{ opacity: 0.8 }}>{it.info}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function providerAgg(computed) {
  const m = new Map();
  for (const { row, v } of computed) {
    const pid = row.providerId || row.providerName;
    if (!m.has(pid)) m.set(pid, { id: row.providerId, name: row.providerName, responsiblePY: row.responsiblePY, category: row.category, city: row.city, total: 0, tutarli: 0, tutarsiz: 0, kars: 0 });
    const g = m.get(pid);
    g.total++;
    if (v.verdict === "Tutarlı") g.tutarli++;
    else if (v.verdict === "Tutarsız") g.tutarsiz++;
    else g.kars++;
  }
  return m;
}
const comparableOf = (g) => g.tutarli + g.tutarsiz;
function provScore(g, mode) {
  const comp = comparableOf(g);
  if (comp === 0) return null;
  if (mode === "optimistic") return g.tutarli > 0 ? 1 : 0;
  if (mode === "strict") return g.tutarsiz > 0 ? 0 : 1;
  return g.tutarli / comp;
}
function provBucketLabel(g, mode) {
  const comp = comparableOf(g);
  if (comp === 0) return "Karşılaştırılamaz";
  if (mode === "proportional") return `${g.tutarli}/${comp} tutarlı`;
  return provScore(g, mode) === 1 ? "Tutarlı" : "Tutarsız";
}

// Kampanya satırlarını provider_id'ye göre TEK grup olacak şekilde sıralar/gruplar.
// Sıra: provider adı, sonra provider_id (sayısal) — aynı isimli farklı id'ler ayrı grup.
function buildGroups(items, agg, basis, cap) {
  const src = [...items].sort((a, a2) => {
    const c = String(a.row.providerName || "").localeCompare(String(a2.row.providerName || ""), "tr");
    if (c !== 0) return c;
    return String(a.row.providerId).localeCompare(String(a2.row.providerId), "tr", { numeric: true });
  });
  const out = [];
  let n = 0, last = null;
  for (const item of src) {
    if (n >= cap) break;
    if (item.row.providerId !== last) {
      last = item.row.providerId;
      const g = agg.get(item.row.providerId);
      out.push({ type: "group", row: item.row, bucket: g ? provBucketLabel(g, basis) : "", category: g?.category });
    }
    out.push({ type: "row", ...item });
    n++;
  }
  return out;
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
  const [view, setView] = useState("normal"); // normal | tutarsiz
  const [colOrder, setColOrder] = useState(DEFAULT_ORDER);
  const [colHidden, setColHidden] = useState([]);
  const [expanded, setExpanded] = useState([]); // açık provider rollup satırları
  const idRef = useRef(0);
  const colDrag = useRef(null);
  const savedReady = useRef(false);

  const mergeOrder = (o) =>
    DEFAULT_ORDER.filter((k) => o.includes(k)).sort((a, b) => o.indexOf(a) - o.indexOf(b)).concat(DEFAULT_ORDER.filter((k) => !o.includes(k)));

  // Önce localStorage (anında), sonra kullanıcının Sheet'teki ayarları (cihazlar arası).
  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem("fiyat_colOrder") || "null");
      const h = JSON.parse(localStorage.getItem("fiyat_colHidden") || "null");
      if (Array.isArray(o) && o.length) setColOrder(mergeOrder(o));
      if (Array.isArray(h)) setColHidden(h);
    } catch { /* yok */ }
    (async () => {
      try {
        const r = await fetch("/api/fiyat/settings");
        const j = await r.json();
        const s = j?.settings;
        if (s) {
          if (Array.isArray(s.colOrder) && s.colOrder.length) setColOrder(mergeOrder(s.colOrder));
          if (Array.isArray(s.colHidden)) setColHidden(s.colHidden);
          if (s.strategy) setStrategy(s.strategy);
          if (s.basis) setBasis(s.basis);
        }
      } catch { /* yok */ } finally { savedReady.current = true; }
    })();
  }, []);

  // Değişiklikleri localStorage + Sheet'e (debounce) yaz.
  useEffect(() => {
    try {
      localStorage.setItem("fiyat_colOrder", JSON.stringify(colOrder));
      localStorage.setItem("fiyat_colHidden", JSON.stringify(colHidden));
    } catch { /* yok */ }
    if (!savedReady.current) return;
    const t = setTimeout(() => {
      fetch("/api/fiyat/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colOrder, colHidden, strategy, basis }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [colOrder, colHidden, strategy, basis]);

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

  const isTutarsizView = view === "tutarsiz";
  const rows = data?.rows || [];
  // Tutarsız analiz görünümünde referans daima Max.
  const effStrategy = isTutarsizView ? "max" : strategy;
  const computed = useMemo(() => rows.map((r) => ({ row: r, v: verdictFor(r, effStrategy) })), [rows, effStrategy]);
  const isProv = basis !== "campaign";

  // Boyut filtreleri uygulanmış küme.
  const dimFiltered = useMemo(
    () => computed.filter(({ row, v }) => {
      for (const f of filters) {
        if (!f.dim || !f.values.length) continue;
        const dd = DIMS.find((d) => d.key === f.dim);
        if (!f.values.includes(String(dd.get(row, v)))) return false;
      }
      return true;
    }),
    [computed, filters]
  );
  const provAgg = useMemo(() => providerAgg(dimFiltered), [dimFiltered]);
  // Provider → kampanya satırları (rollup detay açılımı için).
  const byProvider = useMemo(() => {
    const m = new Map();
    for (const it of dimFiltered) {
      const pid = it.row.providerId || it.row.providerName;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(it);
    }
    return m;
  }, [dimFiltered]);
  const toggleExpand = (id) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const counts = useMemo(() => {
    if (basis === "campaign") {
      const s = { Tutarlı: 0, Tutarsız: 0, Karşılaştırılamaz: 0, total: dimFiltered.length };
      for (const { v } of dimFiltered) s[v.verdict]++;
      return s;
    }
    let T = 0, F = 0, K = 0;
    for (const g of provAgg.values()) {
      const sc = provScore(g, basis);
      if (sc == null) { K++; continue; }
      T += sc; F += 1 - sc;
    }
    return { Tutarlı: T, Tutarsız: F, Karşılaştırılamaz: K, total: provAgg.size };
  }, [basis, dimFiltered, provAgg]);

  const dimValuesAll = useMemo(() => {
    const sets = {}; DIMS.forEach((d) => (sets[d.key] = new Set()));
    computed.forEach(({ row, v }) => DIMS.forEach((d) => sets[d.key].add(d.get(row, v))));
    const out = {};
    for (const k in sets) out[k] = [...sets[k]].filter((x) => x !== "" && x != null).map(String).sort((a, b) => a.localeCompare(b, "tr"));
    return out;
  }, [computed]);

  // "Yalnız tutarsız provider" görünümü: referans Max + "en az 1 tutarlı = tutarlı"
  // kuralına göre HİÇ tutarlısı olmayan (ama karşılaştırılabilir) provider'lar.
  const tutarsizIds = useMemo(() => {
    if (!isTutarsizView) return null;
    const s = new Set();
    for (const [id, g] of provAgg) if (comparableOf(g) > 0 && g.tutarli === 0) s.add(id);
    return s;
  }, [isTutarsizView, provAgg]);

  const shown = useMemo(() => {
    if (isTutarsizView) return dimFiltered.filter(({ row }) => tutarsizIds.has(row.providerId || row.providerName));
    return dimFiltered.filter(({ v }) => cardFilter === "Tümü" || v.verdict === cardFilter);
  }, [isTutarsizView, dimFiltered, tutarsizIds, cardFilter]);

  const showProviderTable = !isTutarsizView && isProv && cardFilter === "Tümü";
  const providerRows = useMemo(() => {
    if (!showProviderTable) return [];
    return [...provAgg.values()].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "tr"));
  }, [showProviderTable, provAgg]);

  // Kampanya tablosu (gruplu). Tutarsız görünümünde grup etiketi optimistic.
  const tableItems = useMemo(() => {
    if (showProviderTable) return [];
    const groupMode = isTutarsizView ? "optimistic" : basis;
    const grouped = isProv || isTutarsizView;
    if (!grouped) return shown.slice(0, CAP).map((it) => ({ type: "row", ...it }));
    return buildGroups(shown, provAgg, groupMode, CAP);
  }, [shown, isProv, basis, provAgg, showProviderTable, isTutarsizView]);

  const visibleCols = colOrder.filter((k) => !colHidden.includes(k));

  const addFilter = () => setFilters((f) => [...f, { id: ++idRef.current, dim: "", values: [] }]);
  const updateFilter = (id, patch) => setFilters((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeFilter = (id) => setFilters((f) => f.filter((x) => x.id !== id));
  const toggleCol = (k) => setColHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  function reorderCol(target) {
    const from = colDrag.current;
    colDrag.current = null;
    if (!from || from === target) return;
    setColOrder((o) => {
      const a = o.filter((k) => k !== from);
      a.splice(a.indexOf(target), 0, from);
      return a;
    });
  }

  const th = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e3e7ec", position: "sticky", top: 0, background: "#fff", cursor: "grab", userSelect: "none", whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" };
  const cellStyle = (col, v) => {
    if (col.verdict) return { ...td, color: VCOLOR[v.verdict], fontWeight: 700 };
    if (col.bold) return { ...td, fontWeight: 600 };
    if (col.wrap) return { ...td, whiteSpace: "normal", maxWidth: 360, opacity: 0.8 };
    return td;
  };

  return (
    <main className="wrap" style={{ maxWidth: "min(1600px, 97vw)", margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Link href="/" className="gbtn">&larr; Hub</Link>
        <Brand subtitle="Fiyat Tutarlılık" />
      </div>
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
        {data && rows.length > 0 && (
          <button type="button" onClick={() => setView(isTutarsizView ? "normal" : "tutarsiz")}
            style={{ marginLeft: "auto", ...SEL, height: 38, cursor: "pointer", fontWeight: 700, color: isTutarsizView ? "#fff" : "#c0392b", background: isTutarsizView ? "#c0392b" : "#fff", borderColor: "#f0c4c0" }}>
            {isTutarsizView ? "← Normal görünüm" : "Yalnız tutarsız provider'lar"}
          </button>
        )}
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
            {isTutarsizView ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 14 }}>
                  <b style={{ color: "#c0392b" }}>{tutarsizIds.size}</b> tamamen tutarsız provider
                  <span style={{ fontSize: 12.5, opacity: 0.7 }}> · referans: Max · kural: en az 1 tutarlı = tutarlı</span>
                </div>
                <ColumnPicker order={colOrder} hidden={colHidden} onToggle={toggleCol} />
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
                      Referans:
                      <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={SEL}>
                        {STRATS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </label>
                    <InfoPopover title="Referans seçenekleri" items={STRATS} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
                      Sayım bazı:
                      <select value={basis} onChange={(e) => setBasis(e.target.value)} style={SEL}>
                        {BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                      </select>
                    </label>
                    <InfoPopover title="Sayım bazı seçenekleri" items={BASES} />
                  </div>
                  <ColumnPicker order={colOrder} hidden={colHidden} onToggle={toggleCol} />
                  <span style={{ fontSize: 13, opacity: 0.7, marginLeft: "auto" }}>
                    {data.catalogRows ?? "—"} katalog · {data.campaignRows ?? "—"} kampanya satırı
                  </span>
                </div>

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
              </>
            )}

            {/* Filtreler */}
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {filters.map((f) => (
                <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={f.dim} onChange={(e) => updateFilter(f.id, { dim: e.target.value, values: [] })} style={SEL}>
                    <option value="">Boyut…</option>
                    {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                  <MultiSelect options={f.dim ? dimValuesAll[f.dim] || [] : []} selected={f.values} onChange={(values) => updateFilter(f.id, { values })} disabled={!f.dim} />
                  <button type="button" onClick={() => removeFilter(f.id)} title="Filtreyi kaldır" style={{ ...SEL, cursor: "pointer", color: "#c0392b", borderColor: "#f0c4c0" }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addFilter} style={{ ...SEL, cursor: "pointer", color: "#1f6feb" }}>+ Filtre ekle</button>
                {filters.length > 0 && <button type="button" onClick={() => setFilters([])} style={{ ...SEL, cursor: "pointer", color: "#5b6675" }}>Tümünü temizle</button>}
                <span style={{ fontSize: 12.5, opacity: 0.6 }}>
                  {showProviderTable ? `${providerRows.length} provider` : `${shown.length} kampanya satırı`}
                </span>
              </div>
            </div>
          </div>

          {/* Tablo */}
          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 80px)" }}>
            {showProviderTable ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {["Provider", "Sorumlu PY", "Kategori", "Şehir", "Kampanya", "Tutarlı", "Tutarsız", "Karş.", "Durum"].map((h) => <th key={h} style={{ ...th, cursor: "default" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {providerRows.slice(0, CAP).map((g, i) => {
                    const pkey = g.id || g.name;
                    const open = expanded.includes(pkey);
                    return (
                      <Fragment key={i}>
                        <tr onClick={() => toggleExpand(pkey)} style={{ cursor: "pointer", background: open ? "#f6f8fb" : undefined }}>
                          <td style={{ ...td, fontWeight: 600 }} title={`#${g.id}`}>
                            <span style={{ display: "inline-block", width: 14, color: "#8a93a0" }}>{open ? "▾" : "▸"}</span>
                            {g.name || g.id}
                          </td>
                          <td style={td}>{g.responsiblePY}</td>
                          <td style={td}>{g.category}</td>
                          <td style={td}>{g.city}</td>
                          <td style={td}>{g.total}</td>
                          <td style={{ ...td, color: VCOLOR.Tutarlı, fontWeight: 600 }}>{g.tutarli}</td>
                          <td style={{ ...td, color: VCOLOR.Tutarsız, fontWeight: 600 }}>{g.tutarsiz}</td>
                          <td style={{ ...td, color: VCOLOR.Karşılaştırılamaz }}>{g.kars}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{provBucketLabel(g, basis)}</td>
                        </tr>
                        {open && (
                          <tr key={`d${i}`}>
                            <td colSpan={9} style={{ padding: "4px 8px 10px 28px", background: "#fafbfc" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    {["Kategori", "Şehir", "Birim", "Dönem", "Para", "Fiyat Sonra", "Referans", "Eşleşme", "Sonuç", "Not / Intro"].map((h) => (
                                      <th key={h} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e3e7ec", opacity: 0.7, whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(byProvider.get(pkey) || []).map((it, j) => (
                                    <tr key={j}>
                                      <td style={td}>{it.row.category}</td>
                                      <td style={td}>{it.row.city}</td>
                                      <td style={td}>{it.row.unit === "kisi" ? "Kişi Başı" : "Paket"}</td>
                                      <td style={td}>{periodLabel(it.row.period)}</td>
                                      <td style={td}>{it.row.currency}</td>
                                      <td style={{ ...td, fontWeight: 600 }}>{TR(it.row.priceAfter)}</td>
                                      <td style={td}>{TR(it.v.refValue)}</td>
                                      <td style={td}>{it.row.matchTier}</td>
                                      <td style={{ ...td, color: VCOLOR[it.v.verdict], fontWeight: 700 }}>{it.v.verdict}</td>
                                      <td style={{ ...td, whiteSpace: "normal", maxWidth: 460, opacity: 0.8 }}>{it.v.reason || it.row.intro}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {visibleCols.map((k) => {
                      const col = COLUMNS.find((c) => c.key === k);
                      return (
                        <th key={k} style={th} draggable
                          onDragStart={() => { colDrag.current = k; }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => reorderCol(k)}
                          title="Sürükleyerek sırala">
                          {col.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableItems.map((it, i) =>
                    it.type === "group" ? (
                      <tr key={`g${i}`}>
                        <td colSpan={visibleCols.length} style={{ padding: "6px 8px", background: "#f6f8fb", fontWeight: 700, borderBottom: "1px solid #e3e7ec" }}>
                          {it.row.providerName || it.row.providerId}
                          {it.category ? <span style={{ fontWeight: 500, opacity: 0.6, marginLeft: 8, fontSize: 12 }}>· {it.category}</span> : null}
                          <span style={{ fontWeight: 500, opacity: 0.65, marginLeft: 8, fontSize: 12 }}>· {it.bucket}</span>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i}>
                        {visibleCols.map((k) => {
                          const col = COLUMNS.find((c) => c.key === k);
                          return (
                            <td key={k} style={cellStyle(col, it.v)} title={k === "provider" ? `#${it.row.providerId}` : undefined}>
                              {col.get(it.row, it.v, it.row)}
                            </td>
                          );
                        })}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
            {!showProviderTable && shown.length > CAP && (
              <div style={{ padding: 10, fontSize: 12.5, opacity: 0.7 }}>
                {shown.length} satırdan ilk {CAP} gösteriliyor. Tamamı &quot;Fiyat_Tutarlılık_Kıyas&quot; sekmesinde.
              </div>
            )}
            {((showProviderTable && providerRows.length === 0) || (!showProviderTable && shown.length === 0)) && (
              <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>
                {isTutarsizView ? "Tamamen tutarsız provider yok." : "Bu filtrede satır yok."}
              </div>
            )}
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
