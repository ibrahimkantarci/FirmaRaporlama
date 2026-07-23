"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Black hole plan uygulaması — basit Notion tarzı blok editörü + takvim.
//
// Sekmeler:
//   Sayfalar  → sayfa listesi + blok editörü (mobilde liste ↔ editör geçişli)
//   Haftalık  → seçili haftanın 7 günü, tarihli yapılacaklar gün gün
//   Aylık     → seçili ayın tarihli yapılacakları gün gruplu liste + ilerleme
//   Takvim    → ay ızgarası; güne dokun → o günün yapılacakları altta
//
// Tarih: todo bloklarının yanındaki küçük tarih kutusu (opsiyonel "d" alanı).
// Takvim görünümleri TÜM sayfalardaki tarihli todoları toplar; kutucuğu
// işaretlemek ilgili sayfayı anında kaydeder (son kaydeden kazanır).
//
// Editör kısayolları: "# " başlık · "[] " yapılacak · Enter yeni blok ·
// boş blokta Backspace sil · Ctrl/Cmd+S kaydet.
// ───────────────────────────────────────────────────────────────────────────

function newId() {
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}
function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Tarih yardımcıları (hep yerel gün; saat dilimi kaymasın diye string tabanlı) ──
const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function fromYmd(s) {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Pazartesi başlangıç
  return x;
}
function gunEtiket(d) {
  return GUN_KISA[(d.getDay() + 6) % 7] + " " + d.getDate();
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 720px)");
    const h = () => setM(q.matches);
    h();
    q.addEventListener("change", h);
    return () => q.removeEventListener("change", h);
  }, []);
  return m;
}

