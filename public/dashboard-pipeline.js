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

  // ── Yenileme (Genel Analiz) — 1'e 1 hedef + kırılım + esnek filtre ────────
  // İki metrik (görünüm biçimi):
  //   • "tutar" · 1'e 1 Hedef = Σ Yenilenen Tutar / Σ Yenileme Öncesi Tutar
  //     (yenileyen satırlarda); hedef %100 (yeşil ≥100, kırmızı <100).
  //   • "adet"  · Yenileyen / Toplam; Toplam = "Yenileme mi?" == "Yenileme" satır sayısı.
  // Kırılım: seçilen kolonun her değeri için metrik ayrı hesaplanır (group-by).
  // Ay (çoklu seçim) ve değer filtreleri önce popülasyonu daraltır.
  function renEsc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }
  var renTL = function (v) { return "₺" + Math.round(v || 0).toLocaleString("tr-TR"); };
  // Ham satırdan (tüm kolonlar) bir kolonun değeri — kırılım/filtre herhangi bir kolonu kullanabilsin.
  function renRawVal(r, col) { var raw = r && r.raw; var v = raw && col ? raw[col] : undefined; return v == null ? "" : String(v).trim(); }

  // Ham veriden tüm kolon başlıkları (kırılım + filtre açılırları). Bir kez hesapla/önbellekle.
  function renCols() {
    if (S._renColsCache) return S._renColsCache;
    var seen = {}, out = [];
    (S._renewalRows || []).forEach(function (r) {
      var raw = r.raw || {};
      for (var k in raw) { if (raw.hasOwnProperty(k) && k && !seen[k]) { seen[k] = 1; out.push(k); } }
    });
    out.sort(function (a, b) { return a.localeCompare(b, "tr"); });
    S._renColsCache = out;
    return out;
  }
  function renDistinct(col) {
    var set = {}; (S._renewalRows || []).forEach(function (r) { var v = renRawVal(r, col); if (v) set[v] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "tr"); });
  }
  function renMonthsAll() {
    var set = {}; (S._renewalRows || []).forEach(function (r) { if (r.ay) set[r.ay] = 1; });
    return Object.keys(set).sort();
  }
  // Ay (çoklu) + değer filtrelerini uygula.
  function renFiltered() {
    var months = S._renMonths || [];
    var fs = S._renFilters || [];
    return (S._renewalRows || []).filter(function (r) {
      if (months.length && months.indexOf(r.ay) < 0) return false;
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.col && f.values && f.values.length && f.values.indexOf(renRawVal(r, f.col)) < 0) return false;
      }
      return true;
    });
  }
  // Bir satır kümesi için seçili metriği hesapla → {num, den, pct}.
  function renCalc(rows, metric) {
    if (metric === "tutar") {
      var num = 0, den = 0;
      for (var i = 0; i < rows.length; i++) { if (rows[i].yeniledi) { num += rows[i].sonrasi; den += rows[i].oncesi; } }
      return { num: num, den: den, pct: den ? 100 * num / den : 0 };
    }
    var ren = 0, tot = 0;
    for (var j = 0; j < rows.length; j++) { if (rows[j].elig) tot++; if (rows[j].yeniledi) ren++; }
    return { num: ren, den: tot, pct: tot ? 100 * ren / tot : 0 };
  }
  function renColor(metric, pct) {
    if (metric === "tutar") return pct >= 100 ? "#16a34a" : pct >= 80 ? "#ca8a04" : "#dc2626";
    return pct >= 70 ? "#16a34a" : pct >= 50 ? "#ca8a04" : "#dc2626";
  }
  function renCard(cls, lbl, val, sub) {
    return '<div class="mc ' + cls + '"><div class="mc-label">' + lbl + '</div><div class="mc-val">' + val + '</div>' +
      (sub ? '<div style="font-size:11px;color:#a1a1aa;margin-top:2px">' + sub + '</div>' : '') + '</div>';
  }

  // Kontrolleri (kırılım kolonu, aylar, değer filtreleri) çiz.
  function renderRenControls() {
    var dimSel = document.getElementById("ren-dim");
    if (dimSel) {
      var cols = renCols();
      if (!S._renDim || cols.indexOf(S._renDim) < 0) S._renDim = cols.indexOf("Kategori") >= 0 ? "Kategori" : (cols[0] || "");
      dimSel.innerHTML = cols.map(function (c) { return '<option value="' + renEsc(c) + '"' + (S._renDim === c ? " selected" : "") + '>' + renEsc(c) + '</option>'; }).join("");
    }
    var mHost = document.getElementById("ren-months-filter");
    if (mHost) {
      var all = renMonthsAll(), sel = S._renMonths || [];
      mHost.innerHTML = '<div class="chip' + (sel.length ? "" : " on") + '" onclick="renClearMonths()">Tümü</div>' +
        all.map(function (mo) { return '<div class="chip' + (sel.indexOf(mo) >= 0 ? " on" : "") + '" onclick="renToggleMonth(\'' + mo + '\')">' + mo + '</div>'; }).join("");
    }
    var fHost = document.getElementById("ren-filters");
    if (fHost) {
      var cols2 = renCols();
      fHost.innerHTML = (S._renFilters || []).map(function (f, i) {
        var opts = '<option value="">— kolon —</option>' + cols2.map(function (c) { return '<option value="' + renEsc(c) + '"' + (f.col === c ? " selected" : "") + '>' + renEsc(c) + '</option>'; }).join("");
        var valSel = "";
        if (f.col) {
          valSel = '<select multiple size="4" onchange="renSetVals(' + i + ',this)" style="min-width:190px;max-width:320px;font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:3px">' +
            renDistinct(f.col).map(function (v) { return '<option value="' + renEsc(v) + '"' + (f.values.indexOf(v) >= 0 ? " selected" : "") + '>' + renEsc(v) + '</option>'; }).join("") + '</select>';
        }
        return '<div style="display:flex;gap:6px;align-items:flex-start">' +
          '<select onchange="renSetCol(' + i + ',this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px">' + opts + '</select>' +
          valSel + '<button onclick="renRemoveFilter(' + i + ')" style="font-size:11px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#71717a;padding:4px 8px">✕</button></div>';
      }).join("");
    }
  }

  function renderRenewalAnaliz() {
    var panel = document.getElementById("panel-analiz"); if (!panel) return;
    var rows = S._renewalRows || [];
    if (!rows.length) { panel.innerHTML = '<div class="empty-state"><div>📊</div><div class="et">Yenileme verisi yok</div><div class="es">Qlik\'ten yenile ile canlı çekilir</div></div>'; return; }
    if (!S._renMetric) S._renMetric = "tutar";
    if (!S._renFilters) S._renFilters = [];
    if (!S._renMonths) S._renMonths = [];
    if (panel.getAttribute("data-ren") !== "2") {
      panel.setAttribute("data-ren", "2");
      panel.innerHTML =
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="flbl">Görünüm</span>' +
            '<div class="chip" id="rm-tutar" onclick="setRenMetric(\'tutar\')">Tutar · 1\'e 1 Hedef</div>' +
            '<div class="chip" id="rm-adet" onclick="setRenMetric(\'adet\')">Adet · Yenileyen / Toplam</div></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="flbl">Kırılım</span>' +
            '<select id="ren-dim" onchange="renSetDim(this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px;max-width:260px"></select></div>' +
          '<div style="margin-bottom:10px"><div class="flbl" style="margin-bottom:4px">Aylar (çoklu)</div><div id="ren-months-filter" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>' +
          '<div class="flbl" style="margin-bottom:4px">Filtreler</div><div id="ren-filters" style="display:flex;flex-direction:column;gap:6px"></div>' +
          '<div style="margin-top:8px"><button onclick="addRenFilter()" style="font-size:12px;padding:5px 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+ Filtre ekle</button> <span id="ren-info" style="font-size:11px;color:#a1a1aa;margin-left:6px"></span></div>' +
        '</div>' +
        '<div class="mg" id="ren-cards"></div>' +
        '<div class="card"><div class="card-head"><span class="ct" id="ren-brk-title">Kırılım</span><span id="ren-brk-cnt" style="font-size:11px;color:#a1a1aa"></span></div><div id="ren-breakdown"></div></div>' +
        '<div class="card"><div class="card-head"><span class="ct">Detay</span><span id="ren-tcnt" style="font-size:11px;color:#a1a1aa"></span></div><div class="tw"><table><thead><tr><th>Firma</th><th id="ren-th-dim">Kırılım</th><th>Ay</th><th>Öncesi</th><th>Yenilenen</th><th>Durum</th></tr></thead><tbody id="ren-tbl"></tbody></table></div></div>';
    }
    document.getElementById("rm-tutar").classList.toggle("on", S._renMetric === "tutar");
    document.getElementById("rm-adet").classList.toggle("on", S._renMetric === "adet");
    renderRenControls();

    var metric = S._renMetric, isT = metric === "tutar";
    var data = renFiltered();
    var agg = renCalc(data, metric);

    // ── Başlık kartları ──
    var cardsHtml;
    if (isT) {
      var col = renColor("tutar", agg.pct);
      cardsHtml =
        renCard("green", "Yenilenen Tutar", renTL(agg.num)) +
        renCard("", "Yenileme Öncesi Tutar", renTL(agg.den)) +
        '<div class="mc"><div class="mc-label">1\'e 1 Oranı · hedef %100</div><div class="mc-val" style="color:' + col + '">%' + agg.pct.toFixed(1) + '</div><div style="font-size:11px;color:#a1a1aa;margin-top:2px">' + (agg.pct >= 100 ? "hedefin üstünde ✓" : "hedefin altında") + '</div></div>';
    } else {
      var colc = renColor("adet", agg.pct);
      cardsHtml =
        renCard("green", "Yenileyen", String(agg.num)) +
        renCard("", "Toplam · Yenileme mi? = Yenileme", String(agg.den)) +
        '<div class="mc"><div class="mc-label">Yenileme Oranı</div><div class="mc-val" style="color:' + colc + '">%' + agg.pct.toFixed(1) + '</div><div style="font-size:11px;color:#a1a1aa;margin-top:2px">' + agg.num + " / " + agg.den + '</div></div>';
    }
    document.getElementById("ren-cards").innerHTML = cardsHtml;
    document.getElementById("ren-info").textContent = data.length !== rows.length ? (data.length + " / " + rows.length + " satır") : (rows.length + " satır");

    // ── Kırılım (seçilen kolonun her değeri için metrik) ──
    var dim = S._renDim;
    document.getElementById("ren-brk-title").textContent = (dim || "Kırılım") + " kırılımı — " + (isT ? "1'e 1 oranı" : "yenileme oranı");
    document.getElementById("ren-th-dim").textContent = dim || "Kırılım";
    var groups = {};
    data.forEach(function (r) { var g = renRawVal(r, dim) || "—"; (groups[g] || (groups[g] = [])).push(r); });
    var gkeys = Object.keys(groups).map(function (g) { return { g: g, m: renCalc(groups[g], metric) }; })
      .filter(function (x) { return x.m.den > 0; })
      .sort(function (a, b) { return b.m.den - a.m.den; });
    document.getElementById("ren-brk-cnt").textContent = gkeys.length + " değer";
    var brkEl = document.getElementById("ren-breakdown");
    if (!gkeys.length) { brkEl.innerHTML = '<div style="color:#a1a1aa;font-size:12px;padding:8px">Kırılacak veri yok</div>'; }
    else {
      brkEl.innerHTML = gkeys.slice(0, 40).map(function (x) {
        var c = renColor(metric, x.m.pct);
        var sub = isT ? renTL(x.m.num) + " / " + renTL(x.m.den) : x.m.num + " / " + x.m.den;
        return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">' + renEsc(x.g) + '</span><span style="color:#71717a">' + sub + ' · <b style="color:' + c + '">%' + x.m.pct.toFixed(1) + '</b></span></div><div style="background:#f4f4f5;border-radius:5px;height:16px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, x.m.pct) + '%;background:' + c + ';border-radius:5px"></div></div></div>';
      }).join("") + (gkeys.length > 40 ? '<div style="color:#a1a1aa;font-size:11px;padding:4px 0">…+' + (gkeys.length - 40) + ' değer daha (filtreyle daralt)</div>' : "");
    }

    // ── Detay tablosu (yenileyen + Yenileme-eligible satırlar) ──
    var detail = data.filter(function (r) { return r.elig || r.yeniledi; });
    document.getElementById("ren-tcnt").textContent = detail.length + " satır";
    document.getElementById("ren-tbl").innerHTML = detail.slice(0, 300).map(function (r) {
      return "<tr><td style=\"font-size:12px\">" + renEsc(r.musteri_adi || r.firma_id) + "</td><td style=\"font-size:11px;color:#71717a\">" + renEsc(renRawVal(r, dim)) + "</td><td style=\"font-size:11px\">" + renEsc(r.ay) + "</td><td style=\"font-size:12px\">" + (r.oncesi ? renTL(r.oncesi) : "—") + "</td><td style=\"font-size:12px\">" + (r.sonrasi ? renTL(r.sonrasi) : "—") + "</td><td>" + (r.yeniledi ? '<span class="badge ok">Yenilendi</span>' : (r.decided ? '<span class="badge crit">Yenilemedi</span>' : '<span class="badge">Bekliyor</span>')) + "</td></tr>";
    }).join("") || '<tr><td colspan="6" style="text-align:center;color:#a1a1aa;padding:16px">Sonuç yok</td></tr>';
  }
  window.setRenMetric = function (m) { S._renMetric = m; renderRenewalAnaliz(); };
  window.renSetDim = function (c) { S._renDim = c; renderRenewalAnaliz(); };
  window.renToggleMonth = function (mo) { var s = S._renMonths || (S._renMonths = []); var i = s.indexOf(mo); if (i >= 0) s.splice(i, 1); else s.push(mo); renderRenewalAnaliz(); };
  window.renClearMonths = function () { S._renMonths = []; renderRenewalAnaliz(); };
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
      // Yenilendi=yenileyen, Yenilemedi=yenilemeyen, boş/Bağlantı=bekleyen.
      // Tutarlar canlı sayı gelir; ay "01.12.2025" veya "2026-09-01" olabilir (iki format).
      // raw: tüm kolonlar korunur → kırılım/filtre herhangi bir kolonu kullanabilir.
      // elig: "Yenileme mi?" == "Yenileme" (adet metriğinde Toplam paydası).
      if (Array.isArray(d.yenileme) && d.yenileme.length) {
        // "Yenileme mi?" kolon başlığını dinamik bul (boşluk/büyük-küçük harf toleransı).
        var eligKey = null;
        var keys0 = Object.keys(d.yenileme[0] || {});
        for (var ki = 0; ki < keys0.length; ki++) { if (/yenileme\s*mi/i.test(keys0[ki])) { eligKey = keys0[ki]; break; } }
        S._renEligKey = eligKey;
        S._renColsCache = null; // yeni veri → kolon listesini tazele
        S._renewalRows = d.yenileme.map(function (r) {
          var durum = String(r["Yenileme Durumu"] || "").trim();
          return {
            raw: r,
            ay: renMonth(r["Yenileme Ayı-Date"]) || renMonth(r["Yenileme Ayı"]),
            yeniledi: durum === "Yenilendi",
            decided: durum === "Yenilendi" || durum === "Yenilemedi",
            // Toplam paydası: "Yenileme mi?" == "Yenileme". Kolon yoksa yedek: karar verilmiş satır.
            elig: eligKey ? String(r[eligKey] || "").trim() === "Yenileme" : (durum === "Yenilendi" || durum === "Yenilemedi"),
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
