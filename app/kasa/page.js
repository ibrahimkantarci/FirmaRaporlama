"use client";
// app/kasa/page.js
// Kişisel şifreli kasa. Parola YALNIZCA bu tarayıcıda kalır — sunucuya,
// repo'ya, log'a asla gitmez. Şifreleme WebCrypto (PBKDF2 + AES-GCM) ile
// tarayıcıda yapılır; sunucuya sadece şifreli metin (ciphertext) yollanır.
// Parolayı unutursan içerik kurtarılamaz (sıfırlama = arka kapı olurdu, yok).
import { useEffect, useState, useCallback } from "react";

const ITER = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deriveKey(password, saltBytes) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), ct: bufToB64(ct) };
}
async function decryptBlob(blob, password) {
  const key = await deriveKey(password, b64ToBuf(blob.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(blob.iv) }, key, b64ToBuf(blob.ct));
  return dec.decode(pt);
}

export default function KasaPage() {
  const [status, setStatus] = useState("loading"); // loading|locked|new|open|error
  const [hasBlob, setHasBlob] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(""); setPw(""); setPw2(""); setText("");
    try {
      const r = await fetch("/api/kasa", { credentials: "same-origin" });
      const d = await r.json();
      if (!d.ok) { setStatus("error"); setMsg(d.error || "Yüklenemedi."); return; }
      if (d.blob && d.blob.ct) { window.__kasaBlob = d.blob; setHasBlob(true); setStatus("locked"); }
      else { setHasBlob(false); setStatus("new"); }
    } catch (e) { setStatus("error"); setMsg("Bağlantı hatası."); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function unlock() {
    if (!pw) { setMsg("Parola gir."); return; }
    setBusy(true); setMsg("");
    try {
      const t = await decryptBlob(window.__kasaBlob, pw);
      setText(t); setStatus("open");
    } catch (e) { setMsg("Parola hatalı."); }
    setBusy(false);
  }

  async function createNew() {
    if (!pw || pw.length < 6) { setMsg("En az 6 karakterli bir parola belirle."); return; }
    if (pw !== pw2) { setMsg("Parolalar eşleşmiyor."); return; }
    setStatus("open"); setMsg("Parola belirlendi. İçeriğini yazıp Kaydet'e bas.");
  }

  async function save() {
    if (!pw) { setMsg("Parola yok."); return; }
    setBusy(true); setMsg("");
    try {
      const blob = await encryptText(text, pw);
      const r = await fetch("/api/kasa", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blob),
      });
      const d = await r.json();
      if (d.ok) { window.__kasaBlob = blob; setHasBlob(true); setMsg("Kaydedildi · " + new Date().toLocaleTimeString("tr-TR")); }
      else setMsg(d.error || "Kaydedilemedi.");
    } catch (e) { setMsg("Kaydedilemedi."); }
    setBusy(false);
  }

  function lock() {
    setPw(""); setPw2(""); setText(""); setMsg("");
    setStatus(hasBlob ? "locked" : "new");
  }

  const wrap = { maxWidth: 820, margin: "40px auto", padding: "0 20px", color: "#e4e4e7", fontFamily: "system-ui, sans-serif" };
  const card = { background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 24 };
  const input = { width: "100%", boxSizing: "border-box", background: "#0f0f11", border: "1px solid #3f3f46", borderRadius: 8, color: "#e4e4e7", padding: "10px 12px", fontSize: 14, marginTop: 8 };
  const btn = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", marginTop: 12 };
  const ghost = { ...btn, background: "transparent", border: "1px solid #3f3f46", color: "#a1a1aa", marginLeft: 8 };

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>🔒 Kasa</h1>
      <p style={{ color: "#71717a", fontSize: 13, marginTop: 0 }}>
        İçerik bu tarayıcıda şifrelenir; sunucuda yalnız şifreli hali durur. Parola cihazından çıkmaz.
      </p>

      <div style={card}>
        {status === "loading" && <div style={{ color: "#a1a1aa" }}>Yükleniyor…</div>}

        {status === "error" && <div style={{ color: "#f87171" }}>{msg}</div>}

        {status === "locked" && (
          <div>
            <label style={{ fontSize: 13, color: "#a1a1aa" }}>Parola</label>
            <input style={input} type="password" value={pw} autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} />
            <div>
              <button style={btn} onClick={unlock} disabled={busy}>{busy ? "Açılıyor…" : "Aç"}</button>
            </div>
            {msg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </div>
        )}

        {status === "new" && (
          <div>
            <div style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 4 }}>
              İlk kez kuruyorsun. Bir parola belirle — bunu <b>sadece sen</b> bileceksin, unutursan içerik kurtarılamaz.
            </div>
            <label style={{ fontSize: 13, color: "#a1a1aa" }}>Yeni parola</label>
            <input style={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <label style={{ fontSize: 13, color: "#a1a1aa", marginTop: 8, display: "block" }}>Parola (tekrar)</label>
            <input style={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNew(); }} />
            <div><button style={btn} onClick={createNew}>Devam</button></div>
            {msg && <div style={{ color: "#fbbf24", fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </div>
        )}

        {status === "open" && (
          <div>
            <textarea style={{ ...input, minHeight: 320, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Notların, hesapların, ne istersen…" />
            <div>
              <button style={btn} onClick={save} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
              <button style={ghost} onClick={lock}>Kilitle</button>
            </div>
            {msg && <div style={{ color: "#4ade80", fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
