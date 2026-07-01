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

  // Yenileme ayı → "YYYY-MM". "2026-09-01" ve "01.12.2025" (GG.AA.YYYY) formatlarını çözer.
  function renMonth(v) {
    var s = String(v == null ? "" : v).trim();
    var m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return m[1] + "-" + m[2];
    m = s.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})/);
    if (m) return m[3] + "-" + m[2];
    return "";
  }
  // Tutar → sayı. Canlı veri çoğunlukla sayı; string gelirse TR/para birimi temizle.
  function renNum(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var t = String(v).replace(/[^\d.,-]/g, "");
    var hasC = t.indexOf(",") >= 0, hasD = t.indexOf(".") >= 0;
    if (hasC && hasD) t = t.replace(/\./g, "").replace(",", "."); // TR: 1.813,00
    else if (hasC) t = t.replace(",", ".");
    var f = parseFloat(t);
    return isFinite(f) ? f : 0;
  }

  // ── Yenileme (Genel Analiz) — esnek filtre + aylık görünüm ───────────────
  // Oran = yenileyen / KARAR VERİLMİŞ (Yenilendi+Yenilemedi); bekleyen (boş) hariç.
  var REN_DIMS = [
    { k: "kategori_grubu", lbl: "Üst Kategori" }, { k: "kategori_adi", lbl: "Kategori" },
    { k: "sehir", lbl: "Şehir" }, { k: "ilce", lbl: "İlçe" }, { k: "urun_adi", lbl: "Ürün" },
    { k: "musteri_statusu", lbl: "Müşteri Statüsü" }, { k: "py_adi", lbl: "PY" }, { k: "ay", lbl: "Ay" },
  ];
  function renEsc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }
  function renFiltered() {
    var fs = S._renFilters || [];
    return (S._renewalRows || []).filter(function (r) {
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.col && f.values && f.values.length && f.values.indexOf(String(r[f.col] == null ? "" : r[f.col])) < 0) return false;
      }
      return true;
    });
  }
  function renRate(subset, metric) {
    var dec = subset.filter(function (r) { return r.decided; });
    if (metric === "tutar") {
      var rb = 0, db = 0;
      for (var i = 0; i < dec.length; i++) { db += dec[i].oncesi; if (dec[i].yeniledi) rb += dec[i].oncesi; }
      return { pct: db ? 100 * rb / db : 0, num: rb, den: db };
    }
    var ren = dec.filter(function (r) { return r.yeniledi; }).length;
    return { pct: dec.length ? 100 * ren / dec.length : 0, num: ren, den: dec.length };
  }
  function renCard(cls, lbl, val) { return '<div class="mc ' + cls + '"><div class="mc-label">' + lbl + '</div><div class="mc-val">' + val + '</div></div>'; }
  function renDistinct(col) {
    var set = {}; (S._renewalRows || []).forEach(function (r) { var v = String(r[col] == null ? "" : r[col]).trim(); if (v) set[v] = 1; });
    return Object.keys(set).sort();
  }
  function renderRenFilters() {
    var host = document.getElementById("ren-filters"); if (!host) return;
    host.innerHTML = (S._renFilters || []).map(function (f, i) {
      var opts = REN_DIMS.map(function (d) { return '<option value="' + d.k + '"' + (f.col === d.k ? " selected" : "") + '>' + d.lbl + '</option>'; }).join("");
      var valSel = "";
      if (f.col) {
        valSel = '<select multiple size="4" onchange="renSetVals(' + i + ',this)" style="min-width:190px;max-width:300px;font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:3px">' +
          renDistinct(f.col).map(function (v) { return '<option value="' + renEsc(v) + '"' + (f.values.indexOf(v) >= 0 ? " selected" : "") + '>' + renEsc(v) + '</option>'; }).join("") + '</select>';
      }
      return '<div style="display:flex;gap:6px;align-items:flex-start">' +
        '<select onchange="renSetCol(' + i + ',this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px"><option value="">— kolon —</option>' + opts + '</select>' +
        valSel + '<button onclick="renRemoveFilter(' + i + ')" style="font-size:11px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#71717a;padding:4px 8px">✕</button></div>';
    }).join("");
  }
  function renderRenMonths(data, metric) {
    var by = {}; data.forEach(function (r) { if (r.ay && r.decided) (by[r.ay] || (by[r.ay] = [])).push(r); });
    var months = Object.keys(by).sort();
    var el = document.getElementById("ren-months"); if (!el) return;
    if (!months.length) { el.innerHTML = '<div style="color:#a1a1aa;font-size:12px;padding:8px">Ay verisi yok</div>'; return; }
    el.innerHTML = months.map(function (mo) {
      var rt = renRate(by[mo], metric);
      var sub = metric === "tutar" ? "₺" + Math.round(rt.num).toLocaleString("tr-TR") + " / ₺" + Math.round(rt.den).toLocaleString("tr-TR") : rt.num + " / " + rt.den + " firma";
      var col = rt.pct >= 70 ? "#16a34a" : rt.pct >= 50 ? "#ca8a04" : "#dc2626";
      return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">' + mo + '</span><span style="color:#71717a">' + sub + ' · <b style="color:' + col + '">%' + rt.pct.toFixed(1) + '</b></span></div><div style="background:#f4f4f5;border-radius:5px;height:16px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, rt.pct) + '%;background:' + col + ';border-radius:5px"></div></div></div>';
    }).join("");
  }
  function renderRenewalAnaliz() {
    var panel = document.getElementById("panel-analiz"); if (!panel) return;
    var rows = S._renewalRows || [];
    if (!rows.length) { panel.innerHTML = '<div class="empty-state"><div>📊</div><div class="et">Yenileme verisi yok</div><div class="es">Qlik\'ten yenile ile canlı çekilir</div></div>'; return; }
    if (!S._renMetric) S._renMetric = "adet";
    if (!S._renFilters) S._renFilters = [];
    if (panel.getAttribute("data-ren") !== "1") {
      panel.setAttribute("data-ren", "1");
      panel.innerHTML =
        '<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="flbl">Metrik</span>' +
        '<div class="chip" id="rm-adet" onclick="setRenMetric(\'adet\')">Adet (firma)</div><div class="chip" id="rm-tutar" onclick="setRenMetric(\'tutar\')">Tutar (₺)</div></div>' +
        '<div id="ren-filters" style="display:flex;flex-direction:column;gap:6px"></div>' +
        '<div style="margin-top:8px"><button onclick="addRenFilter()" style="font-size:12px;padding:5px 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+ Filtre ekle</button> <span id="ren-info" style="font-size:11px;color:#a1a1aa;margin-left:6px"></span></div></div>' +
        '<div class="mg" id="ren-cards"></div>' +
        '<div class="card"><div class="card-head"><span class="ct">📅 Aylık yenileme — <span id="ren-mlbl">adet</span></span></div><div id="ren-months"></div></div>' +
        '<div class="card"><div class="card-head"><span class="ct">Detay</span><span id="ren-tcnt" style="font-size:11px;color:#a1a1aa"></span></div><div class="tw"><table><thead><tr><th>Firma</th><th>Üst Kat.</th><th>Kategori</th><th>Şehir</th><th>Statü</th><th>Ay</th><th>Öncesi</th><th>Sonrası</th><th>Durum</th></tr></thead><tbody id="ren-tbl"></tbody></table></div></div>';
    }
    document.getElementById("rm-adet").classList.toggle("on", S._renMetric === "adet");
    document.getElementById("rm-tutar").classList.toggle("on", S._renMetric === "tutar");
    document.getElementById("ren-mlbl").textContent = S._renMetric === "tutar" ? "tutar (₺)" : "adet (firma)";
    renderRenFilters();
    var data = renFiltered();
    var decided = data.filter(function (r) { return r.decided; });
    var yen = decided.filter(function (r) { return r.yeniledi; });
    var m = S._renMetric, isT = m === "tutar";
    var yenV = isT ? yen.reduce(function (s, r) { return s + r.oncesi; }, 0) : yen.length;
    var noV = isT ? decided.filter(function (r) { return !r.yeniledi; }).reduce(function (s, r) { return s + r.oncesi; }, 0) : (decided.length - yen.length);
    var rate = renRate(data, m);
    var fmt = function (v) { return isT ? "₺" + Math.round(v).toLocaleString("tr-TR") : String(Math.round(v)); };
    document.getElementById("ren-cards").innerHTML =
      renCard("green", "Yenileyen", fmt(yenV)) + renCard("red", "Yenilemeyen", fmt(noV)) +
      renCard("", "Bekleyen (karar yok)", String(data.length - decided.length)) + renCard("blue", "Yenileme oranı", rate.pct.toFixed(1) + "%");
    renderRenMonths(data, m);
    document.getElementById("ren-info").textContent = data.length !== rows.length ? (data.length + " / " + rows.length + " satır") : (rows.length + " satır");
    document.getElementById("ren-tcnt").textContent = decided.length + " karar";
    document.getElementById("ren-tbl").innerHTML = decided.slice(0, 300).map(function (r) {
      return "<tr><td style=\"font-size:12px\">" + renEsc(r.musteri_adi || r.firma_id) + "</td><td style=\"font-size:11px;color:#71717a\">" + renEsc(r.kategori_grubu) + "</td><td style=\"font-size:11px;color:#71717a\">" + renEsc(r.kategori_adi) + "</td><td style=\"font-size:11px;color:#71717a\">" + renEsc(r.sehir) + "</td><td style=\"font-size:11px\">" + renEsc(r.musteri_statusu) + "</td><td style=\"font-size:11px\">" + renEsc(r.ay) + "</td><td style=\"font-size:12px\">" + (r.oncesi ? "₺" + Math.round(r.oncesi).toLocaleString("tr-TR") : "—") + "</td><td style=\"font-size:12px\">" + (r.sonrasi ? "₺" + Math.round(r.sonrasi).toLocaleString("tr-TR") : "—") + "</td><td>" + (r.yeniledi ? '<span class="badge ok">Yenilendi</span>' : '<span class="badge crit">Yenilemedi</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="9" style="text-align:center;color:#a1a1aa;padding:16px">Sonuç yok</td></tr>';
  }
  window.setRenMetric = function (m) { S._renMetric = m; renderRenewalAnaliz(); };
  window.addRenFilter = function () { (S._renFilters = S._renFilters || []).push({ col: "", values: [] }); renderRenewalAnaliz(); };
  window.renRemoveFilter = function (i) { S._renFilters.splice(i, 1); renderRenewalAnaliz(); };
  window.renSetCol = function (i, col) { S._renFilters[i].col = col; S._renFilters[i].values = []; renderRenewalAnaliz(); };
  window.renSetVals = function (i, sel) { var v = []; for (var o = 0; o < sel.options.length; o++) if (sel.options[o].selected) v.push(sel.options[o].value); S._renFilters[i].values = v; renderRenewalAnaliz(); };

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

      // ── Yenileme analizi (ALL_new → S._renewalRows) ─────────────────────
      // Ayrı Google Sheet'ten (RENEWAL_DATA deploy) canlı gelir. "Yenileme Durumu":
      // Yenilendi=yenileyen, Yenilemedi=yenilemeyen, boş/Bağlantı=bekleyen (oranda HARİÇ).
      // Tutarlar canlı sayı gelir; ay "01.12.2025" veya "2026-09-01" olabilir (iki format).
      if (Array.isArray(d.yenileme) && d.yenileme.length) {
        S._renewalRows = d.yenileme.map(function (r) {
          var durum = String(r["Yenileme Durumu"] || "").trim();
          return {
            ay: renMonth(r["Yenileme Ayı-Date"]) || renMonth(r["Yenileme Ayı"]),
            yeniledi: durum === "Yenilendi",
            decided: durum === "Yenilendi" || durum === "Yenilemedi",
            durum: durum,
            kategori_adi: String(r["Kategori Adı"] || "").trim(),
            kategori_grubu: String(r["Kategori"] || "").trim(), // Big 5 / Others / Venue
            sehir: String(r["Şehir"] || "").trim(),
            ilce: String(r["İlçe"] || "").trim(),
            urun_adi: String(r["Ürün Adı"] || "").trim(),
            musteri_statusu: String(r["Müşteri Statüsü"] || "").trim().toLowerCase(),
            py_adi: String(r["PY"] || "").trim(),
            firma_id: String(r["Müşteri İD"] || r["RÇİ"] || "").trim(),
            musteri_adi: String(r["RÇİ Adı"] || "").trim(),
            oncesi: renNum(r["Yenileme Öncesi Tutar"]),
            sonrasi: renNum(r["Yenilenen Tutar"]),
          };
        });
        S.loaded.yenileme = true;
        // Genel Analiz panelini kendi yenileme görünümümüzle DEĞİŞTİR (vendor HTML'e
        // dokunmadan). renderAll() ve nav bunu çağırır.
        window.renderAnaliz = renderRenewalAnaliz;
        loaded.push("yenileme: " + S._renewalRows.length);
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
