"use client";
// app/rapor/page.js
// Sunum önizleme/düzenleme: Google Sheet'ten çek → düzelt → .pptx üret.
// Phase B: medyan/ortalama dönüş için iki ayrı buton (venue + toplam),
// sürükle-bırak sıralama (venue içi, venue'ler arası, venue sırası), satır/venue silme,
// banner her zaman görünür ama boş.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "../brand";

const TR_INT = (v) => Math.round(v).toLocaleString("tr-TR");

// Saat cinsinden değer → "X saat Y dakika" (sıfır parça atılır).
function hm(v) {
  const total = Math.round((Number(v) || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} saat ${m} dakika`;
  if (h) return `${h} saat`;
  return `${m} dakika`;
}

// Toplam (slayt 4): sayfa/teklif TOPLANIR; profil DÜZ ORTALAMA (>0).
// Dönüş süresi: "Teklif" (Çift) ile AĞIRLIKLI ORTALAMA — her dönem kendi teklifiyle.
function computeTotals(venues, metric) {
  const cats = venues.flatMap((v) => v.categories);
  const sum = (key) => cats.reduce((a, c) => a + (Number(c[key]) || 0), 0);
  const avgPos = (key) => {
    const xs = cats.map((c) => Number(c[key]) || 0).filter((x) => x > 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  // Ağırlıklı ortalama: sum(değer*ağırlık)/sum(ağırlık), yalnız değer>0 & ağırlık>0.
  const wavg = (valKey, wKey) => {
    let nu = 0, de = 0;
    for (const c of cats) {
      const v = Number(c[valKey]) || 0;
      const w = Number(c[wKey]) || 0;
      if (v > 0 && w > 0) { nu += v * w; de += w; }
    }
    return de ? nu / de : 0;
  };
  const dk = metric === "median" ? "donusMedian" : "donusAvg";
  const dkGy = metric === "median" ? "donusMedianGy" : "donusAvgGy";
  return {
    sayfa: [sum("sayfa"), sum("sayfaGy")],
    teklif: [sum("teklif"), sum("teklifGy")],
    donus: [wavg(dk, "teklif"), wavg(dkGy, "teklifGy")],
    profil: [avgPos("profil"), avgPos("profilGy")],
  };
}

function pct(cur, prev) {
  if (!prev) return { arrow: "▲", text: "0,0%" };
  const d = ((cur - prev) / prev) * 100;
  return { arrow: cur >= prev ? "▲" : "▼", text: `${Math.abs(d).toFixed(1).replace(".", ",")}%` };
}

// Medyan/Ortalama seçici (iki durumlu segment buton).
function MetricToggle({ label, value, onChange }) {
  const seg = (active) => ({
    border: "1px solid " + (active ? "#1f6feb" : "#d7dce3"),
    background: active ? "#1f6feb" : "#fff",
    color: active ? "#fff" : "#5b6675",
    fontSize: 12.5,
    padding: "5px 12px",
    borderRadius: 8,
    cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 13, opacity: 0.75 }}>{label}:</span>
      <button type="button" style={seg(value === "median")} onClick={() => onChange("median")}>
        Medyan
      </button>
      <button type="button" style={seg(value === "average")} onClick={() => onChange("average")}>
        Ortalama
      </button>
    </div>
  );
}

export default function RaporPage() {
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // İki ayrı dönüş ölçüsü seçimi (varsayılan: medyan).
  const [venueMetric, setVenueMetric] = useState("median");
  const [totalsMetric, setTotalsMetric] = useState("median");

  // Sürükle-bırak için geçici durum (render tetiklemesin diye ref).
  const dragRef = useRef(null);

  const totals = useMemo(() => {
    if (!data) return null;
    const t = computeTotals(data.venues, totalsMetric);
    // Toplam dönüş: varsa GERÇEK Qlik grand total kullan (ağırlıklı ortalama yedek).
    const et = data.engTotals;
    const arr = et && (totalsMetric === "median" ? et.median : et.avg);
    if (arr && (arr[0] != null || arr[1] != null)) {
      t.donus = [Number(arr[0]) || 0, Number(arr[1]) || 0];
      t.donusSource = "qlik";
    } else {
      t.donusSource = "weighted";
    }
    return t;
  }, [data, totalsMetric]);

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
  function setBannerItem(vi, idx, value) {
    setData((d) => {
      const venues = d.venues.map((ven, i) => {
        if (i !== vi) return ven;
        const bb = [...(ven.bannerBullets || [])];
        while (bb.length < 6) bb.push("");
        bb[idx] = value;
        return { ...ven, bannerBullets: bb };
      });
      return { ...d, venues };
    });
  }
  function setBannerOn(vi, on) {
    setData((d) => ({
      ...d,
      venues: d.venues.map((ven, i) => (i === vi ? { ...ven, bannerOn: on } : ven)),
    }));
  }

  // --- sıralama / silme ---
  function moveVenue(from, to) {
    if (from === to) return;
    setData((d) => {
      const venues = [...d.venues];
      const [m] = venues.splice(from, 1);
      venues.splice(from < to ? to - 1 : to, 0, m);
      return { ...d, venues };
    });
  }
  function moveRow(fromVi, fromCi, toVi, toCi) {
    setData((d) => {
      const venues = d.venues.map((v) => ({ ...v, categories: [...v.categories] }));
      const [m] = venues[fromVi].categories.splice(fromCi, 1);
      if (!m) return d;
      let at = toCi;
      if (fromVi === toVi && fromCi < toCi) at = toCi - 1; // çıkarma kaymasını telafi et
      venues[toVi].categories.splice(at, 0, m);
      return { ...d, venues };
    });
  }
  function deleteRow(vi, ci) {
    setData((d) => {
      const venues = d.venues.map((v, i) =>
        i === vi ? { ...v, categories: v.categories.filter((_, j) => j !== ci) } : v
      );
      return { ...d, venues };
    });
  }
  function deleteVenue(vi) {
    setData((d) => ({ ...d, venues: d.venues.filter((_, i) => i !== vi) }));
  }

  // --- HTML5 drag-drop yardımcıları (kütüphanesiz) ---
  function startDrag(e, payload) {
    dragRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", "x"); } catch {}
  }
  function onRowDrop(e, vi, ci) {
    e.preventDefault();
    e.stopPropagation();
    const d = dragRef.current;
    if (d?.type === "row") moveRow(d.vi, d.ci, vi, ci);
    dragRef.current = null;
  }
  function onVenueDrop(e, vi) {
    e.preventDefault();
    const d = dragRef.current;
    if (d?.type === "row") moveRow(d.vi, d.ci, vi, data.venues[vi].categories.length);
    else if (d?.type === "venue") moveVenue(d.vi, vi);
    dragRef.current = null;
  }
  const allowDrop = (e) => e.preventDefault();

  async function generate() {
    setError("");
    setGenerating(true);
    try {
      // venue slaytları: seçilen ölçüye göre donus/donusGy doldur.
      const vk = venueMetric === "median" ? "donusMedian" : "donusAvg";
      const vkGy = venueMetric === "median" ? "donusMedianGy" : "donusAvgGy";
      const venuesOut = data.venues.map((v) => ({
        ...v,
        categories: v.categories.map((c) => ({
          ...c,
          donus: Number(c[vk]) || 0,
          donusGy: Number(c[vkGy]) || 0,
        })),
      }));
      // toplam slaytı: gerçek Qlik grand total (yoksa ağırlıklı ortalama) — memo'dan.
      const payload = { ...data, venues: venuesOut, totalsDonus: totals ? totals.donus : undefined };

      const r = await fetch("/api/generate-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const num = { width: 96 };
  const fieldRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0" };
  const handle = { cursor: "grab", userSelect: "none", color: "#9aa4b2", fontSize: 16, padding: "0 4px" };
  const delBtn = {
    border: "1px solid #f0c4c0",
    background: "#fff",
    color: "#c0392b",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 6,
    cursor: "pointer",
  };
  const addBtn = {
    border: "1px solid #cfe3d4",
    background: "#fff",
    color: "#1f7a3d",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 6,
    cursor: "pointer",
  };

  // venue tablosunda gösterilecek dönüş alanı (seçili ölçüye göre).
  const vk = venueMetric === "median" ? "donusMedian" : "donusAvg";
  const vkGy = venueMetric === "median" ? "donusMedianGy" : "donusAvgGy";

  return (
    <main className="wrap" style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Link href="/provider" className="gbtn">&larr; Firma Raporlama</Link>
        <Brand subtitle="Sunum Üretimi" />
      </div>
      <p className="eyebrow">Google Sheets → PowerPoint</p>
      <h1 className="title">Sunum Önizleme &amp; Düzenleme</h1>
      <p className="lede">
        Müşteri verisini Google Sheet&apos;ten çek, alanları düzelt, sırala, sonra sunumu üret.
        (Veri önce &quot;Firma Raporlama&quot; ekranından Sheet&apos;e aktarılmış olmalı.)
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
                Sheet başlık adlarını kontrol et (medyan kolonları eski aktarımlarda olmayabilir).
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
              Bu dönem: <b>{data.thisDate}</b> &nbsp;·&nbsp; Geçen dönem: <b>{data.lastDate || "—"}</b>
              {data.gapDays != null && <> &nbsp;·&nbsp; Gün farkı: {data.gapDays}</>}
            </p>
          </div>

          {/* Slayt-4 toplam önizleme + toplam ölçü seçici */}
          {totals && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>
                  Slayt 4 — Toplam karşılaştırma (canlı)
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6, marginLeft: 8 }}>
                    dönüş: {totals.donusSource === "qlik" ? "Qlik Totals" : "ağırlıklı ort. (yedek)"}
                  </span>
                </h3>
                <MetricToggle label="Toplam dönüş" value={totalsMetric} onChange={setTotalsMetric} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
                {[
                  ["Sayfa Ziyareti", totals.sayfa, TR_INT],
                  ["Çift (Teklif)", totals.teklif, TR_INT],
                  ["Dönüş Süresi", totals.donus, hm],
                  ["Profil Puanı", totals.profil, TR_INT],
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

          {/* Venue ölçü seçici */}
          <div className="card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              Satırları/venue&apos;leri sürükleyip bırakarak sıralayabilirsin (⠿ tut).
            </span>
            <MetricToggle label="Venue dönüş" value={venueMetric} onChange={setVenueMetric} />
          </div>

          {/* Venue başına slayt-3 düzenleme */}
          {data.venues.map((ven, vi) => (
            <div
              key={vi}
              className="card"
              style={{ marginBottom: 16 }}
              onDragOver={allowDrop}
              onDrop={(e) => onVenueDrop(e, vi)}
            >
              <div style={fieldRow}>
                <span
                  draggable
                  onDragStart={(e) => startDrag(e, { type: "venue", vi })}
                  title="Venue'yi taşı"
                  style={handle}
                >
                  ⠿
                </span>
                <label style={{ minWidth: 120, fontWeight: 700 }}>RÇİ (venue) #{vi + 1}</label>
                <input
                  value={ven.rci}
                  onChange={(e) => setVenueField(vi, "rci", e.target.value)}
                  style={{ flex: 1, minWidth: 200, height: 36, padding: "0 10px" }}
                />
                <button type="button" style={delBtn} onClick={() => deleteVenue(vi)}>
                  Venue&apos;yi sil
                </button>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th style={{ width: 22 }}></th>
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
                    <th style={{ width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ven.categories.map((c, ci) => (
                    <tr key={ci} onDragOver={allowDrop} onDrop={(e) => onRowDrop(e, vi, ci)}>
                      <td>
                        <span
                          draggable
                          onDragStart={(e) => startDrag(e, { type: "row", vi, ci })}
                          title="Satırı taşı (venue içi veya başka venue'ye)"
                          style={handle}
                        >
                          ⠿
                        </span>
                      </td>
                      <td><input value={c.urun} onChange={(e) => setCatField(vi, ci, "urun", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input value={c.kategori} onChange={(e) => setCatField(vi, ci, "kategori", e.target.value)} style={{ width: 130 }} /></td>
                      <td><input type="number" value={c.sayfa} onChange={(e) => setCatField(vi, ci, "sayfa", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.teklif} onChange={(e) => setCatField(vi, ci, "teklif", e.target.value)} style={num} /></td>
                      <td><input type="number" step="0.1" value={c[vk]} onChange={(e) => setCatField(vi, ci, vk, e.target.value)} style={num} title="saat cinsinden" /></td>
                      <td><input type="number" value={c.profil} onChange={(e) => setCatField(vi, ci, "profil", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.sayfaGy} onChange={(e) => setCatField(vi, ci, "sayfaGy", e.target.value)} style={num} /></td>
                      <td><input type="number" value={c.teklifGy} onChange={(e) => setCatField(vi, ci, "teklifGy", e.target.value)} style={num} /></td>
                      <td><input type="number" step="0.1" value={c[vkGy]} onChange={(e) => setCatField(vi, ci, vkGy, e.target.value)} style={num} title="saat cinsinden" /></td>
                      <td><input type="number" value={c.profilGy} onChange={(e) => setCatField(vi, ci, "profilGy", e.target.value)} style={num} /></td>
                      <td><button type="button" style={delBtn} onClick={() => deleteRow(vi, ci)} title="Satırı sil">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0" }}>
                Dönüş sütunları saat cinsinden ({venueMetric === "median" ? "medyan" : "ortalama"}); sunumda &quot;X saat Y dakika&quot; gösterilir.
              </p>

              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>
                    Banner maddeleri (en çok 6 — yalnızca dolu olanlar simetrik yerleşir):
                  </label>
                  {ven.bannerOn === false ? (
                    <button type="button" style={addBtn} onClick={() => setBannerOn(vi, true)}>
                      Banner ekle
                    </button>
                  ) : (
                    <button type="button" style={delBtn} onClick={() => setBannerOn(vi, false)}>
                      Banner&apos;ı sil
                    </button>
                  )}
                </div>
                {ven.bannerOn !== false && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                    {Array.from({ length: 6 }).map((_, bi) => (
                      <input
                        key={bi}
                        value={(ven.bannerBullets || [])[bi] || ""}
                        onChange={(e) => setBannerItem(vi, bi, e.target.value)}
                        style={{ height: 34, padding: "0 8px" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 40px", flexWrap: "wrap" }}>
            <button className="btn" onClick={generate} disabled={generating || data.venues.length === 0} style={{ height: 46, padding: "0 24px" }}>
              {generating ? "Üretiliyor…" : "Sunum oluştur (.pptx indir)"}
            </button>
            <span style={{ fontSize: 13, opacity: 0.7 }}>
              {data.venues.length} venue · slayt 3 ×{data.venues.length} + toplam
            </span>
          </div>
        </>
      )}
    </main>
  );
}
