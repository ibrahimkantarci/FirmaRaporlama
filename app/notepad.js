"use client";

import { useEffect, useRef, useState } from "react";

// Hub'ın yanında duran "Info / Plans" not kağıdı.
// Sarı post-it görünümü: hafif eğik, üstünde bant, alt köşede kıvrım.
// Veri /api/notlar (Sheet "Notlar" sekmesi) üzerinden okunur/yazılır.
// Görünürlük hub sayfasında karara bağlanır; burası yalnız çizim + kaydetme.

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NotePad() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState({ by: "", at: "" });
  const [state, setState] = useState("loading"); // loading | idle | saving | error
  const [msg, setMsg] = useState("");
  const taRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/notlar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d || d.ok === false) throw new Error(d?.error || "Okunamadı");
        setText(d.text || "");
        setSaved(d.text || "");
        setMeta({ by: d.updatedBy || "", at: d.updatedAt || "" });
        setState("idle");
      })
      .catch((e) => {
        if (!alive) return;
        setState("error");
        setMsg(e?.message || "Not okunamadı");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Textarea içeriğe göre büyüsün (scrollbar yerine kağıt uzasın).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(180, el.scrollHeight) + "px";
  }, [text, state]);

  const dirty = text !== saved;

  async function save() {
    if (!dirty || state === "saving") return;
    setState("saving");
    setMsg("");
    try {
      const r = await fetch("/api/notlar", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.error || "Kaydedilemedi");
      setSaved(d.text ?? text);
      setMeta({ by: d.updatedBy || "", at: d.updatedAt || "" });
      setState("idle");
      setMsg("Kaydedildi");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setState("error");
      setMsg(e?.message || "Kaydedilemedi");
    }
  }

  // Ctrl/Cmd+Enter ile kaydet.
  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  return (
    <aside
      aria-label="Info / Plans notu"
      style={{
        flex: "0 0 296px",
        maxWidth: 296,
        position: "relative",
        marginTop: 46,
        transform: "rotate(-1.1deg)",
      }}
    >
      {/* bant */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -13,
          left: "50%",
          transform: "translateX(-50%) rotate(1.6deg)",
          width: 86,
          height: 24,
          background: "rgba(255,255,255,.55)",
          border: "1px solid rgba(0,0,0,.06)",
          borderRadius: 2,
          boxShadow: "0 1px 2px rgba(0,0,0,.07)",
        }}
      />
      <div
        style={{
          background: "linear-gradient(175deg,#fef9c3 0%,#fdf3a8 100%)",
          borderRadius: "2px 2px 14px 2px",
          padding: "22px 18px 16px",
          boxShadow: "0 10px 22px rgba(120,100,20,.16), 0 2px 5px rgba(0,0,0,.07)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: ".3px",
            color: "#854d0e",
            textTransform: "uppercase",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden="true">📌</span> Info / Plans
          {/* black hole → plan uygulaması (/planlar). Not kağıdı olduğu gibi kalır. */}
          <a
            href="/planlar"
            title="Planlar"
            aria-label="Plan uygulamasını aç"
            style={{ marginLeft: "auto", display: "inline-flex", lineHeight: 0, opacity: 0.85 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              {/* yığılma diski */}
              <ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#854d0e" strokeWidth="1.4" opacity=".55" transform="rotate(-18 12 12)" />
              <ellipse cx="12" cy="12" rx="7" ry="2.9" fill="none" stroke="#854d0e" strokeWidth="1.2" opacity=".75" transform="rotate(-18 12 12)" />
              {/* olay ufku */}
              <circle cx="12" cy="12" r="3.4" fill="#1c1917" />
              <circle cx="12" cy="12" r="3.4" fill="none" stroke="#854d0e" strokeWidth=".8" opacity=".5" />
            </svg>
          </a>
        </div>

        {state === "loading" ? (
          <div style={{ fontSize: 12.5, color: "#a16207", padding: "18px 0" }}>Yükleniyor…</div>
        ) : (
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={"Notlar, planlar, yapılacaklar…\n\nCtrl+Enter ile kaydet"}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 180,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#3f2d06",
              fontFamily: "'Segoe Print','Bradley Hand','Comic Sans MS',ui-rounded,-apple-system,sans-serif",
              fontSize: 13.5,
              lineHeight: "23px",
              // defter çizgisi
              backgroundImage: "repeating-linear-gradient(transparent,transparent 22px,rgba(133,77,14,.16) 23px)",
              overflow: "hidden",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 10,
            borderTop: "1px solid rgba(133,77,14,.18)",
            paddingTop: 9,
          }}
        >
          <span style={{ fontSize: 10.5, color: "#a16207", lineHeight: 1.35, minWidth: 0 }}>
            {state === "error" ? (
              <span style={{ color: "#b91c1c", fontWeight: 600 }}>{msg}</span>
            ) : msg ? (
              <span style={{ color: "#15803d", fontWeight: 600 }}>{msg}</span>
            ) : meta.at ? (
              <>
                {fmt(meta.at)}
                {meta.by ? <><br />{meta.by}</> : null}
              </>
            ) : (
              "Henüz not yok"
            )}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || state === "saving"}
            style={{
              flexShrink: 0,
              border: "1px solid rgba(133,77,14,.3)",
              background: dirty ? "#854d0e" : "rgba(133,77,14,.12)",
              color: dirty ? "#fff" : "#a16207",
              borderRadius: 7,
              padding: "5px 13px",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: dirty && state !== "saving" ? "pointer" : "default",
            }}
          >
            {state === "saving" ? "Kaydediliyor…" : dirty ? "Kaydet" : "Kayıtlı"}
          </button>
        </div>
      </div>
    </aside>
  );
}
