"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Black hole plan uygulaması — Notion tarzı blok editörü + görev takvimi.
//
// Akış: görevler TAKVİM'den girilir (güne dokun → yaz → Ekle). Girilen görevler
// Haftalık ve Aylık sekmelerde YAPILACAK LİSTESİ olarak akar: kutucuğu tikle,
// ℹ ile yanına bilgi notu ekle. (Sayfalardaki tarihli todolar da aynı akışa girer.)
//
// Sekmeler:
//   Sayfalar → sayfa listesi + blok editörü (mobilde liste ↔ editör geçişli)
//   Haftalık → haftanın görevleri gün gün checklist (grid değil, liste)
//   Aylık    → ayın görevleri gün gruplu checklist + ilerleme
//   Takvim   → ay ızgarası; güne dokun → görev EKLE + o günün listesi
//
// Takvimden eklenen görevler "Takvim Görevleri" sayfasında saklanır (id: takvim)
// — istersen o sayfayı editörden de düzenlersin; ayrı bir veri modeli yok.
// Kutucuk/ℹ değişiklikleri ilgili sayfayı ANINDA kaydeder (son kaydeden kazanır).
//
// Editör kısayolları: "# " başlık · "[] " yapılacak · Enter yeni blok ·
// boş blokta Backspace sil · Ctrl/Cmd+S kaydet.
// ───────────────────────────────────────────────────────────────────────────

const CAL_PAGE_ID = "takvim";
const CAL_PAGE_TITLE = "Takvim Görevleri";

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

function dayDiff(a, b) {
  return Math.round((b - a) / 86400000);
}

// Rutin verilen günde düşüyor mu? k: "YYYY-AA-GG"
// Tekrarlar satır olarak saklanmaz; görünen her tarih burada hesaplanır.
function occursOn(r, k) {
  if (!r.active || !r.start) return false;
  if (k < r.start) return false;
  if (r.end && k > r.end) return false;
  const d = fromYmd(k), st = fromYmd(r.start);
  const every = Math.max(1, r.every || 1);
  if (r.freq === "gun") return dayDiff(st, d) % every === 0;
  if (r.freq === "hafta") {
    const wd = (d.getDay() + 6) % 7;
    if (!(r.days || []).includes(wd)) return false;
    return Math.round(dayDiff(startOfWeek(st), startOfWeek(d)) / 7) % every === 0;
  }
  // ay: ayın N'i; kısa aylarda son güne sıkışır (31 → Şubat'ta 28/29)
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() !== Math.min(r.dom || 1, dim)) return false;
  const mDiff = (d.getFullYear() - st.getFullYear()) * 12 + (d.getMonth() - st.getMonth());
  return mDiff >= 0 && mDiff % every === 0;
}

// Görev satırı anahtarı: sayfa todosu için sayfa+sıra, rutin için rutin+tarih.
function itemKey(it) {
  return it.kind === "rutin" ? "r:" + it.rid + ":" + it.d : it.pageId + ":" + it.idx;
}

