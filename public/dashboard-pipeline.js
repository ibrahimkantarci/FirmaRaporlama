/* dashboard-pipeline.js
 * b2b-dashboard.html içine /dashboard sarmalayıcısı tarafından enjekte edilir.
 * Vendor HTML'i DEĞİŞTİRMEZ — yeni sürüm yüklendiğinde de çalışmaya devam eder.
 * Görev: /api/dashboard/data → dashboard'ın global durumuna (S) bas, yeniden çiz.
 * Manuel "Veri Yükle" akışı yedek olarak çalışmaya devam eder.
 *
 * Not: S, ONBOARDING_MAP (const) ve mapRow/renderAll (function) vendor script ile
 * aynı global lexical kapsamda olduğundan buradan erişilebilir.
 */
(function () {
  if (typeof S === "undefined" || typeof mapRow !== "function") {
    console.warn("[pipeline] dashboard global hazır değil, atlanıyor");
    return;
  }

  fetch("/api/dashboard/data", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.ok === false) {
        console.warn("[pipeline] veri hatası:", d && d.error);
        return;
      }
      var loaded = [];

      // ── Onboarding ──────────────────────────────────────────────────────
      if (Array.isArray(d.onboarding) && d.onboarding.length) {
        S.onboarding = d.onboarding.map(function (row) {
          return mapRow(row, ONBOARDING_MAP);
        });
        S.loaded.onboarding = true;
        S.loaded.flag = S.onboarding.some(function (f) { return f.ob_flag; });
        S.loaded.kw = S.onboarding.some(function (f) { return f.kampanya || f.whatsapp; });
        loaded.push("onboarding: " + S.onboarding.length);
      }

      // ── Firma performans (Providers-PY → S.firmalar) ────────────────────
      // Performans + Alarm + Yenileme (fallback) + Genel Analiz panellerini besler.
      // applyImport ile aynı: mapRow(FIRMA_MAP) + calcFlag(flag_rengi).
      if (Array.isArray(d.firma) && d.firma.length) {
        S.firmalar = d.firma.map(function (row) {
          var m = mapRow(row, FIRMA_MAP);
          m.flag_rengi = calcFlag(m);
          return m;
        });
        S.loaded.firma_performans = true;
        loaded.push("firma: " + S.firmalar.length);
      }

      // (Diğer sayfalar eklendikçe buraya benzer bloklar gelecek.)

      if (!loaded.length) return;

      try { if (typeof updateTopbar === "function") updateTopbar(); } catch (e) {}
      try { renderAll(); } catch (e) { console.error("[pipeline] renderAll", e); }
      try { if (typeof updateBadges === "function") updateBadges(); } catch (e) {}
      try { if (typeof buildAlarmStrip === "function") buildAlarmStrip(); } catch (e) {}
      try {
        var fr = document.getElementById("freshness");
        if (fr) fr.textContent = "Qlik · " + new Date().toLocaleTimeString("tr-TR");
      } catch (e) {}
      try { if (typeof toast === "function") toast("Qlik verisi yüklendi · " + loaded.join(" · ")); } catch (e) {}
    })
    .catch(function (e) { console.error("[pipeline] istek başarısız", e); });
})();
