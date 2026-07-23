"use client";

import { useEffect, useRef, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Black hole plan uygulaması — basit Notion tarzı blok editörü.
// Sol: sayfa listesi. Sağ: başlık + bloklar (paragraf / başlık / yapılacak).
// Kısayollar (satır başında yazınca dönüşür):
//   "# "  → başlık bloğu      "[] " → yapılacak (checkbox)
//   Enter → yeni blok         Boş blokta Backspace → bloğu sil
// Kaydet: buton ya da Ctrl/Cmd+S. Son kaydeden kazanır (ekip içi kabul).
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

const S = {
  wrap: { display: "flex", flex: 1, minHeight: 0, background: "#0b0b10", color: "#e4e4e7" },
  side: {
    width: 230, flexShrink: 0, borderRight: "1px solid #1f1f28", padding: "14px 10px",
    overflowY: "auto", background: "#0e0e15",
  },
  pageBtn: (on) => ({
    display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
    border: "none", borderRadius: 7, padding: "7px 9px", marginBottom: 2, fontSize: 13,
    cursor: "pointer", color: on ? "#fff" : "#a1a1aa",
    background: on ? "#1e1b2e" : "transparent", fontWeight: on ? 700 : 500,
  }),
  main: { flex: 1, minWidth: 0, overflowY: "auto", padding: "34px 40px 80px" },
  title: {
    width: "100%", border: "none", outline: "none", background: "transparent",
    color: "#fafafa", fontSize: 28, fontWeight: 800, marginBottom: 18, padding: 0,
  },
  blockRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 2 },
  ta: (t) => ({
    flex: 1, border: "none", outline: "none", background: "transparent", resize: "none",
    color: t === "h" ? "#fafafa" : "#d4d4d8", overflow: "hidden",
    fontSize: t === "h" ? 19 : 14.5, fontWeight: t === "h" ? 800 : 400,
    lineHeight: t === "h" ? "28px" : "24px", padding: "2px 0",
    fontFamily: "inherit",
  }),
  smallBtn: {
    border: "1px solid #2a2a35", background: "#15151d", color: "#a1a1aa",
    borderRadius: 7, padding: "5px 11px", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
};

function Block({ b, onChange, onKeyDown, taRef }) {
  useEffect(() => {
    const el = taRef.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  });
  return (
    <div style={S.blockRow}>
      {b.t === "todo" ? (
        <input
          type="checkbox" checked={!!b.c}
          onChange={(e) => onChange({ ...b, c: e.target.checked })}
          style={{ marginTop: 7, accentColor: "#7c3aed", cursor: "pointer" }}
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
          onChange({ t, x: v, ...(t === "todo" ? { c: !!c } : {}) });
        }}
        onKeyDown={onKeyDown}
        style={{ ...S.ta(b.t), textDecoration: b.t === "todo" && b.c ? "line-through" : "none", opacity: b.t === "todo" && b.c ? 0.55 : 1 }}
      />
    </div>
  );
}

export default function Planner() {
  const [pages, setPages] = useState([]);
  const [cur, setCur] = useState(null); // seçili sayfa id
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [savedSig, setSavedSig] = useState("");
  const [state, setState] = useState("loading"); // loading|idle|saving|error
  const [msg, setMsg] = useState("");
  const taRefs = useRef({}); // idx -> ref
  const focusIdx = useRef(null);

  const sig = JSON.stringify({ title, blocks });
  const dirty = cur !== null && sig !== savedSig;

  function openPage(p) {
    setCur(p.id); setTitle(p.title); setBlocks(p.blocks.length ? p.blocks : [{ t: "p", x: "" }]);
    setSavedSig(JSON.stringify({ title: p.title, blocks: p.blocks.length ? p.blocks : [{ t: "p", x: "" }] }));
    setMsg("");
  }

  useEffect(() => {
    fetch("/api/planlar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.ok === false) throw new Error(d?.error || "Okunamadı");
        setPages(d.pages || []);
        setState("idle");
        if ((d.pages || []).length) openPage(d.pages[0]);
      })
      .catch((e) => { setState("error"); setMsg(e?.message || "Yüklenemedi"); });
  }, []);

  // Blok ekleme/silme sonrası odak yönetimi
  useEffect(() => {
    if (focusIdx.current != null) {
      const r = taRefs.current[focusIdx.current];
      if (r && r.current) { r.current.focus(); }
      focusIdx.current = null;
    }
  }, [blocks.length]);

  function addPage() {
    const p = { id: newId(), title: "", blocks: [{ t: "p", x: "" }], updatedBy: "", updatedAt: "" };
    setPages((xs) => [p, ...xs]);
    openPage(p);
  }

  async function save() {
    if (!cur || !dirty || state === "saving") return;
    setState("saving"); setMsg("");
    try {
      const r = await fetch("/api/planlar", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: { id: cur, title, blocks } }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.error || "Kaydedilemedi");
      setPages((xs) => xs.map((p) => (p.id === cur ? d.page : p)));
      setSavedSig(JSON.stringify({ title: d.page.title, blocks: d.page.blocks }));
      setState("idle"); setMsg("Kaydedildi"); setTimeout(() => setMsg(""), 2000);
    } catch (e) { setState("error"); setMsg(e?.message || "Kaydedilemedi"); }
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
  }

  function blockKeyDown(i) {
    return (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setBlocks((bs) => {
          const next = bs.slice();
          const t = bs[i].t === "todo" ? "todo" : "p"; // todo altına todo aç
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

  // Ctrl/Cmd+S
  useEffect(() => {
    function h(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div style={S.wrap}>
      <aside style={S.side}>
        <button onClick={addPage} style={{ ...S.smallBtn, width: "100%", marginBottom: 10, background: "#1e1b2e", color: "#c4b5fd", border: "1px solid #312a52" }}>
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

      <main style={S.main}>
        {cur === null ? (
          <div style={{ color: "#52525b", fontSize: 14, marginTop: 60, textAlign: "center" }}>
            Soldan bir sayfa seç ya da yeni sayfa aç.
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adsız sayfa"
              style={S.title} spellCheck={false}
            />
            {blocks.map((b, i) => {
              if (!taRefs.current[i]) taRefs.current[i] = { current: null };
              return (
                <Block
                  key={i} b={b} taRef={taRefs.current[i]}
                  onChange={(nb) => setBlocks((bs) => bs.map((x, j) => (j === i ? nb : x)))}
                  onKeyDown={blockKeyDown(i)}
                />
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 26, borderTop: "1px solid #1f1f28", paddingTop: 12 }}>
              <button onClick={save} disabled={!dirty || state === "saving"}
                style={{ ...S.smallBtn, background: dirty ? "#7c3aed" : "#15151d", color: dirty ? "#fff" : "#52525b", border: "1px solid " + (dirty ? "#7c3aed" : "#2a2a35") }}>
                {state === "saving" ? "Kaydediliyor…" : dirty ? "Kaydet (Ctrl+S)" : "Kayıtlı"}
              </button>
              <button onClick={removePage} style={{ ...S.smallBtn, color: "#f87171", borderColor: "#3b1d1d" }}>Sayfayı sil</button>
              <span style={{ fontSize: 11.5, color: state === "error" ? "#f87171" : "#52525b" }}>
                {msg || (() => { const p = pages.find((x) => x.id === cur); return p?.updatedAt ? `${fmt(p.updatedAt)} · ${p.updatedBy}` : ""; })()}
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
