"use client";
// app/rapor/page.js
// Üretim öncesi önizleme/düzenleme ekranı.
// Müşteri ID → /api/qlik/preview → düzenlenebilir form → /api/generate-deck → .pptx indir.
// Stil: mevcut globals.css sınıfları (.wrap/.card/.btn/.title/.lede/.eyebrow) + birkaç inline.
import { useMemo, useState } from "react";

const TR_INT = (v) => Math.round(v).toLocaleString("tr-TR");
const TR_DEC1 = (v) => v.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Slayt-4 mantığı: sayfa/teklif TOPLANIR; donüş/profil DÜZ ORTALAMA (>0 değerler).
function computeTotals(venues) {
  const cats = venues.flatMap((v) => v.categories);
  const sum = (key) => cats.reduce((a, c) => a + (Number(c[key]) || 0), 0);
  const avg = (key) => {
    const xs = cats.map((c) => Number(c[key]) || 0).filter((x) => x > 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  return {
    sayfa: [sum("sayfa"), sum("sayfaGy")],
    teklif: [sum("teklif"), sum("teklifGy")],
    donus: [avg("donus"), avg("donusGy")],
    profil: [avg("profil"), avg("profilGy")],
  };
}

function pct(cur, prev) {
  if (!prev) return { arrow: "▲", text: "0,0%" };
  const d = ((cur - prev) / prev) * 100;
  return { arrow: cur >= prev ? "▲" : "▼", text: `${Math.abs(d).toFixed(1).replace(".", ",")}%` };
}

export default function RaporPage() {
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const totals = useMemo(() => (data ? computeTotals(data.venues) : null), [data]);

  async function loadPreview() {
    setError("");
    setData(null);
    if (!customerId.trim()) {
      setError("Müşteri ID gir.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/sheet/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customerId.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Önizleme alınamadı.");
      setData(j);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // --- immutable güncelleyiciler ---
  function setCover(v) {
    setData((d) => ({ ...d, coverName: v }));
  }
  function setVenueField(vi, key, v) {
    setData((d) => {
      const venues = d.venues.map((ven, i) => (i === vi ? { ...ven, [key]: v } : ven));
      return { ...d, venues };
    });
  }
  function setCatField(vi, ci, key, v) {
    setData((d) => {
      const venues = d.venues.map((ven, i) => {
        if (i !== vi) return ven;
        const categories = ven.categories.map((c, j) =>
          j === ci ? { ...c, [key]: key === "urun" || key === "kategori" ? v : Number(v) } : c
        );
        return { ...ven, categories };
      });
      return { ...d, venues };
    });
  }
  function setBanner(vi, text) {
    setData((d) => {
      const bullets = text.split("\n");
      const venues = d.venues.map((ven, i) => (i === vi ? { ...ven, bannerBullets: bullets } : ven));
      return { ...d, venues };
    });
  }

  async function generate() {
    setError("");
    setGenerating(true);
    try {
      const r = await fetch("/api/generate-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        let msg = `Üretim hatası (${r.status})`;
        try {
          const j = await r.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.coverName || "rapor"}_${data.customerId}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setGenerating(false);
    }
  }

  const num = { width: 110 };
  const fieldRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0" };

  return (
    <main className="wrap" style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <p className="eyebrow">Google Sheets → PowerPoint</p>
      <h1 className="title">Sunum Önizleme &amp; Düzenleme</h1>
      <p className="lede">
        Müşteri verisini Google Sheet&apos;ten çek, alanları düzelt, sonra sunumu üret.
        (Veri önce &quot;Provider Aktarımı&quot; ekranından Sheet&apos;e aktarılmış olmalı.)
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={fieldRow}>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Müşteri ID (örn. 10836)"
            onKeyDown={(e) => e.key === "Enter" && loadPreview()}
            style={{ flex: 1, minWidth: 220, height: 40, padding: "0 10px" }}
          />
          <button className="btn" onClick={loadPreview} disabled={loading} style={{ height: 42 }}>
            {loading ? "Çekiliyor…" : "Önizle"}
          </button>
        </div>
        {error && <p style={{ color: "#c0392b", margin: "8px 0 0" }}>{error}</p>}
      </div>

      {data && (
        <>
          {data.missing?.length > 0 && (
            <div className="card" style={{ borderColor: "#e67e22", marginBottom: 16 }}>
              <strong>Uyarı — eksik/eşleşmeyen sütun(lar):</strong> {data.missing.join(", ")}.
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Sheet/Qlik etiket adlarını kontrol et (isimle eşleme bozulmuş olabilir).
              </div>
            </div>
          )}

          {/* Kapak + dönem bilgisi */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={fieldRow}>
              <label style={{ minWidth: 140 }}>Kapak firma adı</label>
              <input
                value={data.coverName}
                onChange={(e) => setCover(e.target.value)}
                style={{ flex: 1, minWidth: 220, height: 38, padding: "0 10px" }}
              />
            </div>
            <p style={{ fontSize: 13, opacity: 0.75, margin: "8px 0 0" }}>
              Bu dönem: <b>{data.thisDate}</b> &nbsp;·&nbsp; Geçen dönem: <b>{data.lastDate}</b>
              {data.gapDays != null && <> &nbsp;·&nbsp; Gün farkı: {data.gapDays}</>}
            </p>
          </div>

          {/* Slayt-4 toplam önizleme */}
          {totals && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px" }}>Slayt 4 — Toplam karşılaştırma (canlı)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                {[
                  ["Sayfa Ziyareti", totals.sayfa, TR_INT],
                  ["Çift (Teklif)", totals.teklif, TR_INT],
                  ["Dönüş Süresi (saat)", totals.donus, TR_DEC1],
                  ["Profil Puanı", totals.profil, (v) => TR_INT(v)],
                ].map(([label, [cur, prev], fmt]) => {
                  const p = pct(cur, prev);
                  return (
                    <div key={label} style={{ fontSize: 13 }}>
                      <div style={{ opacity: 0.7 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(cur)}</div>
                      <div style={{ opacity: 0.7 }}>geçen: {fmt(prev)}</div>
                      <div>{p.arrow} {p.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Venue başına slayt-3 düzenleme */}
          {data.venues.map((ven, vi) => (
            <div key={vi} className="card" style={{ marginBottom: 16 }}>
              <div style={fieldRow}>
                <label style={{ minWidth: 140, fontWeight: 700 }}>RÇİ (venue) #{vi + 1}</label>
                <input
                  value={ven.rci}
                  onChange={(e) => setVenueField(vi, "rci", e.target.value)}
                  style={{ flex: 1, minWidth: 220, height: 36, padding: "0 10px" }}
                />
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th>Ürün Adı</th>
                    <th>Kategori</th>
                    <th>Sayfa</th>
                    <th>Çift</th>
                    <th>Dönüş</th>
                    <th>Profil</th>
                    <th>S(GY)</th>
                    <th>Ç(GY)</th>
                    <th>D(GY)</th>
                    <th>P(GY)</th>
                  </tr>
                </thead>
                <tbody>
                  {ven.categories.map((c, ci) => (
                    <tr key={ci}>
                      <td><input value={c.urun} onChange={(e) => setCatField(vi, ci, "urun", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input value={c.kategori} onChange={(e) => setCatField(vi, ci, "kategori", e.target.value)} style={{ width: 140 }} /></td>
                      <td><input type="number" value={c.sayfa} onChange={(e) => setCatField(vi, ci, "sayfa", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.teklif} onChange={(e) => setCatField(vi, ci, "teklif", e.target.value)} style={num} /></td>
                      <td><input type="number" step="0.1" value={c.donus} onChange={(e) => setCatField(vi, ci, "donus", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.profil} onChange={(e) => setCatField(vi, ci, "profil", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.sayfaGy} onChange={(e) => setCatField(vi, ci, "sayfaGy", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.teklifGy} onChange={(e) => setCatField(vi, ci, "teklifGy", e.target.value)} style={num} /></td>
                      <td><input type="number" step="0.1" value={c.donusGy} onChange={(e) => setCatField(vi, ci, "donusGy", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.profilGy} onChange={(e) => setCatField(vi, ci, "profilGy", e.target.value)} style={num} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.75 }}>Slayt 3 alt banner maddeleri (her satır bir madde — boş bırakılabilir):</label>
                <textarea
                  value={(ven.bannerBullets || []).join("\n")}
                  onChange={(e) => setBanner(vi, e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                  placeholder={"Deniz kenarında…\n…\n…"}
                />
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 40px" }}>
            <button className="btn" onClick={generate} disabled={generating} style={{ height: 46, padding: "0 24px" }}>
              {generating ? "Üretiliyor…" : "Sunum oluştur (.pptx indir)"}
            </button>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{data.venueCount} venue · slayt 3 ×{data.venueCount} + toplam</span>
          </div>
        </>
      )}
    </main>
  );
}
