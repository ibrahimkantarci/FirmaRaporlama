"use client";
// app/erce/gate.js
// /erce için parola kapısı. Çocuklarını (ErcePanel) yalnız doğru parola girilince
// render eder. Doğrulama sunucuda (scrypt) yapılır. Aynı sekme oturumu boyunca
// tekrar sormamak için sessionStorage'da "açık" bayrağı tutar.
import { useEffect, useState } from "react";

export default function ErceGate({ children }) {
  const [phase, setPhase] = useState("loading"); // loading|setup|enter|open
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("erceUnlocked") === "1") {
      setPhase("open");
      return;
    }
    fetch("/api/erce/gate", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setPhase(d?.set ? "enter" : "setup"))
      .catch(() => setPhase("enter"));
  }, []);

  async function submit(action) {
    if (!pw) { setMsg("Parola gir."); return; }
    if (action === "set") {
      if (pw.length < 6) { setMsg("En az 6 karakter."); return; }
      if (pw !== pw2) { setMsg("Parolalar eşleşmiyor."); return; }
    }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/erce/gate", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password: pw }),
      });
      const d = await r.json();
      if (d.ok && d.unlocked) {
        try { sessionStorage.setItem("erceUnlocked", "1"); } catch {}
        setPhase("open"); setPw(""); setPw2("");
      } else {
        setMsg(d.error || (action === "verify" ? "Parola hatalı." : "Kurulamadı."));
      }
    } catch { setMsg("Bağlantı hatası."); }
    setBusy(false);
  }

  if (phase === "open") return children;

  const shell = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" };
  const card = { width: 360, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
  const input = { width: "100%", boxSizing: "border-box", border: "1px solid #d4d4d8", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginTop: 8 };
  const btn = { width: "100%", background: "var(--brand, #2563eb)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", marginTop: 14 };

  return (
    <div style={shell}>
      <div style={card}>
        {phase === "loading" && <div style={{ color: "#71717a" }}>Yükleniyor…</div>}

        {phase === "enter" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>🔒 Erce İçin</div>
            <div style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>Bu sayfa parolayla korunuyor.</div>
            <input style={input} type="password" value={pw} autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit("verify"); }} />
            <button style={btn} onClick={() => submit("verify")} disabled={busy}>{busy ? "Kontrol…" : "Aç"}</button>
            {msg && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </div>
        )}

        {phase === "setup" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>🔒 Parola belirle</div>
            <div style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>
              Bu sayfa için ilk parolayı sen belirliyorsun. Bir kez ayarlanınca sabittir; girenler bu parolayı bilmek zorunda.
            </div>
            <input style={input} type="password" placeholder="Yeni parola" value={pw} autoFocus onChange={(e) => setPw(e.target.value)} />
            <input style={input} type="password" placeholder="Parola (tekrar)" value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit("set"); }} />
            <button style={btn} onClick={() => submit("set")} disabled={busy}>{busy ? "Kaydediliyor…" : "Belirle"}</button>
            {msg && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
