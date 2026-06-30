"use client";

import { useState } from "react";

export default function ExportTool() {
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runExport() {
    const id = customerId.trim();
    if (!id) {
      setError({ message: "Bir müşteri ID gir." });
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/qlik/export?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.ok) {
        setError({ message: data.error || "Bilinmeyen bir hata oluştu." });
      } else {
        setResult(data);
      }
    } catch (e) {
      setError({ message: "İstek tamamlanamadı. Bağlantıyı kontrol et.", detail: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !loading) runExport();
  }

  const gapWide = result && typeof result.lastYearGapDays === "number" && result.lastYearGapDays > 31;
  const noProviders = result && result.providerCount === 0;

  return (
    <main className="wrap">
      <p className="eyebrow">Qlik &rarr; Google Sheets</p>
      <h1 className="title">Firma Raporlama</h1>
      <p className="lede">
        Bir müşteri ID gir; o müşterinin tüm provider'ları, bu dönem ve önceki dönem
        yan yana olacak şekilde Google Sheet'e yazılır.
      </p>

      <div className="modes" role="tablist" aria-label="Aktarım modu">
        <button className="mode" role="tab" aria-selected="true">
          Tekil müşteri
        </button>
        <button className="mode" role="tab" aria-selected="false" disabled>
          30 gün içinde bitenler <span className="soon">yakında</span>
        </button>
      </div>

      <div className="card">
        <label className="field-label" htmlFor="cust">Müşteri ID</label>
        <div className="row">
          <input
            id="cust"
            className="input"
            inputMode="numeric"
            placeholder="örn. 58367"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
          <button className="btn" onClick={runExport} disabled={loading}>
            {loading ? "Aktarılıyor…" : "Aktar"}
          </button>
        </div>
        <p className="hint">
          {loading
            ? "Qlik'ten çekiliyor ve Sheet'e yazılıyor — birkaç saniye sürebilir."
            : "Çalıştırınca seçili sekme önce temizlenir, sonra güncel veri yazılır."}
        </p>
      </div>

      {result && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <span className="result-cust">
              Müşteri <b>{result.customerId}</b>
            </span>
            <span className="badge">{result.sheet?.updatedRows ?? "\u2014"} satır yazıldı</span>
          </div>

          <div className="periods">
            <div className="period">
              <div className="lab">Önceki dönem</div>
              <div className="val">{result.lastYearUsedDate || "\u2014"}</div>
            </div>
            <div className="period-link">
              <span>{result.lastYearGapDays} gün fark</span>
            </div>
            <div className="period">
              <div className="lab">Bu dönem</div>
              <div className="val">{result.currentDate || "\u2014"}</div>
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="num">{result.providerCount}</div>
              <div className="cap">Provider</div>
            </div>
            <div className="stat">
              <div className="num">
                {result.lastYearMatchedCount}
                {typeof result.lastYearFetchedRows === "number" && (
                  <span style={{ fontSize: 13, opacity: 0.55 }}> / {result.lastYearFetchedRows}</span>
                )}
              </div>
              <div className="cap">Önceki dönem eşleşen / çekilen satır</div>
            </div>
            <div className="stat">
              <div className="num">{result.columnsCount}</div>
              <div className="cap">Sütun</div>
            </div>
          </div>

          {noProviders && (
            <div className="note empty">
              Bu ID için provider bulunamadı. ID'yi ve müşterinin güncel snapshot'ta
              olduğunu kontrol et.
            </div>
          )}
          {gapWide && (
            <div className="note warn">
              Önceki dönem hedefe {result.lastYearGapDays} gün uzakta. Bu müşteri için
              gerçek bir önceki dönem snapshot'ı olmayabilir — değerleri kontrol et.
            </div>
          )}

          {result.sheet?.sheetUrl && (
            <a className="sheet-link" href={result.sheet.sheetUrl} target="_blank" rel="noreferrer">
              Sheet'i aç &rarr;
            </a>
          )}
        </section>
      )}

      {error && (
        <div className="error" role="alert">
          <b>Aktarım yapılamadı</b>
          {error.message}
          {error.detail && <div style={{ marginTop: 6 }}><code>{error.detail}</code></div>}
        </div>
      )}
    </main>
  );
}
