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

  // Sheet tarih hücreleri (UNFORMATTED okuma) Excel seri no olarak gelebilir
  // (ör. 46203). Seri no → "YYYY-MM-DD"; string tarih ise olduğu gibi bırak.
  function toDateStr(v) {
    if (typeof v === "number") {
      var d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      var m = String(d.getUTCMonth() + 1);
      var day = String(d.getUTCDate());
      return d.getUTCFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
    }
    return typeof parseTarih === "function" ? parseTarih(v) : String(v || "");
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
          // Çağrılar MÜŞTERİ (account) seviyesinde → firma-çağrı eşleşmesi için
          // firma_id'yi Müşteri İD'ye hizala (kullanıcı kararı). RÇİ sheet'te durur;
          // yalnız bellek içi join anahtarı değişir. c.firma_id da Müşteri ID.
          if (m.musteri_id) m.firma_id = String(m.musteri_id).trim();
          return m;
        });
        S.loaded.firma_performans = true;
        loaded.push("firma: " + S.firmalar.length);
      }

      // ── Çağrı ham veri (PY Sonitel → S.cagrilar) ────────────────────────
      // Obje kolonları TÜRKÇE (CAGRI_MAP İngilizce beklediğinden burada elle eşlenir).
      // applyImport ile aynı dönüşüm: parseTarih + durum(Touch/Attempt) + süre normalizasyonu.
      // Not: firma bağlantısı "Müşteri ID" üzerinden (kullanıcı onayı) — S.firmalar ile
      // çapraz eşleşme, firma tarafının aynı anahtarı kullanmasına bağlıdır (doğrulanacak).
      if (Array.isArray(d.cagri) && d.cagri.length) {
        S.cagrilar = d.cagri.map(function (row) {
          var durum = String(row["Arama Tipi"] || "").trim();
          durum =
            durum === "Touch" ? "Touch" :
            durum === "Attempt" ? "Attempt" :
            durum === "Başarılı" ? "Touch" :
            durum === "Cevapsız" ? "Attempt" : durum;
          var sd = row["Konuşma Süresi"];
          var sure = (sd === "-" || sd === "" || sd == null) ? 0 : Math.round(parseFloat(sd) || 0);
          var mid = String(row["Müşteri ID"] || "").trim();
          return {
            firma_id: mid,
            firma_adi: "",
            customer_name: String(row["Kullanıcı Adı"] || ""),
            py_adi: String(row["Arayan PY"] || ""),
            tarih: toDateStr(row["Arama Tarihi"]),
            durum: durum,
            sure_dakika: sure,
            musteri_id: mid,
            cagri_id: String(row["sonitel_call_log_id"] || ""),
            kullanici_tipi: String(row["Kullanıcı Tipi"] || ""),
          };
        });
        S.loaded.cagri = true;
        S._cagriSecilenAy = "";
        loaded.push("çağrı: " + S.cagrilar.length);
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