const S = {
  root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#0b0b10", color: "#e4e4e7" },
  tabs: {
    display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid #1f1f28",
    background: "#0e0e15", overflowX: "auto", flexShrink: 0, WebkitOverflowScrolling: "touch",
  },
  tab: (on) => ({
    border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
    background: on ? "#1e1b2e" : "transparent", color: on ? "#c4b5fd" : "#71717a",
  }),
  wrap: { display: "flex", flex: 1, minHeight: 0 },
  side: (mobile) => ({
    width: mobile ? "100%" : 230, flexShrink: 0, padding: "14px 10px", overflowY: "auto",
    background: "#0e0e15", borderRight: mobile ? "none" : "1px solid #1f1f28",
  }),
  pageBtn: (on) => ({
    display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
    border: "none", borderRadius: 7, padding: "9px 9px", marginBottom: 2, fontSize: 13.5,
    cursor: "pointer", color: on ? "#fff" : "#a1a1aa",
    background: on ? "#1e1b2e" : "transparent", fontWeight: on ? 700 : 500,
  }),
  main: (mobile) => ({
    flex: 1, minWidth: 0, overflowY: "auto",
    padding: mobile ? "18px 16px 70px" : "34px 40px 80px",
  }),
  title: (mobile) => ({
    width: "100%", border: "none", outline: "none", background: "transparent",
    color: "#fafafa", fontSize: mobile ? 22 : 28, fontWeight: 800, marginBottom: 16, padding: 0,
  }),
  blockRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 2 },
  ta: (t) => ({
    flex: 1, border: "none", outline: "none", background: "transparent", resize: "none",
    color: t === "h" ? "#fafafa" : "#d4d4d8", overflow: "hidden", minWidth: 0,
    fontSize: t === "h" ? 19 : 14.5, fontWeight: t === "h" ? 800 : 400,
    lineHeight: t === "h" ? "28px" : "24px", padding: "2px 0", fontFamily: "inherit",
  }),
  dateIn: {
    border: "1px solid #2a2a35", background: "#12121a", color: "#a1a1aa", colorScheme: "dark",
    borderRadius: 6, fontSize: 11, padding: "2px 4px", marginTop: 3, flexShrink: 0, width: 118,
  },
  smallBtn: {
    border: "1px solid #2a2a35", background: "#15151d", color: "#a1a1aa",
    borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
  navBar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  navLabel: { fontSize: 16, fontWeight: 800, color: "#fafafa", minWidth: 140 },
  aggItem: { display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", borderRadius: 7 },
  pageTag: {
    fontSize: 10, fontWeight: 700, color: "#a78bfa", background: "#1e1b2e",
    borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2,
  },
  empty: { color: "#52525b", fontSize: 13, padding: "18px 6px" },
};

function Block({ b, mobile, onChange, onKeyDown, taRef }) {
  useEffect(() => {
    const el = taRef.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  });
  return (
    <div style={{ ...S.blockRow, flexWrap: mobile && b.t === "todo" ? "wrap" : "nowrap" }}>
      {b.t === "todo" ? (
        <input
          type="checkbox" checked={!!b.c}
          onChange={(e) => onChange({ ...b, c: e.target.checked })}
          style={{ marginTop: 7, accentColor: "#7c3aed", cursor: "pointer", width: 16, height: 16 }}
        />
      ) : (
        <span style={{ width: 13, flexShrink: 0 }} />
      )}
      <textarea
        ref={taRef} rows={1} value={b.x} spellCheck={false}
        placeholder={b.t === "h" ? "Başlık" : "Yaz… ('# ' başlık, '[] ' yapılacak)"}
        onChange={(e) => {
          let v = e.target.value, t = b.t, c = b.c;
          if (t === "p" && v.startsWith("# ")) { t = "h"; v = v.slice(2); }
          else if (t === "p" && (v.startsWith("[] ") || v.startsWith("[ ] "))) { t = "todo"; v = v.replace(/^\[\s?\]\s/, ""); c = false; }
          onChange({ t, x: v, ...(t === "todo" ? { c: !!c, ...(b.d ? { d: b.d } : {}) } : {}) });
        }}
        onKeyDown={onKeyDown}
        style={{ ...S.ta(b.t), textDecoration: b.t === "todo" && b.c ? "line-through" : "none", opacity: b.t === "todo" && b.c ? 0.55 : 1 }}
      />
      {b.t === "todo" && (
        <input
          type="date" value={b.d || ""} title="Tarih (haftalık/aylık/takvimde görünür)"
          onChange={(e) => {
            const nb = { ...b };
            if (e.target.value) nb.d = e.target.value; else delete nb.d;
            onChange(nb);
          }}
          style={{ ...S.dateIn, marginLeft: mobile ? 24 : 0 }}
        />
      )}
    </div>
  );
}

// Toplu görünümlerdeki tek satır: kutucuk + metin + sayfa etiketi.
function AggItem({ it, onToggle, onOpen }) {
  return (
    <div style={S.aggItem}>
      <input
        type="checkbox" checked={it.c} onChange={() => onToggle(it)}
        style={{ marginTop: 3, accentColor: "#7c3aed", cursor: "pointer", width: 16, height: 16, flexShrink: 0 }}
      />
      <span style={{ fontSize: 13.5, lineHeight: "20px", minWidth: 0, textDecoration: it.c ? "line-through" : "none", opacity: it.c ? 0.5 : 1 }}>
        {it.x || "(boş)"}
      </span>
      <button onClick={() => onOpen(it.pageId)} style={{ ...S.pageTag, border: "none", cursor: "pointer", marginLeft: "auto" }}>
        {it.pageTitle}
      </button>
    </div>
  );
}

export default function Planner() {
  const mobile = useIsMobile();
  const [view, setView] = useState("sayfalar"); // sayfalar | hafta | ay | takvim
  const [mobilePane, setMobilePane] = useState("list"); // mobil Sayfalar: list | edit

  const [pages, setPages] = useState([]);
  const [cur, setCur] = useState(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [savedSig, setSavedSig] = useState("");
  const [state, setState] = useState("loading"); // loading|idle|saving|error
  const [msg, setMsg] = useState("");
  const taRefs = useRef({});
  const focusIdx = useRef(null);

  const bugun = ymd(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [calY, setCalY] = useState(() => new Date().getFullYear());
  const [calM, setCalM] = useState(() => new Date().getMonth()); // 0-11
  const [selDay, setSelDay] = useState(bugun);

  const sig = JSON.stringify({ title, blocks });
  const dirty = cur !== null && sig !== savedSig;

  function openPage(p, toEdit = true) {
    setCur(p.id); setTitle(p.title);
    const bs = p.blocks.length ? p.blocks : [{ t: "p", x: "" }];
    setBlocks(bs);
    setSavedSig(JSON.stringify({ title: p.title, blocks: bs }));
    setMsg("");
    if (toEdit) { setView("sayfalar"); setMobilePane("edit"); }
  }

  useEffect(() => {
    fetch("/api/planlar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.ok === false) throw new Error(d?.error || "Okunamadı");
        setPages(d.pages || []);
        setState("idle");
        // mobile state'i bu closure'da bayat kalabilir (ilk render false) — medyayı doğrudan sor:
        // telefonda ilk sayfayı otomatik AÇMA, kullanıcı listeden seçsin.
        const isMob = window.matchMedia("(max-width: 720px)").matches;
        if ((d.pages || []).length && !isMob) openPage(d.pages[0], false);
      })
      .catch((e) => { setState("error"); setMsg(e?.message || "Yüklenemedi"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focusIdx.current != null) {
      const r = taRefs.current[focusIdx.current];
      if (r && r.current) r.current.focus();
      focusIdx.current = null;
    }
  }, [blocks.length]);

  // Açık sayfanın taslağı toplu görünümlere de yansısın (kaydedilmemiş tarihler dahil).
  const effPages = useMemo(
    () => pages.map((p) => (p.id === cur ? { ...p, title, blocks } : p)),
    [pages, cur, title, blocks]
  );
  const items = useMemo(() => {
    const out = [];
    for (const p of effPages) {
      (p.blocks || []).forEach((b, idx) => {
        if (b.t === "todo" && b.d) {
          out.push({ pageId: p.id, pageTitle: p.title || "(adsız)", idx, x: b.x, c: !!b.c, d: b.d });
        }
      });
    }
    return out;
  }, [effPages]);
  const itemsByDay = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.d)) m.set(it.d, []);
      m.get(it.d).push(it);
    }
    return m;
  }, [items]);

  function addPage() {
    const p = { id: newId(), title: "", blocks: [{ t: "p", x: "" }], updatedBy: "", updatedAt: "" };
    setPages((xs) => [p, ...xs]);
    openPage(p);
  }

  async function postPage(id, pTitle, pBlocks) {
    const r = await fetch("/api/planlar", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: { id, title: pTitle, blocks: pBlocks } }),
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d?.error || "Kaydedilemedi");
    return d.page;
  }

  async function save() {
    if (!cur || !dirty || state === "saving") return;
    setState("saving"); setMsg("");
    try {
      const p = await postPage(cur, title, blocks);
      setPages((xs) => xs.map((x) => (x.id === cur ? p : x)));
      setSavedSig(JSON.stringify({ title: p.title, blocks: p.blocks }));
      setState("idle"); setMsg("Kaydedildi"); setTimeout(() => setMsg(""), 2000);
    } catch (e) { setState("error"); setMsg(e?.message || "Kaydedilemedi"); }
  }

  // Toplu görünümden kutucuk işaretleme → ilgili sayfayı anında kaydet.
  async function toggleItem(it) {
    const isCur = it.pageId === cur;
    const src = isCur ? blocks : (pages.find((p) => p.id === it.pageId)?.blocks || []);
    const nb = src.map((b, j) => (j === it.idx ? { ...b, c: !b.c } : b));
    const pTitle = isCur ? title : (pages.find((p) => p.id === it.pageId)?.title || "");
    if (isCur) setBlocks(nb);
    setPages((xs) => xs.map((p) => (p.id === it.pageId ? { ...p, blocks: nb } : p))); // iyimser
    try {
      const p = await postPage(it.pageId, pTitle, nb);
      setPages((xs) => xs.map((x) => (x.id === it.pageId ? p : x)));
      if (isCur) setSavedSig(JSON.stringify({ title: p.title, blocks: p.blocks }));
    } catch (e) {
      setMsg((e?.message || "Kaydedilemedi") + " — sayfayı yenileyin");
    }
  }

  async function removePage() {
    if (!cur) return;
    if (!confirm("Bu sayfa silinsin mi?")) return;
    const id = cur;
    try {
      const r = await fetch("/api/planlar?id=" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.error || "Silinemedi");
    } catch (e) {
      // Sheet'te hiç kaydedilmemiş yeni sayfa 404 döner — yerelden silmek yeterli.
    }
    setPages((xs) => xs.filter((p) => p.id !== id));
    setCur(null); setTitle(""); setBlocks([]); setSavedSig("");
    setMobilePane("list");
  }

  function blockKeyDown(i) {
    return (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setBlocks((bs) => {
          const next = bs.slice();
          const t = bs[i].t === "todo" ? "todo" : "p";
          next.splice(i + 1, 0, t === "todo" ? { t, x: "", c: false } : { t: "p", x: "" });
          return next;
        });
        focusIdx.current = i + 1;
      } else if (e.key === "Backspace" && blocks[i].x === "" && blocks.length > 1) {
        e.preventDefault();
        setBlocks((bs) => bs.filter((_, j) => j !== i));
        focusIdx.current = Math.max(0, i - 1);
      }
    };
  }

  useEffect(() => {
    function h(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── Görünümler ──────────────────────────────────────────────────────────

  function renderSayfalar() {
    const list = (
      <aside style={S.side(mobile)}>
        <button onClick={addPage} style={{ ...S.smallBtn, width: "100%", marginBottom: 10, background: "#1e1b2e", color: "#c4b5fd", border: "1px solid #312a52", padding: "9px 12px" }}>
          + Yeni sayfa
        </button>
        {state === "loading" ? (
          <div style={{ fontSize: 12, color: "#52525b", padding: 8 }}>Yükleniyor…</div>
        ) : pages.length === 0 ? (
          <div style={{ fontSize: 12, color: "#52525b", padding: 8 }}>Henüz sayfa yok</div>
        ) : (
          pages.map((p) => (
            <button key={p.id} onClick={() => openPage(p)} style={S.pageBtn(p.id === cur)}>
              <span aria-hidden="true" style={{ fontSize: 11 }}>◦</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title || "(adsız)"}
              </span>
            </button>
          ))
        )}
      </aside>
    );

    const editor = (
      <main style={S.main(mobile)}>
        {cur === null ? (
          <div style={{ color: "#52525b", fontSize: 14, marginTop: 60, textAlign: "center" }}>
            {mobile ? "Listeden bir sayfa seç." : "Soldan bir sayfa seç ya da yeni sayfa aç."}
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {mobile && (
              <button onClick={() => setMobilePane("list")} style={{ ...S.smallBtn, marginBottom: 14 }}>
                ‹ Sayfalar
              </button>
            )}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adsız sayfa" style={S.title(mobile)} spellCheck={false} />
            {blocks.map((b, i) => {
              if (!taRefs.current[i]) taRefs.current[i] = { current: null };
              return (
                <Block
                  key={i} b={b} mobile={mobile} taRef={taRefs.current[i]}
                  onChange={(nb) => setBlocks((bs) => bs.map((x, j) => (j === i ? nb : x)))}
                  onKeyDown={blockKeyDown(i)}
                />
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 26, borderTop: "1px solid #1f1f28", paddingTop: 12, flexWrap: "wrap" }}>
              <button onClick={save} disabled={!dirty || state === "saving"}
                style={{ ...S.smallBtn, background: dirty ? "#7c3aed" : "#15151d", color: dirty ? "#fff" : "#52525b", border: "1px solid " + (dirty ? "#7c3aed" : "#2a2a35") }}>
                {state === "saving" ? "Kaydediliyor…" : dirty ? (mobile ? "Kaydet" : "Kaydet (Ctrl+S)") : "Kayıtlı"}
              </button>
              <button onClick={removePage} style={{ ...S.smallBtn, color: "#f87171", borderColor: "#3b1d1d" }}>Sayfayı sil</button>
              <span style={{ fontSize: 11.5, color: state === "error" ? "#f87171" : "#52525b" }}>
                {msg || (() => { const p = pages.find((x) => x.id === cur); return p?.updatedAt ? `${fmt(p.updatedAt)} · ${p.updatedBy}` : ""; })()}
              </span>
            </div>
          </div>
        )}
      </main>
    );

    if (mobile) return <div style={S.wrap}>{mobilePane === "list" ? list : editor}</div>;
    return <div style={S.wrap}>{list}{editor}</div>;
  }

  function NavBar({ label, onPrev, onNext, onToday }) {
    return (
      <div style={S.navBar}>
        <button onClick={onPrev} style={S.smallBtn} aria-label="Önceki">‹</button>
        <span style={S.navLabel}>{label}</span>
        <button onClick={onNext} style={S.smallBtn} aria-label="Sonraki">›</button>
        <button onClick={onToday} style={{ ...S.smallBtn, marginLeft: 4 }}>Bugün</button>
      </div>
    );
  }

  function Progress({ list }) {
    const done = list.filter((x) => x.c).length;
    if (!list.length) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, maxWidth: 280, height: 7, background: "#1f1f28", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: (done / list.length) * 100 + "%", height: "100%", background: "#7c3aed" }} />
        </div>
        <span style={{ fontSize: 12, color: "#a1a1aa" }}>{done}/{list.length} tamamlandı</span>
      </div>
    );
  }

  function renderHafta() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekItems = days.flatMap((d) => itemsByDay.get(ymd(d)) || []);
    const end = addDays(weekStart, 6);
    const label =
      weekStart.getDate() + (weekStart.getMonth() === end.getMonth() ? "" : " " + AY_KISA[weekStart.getMonth()]) +
      " – " + end.getDate() + " " + AY_KISA[end.getMonth()] + " " + end.getFullYear();

    return (
      <main style={S.main(mobile)}>
        <NavBar
          label={label}
          onPrev={() => setWeekStart((d) => addDays(d, -7))}
          onNext={() => setWeekStart((d) => addDays(d, 7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
        />
        <Progress list={weekItems} />
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(7, 1fr)", gap: 8 }}>
          {days.map((d) => {
            const k = ymd(d);
            const list = itemsByDay.get(k) || [];
            const isToday = k === bugun;
            return (
              <div key={k} style={{
                background: "#0e0e15", border: "1px solid " + (isToday ? "#7c3aed" : "#1f1f28"),
                borderRadius: 10, padding: "8px 6px", minHeight: mobile ? 0 : 120,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: isToday ? "#c4b5fd" : "#71717a", marginBottom: 4, padding: "0 6px" }}>
                  {gunEtiket(d)}{isToday ? " · bugün" : ""}
                </div>
                {list.length === 0 ? (
                  mobile ? null : <div style={{ fontSize: 11, color: "#3f3f46", padding: "0 6px" }}>—</div>
                ) : (
                  list.map((it, i) => <AggItem key={it.pageId + ":" + it.idx + ":" + i} it={it} onToggle={toggleItem} onOpen={(id) => { const p = pages.find((x) => x.id === id); if (p) openPage(p); }} />)
                )}
              </div>
            );
          })}
        </div>
        {weekItems.length === 0 && (
          <div style={S.empty}>Bu hafta için tarihli görev yok. Sayfalar'da bir yapılacağın yanındaki tarih kutusunu doldur — burada görünür.</div>
        )}
      </main>
    );
  }

  function renderAy() {
    const pre = calY + "-" + String(calM + 1).padStart(2, "0");
    const monthItems = items.filter((it) => it.d.startsWith(pre)).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const groups = [];
    for (const it of monthItems) {
      if (!groups.length || groups[groups.length - 1].d !== it.d) groups.push({ d: it.d, list: [] });
      groups[groups.length - 1].list.push(it);
    }
    return (
      <main style={S.main(mobile)}>
        <NavBar
          label={AY_UZUN[calM] + " " + calY}
          onPrev={() => { const m = calM === 0 ? 11 : calM - 1; setCalM(m); if (m === 11) setCalY((y) => y - 1); }}
          onNext={() => { const m = calM === 11 ? 0 : calM + 1; setCalM(m); if (m === 0) setCalY((y) => y + 1); }}
          onToday={() => { const n = new Date(); setCalY(n.getFullYear()); setCalM(n.getMonth()); }}
        />
        <Progress list={monthItems} />
        {groups.length === 0 ? (
          <div style={S.empty}>Bu ay için tarihli görev yok.</div>
        ) : (
          groups.map((g) => {
            const d = fromYmd(g.d);
            const isToday = g.d === bugun;
            return (
              <div key={g.d} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: isToday ? "#c4b5fd" : "#71717a", marginBottom: 3 }}>
                  {d.getDate()} {AY_KISA[d.getMonth()]} · {GUN_KISA[(d.getDay() + 6) % 7]}{isToday ? " · bugün" : ""}
                </div>
                <div style={{ background: "#0e0e15", border: "1px solid #1f1f28", borderRadius: 10, padding: "4px 2px" }}>
                  {g.list.map((it, i) => <AggItem key={it.pageId + ":" + it.idx + ":" + i} it={it} onToggle={toggleItem} onOpen={(id) => { const p = pages.find((x) => x.id === id); if (p) openPage(p); }} />)}
                </div>
              </div>
            );
          })
        )}
      </main>
    );
  }

  function renderTakvim() {
    const first = new Date(calY, calM, 1);
    const start = startOfWeek(first);
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    const selList = itemsByDay.get(selDay) || [];
    const selD = fromYmd(selDay);

    return (
      <main style={S.main(mobile)}>
        <NavBar
          label={AY_UZUN[calM] + " " + calY}
          onPrev={() => { const m = calM === 0 ? 11 : calM - 1; setCalM(m); if (m === 11) setCalY((y) => y - 1); }}
          onNext={() => { const m = calM === 11 ? 0 : calM + 1; setCalM(m); if (m === 0) setCalY((y) => y + 1); }}
          onToday={() => { const n = new Date(); setCalY(n.getFullYear()); setCalM(n.getMonth()); setSelDay(ymd(n)); }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: mobile ? 3 : 6, marginBottom: 6 }}>
          {GUN_KISA.map((g) => (
            <div key={g} style={{ fontSize: 10.5, fontWeight: 800, color: "#52525b", textAlign: "center", textTransform: "uppercase" }}>{g}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: mobile ? 3 : 6 }}>
          {cells.map((d) => {
            const k = ymd(d);
            const inMonth = d.getMonth() === calM;
            const list = itemsByDay.get(k) || [];
            const done = list.filter((x) => x.c).length;
            const isToday = k === bugun;
            const isSel = k === selDay;
            return (
              <button key={k} onClick={() => setSelDay(k)} style={{
                border: "1px solid " + (isSel ? "#7c3aed" : isToday ? "#4c1d95" : "#1f1f28"),
                background: isSel ? "#1e1b2e" : "#0e0e15", borderRadius: 9, cursor: "pointer",
                padding: mobile ? "6px 2px" : "8px 6px", minHeight: mobile ? 46 : 74,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                opacity: inMonth ? 1 : 0.35, color: "#e4e4e7",
              }}>
                <span style={{ fontSize: mobile ? 12 : 13, fontWeight: isToday ? 800 : 600, color: isToday ? "#c4b5fd" : "inherit" }}>
                  {d.getDate()}
                </span>
                {list.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, borderRadius: 8, padding: "0 6px",
                    background: done === list.length ? "#14261c" : "#1e1b2e",
                    color: done === list.length ? "#4ade80" : "#a78bfa",
                  }}>
                    {done}/{list.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>
            {selD.getDate()} {AY_UZUN[selD.getMonth()]} {selD.getFullYear()} · {GUN_KISA[(selD.getDay() + 6) % 7]}
          </div>
          {selList.length === 0 ? (
            <div style={S.empty}>Bu gün için görev yok.</div>
          ) : (
            <div style={{ background: "#0e0e15", border: "1px solid #1f1f28", borderRadius: 10, padding: "4px 2px" }}>
              {selList.map((it, i) => <AggItem key={it.pageId + ":" + it.idx + ":" + i} it={it} onToggle={toggleItem} onOpen={(id) => { const p = pages.find((x) => x.id === id); if (p) openPage(p); }} />)}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.tabs}>
        {[["sayfalar", "Sayfalar"], ["hafta", "Haftalık"], ["ay", "Aylık"], ["takvim", "Takvim"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={S.tab(view === k)}>{l}</button>
        ))}
        {dirty && view !== "sayfalar" && (
          <span style={{ fontSize: 11, color: "#facc15", alignSelf: "center", marginLeft: "auto", paddingRight: 6, whiteSpace: "nowrap" }}>
            kaydedilmemiş değişiklik
          </span>
        )}
      </div>
      {view === "sayfalar" ? renderSayfalar() : view === "hafta" ? renderHafta() : view === "ay" ? renderAy() : renderTakvim()}
    </div>
  );
}
