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
  // Provider ID normalizasyonu (join anahtarı): kenar boşluğu + sondaki ".0" temizle.
  function renNormId(v) { var s = String(v == null ? "" : v).trim(); return s.replace(/\.0+$/, ""); }
  // Flag Date hücresi (Excel seri no veya string) → "YYYY-MM" (ayın 15'i → o ay).
  function renFlagMonth(v) { if (typeof v === "number") return renMonth(toDateStr(v)); var s = String(v == null ? "" : v).trim(); return renMonth(s) || renMonth(toDateStr(s)); }
  // "YYYY-MM"'den n ay geriye: geriye dönük flag eşleme için (2026-03, 2 → 2026-01).
  function renMonthMinus(ym, n) {
    var p = String(ym == null ? "" : ym).split("-");
    if (p.length < 2) return "";
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (!y || !m) return "";
    var idx = y * 12 + (m - 1) - n, ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
    return ny + "-" + (nm < 10 ? "0" : "") + nm;
  }
  // Binary flag değeri → okunur etiket. 1 = Flag var (kötü), 0 = Flag yok (iyi); renk/metin olduğu gibi.
  function renFlagVal(v) { if (v === 1 || v === "1") return "Flag var"; if (v === 0 || v === "0") return "Flag yok"; return v == null ? "" : v; }

  // Çağrı "Arayan PY" (kısa ad) → firma "Sorumlu PY" (tam ad). Arama_Ham çekilirken çevrilir,
  // böylece PY coverage join'i doğrudan oturur. Yeni PY: bu tabloyu güncelle (eşleşmeyen ad korunur).
  var PY_NAME_MAP = {
    "Berkay": "Berkay Ozcan",
    "Eylül": "Eylul Sazak",
    "Kübra": "Kubra Celik",
    "Mine": "Mine Akgemik",
    "Nidanur": "Nidanur Başoğul",
    "Sinem": "Sinem Kilic",
    "Yiğit_Ziya": "Yigit YAGIZ",
  };

  // Özel Fiyat "Tüm Firmalar" filtreleri için performans flag'leri: provider_flag_current'tan
  // (en güncel snapshot) RÇİ ile firmaya eklenir. src = flag sekmesindeki kolon adı, k = firma
  // property'si (filtre/kolon anahtarı), lbl = görünen ad. Provider Health Flag renk/statü,
  // diğerleri binary (renFlagVal → "Flag var"/"Flag yok").
  var OZ_FLAG_COLS = [
    { src: "Provider Health Flag", k: "pf_health", lbl: "Provider Health Flag" },
    { src: "Campaign Flag", k: "pf_campaign", lbl: "Campaign Flag" },
    { src: "Gallery Flag", k: "pf_gallery", lbl: "Gallery Flag" },
    { src: "Last Seen Flag", k: "pf_lastseen", lbl: "Last Seen Flag" },
    { src: "Lead Count Flag", k: "pf_leadcount", lbl: "Lead Count Flag" },
    { src: "Response Rate Flag", k: "pf_resprate", lbl: "Response Rate Flag" },
    { src: "Response Time Flag", k: "pf_resptime", lbl: "Response Time Flag" },
    { src: "Review Flag", k: "pf_review", lbl: "Review Flag" },
    { src: "CR Flag", k: "pf_cr", lbl: "CR Flag" },
  ];

  // ── Yenileme (Genel Analiz) — 1'e 1 hedef + kırılım + esnek filtre ────────
  // İki metrik (görünüm biçimi):
  //   • "tutar" · 1'e 1 Hedef = Σ Yenilenen Tutar / Σ Yenileme Öncesi Tutar
  //     (yenileyen satırlarda); hedef %100 (yeşil ≥100, kırmızı <100).
  //   • "adet"  · Yenileyen / Toplam; Toplam = "Yenileme mi?" == "Yenileme" satır sayısı.
  // Kırılım: seçilen kolonun her değeri için metrik ayrı hesaplanır (group-by).
  // Ay (çoklu seçim) ve değer filtreleri önce popülasyonu daraltır.
  function renEsc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }
  var renTL = function (v) { return "₺" + Math.round(v || 0).toLocaleString("tr-TR"); };
  // Kırılım/filtre için İZİNLİ renewal kolonları (diğer ham kolonlar kasıtlı gizli).
  // Provider flag kolonları ("⚑ …") renCols() içinde dinamik eklenir.
  var REN_DIM_COLS = [
    "Yenileme Ayı", "Segment", "Özel Fiyat", "PY", "Ekip", "Kategori", "Kategori Adı", "Ürün Adı",
    "Şehir", "İlçe", "Müşteri Statüsü", "X Count", "PY Tahmin",
    // NOT: Provider-segment / yenileme-durumu / tahmin-tutarlılık-kodu kırılımları kasıtlı
    // ÇIKARILDI — anlamlı kırılım/filtre vermiyordu (kullanıcı isteği).
    // "Segment" + "Özel Fiyat" Sheet "Segmentation" tabından yenileme satırına eşlenir (aşağıda).
  ];
  // Segmentation segment kodu → görseldeki başlık isimleri. Numara öneki sıralamayı korur
  // (kırılım/filtre alfabetik sıralar). Eşleşmeyen / "-" segment → "Bilinmiyor".
  var SEG_NAME = {
    "1. Segment": "1 · Büyük Kıdemliler",
    "2. Segment": "2 · Küçük Kıdemliler",
    "3. Segment": "3 · Kıdemsiz Ana Mekanlar",
    "4. Segment": "4 · Kıdemsiz Yan Mekanlar",
    "5. Segment": "5 · Ötekiler",
    "6. Segment": "6 · Kıdemli Mekan Dışı",
    "7. Segment": "7 · Kıdemsiz Mekan Dışı",
  };
  // Kırılım/filtre için İZİNLİ provider flag kolonları — Provider_Flag_Old GERÇEK
  // başlıklarıyla BİREBİR (normalize: boşluk/büyük-küçük). Tab'da ayrıca Provider,
  // Customer ID, Account Manager, Total Flag, Discount/Media Count, Profile Score Raw…
  // gibi 20+ kolon var; bunlar KASITLI dışarıda. "Provider Health Flag" = renk statüsü
  // (Welcome/Yeşil/Sarı/Turuncu/Kırmızı); diğer 8'i binary (1/0).
  var REN_FLAG_WHITELIST = [
    "Provider Health Flag", "Campaign Flag", "Gallery Flag", "Last Seen Flag",
    "Lead Count Flag", "Response Rate Flag", "Response Time Flag", "Review Flag", "CR Flag",
  ];
  function renNormHdr(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLocaleLowerCase("tr"); }
  // Bir kolonun değeri. "Yenileme Ayı" karışık formatlı → normalize ay (r.ay) döndürülür.
  function renRawVal(r, col) {
    if (col === "Yenileme Ayı") return r && r.ay ? r.ay : "";
    var raw = r && r.raw; var v = raw && col ? raw[col] : undefined; return v == null ? "" : String(v).trim();
  }

  // Kırılım + filtre kolon listesi: izinli renewal kolonları + provider flag kolonları
  // ("⚑ …", eşleşme olmasa bile listede durur). Verilen sırayı korur (alfabetik sıralamaz).
  function renCols() {
    var cols = REN_DIM_COLS.slice();
    (S._renFlagCols || []).forEach(function (k) { if (k && cols.indexOf(k) < 0) cols.push(k); });
    return cols;
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
      // Öncesi (payda): TÜM firmalar (yenilesin/yenilemesin). Yenilenen (pay): yalnız Yenilendi.
      for (var i = 0; i < rows.length; i++) { den += rows[i].oncesi; if (rows[i].yeniledi) num += rows[i].sonrasi; }
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
    var mSel = document.getElementById("ren-months");
    if (mSel) {
      var all = renMonthsAll(), sel = S._renMonths || [];
      mSel.innerHTML = all.map(function (mo) { return '<option value="' + mo + '"' + (sel.indexOf(mo) >= 0 ? " selected" : "") + '>' + mo + '</option>'; }).join("");
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
    if (panel.getAttribute("data-ren") !== "3") {
      panel.setAttribute("data-ren", "3");
      panel.innerHTML =
        '<div class="card" style="margin-bottom:14px">' +
          '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px">' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="flbl">Görünüm</span>' +
              '<div class="chip" id="rm-tutar" onclick="setRenMetric(\'tutar\')">Tutar · 1\'e 1 Hedef</div>' +
              '<div class="chip" id="rm-adet" onclick="setRenMetric(\'adet\')">Adet · Yenileyen / Toplam</div></div>' +
            '<div style="display:flex;gap:8px;align-items:center"><span class="flbl">Kırılım</span>' +
              '<select id="ren-dim" onchange="renSetDim(this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px;max-width:220px"></select></div>' +
            '<div style="display:flex;gap:8px;align-items:flex-start"><span class="flbl" style="margin-top:4px">Aylar</span>' +
              '<select id="ren-months" multiple size="4" onchange="renSetMonths(this)" title="Boş bırak = tüm aylar (Ctrl/Cmd ile çoklu seç)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:3px;min-width:120px"></select></div>' +
          '</div>' +
          '<div class="flbl" style="margin-bottom:4px">Filtreler</div><div id="ren-filters" style="display:flex;flex-direction:column;gap:6px"></div>' +
          '<div style="margin-top:8px"><button onclick="addRenFilter()" style="font-size:12px;padding:5px 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+ Filtre ekle</button> <span id="ren-info" style="font-size:11px;color:#a1a1aa;margin-left:6px"></span></div>' +
        '</div>' +
        '<div class="mg" id="ren-cards"></div>' +
        '<div class="card" id="ren-flagcov-card" style="margin-bottom:14px"><div class="card-head"><span class="ct">🚩 Flag kapsama · geriye dönük eşleme</span><span id="ren-flagcov-sum" style="font-size:11px;color:#a1a1aa"></span></div><div id="ren-flagcov-body"></div></div>' +
        '<div class="card"><div class="card-head"><span class="ct" id="ren-brk-title">Kırılım</span><span id="ren-brk-cnt" style="font-size:11px;color:#a1a1aa"></span></div><div id="ren-breakdown"></div></div>';
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

    // ── Flag kapsama (geriye dönük eşleme) — filtreye duyarlı (seçili ay/filtre kümesi) ──
    (function () {
      var covBody = document.getElementById("ren-flagcov-body"); if (!covBody) return;
      var fcov = {}, fcovMax = 0, fcovNF = 0, fcovTot = 0;
      data.forEach(function (d2) {
        var b = (d2 && d2.raw) ? d2.raw._flagBack : -1;
        fcovTot++;
        if (b == null || b < 0) fcovNF++;
        else { fcov[b] = (fcov[b] || 0) + 1; if (b > fcovMax) fcovMax = b; }
      });
      var found = fcovTot - fcovNF;
      var covChip = function (lbl, cnt, color) {
        var pct = fcovTot ? Math.round(cnt / fcovTot * 100) : 0;
        return '<div style="background:#fafafa;border:1px solid #f0f0f0;border-radius:8px;padding:8px 12px;min-width:104px;text-align:center">' +
          '<div style="font-size:11px;color:#71717a;white-space:nowrap">' + lbl + '</div>' +
          '<div style="font-size:19px;font-weight:700;color:' + color + '">' + cnt + '</div>' +
          '<div style="font-size:10px;color:#a1a1aa">%' + pct + '</div></div>';
      };
      var html = '<div style="display:flex;gap:10px;flex-wrap:wrap">';
      for (var oi = 0; oi <= fcovMax; oi++) {
        var cnt = fcov[oi] || 0;
        if (!cnt && oi !== 0) continue; // 0. offset (yenileme ayı) hep gösterilir; boş ara aylar atlanır
        var lbl = oi === 0 ? "Yenileme ayı" : oi + " ay önce";
        var color = oi === 0 ? "#16a34a" : oi <= 2 ? "#ca8a04" : "#ea580c";
        html += covChip(lbl, cnt, color);
      }
      html += covChip("Bulunamadı", fcovNF, "#dc2626");
      html += '</div>';
      covBody.innerHTML = html;
      var sumEl = document.getElementById("ren-flagcov-sum");
      if (sumEl) sumEl.textContent = found + " / " + fcovTot + " kayıtta flag eşleşti · %" + (fcovTot ? Math.round(found / fcovTot * 100) : 0);
    })();

    // ── Kırılım (seçilen kolonun her değeri için metrik) ──
    var dim = S._renDim;
    document.getElementById("ren-brk-title").textContent = (dim || "Kırılım") + " kırılımı — " + (isT ? "1'e 1 oranı" : "yenileme oranı");
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
  }
  window.setRenMetric = function (m) { S._renMetric = m; renderRenewalAnaliz(); };
  window.renSetDim = function (c) { S._renDim = c; renderRenewalAnaliz(); };
  window.renSetMonths = function (sel) { var v = []; for (var o = 0; o < sel.options.length; o++) if (sel.options[o].selected) v.push(sel.options[o].value); S._renMonths = v; renderRenewalAnaliz(); };
  window.addRenFilter = function () { (S._renFilters = S._renFilters || []).push({ col: "", values: [] }); renderRenewalAnaliz(); };
  window.renRemoveFilter = function (i) { S._renFilters.splice(i, 1); renderRenewalAnaliz(); };
  window.renSetCol = function (i, col) { S._renFilters[i].col = col; S._renFilters[i].values = []; renderRenewalAnaliz(); };
  window.renSetVals = function (i, sel) { var v = []; for (var o = 0; o < sel.options.length; o++) if (sel.options[o].selected) v.push(sel.options[o].value); S._renFilters[i].values = v; renderRenewalAnaliz(); };

  // NOT: "Segment bazlı lead dağılımı" (renderLeadDist) artık VENDOR HTML'de
  // (sabit segment renkleri + A+/A/B/C/D daima görünür orada düzeltildi). Pipeline
  // override'ı kaldırıldı; renderPF içindeki renderLeadDist() vendor sürümünü çağırır.

  // ══ Çağrı Analizi — executive top kart + coverage rework + PY detayı dönem seçici ══
  // Vendor renderCA/calcPYCoverage'ı sarmalar (her iki dashboard'a uygulanır).
  //  • Executive Employee oranı (üst kart): üst filtre döneminde UNIQUE dokunulan
  //    müşteriler içinde Kullanıcı Tipi 'Executive' olanların oranı (Arama_Ham).
  //  • Coverage (PY detayı): PY portföyü (S.firmalar, Sorumlu PY) × KENDİ döneminde
  //    (Gün/Hafta/Ay, default bu ay) touch alan firmalar (herhangi biri, UNIQUE).
  //    Value = Satış Fiyatı / 12; oran = touch value / toplam value, count sayısal.
  if (typeof window.renderCA === "function" && !window.__caPatched) {
    window.__caPatched = true;

    function covPeriodKey(tarih) {
      if (!tarih || tarih === "-") return "";
      var g = S._covGran || "ay";
      if (g === "gun") return String(tarih).slice(0, 10);
      if (g === "hafta" && typeof getISOWeek === "function") return getISOWeek(new Date(tarih));
      return String(tarih).slice(0, 7);
    }
    function covCurrentPeriod() {
      var now = new Date(), g = S._covGran || "ay";
      var y = now.getFullYear(), mo = String(now.getMonth() + 1);
      if (mo.length < 2) mo = "0" + mo;
      if (g === "gun") { var dd = String(now.getDate()); if (dd.length < 2) dd = "0" + dd; return y + "-" + mo + "-" + dd; }
      if (g === "hafta" && typeof getISOWeek === "function") return getISOWeek(now);
      return y + "-" + mo;
    }
    function covPeriodsMap() {
      var pm = {}; (S.cagrilar || []).forEach(function (c) { if (c.durum !== "Touch") return; var k = covPeriodKey(c.tarih); if (k) pm[k] = (pm[k] || 0) + 1; }); return pm;
    }
    function ensureCovDefaults() {
      if (!S._covDays) S._covDays = 30; // son 30 gün (varsayılan)
    }
    function covTouchedSet() {
      var key = (S._covGran || "ay") + "|" + (S._covPeriod || "");
      if (S._covTouchedKey === key && S._covTouched) return S._covTouched;
      var set = {};
      (S.cagrilar || []).forEach(function (c) {
        if (c.durum !== "Touch") return;
        if (S._covPeriod && covPeriodKey(c.tarih) !== S._covPeriod) return;
        var cid = String(c.firma_id == null ? "" : c.firma_id).trim();
        if (cid) set[cid] = 1;
      });
      S._covTouched = set; S._covTouchedKey = key; return set;
    }

    // Çağrı PY (Arayan PY = kısa ad, ör. "Kübra") ↔ firma Sorumlu PY (tam ad "Kubra Celik")
    // eşleştir: TR karakter kıvrımlı + kelime sınırında ön-ek. (İki alan formatı farklı, kesişim 0.)
    function pyKey(s) { s = String(s == null ? "" : s).trim().toLocaleLowerCase("tr").replace(/_/g, " "); return s.replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c"); }
    function pyMatch(firmaPY, cagriPY) { var fk = pyKey(firmaPY), ck = pyKey(cagriPY); if (!fk || !ck) return false; return fk === ck || fk.indexOf(ck + " ") === 0; }

    // Coverage: MÜŞTERİ bazlı count/value + executive. Native pyDetayMetrics'e (HTML) delege eder
    // (provider≠müşteri: müşteri tek PY, çok provider'lı olabilir → count müşteri, value provider).
    window.calcPYCoverage = function (pyName) {
      if (typeof pyDetayMetrics === "function") return pyDetayMetrics(pyName);
      return { valueOran: null, countOran: null, aranan: 0, toplam: 0, aranValue: 0, toplamValue: 0, execCust: 0, uniqueTouched: 0, execOran: null };
    };

    // Executive top kart: üst filtre döneminde UNIQUE dokunulan müşteri bazında executive oranı.
    function patchExecCard() {
      var el = document.getElementById("ca-yip-oran"); if (!el) return;
      var data = (typeof getCagriFiltered === "function") ? getCagriFiltered() : (S.cagrilar || []);
      var byCust = {};
      data.forEach(function (c) {
        if (c.durum !== "Touch") return;
        var cid = String(c.musteri_id || c.firma_id || c.customer_name || "").trim(); if (!cid) return;
        var o = byCust[cid] || (byCust[cid] = { hasType: false, exec: false });
        var t = String(c.kullanici_tipi || "").trim();
        if (t) { o.hasType = true; if (/executive/i.test(t)) o.exec = true; }
      });
      var total = 0, exec = 0, noType = 0;
      for (var k in byCust) { total++; if (byCust[k].exec) exec++; if (!byCust[k].hasType) noType++; }
      var oran = total ? Math.round(100 * exec / total) : null;
      el.textContent = oran !== null ? "%" + oran : "—";
      var sub = document.getElementById("ca-yip-sub");
      if (sub) sub.textContent = total ? (exec + " / " + total + " unique müşteri" + (noType ? " · " + noType + " tipsiz" : "")) : "";
    }

    // PY detayı içine kendi dönem seçicisi (Gün/Hafta/Ay + dönem, default bu ay).
    function injectCovBar() {
      var blocks = document.getElementById("py-cagri-blocks"); if (!blocks || !blocks.parentNode) return;
      var bar = document.getElementById("cov-period-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "cov-period-bar";
        bar.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid #f4f4f5;background:#fafafa";
        bar.innerHTML =
          '<span style="font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px">Coverage dönemi</span>' +
          '<div class="chip" id="cov-d-30" onclick="setCovDays(30)" style="font-size:11px">Son 30 gün</div>' +
          '<div class="chip" id="cov-d-45" onclick="setCovDays(45)" style="font-size:11px">Son 45 gün</div>' +
          '<div class="chip" id="cov-d-60" onclick="setCovDays(60)" style="font-size:11px">Son 60 gün</div>' +
          '<div class="chip" id="cov-d-90" onclick="setCovDays(90)" style="font-size:11px">Son 90 gün</div>' +
          '<span id="cov-period-info" style="font-size:11px;color:#a1a1aa"></span>';
        blocks.parentNode.insertBefore(bar, blocks);
      }
      var days = S._covDays || 30;
      [30, 45, 60, 90].forEach(function (dd) { var c = document.getElementById("cov-d-" + dd); if (c) c.classList.toggle("on", days === dd); });
      var info = document.getElementById("cov-period-info");
      if (info) {
        var touchedN = (typeof covTouchedCustomers === "function") ? Object.keys(covTouchedCustomers()).length : 0;
        var mx = (typeof covMaxCallMs === "function") ? covMaxCallMs() : 0;
        var toStr = mx ? new Date(mx).toISOString().slice(0, 10) : "-";
        info.textContent = "son " + days + " gün (…" + toStr + " arası) · " + touchedN + " müşteriye touch";
      }
    }

    window.setCovDays = function (d) { S._covDays = d; S._ctc = null; renderCA(); };

    // Per-PY Executive: vendor pm[py].musteri/yip_musteri, Arama_Ham'da olmayan
    // musteri_sayisi/yip_musteri_sayisi'ni kullandığından 0 kalıyor → yipEl "—".
    // buildCagriMaps'i sarmalayıp bu iki alanı Kullanıcı Tipi + UNIQUE dokunulan müşteriden doldur.
    var _origBuildCagriMaps = window.buildCagriMaps;
    if (typeof _origBuildCagriMaps === "function") {
      window.buildCagriMaps = function () {
        var res = _origBuildCagriMaps.apply(this, arguments);
        var data = (typeof getCagriFiltered === "function") ? getCagriFiltered() : (S.cagrilar || []);
        var perPy = {};
        data.forEach(function (c) {
          if (c.durum !== "Touch") return;
          var py = c.py_adi || "Bilinmiyor";
          var cid = String(c.musteri_id || c.firma_id || c.customer_name || "").trim(); if (!cid) return;
          var p = perPy[py] || (perPy[py] = {});
          var o = p[cid] || (p[cid] = { exec: false });
          if (/executive/i.test(String(c.kullanici_tipi || ""))) o.exec = true;
        });
        if (res && res.pm) {
          Object.keys(perPy).forEach(function (py) {
            if (!res.pm[py]) return;
            var custs = Object.keys(perPy[py]);
            var ex = 0; custs.forEach(function (k) { if (perPy[py][k].exec) ex++; });
            res.pm[py].musteri = custs.length;
            res.pm[py].yip_musteri = ex;
          });
        }
        return res;
      };
    }

    var _origRenderCA = window.renderCA;
    window.renderCA = function () {
      ensureCovDefaults();
      var r = _origRenderCA.apply(this, arguments);
      try { injectCovBar(); } catch (e) {}
      try { patchExecCard(); } catch (e) {}
      return r;
    };
  }

  // ══ Onboarding — Çağrı Değerlendirmesi: JOIN düzeltme + müşteri tekilleştirme + unique/çoklu ══
  // (1) JOIN: çağrı MÜŞTERİ (customer) seviyesinde → onboarding "Customer Id" ile eşle
  //     (Provider Id DEĞİL — canlı veri: provider-id %2, customer-id %100 eşleşiyor).
  // (2) Aynı müşterinin birden çok onboarding provider'ı MÜŞTERİ bazında tekilleştirilir
  //     (en erken Ürün Başlangıcı; kaç ürün olduğu rozette gösterilir).
  // (3) Yalnız firmanın kendi başlangıcı SONRASINDAKİ çağrılar sayılır (mevcut mantık).
  // (4) Trend/sayaç: "unique" (benzersiz firma) / "çoklu" (tüm çağrı) toggle, default unique.
  if (typeof window.renderObCagriDegerlendirme === "function" && !window.__obCagriPatched) {
    window.__obCagriPatched = true;

    // Dönem başına BENZERSİZ müşteri sayısı (unique mod). Çoklu için vendor cagriGroupByPeriod kullanılır.
    function obUniqueByPeriod(calls, gran, range) {
      var from = range && range.from ? range.from : null;
      var to = range && range.to ? range.to : null;
      var m = {};
      calls.forEach(function (c) {
        if (!c.tarih || c.tarih === "-") return;
        var g = String(c.tarih).slice(0, 10);
        if (from && g < from) return;
        if (to && g > to) return;
        var k = (typeof cagriTrendPeriodKey === "function") ? cagriTrendPeriodKey(c.tarih, gran) : g.slice(0, 7);
        if (!k) return;
        var cid = renNormId(c.firma_id); if (!cid) return;
        if (!m[k]) m[k] = { touch: {}, attempt: {} };
        if (c.durum === "Touch") m[k].touch[cid] = 1;
        else if (c.durum === "Attempt") m[k].attempt[cid] = 1;
      });
      var keys = Object.keys(m).sort();
      return { keys: keys, touch: keys.map(function (k) { return Object.keys(m[k].touch).length; }), attempt: keys.map(function (k) { return Object.keys(m[k].attempt).length; }) };
    }

    function injectObCagriModeToggle() {
      var chart = document.getElementById("ob-cagri-trend-chart");
      if (!chart || !chart.parentNode) return;
      var bar = document.getElementById("ob-cagri-mode");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "ob-cagri-mode";
        bar.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px";
        bar.innerHTML =
          '<span style="font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px">Sayım</span>' +
          '<div class="chip" id="obm-unique" onclick="setObCagriMode(\'unique\')" style="font-size:11px">Unique (firma)</div>' +
          '<div class="chip" id="obm-coklu" onclick="setObCagriMode(\'coklu\')" style="font-size:11px">Çoklu (çağrı)</div>' +
          '<span style="font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-left:12px">Yön</span>' +
          '<div class="chip" id="oby-hepsi" onclick="setObYon(\'hepsi\')" style="font-size:11px">Hepsi</div>' +
          '<div class="chip" id="oby-in" onclick="setObYon(\'in\')" style="font-size:11px">Gelen</div>' +
          '<div class="chip" id="oby-out" onclick="setObYon(\'out\')" style="font-size:11px">Giden</div>';
        chart.parentNode.insertBefore(bar, chart);
      }
      var u = document.getElementById("obm-unique"), co = document.getElementById("obm-coklu");
      if (u) u.classList.toggle("on", (S._obCagriMode || "unique") === "unique");
      if (co) co.classList.toggle("on", (S._obCagriMode || "unique") === "coklu");
      ["hepsi", "in", "out"].forEach(function (y) { var el = document.getElementById("oby-" + y); if (el) el.classList.toggle("on", (S._obYon || "hepsi") === y); });
    }
    window.setObCagriMode = function (m) { S._obCagriMode = m; renderObCagriDegerlendirme(); };
    window.setObYon = function (y) { S._obYon = y; renderObCagriDegerlendirme(); };

    window.renderObCagriDegerlendirme = function () {
      var chartEl = document.getElementById("ob-cagri-chart");
      var tblEl = document.getElementById("ob-cagri-tbl");
      var cntEl = document.getElementById("ob-cagri-cnt");
      var trendChartEl = document.getElementById("ob-cagri-trend-chart");
      var trendInfoEl = document.getElementById("ob-cagri-trend-info");
      if (!chartEl || !tblEl) return;
      if (!S._obCagriMode) S._obCagriMode = "unique";
      injectObCagriModeToggle();

      // Aktif onboarding (mezun değil) → MÜŞTERİ (Customer Id) bazında tekilleştir.
      // GEÇERSİZ veri elenir: müşteri id sayısal değilse (boş/"-"/0), başlangıç yoksa/1900 ise.
      var aktif = (S.onboarding || []).filter(function (f) { return f.mezun_mu !== "Evet"; });
      var okStart = function (s) { s = String(s == null ? "" : s).slice(0, 10); return s >= "2000-01-01" ? s : ""; };
      var byCust = {};
      aktif.forEach(function (f) {
        var cid = renNormId(f.musteri_id); if (!/^\d+$/.test(cid)) return;
        var start = okStart(f.baslangic);
        var rec = byCust[cid];
        if (!rec) byCust[cid] = { cid: cid, start: start, f: f, providerCount: 1 };
        else { rec.providerCount++; if (start && (!rec.start || start < rec.start)) rec.start = start; }
      });
      // Yalnız GEÇERLİ başlangıcı olan müşteriler (başlangıç-sonrası mantığı için şart).
      var custList = Object.keys(byCust).map(function (k) { return byCust[k]; }).filter(function (r) { return r.start; });
      // Grafik ekseni EN ESKİ onboarding başlangıcından başlasın (geçersiz tarihler hariç).
      var minStart = custList.reduce(function (m, r) { return (!m || r.start < m) ? r.start : m; }, "");

      if (!(S.cagrilar && S.cagrilar.length)) {
        if (trendChartEl) trendChartEl.innerHTML = '<div class="empty-state" style="padding:20px 0"><div>📞</div><div class="et">Çağrı verisi bekleniyor</div></div>';
        if (trendInfoEl) trendInfoEl.textContent = "";
        if (typeof renderCagriRangeInputs === "function") renderCagriRangeInputs("ob");
        chartEl.innerHTML = "";
        tblEl.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a1a1aa;padding:14px">Çağrı verisi bekleniyor</td></tr>';
        if (cntEl) cntEl.textContent = "";
        return;
      }

      // Onboarding müşterilerine ait çağrılar (Customer Id join) + kendi başlangıcı SONRASI.
      var custStart = {}, custSet = {};
      custList.forEach(function (r) { custStart[r.cid] = r.start; custSet[r.cid] = 1; });
      var obCalls = S.cagrilar.filter(function (c) {
        var cid = renNormId(c.firma_id);
        if (!custSet[cid]) return false;
        var st = custStart[cid];
        if (st && c.tarih && c.tarih < st) return false;
        if ((S._obYon || "hepsi") !== "hepsi" && typeof callYonMatch === "function" && !callYonMatch(c, S._obYon)) return false;
        return true;
      });

      // Trend — unique / çoklu
      if (trendChartEl) {
        var gran = S._obCagriGran || "gun";
        var range = (typeof resolveCagriRange === "function") ? resolveCagriRange("ob", gran) : { from: "", to: "" };
        // Kullanıcı aralık seçmediyse alt sınır = en eski onboarding başlangıcı.
        if (!range.from && minStart) range.from = minStart;
        var grouped = (S._obCagriMode === "coklu" && typeof cagriGroupByPeriod === "function")
          ? cagriGroupByPeriod(obCalls, gran, range) : obUniqueByPeriod(obCalls, gran, range);
        // Eksen en eski başlangıç DÖNEMİNDEN başlasın (o dönemde çağrı yoksa 0 ekle).
        if (minStart && typeof cagriTrendPeriodKey === "function") {
          var mk = cagriTrendPeriodKey(minStart, gran);
          if (mk && (!grouped.keys.length || grouped.keys[0] > mk)) { grouped.keys.unshift(mk); grouped.touch.unshift(0); grouped.attempt.unshift(0); }
        }
        if (typeof renderCagriRangeInputs === "function") renderCagriRangeInputs("ob");
        if (typeof drawCagriTrendChart === "function") drawCagriTrendChart("ob-cagri-trend-chart", grouped.keys, grouped.touch, grouped.attempt);
        if (trendInfoEl) {
          var totalT = grouped.touch.reduce(function (a, b) { return a + b; }, 0);
          var totalA = grouped.attempt.reduce(function (a, b) { return a + b; }, 0);
          var birim = gran === "ay" ? "ay" : gran === "hafta" ? "hafta" : "gün";
          var unit = S._obCagriMode === "coklu" ? "çağrı" : "firma";
          trendInfoEl.textContent = grouped.keys.length ? (grouped.keys.length + " " + birim + " · " + totalT + " touch · " + totalA + " attempt (" + unit + ")") : "";
        }
      }

      // Aranmayan MÜŞTERİLER — kendi başlangıcı sonrası hiç Touch almamış.
      var touchedCust = {}, attemptByCust = {};
      obCalls.forEach(function (c) {
        var k = renNormId(c.firma_id);
        if (c.durum === "Touch") touchedCust[k] = 1;
        else if (c.durum === "Attempt") attemptByCust[k] = (attemptByCust[k] || 0) + 1;
      });
      var notTouched = custList.filter(function (r) { return !touchedCust[r.cid]; }).map(function (r) {
        return { r: r, gun: obGun({ baslangic: r.start }), attemptCount: attemptByCust[r.cid] || 0 };
      }).sort(function (a, b) { return b.gun - a.gun; });

      if (cntEl) cntEl.textContent = notTouched.length + " firma";
      if (!notTouched.length) {
        chartEl.innerHTML = '';
        tblEl.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#a1a1aa;padding:14px">Aranmayan firma yok ✅</td></tr>';
        return;
      }

      var prov = function (r) { return r.providerCount > 1 ? ' <span style="font-size:9px;color:#a1a1aa">(' + r.providerCount + " ürün)</span>" : ""; };
      // Üstteki barlar kaldırıldı — yalnızca tablo gösteriliyor
      chartEl.innerHTML = '';

      tblEl.innerHTML = notTouched.map(function (x) {
        var f = x.r.f;
        return "<tr>" +
          '<td style="font-weight:500;font-size:12px">' + renEsc(f.ob_adi || f.musteri_adi || "—") + prov(x.r) + "</td>" +
          '<td style="font-size:11px">' + renEsc(f.py_adi || "—") + "</td>" +
          '<td style="font-size:11px;color:#71717a">' + renEsc(f.kategori_adi || "—") + "</td>" +
          '<td style="font-size:11px;color:#71717a">' + renEsc(f.sehir || "—") + "</td>" +
          '<td style="font-size:11px">' + (x.r.start ? String(x.r.start).slice(0, 10) : "—") + "</td>" +
          '<td><span class="days hot">' + x.gun + "g</span></td>" +
          '<td style="font-size:11px;text-align:center">' + (x.attemptCount || 0) + "</td>" +
          '<td><span class="badge crit">&#128245; Hi&#231; konu&#351;ulmad&#305;</span></td>' +
          '<td style="font-size:12px;color:#185FA5">' + (typeof aylikValFmt === "function" ? aylikValFmt(typeof firmaValByCid === "function" ? firmaValByCid(f.musteri_id) : 0) : "&#8212;") + "</td></tr>";
      }).join("");
    };
  }

  // ══ Performans — FLAG/PY filtresini tüm ekrana yansıt + yenileme kartını taşı + custom pivot ══
  if (typeof window.renderPF === "function" && !window.__pfPatched) {
    window.__pfPatched = true;

    // ── (1) FLAG/PY filtresi TÜM alt-kartlara uygulansın (eski fFlag yalnız tabloyu yeniliyordu).
    // Alt render'lar S.firmalar'ı okuduğundan: geçici olarak filtrelenmiş listeye çevir, çiz, geri koy.
    window.renderPF = function () {
      var full = S.firmalar;
      if (!full || !full.length) return;
      try { if (typeof renderPYChips === "function") renderPYChips(); } catch (e) {} // PY çipleri tam listeden
      // PY özeti TAM flag dağılımını gösterir (flag % anlamlı olsun diye flag filtresinden bağımsız;
      // PY seçimini kendi içinde yapar). Filtre yalnız içerik kartlarına uygulanır.
      try { if (typeof renderPYCards === "function") renderPYCards(); } catch (e) {}
      var filtered = full.filter(function (x) {
        if (S.fFlag && S.fFlag !== "tümü" && x.flag_rengi !== S.fFlag) return false;
        if (S.fPY && S.fPY !== "tümü" && x.py_adi !== S.fPY) return false;
        return true;
      });
      // Üst kartlar FLAG/PY filtresine göre: toplam portföy (adet) + toplam aylık value.
      var topEl = document.getElementById("pf-top"); if (topEl) topEl.textContent = filtered.length;
      var topSub = document.getElementById("pf-top-sub"); if (topSub) topSub.textContent = (filtered.length !== full.length ? "/ " + full.length + " toplam" : "");
      var yearly = filtered.reduce(function (s, x) { return s + renNum(x.satis_fiyati); }, 0);
      var vEl = document.getElementById("pf-top-value"); if (vEl) vEl.textContent = renTL(Math.round(yearly / 12));
      var vSub = document.getElementById("pf-top-value-sub"); if (vSub) vSub.textContent = renTL(Math.round(yearly)) + " / yıl";
      S.firmalar = filtered;
      try {
        if (typeof renderFirmaTbl === "function") renderFirmaTbl();
        if (typeof renderKatDist === "function") renderKatDist();
        if (typeof renderLeadDist === "function") renderLeadDist();
        if (typeof renderSehirValue === "function") renderSehirValue();
        if (typeof renderFlagValue === "function") renderFlagValue();
      } finally { S.firmalar = full; }
      renderPerfPivot();
    };
    // FLAG ve PY chip'leri aynı .filter-row'da → yalnız FLAG chip'lerini (onclick*=fFlag) deselect et.
    window.fFlag = function (el, v) { var p = document.getElementById("panel-performans"); if (p) p.querySelectorAll('.filter-row .chip[onclick*="fFlag"]').forEach(function (c) { c.classList.remove("on"); }); el.classList.add("on"); S.fFlag = v; renderPF(); };
    window.fPY = function (el, v) { document.querySelectorAll("#py-chips .chip,#py-all-chip").forEach(function (c) { c.classList.remove("on"); }); el.classList.add("on"); S.fPY = v; renderPF(); };

    // ── (2) "Paket yenileme — aylık dağılım" kartını Yenileme Öncesi paneline TAŞI ──
    function moveYenilemeCard() {
      if (window.__ynCardMoved) return;
      var dist = document.getElementById("pf-yenileme-dist");
      var yn = document.getElementById("panel-yenileme");
      if (!dist || !yn) return;
      var card = dist.closest ? dist.closest(".card") : null;
      if (card && card.parentNode !== yn) { yn.appendChild(card); window.__ynCardMoved = true; }
    }
    var _origRenderYN = window.renderYN;
    window.renderYN = function () {
      moveYenilemeCard();
      var r = _origRenderYN ? _origRenderYN.apply(this, arguments) : undefined;
      try { if (typeof renderYenilemeMonthDist === "function") renderYenilemeMonthDist(); } catch (e) {}
      return r;
    };

    // ── (3) Custom Pivot (tek kırılım + firma/value metrik + filtreler) — panel-performans altına ──
    var PERF_DIMS = [
      { k: "kategori_adi", lbl: "Kategori" }, { k: "kategori_grubu", lbl: "Kategori Grubu" },
      { k: "sehir", lbl: "Şehir" }, { k: "ilce", lbl: "İlçe" }, { k: "py_adi", lbl: "PY" },
      { k: "musteri_statusu", lbl: "Müşteri Statüsü" }, { k: "urun_adi", lbl: "Ürün" },
      { k: "flag_rengi", lbl: "Flag" }, { k: "provider_segment", lbl: "Segment" },
      { k: "aktif_ozel_fiyat", lbl: "Aktif Özel Fiyat" },
      { k: "odeme_flagi", lbl: "Ödeme Flagi" }, { k: "geri_donus_flagi", lbl: "Geri Dönüş Flagi" },
    ];
    function perfBase() {
      // Custom Pivot üst FLAG/PY filtresinden BAĞIMSIZ (kullanıcı isteği) — yalnız kendi filtreleri.
      var fs = S._perfFilters || [];
      return (S.firmalar || []).filter(function (x) {
        for (var i = 0; i < fs.length; i++) { var f = fs[i]; if (f.col && f.values && f.values.length && f.values.indexOf(String(x[f.col] == null ? "" : x[f.col]).trim()) < 0) return false; }
        return true;
      });
    }
    function perfDistinct(col) { var set = {}; (S.firmalar || []).forEach(function (x) { var v = String(x[col] == null ? "" : x[col]).trim(); if (v) set[v] = 1; }); return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "tr"); }); }
    function injectPerfPivot() {
      var panel = document.getElementById("panel-performans"); if (!panel) return null;
      var card = document.getElementById("perf-pivot-card");
      if (!card) {
        card = document.createElement("div");
        card.className = "card"; card.id = "perf-pivot-card";
        card.innerHTML =
          '<div class="card-head"><span class="ct">Custom Pivot — Performans kırılımı</span><span id="perf-pivot-info" style="font-size:11px;color:#a1a1aa"></span></div>' +
          '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
            '<div style="display:flex;gap:8px;align-items:center"><span class="flbl">Kırılım</span><select id="perf-dim" onchange="perfSetDim(this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px"></select></div>' +
            '<div style="display:flex;gap:8px;align-items:center"><span class="flbl">Görüntüle</span>' +
              '<div class="chip" id="perf-m-value" onclick="perfSetMetric(\'value\')" style="font-size:11px">Value (₺)</div>' +
              '<div class="chip" id="perf-m-teklif" onclick="perfSetMetric(\'teklif\')" style="font-size:11px">Teklif</div></div>' +
            '<div style="display:flex;gap:8px;align-items:center"><span class="flbl">Firma</span>' +
              '<div class="chip" id="perf-f-firma" onclick="perfSetFirma(\'firma\')" style="font-size:11px">Firma başına</div>' +
              '<div class="chip" id="perf-f-toplam" onclick="perfSetFirma(\'toplam\')" style="font-size:11px">Toplam</div></div>' +
            '<div id="perf-gun-wrap" style="display:flex;gap:8px;align-items:center"><span class="flbl">Gün</span>' +
              '<div class="chip" id="perf-g-gun" onclick="perfSetGun(\'gun\')" style="font-size:11px">Gün başına</div>' +
              '<div class="chip" id="perf-g-toplam" onclick="perfSetGun(\'toplam\')" style="font-size:11px">Toplam</div></div>' +
          '</div>' +
          '<div class="flbl" style="margin-bottom:4px">Filtreler</div><div id="perf-filters" style="display:flex;flex-direction:column;gap:6px"></div>' +
          '<div style="margin:8px 0"><button onclick="perfAddFilter()" style="font-size:12px;padding:5px 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+ Filtre ekle</button></div>' +
          '<div id="perf-pivot-body"></div>';
        panel.appendChild(card);
      }
      return card;
    }
    function renderPerfPivot() {
      if (!injectPerfPivot()) return;
      if (!S._perfDim) S._perfDim = "kategori_adi";
      if (!S._perfMetric) S._perfMetric = "value";
      if (!S._perfFirma) S._perfFirma = "firma"; // firma başına (varsayılan) | toplam
      if (!S._perfGun) S._perfGun = "gun";       // gün başına (varsayılan) | toplam
      if (!S._perfFilters) S._perfFilters = [];
      var dimSel = document.getElementById("perf-dim");
      if (dimSel) dimSel.innerHTML = PERF_DIMS.map(function (d) { return '<option value="' + d.k + '"' + (S._perfDim === d.k ? " selected" : "") + '>' + d.lbl + '</option>'; }).join("");
      document.getElementById("perf-m-value").classList.toggle("on", S._perfMetric === "value");
      document.getElementById("perf-m-teklif").classList.toggle("on", S._perfMetric === "teklif");
      document.getElementById("perf-f-firma").classList.toggle("on", S._perfFirma === "firma");
      document.getElementById("perf-f-toplam").classList.toggle("on", S._perfFirma === "toplam");
      document.getElementById("perf-g-gun").classList.toggle("on", S._perfGun === "gun");
      document.getElementById("perf-g-toplam").classList.toggle("on", S._perfGun === "toplam");
      // Gün toggle yalnız Teklif metriğinde görünür (Value gün'den etkilenmez).
      var gunWrap = document.getElementById("perf-gun-wrap"); if (gunWrap) gunWrap.style.display = (S._perfMetric === "teklif") ? "flex" : "none";
      var fHost = document.getElementById("perf-filters");
      if (fHost) fHost.innerHTML = (S._perfFilters || []).map(function (f, i) {
        var opts = '<option value="">— kolon —</option>' + PERF_DIMS.map(function (d) { return '<option value="' + d.k + '"' + (f.col === d.k ? " selected" : "") + '>' + d.lbl + '</option>'; }).join("");
        var valSel = "";
        if (f.col) valSel = '<select multiple size="4" onchange="perfSetVals(' + i + ',this)" style="min-width:180px;max-width:300px;font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:3px">' + perfDistinct(f.col).map(function (v) { return '<option value="' + renEsc(v) + '"' + (f.values.indexOf(v) >= 0 ? " selected" : "") + '>' + renEsc(v) + '</option>'; }).join("") + '</select>';
        return '<div style="display:flex;gap:6px;align-items:flex-start"><select onchange="perfSetCol(' + i + ',this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px">' + opts + '</select>' + valSel + '<button onclick="perfRemFilter(' + i + ')" style="font-size:11px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#71717a;padding:4px 8px">✕</button></div>';
      }).join("");
      var data = perfBase(), dim = S._perfDim, groups = {};
      data.forEach(function (x) {
        var g = String(x[dim] == null ? "" : x[dim]).trim() || "—";
        var o = groups[g] || (groups[g] = { g: g, n: 0, val: 0, teklif: 0, sumRate: 0, nRate: 0 });
        o.n++; o.val += renNum(x.satis_fiyati);
        var tk = renNum(x.teklif); o.teklif += tk;
        var gn = renNum(x.yayinlanan_gun); if (gn > 0) { o.sumRate += tk / gn; o.nRate++; } // firma bazlı teklif/gün
      });
      var arr = Object.keys(groups).map(function (k) { return groups[k]; });
      var isT = S._perfMetric === "teklif";
      // Metrik: Value → firma toggle (ortalama/toplam value). Teklif → önce GÜN (her firmada teklif/gün
      // ham teklif), sonra FIRMA (firmalar arası ortalama/toplam). Varsayılan (firma+gün)=ort. firma günlük teklifi.
      var metricOf = function (o) {
        if (!isT) return S._perfFirma === "firma" ? (o.n ? o.val / o.n : 0) : o.val;
        if (S._perfGun === "gun") return S._perfFirma === "firma" ? (o.nRate ? o.sumRate / o.nRate : 0) : o.sumRate;
        return S._perfFirma === "firma" ? (o.n ? o.teklif / o.n : 0) : o.teklif;
      };
      arr.sort(function (a, b) { return metricOf(b) - metricOf(a); });
      var fmtVal = function (v) {
        if (!isT) return renTL(Math.round(v));
        if (S._perfGun === "gun") return (Math.round(v * 100) / 100).toLocaleString("tr-TR");
        if (S._perfFirma === "firma") return (Math.round(v * 10) / 10).toLocaleString("tr-TR");
        return Math.round(v).toLocaleString("tr-TR");
      };
      var modeLbl = !isT ? (S._perfFirma === "firma" ? "firma başına value (₺)" : "toplam value (₺)")
        : (S._perfFirma === "firma"
            ? (S._perfGun === "gun" ? "firma başına günlük teklif" : "firma başına teklif")
            : (S._perfGun === "gun" ? "toplam günlük teklif" : "toplam teklif"));
      var info = document.getElementById("perf-pivot-info"); if (info) info.textContent = arr.length + " değer · " + data.length + " firma · " + modeLbl;
      var maxM = arr.reduce(function (m, o) { return Math.max(m, metricOf(o)); }, 0) || 1;
      var barCol = isT ? "#7c3aed" : "#185FA5";
      var body = document.getElementById("perf-pivot-body");
      body.innerHTML = arr.length ? arr.slice(0, 60).map(function (o) {
        var m = metricOf(o), pct = Math.round(m / maxM * 100);
        return '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="font-weight:600">' + renEsc(o.g) + '</span><span style="color:#71717a"><b style="color:#3f3f46">' + fmtVal(m) + '</b> · ' + o.n + ' firma</span></div><div style="background:#f4f4f5;border-radius:5px;height:16px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, pct) + '%;background:' + barCol + ';border-radius:5px"></div></div></div>';
      }).join("") + (arr.length > 60 ? '<div style="color:#a1a1aa;font-size:11px">…+' + (arr.length - 60) + ' değer</div>' : "") : '<div style="color:#a1a1aa;font-size:12px;padding:8px">Veri yok</div>';
    }
    window.perfSetDim = function (v) { S._perfDim = v; renderPerfPivot(); };
    window.perfSetMetric = function (m) { S._perfMetric = m; renderPerfPivot(); };
    window.perfSetFirma = function (v) { S._perfFirma = v; renderPerfPivot(); };
    window.perfSetGun = function (v) { S._perfGun = v; renderPerfPivot(); };
    window.perfAddFilter = function () { (S._perfFilters = S._perfFilters || []).push({ col: "", values: [] }); renderPerfPivot(); };
    window.perfRemFilter = function (i) { S._perfFilters.splice(i, 1); renderPerfPivot(); };
    window.perfSetCol = function (i, c) { S._perfFilters[i].col = c; S._perfFilters[i].values = []; renderPerfPivot(); };
    window.perfSetVals = function (i, sel) { var v = []; for (var o = 0; o < sel.options.length; o++) if (sel.options[o].selected) v.push(sel.options[o].value); S._perfFilters[i].values = v; renderPerfPivot(); };

    moveYenilemeCard(); // yükleme anında kartı taşı (Performans'ta görünmesin)
  }

  // ══ Özel Fiyat — "Tüm Firmalar" tablosu + PAYLAŞILAN filtre (özel + tüm firmalar birlikte) ══
  // Özel Fiyat panelinin altına, özel-fiyatlı raw tablosunun ALTINA bir bölüm enjekte eder:
  //   • Filtre bar: Performans kırılım kolonları + Renk + 9 performans flag'i (Provider Health,
  //     Campaign, Gallery, Last Seen, Lead Count, Response Rate/Time, Review, CR).
  //   • Tüm Firmalar tablosu (özel fiyatlı olsun olmasın): ilk 200 + "daha fazla yükle".
  // Filtre HER İKİ bölümü etkiler: renderPF deseniyle S.firmalar geçici filtreli listeye çevrilir,
  // orijinal renderOZ çağrılır (üst özel bölüm otomatik daralır), sonra geri konur; tüm-firmalar
  // tablosu filtreli TAM listeyle çizilir. Kolonlar üstteki özel raw tabloyla aynı + "Özel Fiyat".
  if (typeof window.renderOZ === "function" && !window.__ozAllPatched) {
    window.__ozAllPatched = true;

    // NOT: "kategori_grubu" OZ_DIMS'te YOK — ayrı "Kategori Grubu" chip toplu-seçimi (default Big5
    // hariç = Venue+Others) ile yönetilir; jenerik filtreye eklenmez (çift kontrol olmasın).
    var OZ_DIMS = [
      { k: "kategori_adi", lbl: "Kategori" },
      { k: "sehir", lbl: "Şehir" }, { k: "ilce", lbl: "İlçe" }, { k: "py_adi", lbl: "PY" },
      { k: "musteri_statusu", lbl: "Müşteri Statüsü" }, { k: "urun_adi", lbl: "Ürün" },
      { k: "flag_rengi", lbl: "Renk (Flag)" }, { k: "provider_segment", lbl: "Segment" },
      { k: "aktif_ozel_fiyat", lbl: "Aktif Özel Fiyat" },
      { k: "odeme_flagi", lbl: "Ödeme Flagi" }, { k: "geri_donus_flagi", lbl: "Geri Dönüş Flagi" },
    ].concat(OZ_FLAG_COLS.map(function (fc) { return { k: fc.k, lbl: fc.lbl }; }));

    function ozVal(x, col) { return String(x && x[col] == null ? "" : x[col]).trim(); }
    function ozPredicate(x) {
      // Kategori Grubu chip toplu-seçimi (her zaman aktif): yalnız seçili gruplar geçer.
      if (S._ozKatGrup && S._ozKatGrup.indexOf(ozVal(x, "kategori_grubu")) < 0) return false;
      var fs = S._ozFilters || [];
      for (var i = 0; i < fs.length; i++) { var f = fs[i]; if (f.col && f.values && f.values.length && f.values.indexOf(ozVal(x, f.col)) < 0) return false; }
      return true;
    }
    function ozDistinct(col) { var set = {}; (S.firmalar || []).forEach(function (x) { var v = ozVal(x, col); if (v) set[v] = 1; }); return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "tr"); }); }

    function injectOzAll() {
      var at = document.getElementById("oz-raw-tbl"); if (!at) return null;
      var ac = at.closest ? at.closest(".card") : null;
      var host = ac && ac.parentNode ? ac.parentNode : (document.getElementById("panel-ozel") || document.body);
      var card = document.getElementById("oz-all-card");
      if (!card) {
        card = document.createElement("div");
        card.className = "card"; card.id = "oz-all-card"; card.style.marginTop = "14px";
        card.innerHTML =
          '<div class="card-head"><span class="ct">📇 Tüm Firmalar <span id="oz-all-cnt" style="font-size:11px;color:#a1a1aa;font-weight:400"></span></span></div>' +
          '<div style="font-size:11.5px;color:#71717a;margin-bottom:8px">Özel fiyatlı olsun olmasın tüm firmalar. Buradaki Kategori Grubu + filtreler ve üstteki paket bitiş dönemi yukarıdaki özel-fiyatlı bölümü de daraltır.</div>' +
          '<div class="flbl" style="margin-bottom:4px">Kategori Grubu <span style="font-weight:400;color:#a1a1aa">(tıkla-seç · Big 5 varsayılan kapalı)</span></div><div id="oz-katgrup" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"></div>' +
          '<div class="flbl" style="margin-bottom:4px">Filtreler</div><div id="oz-filters" style="display:flex;flex-direction:column;gap:6px"></div>' +
          '<div style="margin:8px 0"><button onclick="ozAddFilter()" style="font-size:12px;padding:5px 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+ Filtre ekle</button></div>' +
          '<div class="tw" style="overflow-x:auto"><table><thead><tr>' +
            '<th>Provider ID</th><th>Provider Name</th><th>Customer ID</th><th>Customer Name</th><th>Ürün</th><th>İl</th><th>Kategori Adı</th><th>Teklif</th>' +
            '<th style="text-align:right">Yıllık Value</th><th style="text-align:right">Aylık Value</th><th>Özel Fiyat</th>' +
          '</tr></thead><tbody id="oz-all-tbl"></tbody></table></div>' +
          '<div id="oz-all-more" style="text-align:center;margin-top:10px"></div>';
        if (ac && ac.nextSibling) host.insertBefore(card, ac.nextSibling); else host.appendChild(card);
      }
      return card;
    }

    // Kategori Grubu toplu-seçim chip'leri (Big 5 / Others / Venue). Seçili = dahil.
    function renderOzKatChips() {
      var host = document.getElementById("oz-katgrup"); if (!host) return;
      var groups = ozDistinct("kategori_grubu");
      host.innerHTML = groups.map(function (g) {
        var on = (S._ozKatGrup || []).indexOf(g) >= 0;
        return '<div class="chip' + (on ? " on" : "") + '" data-v="' + renEsc(g) + '" onclick="ozToggleKat(this.getAttribute(\'data-v\'))" style="font-size:11px">' + renEsc(g) + '</div>';
      }).join("");
    }

    function renderOzFilters() {
      var host = document.getElementById("oz-filters"); if (!host) return;
      host.innerHTML = (S._ozFilters || []).map(function (f, i) {
        var opts = '<option value="">— kolon —</option>' + OZ_DIMS.map(function (d2) { return '<option value="' + d2.k + '"' + (f.col === d2.k ? " selected" : "") + '>' + renEsc(d2.lbl) + '</option>'; }).join("");
        var valSel = "";
        if (f.col) {
          valSel = '<select multiple size="4" onchange="ozSetVals(' + i + ',this)" style="min-width:190px;max-width:320px;font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:3px">' +
            ozDistinct(f.col).map(function (v) { return '<option value="' + renEsc(v) + '"' + (f.values.indexOf(v) >= 0 ? " selected" : "") + '>' + renEsc(v) + '</option>'; }).join("") + '</select>';
        }
        return '<div style="display:flex;gap:6px;align-items:flex-start">' +
          '<select onchange="ozSetCol(' + i + ',this.value)" style="font-size:12px;border:1px solid #e4e4e7;border-radius:6px;padding:4px">' + opts + '</select>' +
          valSel + '<button onclick="ozRemFilter(' + i + ')" style="font-size:11px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#71717a;padding:4px 8px">✕</button></div>';
      }).join("");
    }

    function renderOzAllTable(rows) {
      var tbl = document.getElementById("oz-all-tbl"); if (!tbl) return;
      if (!S._ozAllLimit) S._ozAllLimit = 200;
      var cnt = document.getElementById("oz-all-cnt");
      if (cnt) cnt.textContent = rows.length + " firma" + (rows.length > S._ozAllLimit ? (" · ilk " + S._ozAllLimit) : "");
      var shown = rows.slice(0, S._ozAllLimit);
      tbl.innerHTML = shown.length ? shown.map(function (f) {
        var yil = renNum(f.satis_fiyati) || 0, ay = Math.round(yil / 12);
        return "<tr>" +
          '<td style="font-size:11px;color:#71717a">' + (f.provider_id || "—") + "</td>" +
          '<td style="font-size:12px;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + renEsc(f.musteri_adi || "") + '">' + renEsc(f.musteri_adi || "—") + "</td>" +
          '<td style="font-size:11px;color:#71717a">' + (f.musteri_id || f.firma_id || "—") + "</td>" +
          '<td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + renEsc(f.customer_name || "") + '">' + renEsc(f.customer_name || "—") + "</td>" +
          '<td style="font-size:11px;color:#71717a">' + renEsc(f.urun_adi || "—") + "</td>" +
          '<td style="font-size:11px">' + renEsc(f.sehir || "—") + "</td>" +
          '<td style="font-size:11px;color:#71717a">' + renEsc(f.kategori_adi || "—") + "</td>" +
          '<td style="font-size:12px;text-align:center">' + (renNum(f.teklif) || 0) + "</td>" +
          '<td style="font-size:12px;text-align:right;white-space:nowrap">₺' + yil.toLocaleString("tr-TR") + "</td>" +
          '<td style="font-size:12px;text-align:right;white-space:nowrap;color:#185FA5;font-weight:500">₺' + ay.toLocaleString("tr-TR") + "</td>" +
          '<td style="font-size:11px;text-align:center">' + renEsc(ozVal(f, "aktif_ozel_fiyat") || "—") + "</td>" +
          "</tr>";
      }).join("") : '<tr><td colspan="11" style="text-align:center;color:#a1a1aa;padding:14px">Filtreye uyan firma yok</td></tr>';
      var more = document.getElementById("oz-all-more");
      if (more) {
        if (rows.length > S._ozAllLimit) {
          more.innerHTML = '<button onclick="ozLoadMore()" style="font-size:12px;padding:6px 16px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;cursor:pointer;color:#185FA5">+200 firma daha yükle (' + (rows.length - S._ozAllLimit) + ' kaldı)</button>';
        } else more.innerHTML = "";
      }
    }

    window.ozAddFilter = function () { (S._ozFilters = S._ozFilters || []).push({ col: "", values: [] }); S._ozAllLimit = 200; renderOZ(); };
    window.ozRemFilter = function (i) { S._ozFilters.splice(i, 1); S._ozAllLimit = 200; renderOZ(); };
    window.ozSetCol = function (i, c) { S._ozFilters[i].col = c; S._ozFilters[i].values = []; S._ozAllLimit = 200; renderOZ(); };
    window.ozSetVals = function (i, sel) { var v = []; for (var o = 0; o < sel.options.length; o++) if (sel.options[o].selected) v.push(sel.options[o].value); S._ozFilters[i].values = v; S._ozAllLimit = 200; renderOZ(); };
    window.ozLoadMore = function () { S._ozAllLimit = (S._ozAllLimit || 200) + 200; renderOZ(); };
    window.ozToggleKat = function (g) {
      if (!S._ozKatGrup) S._ozKatGrup = [];
      var i = S._ozKatGrup.indexOf(g);
      if (i >= 0) S._ozKatGrup.splice(i, 1); else S._ozKatGrup.push(g);
      S._ozAllLimit = 200; renderOZ();
    };

    var _origRenderOZ = window.renderOZ;
    window.renderOZ = function () {
      if (!S._ozFilters) S._ozFilters = [];
      var full = S.firmalar || [];
      // Kategori Grubu default'u: Big 5 HARİÇ tüm gruplar (Venue + Others) — ilk açılışta bir kez kurulur.
      if (S._ozKatGrup === undefined) S._ozKatGrup = ozDistinct("kategori_grubu").filter(function (g) { return !/big\s*5/i.test(g); });
      var filtered = full.filter(ozPredicate);
      // Üst özel-fiyatlı bölümü de daralt: S.firmalar'ı geçici filtreli listeye çevir, çiz, geri koy.
      // (Paket bitiş dönemi filtresini BURAYA katma — orijinal renderOZ dropdown'ı ondan kuruyor;
      //  ay-filtresi tüm-firmalar'a AŞAĞIDA ayrıca uygulanır.)
      S.firmalar = filtered;
      try { _origRenderOZ.apply(this, arguments); } finally { S.firmalar = full; }
      // Tüm-firmalar bölümü: paylaşılan filtreler + ÜST paket bitiş dönemi (dropdown değeri).
      var donemSel = document.getElementById("oz-donem-sel");
      var secilenDonem = donemSel ? donemSel.value : "";
      var allRows = secilenDonem
        ? filtered.filter(function (x) { return String(x.bitis_tarihi || "").slice(0, 7) === secilenDonem; })
        : filtered;
      try { if (injectOzAll()) { renderOzKatChips(); renderOzFilters(); renderOzAllTable(allRows); } } catch (e) { console.warn("[oz-all]", e); }
    };
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
        // "Kampanya var mı" bilgisi Dashboard_Firma'dan (Kampanya Sayısı); Provider Id = RÇİ
        // ile eşlenir (canlı: %99). Onboarding'in kendi kampanya/whatsapp'ı kullanılmaz.
        var firmaKampanya = {};
        if (Array.isArray(d.firma)) d.firma.forEach(function (fr) { var rci = String(fr["RÇİ"] == null ? "" : fr["RÇİ"]).trim().replace(/\.0+$/, ""); if (rci) firmaKampanya[rci] = fr["Kampanya Sayısı"]; });
        // ── Yeni / Yenileme sınıflaması (Dashboard_Onboarding_Sozlesme'den) ──
        // Provider başına aktif(1)+geçmiş(0) sözleşmeler. YENİ = (aktif başlangıç − en güncel pasif
        // bitiş) > 1 yıl VEYA pasif sözleşme yok; aksi YENİLEME; sözleşme verisi yoksa Bilinmiyor.
        var sozByProv = {};
        if (Array.isArray(d.onboarding_sozlesme)) {
          d.onboarding_sozlesme.forEach(function (r) {
            var pp = String(r["Provider Id"] == null ? "" : r["Provider Id"]).trim().replace(/\.0+$/, "");
            if (!pp) return;
            (sozByProv[pp] || (sozByProv[pp] = [])).push({
              cur: String(r["Is Current Product"] == null ? "" : r["Is Current Product"]).trim(),
              start: String(r["Product Start"] == null ? "" : r["Product Start"]).slice(0, 10),
              end: String(r["Product End"] == null ? "" : r["Product End"]).slice(0, 10),
            });
          });
        }
        function classifyProvider(pp) {
          var cs = sozByProv[pp];
          if (!cs || !cs.length) return "Bilinmiyor";
          var actStarts = cs.filter(function (x) { return x.cur === "1" && x.start; }).map(function (x) { return x.start; }).sort();
          if (!actStarts.length) return "Bilinmiyor";
          var actStart = actStarts[0]; // en erken aktif başlangıç
          var inaEnds = cs.filter(function (x) { return x.cur === "0" && x.end; }).map(function (x) { return x.end; }).sort();
          if (!inaEnds.length) return "Yeni"; // hiç pasif sözleşme yok → yeni
          var inaEnd = inaEnds[inaEnds.length - 1]; // en güncel pasif bitiş
          var gapDays = (Date.parse(actStart) - Date.parse(inaEnd)) / 86400000;
          return isNaN(gapDays) ? "Bilinmiyor" : (gapDays > 365 ? "Yeni" : "Yenileme");
        }
        S.onboarding = d.onboarding.map(function (row) {
          var m = mapRow(row, ONBOARDING_MAP);
          var pid = String(m.ob_id == null ? "" : m.ob_id).trim().replace(/\.0+$/, "");
          if (pid in firmaKampanya) m.kampanya = firmaKampanya[pid];
          m.yeni_yenileme = classifyProvider(pid); // Yeni | Yenileme | Bilinmiyor
          return m;
        // Provider İsmi (ob_adi) olmayan satırları dışla — Qlik'te verisi eksik duplike
        // kayıtlar (tüm alanlar '-'); Sheet'i okurken ele → hiçbir onboarding görünümüne girmez.
        // (Kendi kendine yeten kontrol; HTML'deki obNonempty'e bağlı değil.)
        }).filter(function (m) {
          var v = String(m.ob_adi == null ? "" : m.ob_adi).trim();
          return v !== "" && v !== "-" && v !== "0";
        });
        S.loaded.onboarding = true;
        S.loaded.flag = S.onboarding.some(function (f) { return f.ob_flag; });
        S.loaded.kw = S.onboarding.some(function (f) { return f.kampanya; });
        loaded.push("onboarding: " + S.onboarding.length);
      }

      // ── Firma performans (Providers-PY → S.firmalar) ────────────────────
      // Performans + Alarm + Yenileme (fallback) + Genel Analiz panellerini besler.
      // applyImport ile aynı: mapRow(FIRMA_MAP) + calcFlag(flag_rengi).
      if (Array.isArray(d.firma) && d.firma.length) {
        // provider_segment artık Dashboard_Firma'da bir KOLON (run route join). Ayrıca
        // RÇİ → segment arama tablosu kur (yenileme/Genel Analiz kırılımı bunu kullanır).
        S._segByRci = {};
        // Performans flag lookup (en güncel snapshot) → RÇİ ile firmaya eklenir (Özel Fiyat filtreleri).
        var pfRows = (Array.isArray(d.provider_flag_current) && d.provider_flag_current.length) ? d.provider_flag_current
                   : (Array.isArray(d.provider_flag) && d.provider_flag.length) ? d.provider_flag : [];
        var pfLookup = {};
        if (pfRows.length) {
          var pfKeys = Object.keys(pfRows[0] || {});
          var pfPidKey = null;
          for (var pfi = 0; pfi < pfKeys.length; pfi++) { if (/provider\s*id/i.test(pfKeys[pfi])) { pfPidKey = pfKeys[pfi]; break; } }
          if (pfPidKey) pfRows.forEach(function (fr) { var p = renNormId(fr[pfPidKey]); if (p && !pfLookup[p]) pfLookup[p] = fr; });
        }
        S.firmalar = d.firma.map(function (row) {
          var m = mapRow(row, FIRMA_MAP);
          m.flag_rengi = calcFlag(m);
          m.provider_segment = String(row["provider_segment"] == null ? "" : row["provider_segment"]).trim();
          var rci = String(m.firma_id == null ? "" : m.firma_id).trim().replace(/\.0+$/, ""); // RÇİ (override öncesi)
          if (rci) S._segByRci[rci] = m.provider_segment;
          // 9 performans flag'ini firmaya ekle (eşleşme yoksa boş → filtrede "—"/değersiz).
          var pf = pfLookup[rci];
          OZ_FLAG_COLS.forEach(function (fc) { m[fc.k] = pf ? renFlagVal(pf[fc.src]) : ""; });
          m.provider_id = rci; // provider (RÇİ) KORUNUR — müşteri/provider ayrımı için (firma_id müşteriye ezilir)
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
            py_adi: (function () { var p = String(row["Arayan PY"] || "").trim(); return PY_NAME_MAP[p] || p; })(),
            tarih: toDateStr(row["Arama Tarihi"]),
            durum: durum,
            sure_dakika: sure,
            musteri_id: mid,
            cagri_id: String(row["sonitel_call_log_id"] || ""),
            kullanici_tipi: String(row["Kullanıcı Tipi"] || ""),
            yon: String(row["IB OB"] || "").trim(), // Gelen=inbound, Giden=outbound
          };
        });
        S.loaded.cagri = true;
        S._cagriSecilenAy = "";
        loaded.push("çağrı: " + S.cagrilar.length);
      }

      // ── PY verimlilik (shift tablosu, Yıl Ay bazlı → S.verimlilik) ───────
      // Qlik "Yıl Ay" değerini /erce Ay formatına (YYYY-MM) çevirir (ne format
      // gelirse gelsin eşleşsin). Verimlilik zaten hesaplı (%) gelir; biz hesaplamayız.
      function normVerimAy(v) {
        var s = String(v == null ? "" : v).trim();
        if (!s) return "";
        var m = s.match(/(\d{4})[-\/.](\d{1,2})(?!\d)/);
        if (m) return m[1] + "-" + ("0" + m[2]).slice(-2);
        m = s.match(/^(\d{4})(\d{2})$/);
        if (m) return m[1] + "-" + m[2];
        m = s.match(/^(\d{1,2})[-\/.](\d{4})$/);
        if (m) return m[2] + "-" + ("0" + m[1]).slice(-2);
        var TR = { ocak:1, şubat:2, subat:2, mart:3, nisan:4, mayıs:5, mayis:5, haziran:6, temmuz:7, ağustos:8, agustos:8, eylül:9, eylul:9, ekim:10, kasım:11, kasim:11, aralık:12, aralik:12,
                   oca:1, şub:2, sub:2, mar:3, nis:4, may:5, haz:6, tem:7, ağu:8, agu:8, eyl:9, eki:10, kas:11, ara:12 };
        var low = s.toLocaleLowerCase("tr-TR");
        var yr = (low.match(/(\d{4})/) || [])[1];
        var mo = null;
        for (var k in TR) { if (TR.hasOwnProperty(k) && low.indexOf(k) >= 0) { mo = TR[k]; break; } }
        if (yr && mo) return yr + "-" + ("0" + mo).slice(-2);
        return s;
      }
      if (Array.isArray(d.verimlilik) && d.verimlilik.length) {
        S.verimlilik = d.verimlilik.map(function (row) {
          return {
            ay: normVerimAy(row["%year_month_num"]),
            ay_ham: String(row["%year_month_num"] == null ? "" : row["%year_month_num"]).trim(),
            py_adi: String(row["PY"] == null ? "" : row["PY"]).trim(),
            verimlilik: String(row["Verimlilik"] == null ? "" : row["Verimlilik"]).trim(),
            mesai: String(row["Mesai Süresi"] == null ? "" : row["Mesai Süresi"]).trim(),
            konusma: String(row["Konuşma Süresi"] == null ? "" : row["Konuşma Süresi"]).trim(),
            mola: String(row["Mola Süresi"] == null ? "" : row["Mola Süresi"]).trim(),
            toplanti: String(row["Toplantı Süresi"] == null ? "" : row["Toplantı Süresi"]).trim(),
          };
        });
        S.loaded.verimlilik = true;
        loaded.push("verimlilik: " + S.verimlilik.length);
      }

      // ── Provider Health flag — ay sonu, PY × flag sayımı ────────────────
      if (Array.isArray(d.phFlagAy) && d.phFlagAy.length) {
        S.phFlagAy = d.phFlagAy.map(function (r) {
          return {
            ay: String(r["Ay"] == null ? "" : r["Ay"]).trim(),
            tarih: String(r["Tarih"] == null ? "" : r["Tarih"]).trim(),
            py_adi: String(r["PY"] == null ? "" : r["PY"]).trim(),
            flag: String(r["Flag"] == null ? "" : r["Flag"]).trim(),
            adet: parseInt(r["Adet"], 10) || 0,
          };
        });
        S.loaded.phFlagAy = true;
        loaded.push("phFlagAy: " + S.phFlagAy.length);
      }

      // ── Decay takip (renewal_data harici canlı Sheet) ────────────────────
      if (Array.isArray(d.decayTakip)) {
        S.decayTakip = d.decayTakip;
        S.loaded.decayTakip = d.decayTakip.length > 0;
        loaded.push("decayTakip: " + d.decayTakip.length);
      }

      // ── Customer bazında yenileme (renewal_data harici canlı Sheet) ──────
      // Başlıklar Sheet sahibinin elinde değişebilir → ham satır nesneleri olduğu
      // gibi taşınır; kolon tespiti (ay/müşteri/value) render tarafında yapılır.
      if (Array.isArray(d.custYenileme)) {
        S.custYenileme = d.custYenileme;
        S.loaded.custYenileme = d.custYenileme.length > 0;
        loaded.push("custYenileme: " + d.custYenileme.length);
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

        // ── Provider flag geçmişi (Provider_Flag_Old) → RÇİ + ay arama tablosu ──
        // Anahtar = normalize(Provider ID) + "|" + ay. Değerler "⚑ <kolon>" adıyla
        // renewal satırının raw'ına eklenir → Kırılım/filtre kolonu olur.
        var flagByKey = {};
        S._renFlagCols = [];
        // Old (tarihi Provider_Flag_Old) + GÜNCEL (Provider_Flag, en güncel ph_flag_date) BİRLEŞİK.
        // Aynı kolonlar; GÜNCEL Old'dan SONRA eklenir → içinde bulunulan ay için güncel değer kazanır.
        var flagSample = (Array.isArray(d.provider_flag) && d.provider_flag.length) ? d.provider_flag
          : (Array.isArray(d.provider_flag_current) && d.provider_flag_current.length) ? d.provider_flag_current : null;
        if (flagSample) {
          var fkeys = Object.keys(flagSample[0] || {});
          var pidKey = null, dtKey = null;
          for (var fi = 0; fi < fkeys.length; fi++) {
            if (!pidKey && /provider\s*id/i.test(fkeys[fi])) pidKey = fkeys[fi];
            if (!dtKey && /date|tarih/i.test(fkeys[fi])) dtKey = fkeys[fi];
          }
          // Yalnız İZİNLİ flag kolonları (whitelist), tab başlığıyla esnek eşleşen.
          var flagCols = [], usedH = {};
          REN_FLAG_WHITELIST.forEach(function (term) {
            var t = renNormHdr(term);
            for (var hi = 0; hi < fkeys.length; hi++) {
              var h = fkeys[hi];
              if (usedH[h] || h === pidKey || h === dtKey) continue;
              if (renNormHdr(h) === t) { flagCols.push(h); usedH[h] = true; break; }
            }
          });
          S._renFlagCols = flagCols.map(function (k) { return "⚑ " + k; });
          if (pidKey && dtKey) {
            var addFlagRows = function (rows) {
              (rows || []).forEach(function (fr) {
                var pid = renNormId(fr[pidKey]), mo = renFlagMonth(fr[dtKey]);
                if (!pid || !mo) return;
                var rec = {};
                flagCols.forEach(function (k) { rec["⚑ " + k] = renFlagVal(fr[k]); });
                flagByKey[pid + "|" + mo] = rec;
              });
            };
            addFlagRows(d.provider_flag);          // Old (tarihi) önce
            addFlagRows(d.provider_flag_current);   // GÜNCEL sonra → bu ay için üzerine yazar
          } else {
            console.warn("[pipeline] provider_flag: Provider ID / Date kolonu bulunamadı", fkeys);
          }
        }

        // ── Firma Segmentasyonu (Sheet "Segmentation") → yenileyen SÖZLEŞMEYE eşle ──
        // Anahtar: provider_id(=RÇİ) + product_ended_ym(=Yenileme Ayı). Canlı doğrulandı %99.
        // özel-fiyat gün sayısı bucket'lanır (Yok / 1-30 / 31-90 / 90+ gün).
        var segMap = {}, segOzKey = null;
        if (Array.isArray(d.segmentation) && d.segmentation.length) {
          var sk0 = d.segmentation[0] || {};
          for (var sk in sk0) { if (/özel/i.test(sk)) { segOzKey = sk; break; } } // "özel fiyatlı gün sayısı"
          d.segmentation.forEach(function (sr) {
            var spid = renNormId(sr["provider_id"]);
            var sem = renFlagMonth(sr["product_ended_ym"]); // Excel seri no / metin → "YYYY-MM"
            if (!spid || !sem) return;
            segMap[spid + "|" + sem] = {
              seg: SEG_NAME[String(sr["Provider Segmentation"] || "").trim()] || "Bilinmiyor",
              oz: segOzKey ? renNum(sr[segOzKey]) : 0,
            };
          });
        }
        function ozelBucket(n) { return n <= 0 ? "Yok" : n <= 30 ? "1-30 gün" : n <= 90 ? "31-90 gün" : "90+ gün"; }

        S._renewalRows = d.yenileme.map(function (r) {
          var durum = String(r["Yenileme Durumu"] || "").trim();
          var ay = renMonth(r["Yenileme Ayı-Date"]) || renMonth(r["Yenileme Ayı"]);
          // Provider flag'lerini (bu ay + RÇİ provider id) satırın raw'ına ekle →
          // Kırılım/filtre kolonu olur. Eşleşme yoksa kolon boş kalır → "—".
          var pid = renNormId(r["RÇİ"]);
          // Geriye dönük eşleme: yenileme ayında snapshot yoksa ay-1, ay-2 … provider'ın
          // EN YAKIN önceki snapshot'ını bul, o ayın tüm flag'lerini kullan. flagBack=kaç ay geri.
          var frec = null, flagBack = -1;
          if (pid && ay) {
            for (var fb = 0; fb <= 24; fb++) {
              var cand = flagByKey[pid + "|" + renMonthMinus(ay, fb)];
              if (cand) { frec = cand; flagBack = fb; break; }
            }
          }
          if (frec) for (var fk in frec) { if (frec.hasOwnProperty(fk)) r[fk] = frec[fk]; }
          r._flagBack = flagBack; // 0=yenileme ayı, 1=1 ay önce, …, -1=bulunamadı
          // provider_segment (firma'dan RÇİ ile) → raw kolonu (Kırılım/filtre "Provider Segment").
          r["Provider Segment"] = (S._segByRci && S._segByRci[pid]) || "";
          // Firma Segmentasyonu (dönem-bazlı) → yeni Kırılım/filtre kolonları "Segment" + "Özel Fiyat".
          var _segHit = segMap[pid + "|" + ay];
          r["Segment"] = _segHit ? _segHit.seg : "Bilinmiyor";
          r["Özel Fiyat"] = _segHit ? ozelBucket(_segHit.oz) : "Bilinmiyor";
          return {
            raw: r,
            ay: ay,
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