function rutinOzet(r) {
  const e = Math.max(1, r.every || 1);
  let s;
  if (r.freq === "gun") s = e === 1 ? "Her gün" : "Her " + e + " günde bir";
  else if (r.freq === "hafta") {
    const g = (r.days || []).slice().sort().map((i) => GUN_KISA[i]).join(", ") || "—";
    s = (e === 1 ? "Her hafta" : "Her " + e + " haftada bir") + " · " + g;
  } else s = (e === 1 ? "Her ay" : "Her " + e + " ayda bir") + " · ayın " + (r.dom || 1) + "'i";
  if (r.time) s += " · " + r.time;
  if (r.end) s += " · " + r.end + "'e kadar";
  return s;
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
  root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--bg)", color: "var(--ink)" },
  tabs: {
    display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid var(--line)",
    background: "var(--surface)", overflowX: "auto", flexShrink: 0, WebkitOverflowScrolling: "touch",
    position: "sticky", top: 0, zIndex: 5,
  },
  tab: (on) => ({
    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
    background: on ? "var(--brand-050)" : "transparent", color: on ? "var(--brand-200)" : "var(--muted)",
  }),
  wrap: { display: "flex", flex: 1, minHeight: 0 },
  side: (mobile) => ({
    width: mobile ? "100%" : 230, flexShrink: 0, padding: "14px 10px", overflowY: "auto",
    background: "var(--surface)", borderRight: mobile ? "none" : "1px solid var(--line)",
  }),
  pageBtn: (on) => ({
    display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
    border: "none", borderRadius: 7, padding: "8px 10px", marginBottom: 2, fontSize: 13.5,
    cursor: "pointer", color: on ? "#fff" : "var(--muted)",
    background: on ? "var(--brand-050)" : "transparent", fontWeight: on ? 700 : 500,
  }),
  main: (mobile) => ({
    flex: 1, minWidth: 0, overflowY: "auto",
    padding: mobile ? "16px 14px 70px" : "30px 40px 80px",
  }),
  title: (mobile) => ({
    width: "100%", border: "none", outline: "none", background: "transparent",
    color: "var(--ink)", fontSize: mobile ? 22 : 28, fontWeight: 800, marginBottom: 16, padding: 0,
  }),
  blockRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 2 },
  ta: (t) => ({
    flex: 1, border: "none", outline: "none", background: "transparent", resize: "none",
    color: t === "h" ? "var(--ink)" : "var(--ink-2)", overflow: "hidden", minWidth: 0,
    fontSize: t === "h" ? 19 : 14.5, fontWeight: t === "h" ? 800 : 400,
    lineHeight: t === "h" ? "28px" : "24px", padding: "2px 0", fontFamily: "inherit",
  }),
  dateIn: {
    border: "1px solid var(--line-strong)", background: "var(--surface-2)", color: "var(--muted)", colorScheme: "dark",
    borderRadius: 6, fontSize: 11, padding: "2px 4px", marginTop: 3, flexShrink: 0, width: 118,
  },
  smallBtn: {
    border: "1px solid var(--line-strong)", background: "var(--surface-2)", color: "var(--muted)",
    borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
  navBar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  navLabel: { fontSize: 16, fontWeight: 800, color: "var(--ink)", minWidth: 130 },
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 11, overflow: "hidden" },
  dayHead: (today) => ({
    display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 6px",
    fontSize: 12.5, fontWeight: 800, color: today ? "var(--brand-200)" : "var(--muted)",
  }),
  taskRow: { padding: "8px 12px", borderBottom: "1px solid var(--line)" },
  infoBtn: (on) => ({
    border: "1px solid " + (on ? "var(--brand-100)" : "var(--line-strong)"), background: on ? "var(--brand-050)" : "transparent",
    color: on ? "var(--brand-200)" : "var(--faint)", borderRadius: 6, width: 22, height: 22, lineHeight: "18px",
    fontSize: 12, cursor: "pointer", flexShrink: 0, padding: 0, fontWeight: 800, fontStyle: "italic",
    fontFamily: "Georgia, serif",
  }),
  noteTa: {
    width: "100%", marginTop: 6, border: "1px solid var(--line-strong)", background: "var(--surface-2)",
    color: "var(--ink-2)", borderRadius: 8, fontSize: 12.5, lineHeight: "18px", padding: "6px 8px",
    resize: "vertical", outline: "none", fontFamily: "inherit", minHeight: 40,
  },
  noteText: {
    marginTop: 4, marginLeft: 25, fontSize: 12, color: "var(--muted)", lineHeight: "17px",
    whiteSpace: "pre-wrap", cursor: "pointer", borderLeft: "2px solid var(--line-strong)", paddingLeft: 8,
  },
  noteBy: { marginTop: 3, fontSize: 11, fontWeight: 700, color: "var(--brand-200)", letterSpacing: ".2px" },
  pageTag: {
    fontSize: 10, fontWeight: 700, color: "var(--brand-200)", background: "var(--brand-050)", border: "none",
    borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
  },
  empty: { color: "var(--faint)", fontSize: 13, padding: "16px 4px" },
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
          style={{ marginTop: 7, accentColor: "var(--brand)", cursor: "pointer", width: 16, height: 16 }}
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
          // Dikkat: tarih (d) ve bilgi notu (n) yazarken kaybolmasın.
          onChange({ t, x: v, ...(t === "todo" ? { c: !!c, ...(b.d ? { d: b.d } : {}), ...(b.n ? { n: b.n } : {}), ...(b.na ? { na: b.na } : {}) } : {}) });
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

// Ortak görev satırı: [kutucuk] metin [i] [sayfa etiketi] + bilgi notu.
// Planner DIŞINDA tanımlı — içeride tanımlansaydı her render'da remount olur,
// açık not kutusundaki yazılmakta olan metin kaybolurdu.
function TaskRow({ it, last, open, onToggle, onToggleNote, onSaveNote, onOpenPage }) {
  return (
    <div style={{ ...S.taskRow, borderBottom: last ? "none" : S.taskRow.borderBottom }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <input
          type="checkbox" checked={it.c} onChange={onToggle}
          style={{ marginTop: 2, accentColor: "var(--brand)", cursor: "pointer", width: 17, height: 17, flexShrink: 0 }}
        />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: "20px", textDecoration: it.c ? "line-through" : "none", opacity: it.c ? 0.5 : 1 }}>
          {it.kind === "rutin" && <span title="Rutin görev" style={{ marginRight: 5, fontSize: 11 }}>🔁</span>}
          {it.time && <span style={{ marginRight: 6, fontSize: 11.5, fontWeight: 700, color: "var(--brand-200)" }}>{it.time}</span>}
          {it.x || "(boş)"}
        </span>
        <button onClick={onToggleNote} title="Bilgi notu" aria-label="Bilgi notu" style={S.infoBtn(open || !!it.n)}>i</button>
        {onOpenPage && (
          <button onClick={onOpenPage} style={S.pageTag} title="Sayfayı aç">{it.pageTitle}</button>
        )}
      </div>
      {open ? (
        <textarea
          defaultValue={it.n} placeholder="Bilgi / not… (odak dışına çıkınca kaydedilir)"
          onBlur={(e) => onSaveNote(e.target.value)}
          style={S.noteTa} rows={2} spellCheck={false}
        />
      ) : it.n ? (
        <div style={S.noteText} onClick={onToggleNote}>
          {it.n}
          {it.na ? <div style={S.noteBy}>— {kisaAd(it.na)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

// E-postanın "x.y@dugun.com" biçimindeki x kısmı — not satırının altında gösterilir.
function kisaAd(mail) {
  const s = String(mail || "").trim();
  if (!s) return "";
  const local = s.split("@")[0];
  return local.split(".")[0] || local;
}

export default function Planner({ initialView = "sayfalar", email = "" }) {
  const mobile = useIsMobile();
  const [view, setView] = useState(initialView); // sayfalar | hafta | ay | takvim
  const [mobilePane, setMobilePane] = useState("list");

  const [pages, setPages] = useState([]);
  const [cur, setCur] = useState(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [savedSig, setSavedSig] = useState("");
  const [state, setState] = useState("loading");
  const [msg, setMsg] = useState("");
  const taRefs = useRef({});
  const focusIdx = useRef(null);

  const bugun = ymd(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [calY, setCalY] = useState(() => new Date().getFullYear());
  const [calM, setCalM] = useState(() => new Date().getMonth());
  const [selDay, setSelDay] = useState(bugun);
  const [newTask, setNewTask] = useState("");
  const [routines, setRoutines] = useState([]);
  const [rForm, setRForm] = useState(null); // açık rutin formu (null = kapalı)
  const [openNotes, setOpenNotes] = useState(() => new Set()); // "pageId:idx"

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
        // mobile state'i bu closure'da bayat kalabilir — medyayı doğrudan sor;
        // telefonda ilk sayfayı otomatik açma, kullanıcı listeden seçsin.
        const isMob = window.matchMedia("(max-width: 720px)").matches;
        if ((d.pages || []).length && !isMob) openPage(d.pages[0], false);
      })
      .catch((e) => { setState("error"); setMsg(e?.message || "Yüklenemedi"); });

    fetch("/api/rutinler", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (d && d.ok !== false) setRoutines(d.routines || []); })
      .catch(() => { /* rutinler okunamazsa sayfa yine çalışsın */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focusIdx.current != null) {
      const r = taRefs.current[focusIdx.current];
      if (r && r.current) r.current.focus();
      focusIdx.current = null;
    }
  }, [blocks.length]);

  // Açık sayfanın taslağı toplu görünümlere de yansısın.
  const effPages = useMemo(
    () => pages.map((p) => (p.id === cur ? { ...p, title, blocks } : p)),
    [pages, cur, title, blocks]
  );
  const items = useMemo(() => {
    const out = [];
    for (const p of effPages) {
      (p.blocks || []).forEach((b, idx) => {
        if (b.t === "todo" && b.d) {
          out.push({ pageId: p.id, pageTitle: p.title || "(adsız)", idx, x: b.x, c: !!b.c, d: b.d, n: b.n || "", na: b.na || "" });
        }
      });
    }
    return out;
  }, [effPages]);
  const pageItemsByDay = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.d)) m.set(it.d, []);
      m.get(it.d).push(it);
    }
    return m;
  }, [items]);

  // Bir günün TÜM görevleri = sayfalardaki tarihli todolar + o gün düşen rutinler.
  // Rutinler tarih tarih saklanmadığı için burada anlık üretilir.
  const itemsFor = useMemo(() => {
    return (k) => {
      const out = (pageItemsByDay.get(k) || []).slice();
      for (const r of routines) {
        if (occursOn(r, k)) {
          out.push({
            kind: "rutin", rid: r.id, d: k, x: r.x, n: r.n || "", na: r.na || "",
            c: (r.done || []).includes(k), pageTitle: "rutin", time: r.time || "",
          });
        }
      }
      return out;
    };
  }, [pageItemsByDay, routines]);

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

  // Bir görev bloğunu yerinde değiştir (kutucuk / bilgi notu) ve sayfayı anında kaydet.
  async function patchItem(it, patchFn) {
    const isCur = it.pageId === cur;
    const src = isCur ? blocks : (pages.find((p) => p.id === it.pageId)?.blocks || []);
    const nb = src.map((b, j) => (j === it.idx ? patchFn(b) : b));
    const pTitle = isCur ? title : (pages.find((p) => p.id === it.pageId)?.title || "");
    if (isCur) setBlocks(nb);
    setPages((xs) => xs.map((p) => (p.id === it.pageId ? { ...p, blocks: nb } : p)));
    try {
      const p = await postPage(it.pageId, pTitle, nb);
      setPages((xs) => xs.map((x) => (x.id === it.pageId ? p : x)));
      if (isCur) setSavedSig(JSON.stringify({ title: p.title, blocks: p.blocks }));
    } catch (e) {
      setMsg((e?.message || "Kaydedilemedi") + " — sayfayı yenileyin");
    }
  }
  // Rutin tanımını kaydet (iyimser güncelle, sonra sunucu cevabıyla değiştir).
  async function postRoutine(r) {
    setRoutines((xs) => (xs.some((y) => y.id === r.id) ? xs.map((y) => (y.id === r.id ? r : y)) : [...xs, r]));
    try {
      const res = await fetch("/api/rutinler", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine: r }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) throw new Error(d?.error || "Kaydedilemedi");
      setRoutines((xs) => xs.map((y) => (y.id === d.routine.id ? d.routine : y)));
      return d.routine;
    } catch (e) {
      setMsg(e?.message || "Rutin kaydedilemedi");
    }
  }

  // Rutin görevin O GÜNE ait tamamlanma işareti — tanımdaki tarih listesine yazılır.
  function toggleRoutineDay(it) {
    const r = routines.find((y) => y.id === it.rid);
    if (!r) return;
    const done = (r.done || []).includes(it.d)
      ? r.done.filter((x) => x !== it.d)
      : [...(r.done || []), it.d];
    postRoutine({ ...r, done });
  }

  const toggleItem = (it) =>
    it.kind === "rutin" ? toggleRoutineDay(it) : patchItem(it, (b) => ({ ...b, c: !b.c }));

  function saveNote(it, val) {
    const v = (val || "").trim();
    if ((it.n || "") === v) return;
    if (it.kind === "rutin") {
      const r = routines.find((y) => y.id === it.rid);
      if (r) postRoutine({ ...r, n: v, na: v ? email : "" });
      return;
    }
    patchItem(it, (b) => {
      const nb = { ...b };
      if (v) { nb.n = v; nb.na = email; } else { delete nb.n; delete nb.na; }
      return nb;
    });
  }

  async function deleteRoutine(id) {
    if (!confirm("Bu rutin silinsin mi? (geçmiş işaretler de gider)")) return;
    setRoutines((xs) => xs.filter((r) => r.id !== id));
    setRForm(null);
    try {
      await fetch("/api/rutinler?id=" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" });
    } catch { /* zaten yereldenn silindi */ }
  }
  function toggleNote(k) {
    setOpenNotes((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  // Takvimden görev ekleme → "Takvim Görevleri" sayfasına todo bloğu olarak yazılır.
  async function addTask(dateStr, text) {
    const t = (text || "").trim();
    if (!t) return;
    const page = pages.find((p) => p.id === CAL_PAGE_ID);
    const isCur = cur === CAL_PAGE_ID;
    const base = isCur ? blocks : (page?.blocks || []);
    const nb = [...base.filter((b) => !(b.t === "p" && !b.x)), { t: "todo", x: t, c: false, d: dateStr }];
    const pTitle = page ? (isCur ? title : page.title) || CAL_PAGE_TITLE : CAL_PAGE_TITLE;
    if (!page) setPages((xs) => [...xs, { id: CAL_PAGE_ID, title: pTitle, blocks: nb, updatedBy: "", updatedAt: "" }]);
    else setPages((xs) => xs.map((p) => (p.id === CAL_PAGE_ID ? { ...p, blocks: nb } : p)));
    if (isCur) setBlocks(nb);
    setNewTask("");
    try {
      const p = await postPage(CAL_PAGE_ID, pTitle, nb);
      setPages((xs) => xs.map((x) => (x.id === CAL_PAGE_ID ? p : x)));
      if (isCur) setSavedSig(JSON.stringify({ title: p.title, blocks: p.blocks }));
    } catch (e) {
      setMsg((e?.message || "Eklenemedi") + " — tekrar deneyin");
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1, maxWidth: 280, height: 7, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: (done / list.length) * 100 + "%", height: "100%", background: "var(--brand)" }} />
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{done}/{list.length} tamamlandı</span>
      </div>
    );
  }

  function gotoMonth(delta) {
    let m = calM + delta, y = calY;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalM(m); setCalY(y);
  }

  // ── Görünümler ──────────────────────────────────────────────────────────

  function renderSayfalar() {
    const list = (
      <aside style={S.side(mobile)}>
        <button onClick={addPage} style={{ ...S.smallBtn, width: "100%", marginBottom: 10, background: "var(--brand-050)", color: "var(--brand-200)", border: "1px solid var(--brand-200)", padding: "9px 12px" }}>
          + Yeni sayfa
        </button>
        {state === "loading" ? (
          <div aria-busy="true" aria-label="Sayfalar yükleniyor">
            {[68, 82, 55, 74].map((w, i) => (
              <div key={i} className="skel skel--row" style={{ width: w + "%" }} />
            ))}
          </div>
        ) : pages.length === 0 ? (
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--faint)", padding: "var(--s-3)", lineHeight: 1.5 }}>
            Henüz sayfa yok. Yukarıdan yeni sayfa aç.
          </div>
        ) : (
          pages.map((p) => (
            <button key={p.id} onClick={() => openPage(p)} style={S.pageBtn(p.id === cur)}>
              <span aria-hidden="true" style={{ fontSize: 11 }}>{p.id === CAL_PAGE_ID ? "🗓" : "◦"}</span>
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
        {state === "loading" ? (
          <div style={{ maxWidth: 720, margin: "0 auto" }} aria-busy="true" aria-label="Sayfa yükleniyor">
            <div className="skel skel--title" />
            {[100, 92, 78, 96, 64, 88, 71].map((w, i) => (
              <div key={i} className="skel skel--text" style={{ width: w + "%" }} />
            ))}
          </div>
        ) : cur === null ? (
          <div style={{ maxWidth: 460, margin: "var(--s-10) auto 0" }}>
            <div className="empty">
              <span className="empty__ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
              </span>
              <p className="empty__title">Sayfa seçili değil</p>
              <p className="empty__text">
                {mobile
                  ? "Listeden bir sayfa aç ya da yeni bir tane oluştur. Notlar, planlar ve yapılacaklar burada tutulur."
                  : "Soldaki listeden bir sayfa aç ya da yeni bir tane oluştur. Notlar, planlar ve yapılacaklar burada tutulur."}
              </p>
              <button onClick={addPage} className="btn">Yeni sayfa oluştur</button>
            </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 12, flexWrap: "wrap" }}>
              <button onClick={save} disabled={!dirty || state === "saving"}
                style={{ ...S.smallBtn, background: dirty ? "var(--brand)" : "var(--surface-2)", color: dirty ? "#fff" : "var(--faint)", border: "1px solid " + (dirty ? "var(--brand)" : "var(--line-strong)") }}>
                {state === "saving" ? "Kaydediliyor…" : dirty ? (mobile ? "Kaydet" : "Kaydet (Ctrl+S)") : "Kayıtlı"}
              </button>
              <button onClick={removePage} style={{ ...S.smallBtn, color: "#f2837a", borderColor: "#4a2320" }}>Sayfayı sil</button>
              <span style={{ fontSize: 11.5, color: state === "error" ? "#f2837a" : "var(--faint)" }}>
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

  // Gün gruplu YAPILACAK LİSTESİ (Haftalık ve Aylık bunun üstünde).
  function renderChecklist(days, opts = {}) {
    const shown = days
      .map((d) => ({ d, k: ymd(d), list: itemsFor(ymd(d)) }))
      .filter((g) => g.list.length > 0 || opts.showEmptyDays);
    if (!shown.some((g) => g.list.length)) {
      return (
        <div style={S.empty}>
          {opts.emptyText || "Görev yok."} Takvim sekmesinde bir güne dokunup görev ekleyebilirsin.
        </div>
      );
    }
    return shown.map((g) => {
      const isToday = g.k === bugun;
      const done = g.list.filter((x) => x.c).length;
      return (
        <section key={g.k}>
          <div style={S.dayHead(isToday)}>
            <span>{g.d.getDate()} {AY_KISA[g.d.getMonth()]} · {GUN_KISA[(g.d.getDay() + 6) % 7]}{isToday ? " · bugün" : ""}</span>
            {g.list.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)" }}>{done}/{g.list.length}</span>}
          </div>
          {g.list.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--faint)", padding: "2px 2px 4px" }}>—</div>
          ) : (
            <div style={S.card}>
              {g.list.map((it, i) => (
                <TaskRow
                  key={itemKey(it)} it={it} last={i === g.list.length - 1}
                  open={openNotes.has(itemKey(it))}
                  onToggle={() => toggleItem(it)}
                  onToggleNote={() => toggleNote(itemKey(it))}
                  onSaveNote={(v) => saveNote(it, v)}
                  onOpenPage={it.kind !== "rutin" && it.pageId !== CAL_PAGE_ID ? () => { const p = pages.find((x) => x.id === it.pageId); if (p) openPage(p); } : null}
                />
              ))}
            </div>
          )}
        </section>
      );
    });
  }

  function renderHafta() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekItems = days.flatMap((d) => itemsFor(ymd(d)));
    const end = addDays(weekStart, 6);
    const label =
      weekStart.getDate() + (weekStart.getMonth() === end.getMonth() ? "" : " " + AY_KISA[weekStart.getMonth()]) +
      " – " + end.getDate() + " " + AY_KISA[end.getMonth()] + " " + end.getFullYear();
    return (
      <main style={S.main(mobile)}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <NavBar
            label={label}
            onPrev={() => setWeekStart((d) => addDays(d, -7))}
            onNext={() => setWeekStart((d) => addDays(d, 7))}
            onToday={() => setWeekStart(startOfWeek(new Date()))}
          />
          <Progress list={weekItems} />
          {renderChecklist(days, { showEmptyDays: false, emptyText: "Bu hafta için görev yok." })}
        </div>
      </main>
    );
  }

  function renderAy() {
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(calY, calM, i + 1));
    const monthItems = days.flatMap((d) => itemsFor(ymd(d)));
    return (
      <main style={S.main(mobile)}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <NavBar
            label={AY_UZUN[calM] + " " + calY}
            onPrev={() => gotoMonth(-1)}
            onNext={() => gotoMonth(1)}
            onToday={() => { const n = new Date(); setCalY(n.getFullYear()); setCalM(n.getMonth()); }}
          />
          <Progress list={monthItems} />
          {renderChecklist(days, { showEmptyDays: false, emptyText: "Bu ay için görev yok." })}
        </div>
      </main>
    );
  }

  function renderTakvim() {
    const first = new Date(calY, calM, 1);
    const start = startOfWeek(first);
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    const selList = itemsFor(selDay);
    const selD = fromYmd(selDay);

    return (
      <main style={S.main(mobile)}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <NavBar
            label={AY_UZUN[calM] + " " + calY}
            onPrev={() => gotoMonth(-1)}
            onNext={() => gotoMonth(1)}
            onToday={() => { const n = new Date(); setCalY(n.getFullYear()); setCalM(n.getMonth()); setSelDay(ymd(n)); }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: mobile ? 3 : 6, marginBottom: 6 }}>
            {GUN_KISA.map((g) => (
              <div key={g} style={{ fontSize: 10.5, fontWeight: 800, color: "var(--faint)", textAlign: "center", textTransform: "uppercase" }}>{g}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: mobile ? 3 : 6 }}>
            {cells.map((d) => {
              const k = ymd(d);
              const inMonth = d.getMonth() === calM;
              const list = itemsFor(k);
              const done = list.filter((x) => x.c).length;
              const isToday = k === bugun;
              const isSel = k === selDay;
              return (
                <button key={k} onClick={() => setSelDay(k)} style={{
                  border: "1px solid " + (isSel ? "var(--brand)" : isToday ? "var(--brand-100)" : "var(--line)"),
                  background: isSel ? "var(--brand-050)" : "var(--surface)", borderRadius: 9, cursor: "pointer",
                  padding: mobile ? "6px 2px" : "8px 6px", minHeight: mobile ? 46 : 70,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  opacity: inMonth ? 1 : 0.35, color: "var(--ink)",
                }}>
                  <span style={{ fontSize: mobile ? 12 : 13, fontWeight: isToday ? 800 : 600, color: isToday ? "var(--brand-200)" : "inherit" }}>
                    {d.getDate()}
                  </span>
                  {list.length > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, borderRadius: 8, padding: "0 6px",
                      background: done === list.length ? "var(--ok-soft)" : "var(--brand-050)",
                      color: done === list.length ? "var(--ok)" : "var(--brand-200)",
                    }}>
                      {done}/{list.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)", marginBottom: 8 }}>
              {selD.getDate()} {AY_UZUN[selD.getMonth()]} {selD.getFullYear()} · {GUN_KISA[(selD.getDay() + 6) % 7]}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={newTask} onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(selDay, newTask); }}
                placeholder="Bu güne görev ekle…" spellCheck={false}
                style={{
                  flex: 1, minWidth: 0, border: "1px solid var(--line-strong)", background: "var(--surface-2)",
                  color: "var(--ink)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, outline: "none",
                }}
              />
              <button
                onClick={() => addTask(selDay, newTask)} disabled={!newTask.trim()}
                style={{ ...S.smallBtn, background: newTask.trim() ? "var(--brand)" : "var(--surface-2)", color: newTask.trim() ? "#fff" : "var(--faint)", border: "1px solid " + (newTask.trim() ? "var(--brand)" : "var(--line-strong)"), padding: "9px 16px" }}
              >
                Ekle
              </button>
            </div>
            {selList.length === 0 ? (
              <div style={S.empty}>Bu gün için görev yok — yukarıdan ekle.</div>
            ) : (
              <div style={S.card}>
                {selList.map((it, i) => (
                  <TaskRow
                    key={itemKey(it)} it={it} last={i === selList.length - 1}
                    open={openNotes.has(itemKey(it))}
                    onToggle={() => toggleItem(it)}
                    onToggleNote={() => toggleNote(itemKey(it))}
                    onSaveNote={(v) => saveNote(it, v)}
                    onOpenPage={it.kind !== "rutin" && it.pageId !== CAL_PAGE_ID ? () => { const p = pages.find((x) => x.id === it.pageId); if (p) openPage(p); } : null}
                  />
                ))}
              </div>
            )}
          </div>

          {renderRutinler()}
        </div>
      </main>
    );
  }

  function renderRutinler() {
    const blank = {
      id: "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      x: "", n: "", freq: "hafta", every: 1, days: [(fromYmd(selDay).getDay() + 6) % 7],
      dom: fromYmd(selDay).getDate(), start: selDay, end: "", time: "", active: true, done: [],
    };
    const f = rForm;
    const inp = {
      border: "1px solid var(--line-strong)", background: "var(--surface-2)", color: "var(--ink)", colorScheme: "dark",
      borderRadius: 7, padding: "7px 9px", fontSize: 13, outline: "none", minWidth: 0,
    };
    const lbl = { fontSize: 10.5, fontWeight: 800, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".4px", display: "block", marginBottom: 3 };

    return (
      <section style={{ marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>🔁 Rutin görevler</span>
          <button onClick={() => setRForm(f ? null : blank)} style={{ ...S.smallBtn, marginLeft: "auto" }}>
            {f ? "Kapat" : "+ Rutin ekle"}
          </button>
        </div>

        {f && (
          <div style={{ ...S.card, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: mobile ? "auto" : "1 / -1" }}>
                <label style={lbl}>Görev</label>
                <input value={f.x} onChange={(e) => setRForm({ ...f, x: e.target.value })}
                  placeholder="Ör. Haftalık yenileme raporunu gönder" style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={lbl}>Tekrar</label>
                <select value={f.freq} onChange={(e) => setRForm({ ...f, freq: e.target.value })} style={{ ...inp, width: "100%" }}>
                  <option value="gun">Günlük</option>
                  <option value="hafta">Haftalık</option>
                  <option value="ay">Aylık</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Aralık (her N {f.freq === "gun" ? "günde" : f.freq === "hafta" ? "haftada" : "ayda"} bir)</label>
                <input type="number" min={1} max={60} value={f.every}
                  onChange={(e) => setRForm({ ...f, every: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)) })}
                  style={{ ...inp, width: "100%" }} />
              </div>

              {f.freq === "hafta" && (
                <div style={{ gridColumn: mobile ? "auto" : "1 / -1" }}>
                  <label style={lbl}>Günler</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {GUN_KISA.map((g, i) => {
                      const on = (f.days || []).includes(i);
                      return (
                        <button key={g} onClick={() => setRForm({ ...f, days: on ? f.days.filter((x) => x !== i) : [...(f.days || []), i] })}
                          style={{
                            border: "1px solid " + (on ? "var(--brand)" : "var(--line-strong)"), background: on ? "var(--brand-050)" : "transparent",
                            color: on ? "var(--brand-200)" : "var(--muted)", borderRadius: 7, padding: "6px 11px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}>{g}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {f.freq === "ay" && (
                <div>
                  <label style={lbl}>Ayın günü</label>
                  <input type="number" min={1} max={31} value={f.dom}
                    onChange={(e) => setRForm({ ...f, dom: Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)) })}
                    style={{ ...inp, width: "100%" }} />
                </div>
              )}

              <div>
                <label style={lbl}>Başlangıç</label>
                <input type="date" value={f.start} onChange={(e) => setRForm({ ...f, start: e.target.value })} style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={lbl}>Bitiş (boş = süresiz)</label>
                <input type="date" value={f.end} onChange={(e) => setRForm({ ...f, end: e.target.value })} style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={lbl}>Hatırlatma saati</label>
                <input type="time" value={f.time} onChange={(e) => setRForm({ ...f, time: e.target.value })} style={{ ...inp, width: "100%" }} />
              </div>
              <div style={{ gridColumn: mobile ? "auto" : "1 / -1" }}>
                <label style={lbl}>Not (opsiyonel)</label>
                <input value={f.n} onChange={(e) => setRForm({ ...f, n: e.target.value })} style={{ ...inp, width: "100%" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => { if (!f.x.trim()) return; postRoutine({ ...f, x: f.x.trim() }); setRForm(null); }}
                disabled={!f.x.trim()}
                style={{ ...S.smallBtn, background: f.x.trim() ? "var(--brand)" : "var(--surface-2)", color: f.x.trim() ? "#fff" : "var(--faint)", border: "1px solid " + (f.x.trim() ? "var(--brand)" : "var(--line-strong)"), padding: "8px 16px" }}
              >
                Kaydet
              </button>
              {routines.some((r) => r.id === f.id) && (
                <button onClick={() => deleteRoutine(f.id)} style={{ ...S.smallBtn, color: "#f2837a", borderColor: "#4a2320" }}>Sil</button>
              )}
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{rutinOzet(f)}</span>
            </div>
          </div>
        )}

        {routines.length === 0 ? (
          <div className="empty" style={{ padding: "var(--s-8) var(--s-5)" }}>
            <span className="empty__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" />
              </svg>
            </span>
            <p className="empty__title">Henüz rutin yok</p>
            <p className="empty__text">Tekrarlayan işlerini bir kez tanımla — takvime, haftalığa ve aylığa otomatik düşsün.</p>
            <button onClick={() => setRForm(blank)} className="btn">Rutin oluştur</button>
          </div>
        ) : (
          <div style={S.card}>
            {routines.map((r, i) => (
              <div key={r.id} style={{ ...S.taskRow, borderBottom: i === routines.length - 1 ? "none" : S.taskRow.borderBottom, display: "flex", alignItems: "center", gap: 9, opacity: r.active ? 1 : 0.5 }}>
                <span style={{ fontSize: 12 }}>🔁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: "19px" }}>{r.x}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{rutinOzet(r)}{r.active ? "" : " · pasif"}</div>
                </div>
                <button onClick={() => postRoutine({ ...r, active: !r.active })} style={{ ...S.smallBtn, padding: "4px 9px", fontSize: 11 }}>
                  {r.active ? "Duraklat" : "Sürdür"}
                </button>
                <button onClick={() => setRForm({ ...r })} style={{ ...S.smallBtn, padding: "4px 9px", fontSize: 11 }}>Düzenle</button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="theme-dark" style={S.root}>
      <div style={S.tabs}>
        {[["sayfalar", "Sayfalar"], ["hafta", "Haftalık"], ["ay", "Aylık"], ["takvim", "Takvim"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={S.tab(view === k)}>{l}</button>
        ))}
        {dirty && view !== "sayfalar" && (
          <span style={{ fontSize: 11, color: "#e0a92a", alignSelf: "center", marginLeft: "auto", paddingRight: 6, whiteSpace: "nowrap" }}>
            kaydedilmemiş değişiklik
          </span>
        )}
      </div>
      {view === "sayfalar" ? renderSayfalar() : view === "hafta" ? renderHafta() : view === "ay" ? renderAy() : renderTakvim()}
    </div>
  );
}
