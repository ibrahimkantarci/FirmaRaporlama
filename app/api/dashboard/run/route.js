// app/api/dashboard/run/route.js
// Dashboard pipeline (yazma): yapılandırılmış Qlik objelerini oku → Sheet sekmelerine yaz.
// Tek tek (?only=onboarding) veya tümü çalıştırılabilir. /api/fiyat/run ile aynı desen.
import { withAccess } from "../../../../lib/api";
import {
  openQlikDoc,
  fetchObjectData,
  fetchFieldsData,
  selectExact,
  selectLatestDate,
  selectFieldGreaterThan,
  selectMultiple,
  getFieldValues,
} from "../../../../lib/qlik";
import { overwriteSheetTab, readMatrixFromSheet, writeMatrixToSheet } from "../../../../lib/sheets";
import { DASHBOARD_SOURCES } from "../../../../lib/dashboard-sources";

// Bir tarih hücresinden "YYYY-MM" çıkar (ISO / DD.MM.YYYY / Excel seri no toleranslı).
function cellMonth(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})/); if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[3]}-${m[2]}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

// Bir tarih hücresini epoch-ms'e çevir (Excel seri no VEYA "YYYY-MM-DD"/"DD.MM.YYYY" string).
// Arama_Ham "Arama Tarihi" karışık formatlı (eski satırlar seri no, yeni satırlar string).
// Çözülemeyen (NaN) hücreler prune'da KORUNUR (yaşı belirsiz veriyi silme).
function cellToMs(v) {
  if (typeof v === "number") return (v > 20000 && v < 90000) ? Date.UTC(1899, 11, 30) + v * 86400000 : NaN;
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})/); if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 90000) return Date.UTC(1899, 11, 30) + n * 86400000;
  const t = Date.parse(s); return Number.isNaN(t) ? NaN : t;
}

// Canlı URL kaynağından (ör. RENEWAL_DATA) satır nesnelerini çeker (data route ile aynı).
async function fetchExternalRows(src) {
  const base = process.env[src.urlEnv];
  if (!base) return [];
  const sep = base.includes("?") ? "&" : "?";
  const url = src.urlParams ? base + sep + src.urlParams : base;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!j || j.ok === false) return [];
  const data = j.data || j;
  const rows = src.extract ? data[src.extract] : data;
  return Array.isArray(rows) ? rows : [];
}

const normProviderId = (v) => String(v == null ? "" : v).trim().replace(/\.0+$/, "");

// HIZ: Sheet'e yazmadan önce kolon kırp. İki mod (kaynak yapılandırmasından):
//   writeKeepCols (whitelist) → yalnız bu başlıkları tut. Hiçbiri eşleşmezse DOKUNMA (güvenlik).
//   writeDropCols (denylist)  → bu başlıkları düş, gerisini tut (yeni kolonlar fail-safe korunur).
// Başlık eşleşmesi kenar-boşluğu toleranslı; orijinal kolon sırası korunur.
function applyWriteTrim(columns, rows, src) {
  if (!Array.isArray(columns) || !columns.length) return { columns, rows };
  const norm = (c) => String(c == null ? "" : c).trim();
  let keep;
  if (Array.isArray(src.writeKeepCols) && src.writeKeepCols.length) {
    const want = new Set(src.writeKeepCols.map(norm));
    keep = columns.map((c, i) => (want.has(norm(c)) ? i : -1)).filter((i) => i >= 0);
    if (!keep.length) return { columns, rows }; // hiçbiri yoksa eski/farklı başlık — bozma
  } else if (Array.isArray(src.writeDropCols) && src.writeDropCols.length) {
    const drop = new Set(src.writeDropCols.map(norm));
    keep = columns.map((c, i) => (drop.has(norm(c)) ? -1 : i)).filter((i) => i >= 0);
  } else {
    return { columns, rows };
  }
  return {
    columns: keep.map((i) => columns[i]),
    rows: (rows || []).map((r) => keep.map((i) => r[i])),
  };
}

// BİR KEZ: Provider_Flag_Old'u yenileme (ALL_new RÇİ) provider'larına indirir. Eşleşmeyen
// provider'ların + hiç eşleşmeyen satırların hepsi silinir (eski veri; güncel firmalar için
// güncel Provider_Flag kullanılır). GET/POST ?action=prune_flag_old ile tetiklenir.
async function pruneFlagOld() {
  const OLD_TAB = "Provider_Flag_Old";
  const yenSrc = DASHBOARD_SOURCES.find((s) => s.urlEnv);
  const renProviders = new Set();
  if (yenSrc) {
    try {
      const rows = await fetchExternalRows(yenSrc);
      rows.forEach((r) => { const p = normProviderId(r["RÇİ"]); if (p) renProviders.add(p); });
    } catch {}
  }
  if (!renProviders.size) {
    return Response.json({ ok: false, error: "Yenileme (RÇİ) provider'ları alınamadı — prune iptal" }, { status: 400 });
  }
  let old = [];
  try { old = await readMatrixFromSheet({ tab: OLD_TAB }); } catch {}
  if (!old.length) return Response.json({ ok: false, error: `${OLD_TAB} boş/okunamadı` }, { status: 400 });
  const hdr = old[0];
  const pidCol = hdr.findIndex((h) => /provider\s*id/i.test(String(h ?? "")));
  if (pidCol < 0) return Response.json({ ok: false, error: "Provider ID kolonu bulunamadı" }, { status: 400 });
  const kept = [];
  const delProv = new Set();
  for (let r = 1; r < old.length; r++) {
    const p = normProviderId(old[r][pidCol]);
    if (p && renProviders.has(p)) kept.push(old[r]);
    else if (p) delProv.add(p);
  }
  await overwriteSheetTab([hdr, ...kept], { tab: OLD_TAB });
  return Response.json({
    ok: true, action: "prune_flag_old", tab: OLD_TAB,
    before: old.length - 1, after: kept.length, deletedRows: (old.length - 1) - kept.length,
    deletedProviders: delProv.size, renewalProviders: renProviders.size,
  });
}

// BAKIM: Arama_Ham'ı kayan pencereye indir + kullanılmayan kolonları düş. Tek overwrite.
// İki iş bir arada: (1) son `keepDays` günden eski çağrıları at (Arama Tarihi'ne göre; çözülemeyen
// yaş KORUNUR), (2) writeKeepCols ile 9 kolona kırp. İlk çalıştırma 13→9 kolona indirir → sonraki
// append'ler mevcut 9-kolon başlığına hizalanıp otomatik dar kalır. GET/POST ?action=prune_arama_ham
// (opsiyonel ?days=N ile pencereyi geçersiz kıl). Idempotent; tekrar çalıştırmak güvenli.
async function pruneAramaHam(daysOverride) {
  const src = DASHBOARD_SOURCES.find((s) => s.key === "cagri");
  const TAB = src?.tab || "Arama_Ham";
  const dateCol = src?.pruneDateCol || "Arama Tarihi";
  const keepDays = Number.isFinite(daysOverride) && daysOverride > 0 ? daysOverride : (src?.pruneKeepDays || 180);
  let m = [];
  try { m = await readMatrixFromSheet({ tab: TAB }); } catch {}
  if (!m.length) return Response.json({ ok: false, error: `${TAB} boş/okunamadı` }, { status: 400 });
  const hdr = m[0].map((h) => String(h ?? "").trim());
  const dIdx = hdr.indexOf(dateCol);
  if (dIdx < 0) return Response.json({ ok: false, error: `"${dateCol}" kolonu bulunamadı` }, { status: 400 });

  const cutoff = Date.now() - keepDays * 86400000;
  const kept = [];
  let droppedOld = 0, undated = 0;
  for (let r = 1; r < m.length; r++) {
    const ms = cellToMs(m[r][dIdx]);
    if (Number.isFinite(ms)) {
      if (ms < cutoff) { droppedOld++; continue; } // pencereden eski → at
    } else { undated++; } // yaşı belirsiz → KORU
    kept.push(m[r]);
  }
  // Kolon kırp (writeKeepCols eşleşen başlıklar; hiçbiri yoksa tüm kolonları koru — güvenlik).
  const keepCols = Array.isArray(src?.writeKeepCols) ? src.writeKeepCols.map((c) => String(c).trim()) : [];
  let colIdx = keepCols.map((c) => hdr.indexOf(c)).filter((i) => i >= 0);
  if (!colIdx.length) colIdx = hdr.map((_, i) => i);
  const outMatrix = [colIdx.map((i) => hdr[i]), ...kept.map((row) => colIdx.map((i) => row[i]))];
  await overwriteSheetTab(outMatrix, { tab: TAB });
  return Response.json({
    ok: true, action: "prune_arama_ham", tab: TAB, keepDays,
    before: m.length - 1, after: kept.length, droppedOld, undatedKept: undated,
    colsBefore: hdr.length, colsAfter: colIdx.length,
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runPipeline(request) {
  const { searchParams } = new URL(request.url);
  // BİR KEZ tetiklenen bakım aksiyonu: Provider_Flag_Old'u yenileme provider'larına indir.
  if (searchParams.get("action") === "prune_flag_old") {
    try { return await pruneFlagOld(); }
    catch (err) { return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }); }
  }
  // BAKIM: Arama_Ham kayan pencere + 9-kolon indirgeme (periyodik çalıştırılabilir).
  if (searchParams.get("action") === "prune_arama_ham") {
    try { return await pruneAramaHam(Number(searchParams.get("days"))); }
    catch (err) { return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 }); }
  }
  const only = searchParams.get("only");
  // except: bazı kaynakları bu çalıştırmadan HARİÇ tut (virgülle çoklu). Kullanım:
  // istemci run'ı ikiye böler — ?except=yenileme (Qlik kaynakları) + ?only=yenileme
  // (Apps Script cache) PARALEL çağrılır; tek istekte toplam süre Vercel 120sn
  // fonksiyon limitini aşıyordu (düz-metin "An error occurred" → JSON parse hatası).
  const except = (searchParams.get("except") || "").split(",").map((s) => s.trim()).filter(Boolean);
  let sources = only ? DASHBOARD_SOURCES.filter((s) => s.key === only) : DASHBOARD_SOURCES;
  if (!only && except.length) sources = sources.filter((s) => !except.includes(s.key));
  if (!sources.length) {
    return Response.json({ ok: false, error: `Kaynak bulunamadı: ${only || "(boş)"}` }, { status: 400 });
  }

  const out = { ok: true, updatedAt: new Date().toISOString() };

  // İstek-kapsamlı Qlik oturum HAVUZU: her app'i BİR KEZ aç, o app'in tüm kaynaklarında aynı
  // doc'u yeniden kullan (General 3×→1×, Executive 2×→1× açılıştan kurtulur; handshake azalır).
  // Kaynaklar SIRALI işlendiğinden paylaşım güvenli — "Exclusive request aborted" yalnız aynı
  // app'e PARALEL istek atınca olur (bkz. istemci except/only ayrımı). Havuz İSTEK-KAPSAMLI
  // (module-level DEĞİL) ki eşzamanlı çağrılar aynı doc'u paylaşıp birbirine seçim sızdırmasın.
  const docPool = new Map(); // appId -> { session, global, doc }
  async function getDoc(appId) {
    let e = docPool.get(appId);
    if (!e) { e = await openQlikDoc(appId); docPool.set(appId, e); }
    return e.doc;
  }
  async function closePool() {
    for (const e of docPool.values()) { try { await e.session.close(); } catch {} }
    docPool.clear();
  }
  // withQlikDoc'un havuzlu karşılığı (aynı imza). Kapatma finally'de topluca yapılır.
  // ⚠️ Paylaşılan doc'ta önceki kaynağın seçimi sızmasın diye her okuma KENDİ başında
  // clearAll yapar; bu garanti aşağıdaki tüm dallarda mevcut (overwrite dalı da koşulsuz).
  async function withPooledDoc(appId, cb) { return cb({ doc: await getDoc(appId) }); }

  try {
    for (const src of sources) {
      // ── CANLI URL kaynağı (ör. RENEWAL_DATA): cacheTab varsa buraya YAZILIR (açılış
      // hızlansın diye data route sekmeden okur); yoksa data route canlı çeker.
      if (src.urlEnv) {
        if (src.cacheTab) {
          try {
            const liveRows = await fetchExternalRows(src);
            if (liveRows.length) {
              // Satır nesneleri → matris (başlık = tüm satırların anahtar birleşimi, ilk görülme sırası).
              const keys = [];
              const seen = {};
              liveRows.forEach((r) => Object.keys(r || {}).forEach((k) => { if (!seen[k]) { seen[k] = 1; keys.push(k); } }));
              const matrix = [keys, ...liveRows.map((r) => keys.map((k) => {
                const v = r ? r[k] : "";
                return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : v);
              }))];
              await overwriteSheetTab(matrix, { tab: src.cacheTab });
              out[src.key] = { mode: "live-cache", rows: liveRows.length, tab: src.cacheTab };
            } else {
              // Boş yanıt geldiyse mevcut cache'i EZME (eski veri kalır, veri kaybı olmaz).
              out[src.key] = { mode: "live-cache", rows: 0, tab: src.cacheTab, note: "boş yanıt — cache korundu" };
            }
          } catch (e) {
            out[src.key] = { mode: "live-cache", tab: src.cacheTab, error: String(e?.message ?? e) };
          }
        } else {
          out[src.key] = { mode: "live", tab: null };
        }
        continue;
      }

      // ── STATİK kaynak (ör. Provider_Flag_Old): elle doldurulmuş sekme, Qlik yok.
      // run route yazmaz; data route sekmeyi olduğu gibi okur.
      if (src.static) {
        out[src.key] = { mode: "static", tab: src.tab };
        continue;
      }

      // ── ARTIMLI EKLEME (append): yalnız yeni satırları çek + Sheet'e EKLE ──────
      if (src.appendById) {
        let existing = [];
        try {
          existing = await readMatrixFromSheet({ tab: src.tab });
        } catch {
          existing = [];
        }
        const header = existing.length ? existing[0].map((h) => String(h ?? "").trim()) : null;

        // Mevcut sekmedeki en büyük id (yüksek-su-işareti) + tüm mevcut id'ler (dedupe).
        let maxId = 0;
        const existingIds = new Set();
        if (header) {
          const idc = header.indexOf(src.appendById);
          if (idc >= 0) {
            for (let r = 1; r < existing.length; r++) {
              const raw = existing[r]?.[idc];
              const n = Number(raw);
              if (Number.isFinite(n)) {
                if (n > maxId) maxId = n;
                existingIds.add(String(raw).trim());
              }
            }
          }
        }

        // Qlik: yalnız id > maxId olan (yeni) satırları oku. maxId=0 → ilk tam yükleme.
        // KRİTİK: id > maxId eşleşmesi YOKSA seçim uygulanmaz → obje TÜM satırları döner.
        // Bu durumda (senkron, yeni yok) hiç çekme — yoksa tüm veri tekrar eklenirdi.
        const fresh = await withPooledDoc(src.appId, async ({ doc }) => {
          await doc.clearAll(false);
          if (maxId > 0) {
            const sel = await selectFieldGreaterThan(doc, src.appendById, maxId);
            if (!sel.selected) return { columns: [], rows: [] }; // yeni satır yok
          }
          return fetchObjectData(doc, src.objectId);
        });

        if (!header) {
          // Sekme boş/yok → başlık + tüm satırlar (overwrite ile kur). writeKeepCols varsa
          // yalnız kullanılan kolonlar yazılır (append sonraki turlarda bu başlığa hizalanır).
          const ft = applyWriteTrim(fresh.columns, fresh.rows, src);
          const sheet = await overwriteSheetTab([ft.columns, ...ft.rows], { tab: src.tab });
          out[src.key] = { mode: "full", rows: ft.rows.length, columns: ft.columns.length, tab: src.tab, sheetUrl: sheet.sheetUrl };
        } else {
          // DEDUPE: id'si zaten sekmede olan satırları at (çift-eklemeye karşı emniyet).
          // Sonra mevcut BAŞLIK sırasına hizala ve EKLE.
          const freshIdc = fresh.columns.indexOf(src.appendById);
          const colIdx = header.map((h) => fresh.columns.indexOf(h));
          const aligned = fresh.rows
            .filter((row) => freshIdc < 0 || !existingIds.has(String(row[freshIdc]).trim()))
            .map((row) => colIdx.map((ci) => (ci >= 0 ? row[ci] : "")));
          if (aligned.length) await writeMatrixToSheet(aligned, { tab: src.tab });
          out[src.key] = { mode: "append", rows: aligned.length, maxIdBefore: maxId, tab: src.tab };
        }
        continue;
      }

      // ── SEKME-KOLONUNDAN FİLTRELİ ÇEKİM: id'leri başka sekmeden oku → Qlik'te toplu
      // seç (selectMultiple) → çek → overwrite. (Örn: onboarding sözleşmeleri — yalnız
      // onboarding provider'ları; obje seçimsizken 0 satır + 114k+ provider olduğundan şart.)
      if (src.filterByTabColumn) {
        const fb = src.filterByTabColumn;
        let ids = [];
        try {
          const m = await readMatrixFromSheet({ tab: fb.tab });
          if (m && m.length > 1) {
            const hdr = m[0].map((h) => String(h ?? "").trim());
            const ci = hdr.indexOf(fb.col);
            if (ci >= 0) {
              ids = [...new Set(m.slice(1).map((r) => String(r[ci] ?? "").trim().replace(/\.0+$/, "")).filter(Boolean))];
            }
          }
        } catch {
          ids = [];
        }
        if (!ids.length) {
          out[src.key] = { mode: "skip", reason: `${fb.tab}.${fb.col} boş/okunamadı (önce onboarding çalışmalı)`, tab: src.tab };
          continue;
        }
        const cdata = await withPooledDoc(src.appId, async ({ doc }) => {
          await doc.clearAll(false);
          await selectMultiple(doc, fb.field, ids);
          return fetchObjectData(doc, src.objectId);
        });
        const cTrim = applyWriteTrim(cdata.columns, cdata.rows, src);
        const csheet = await overwriteSheetTab([cTrim.columns, ...cTrim.rows], { tab: src.tab });
        out[src.key] = { rows: cdata.rows.length, columns: cTrim.columns.length, tab: src.tab, sheetUrl: csheet.sheetUrl, providers: ids.length };
        continue;
      }

      // ── HARİCİ CANLI SHEET (externalSheet): run'da yapılacak iş yok — data route
      //    her açılışta doğrudan okur. Qlik'e gitme, atla.
      if (src.externalSheet) {
        out[src.key] = { mode: "external_live", skipped: true };
        continue;
      }

      // ── AY BAZLI PIVOT ÇEKİM (perMonthField): obje qMode=P (pivot). Her ay değeri
      //    SEÇİLİR → getHyperCubePivotData ile PY (sol) + ölçüler (veri) okunur → ay
      //    etiketlenir → biriktir → overwrite. Verimlilik zaten hazır ölçü. KRİTİK:
      //    "%year_month_num" seçilir; "Tarih" DEĞİL (o tek güne indirirdi).
      if (src.perMonthField) {
        const res = await withPooledDoc(src.appId, async ({ doc }) => {
          const obj = await doc.getObject(src.objectId);
          const lay0 = await obj.getLayout();
          const hc0 = lay0.qHyperCube || {};
          const measTitles = (hc0.qMeasureInfo || []).map((m) => m.qFallbackTitle);
          const width = (hc0.qSize?.qcx || 0) + (hc0.qNoOfLeftDims || 0);
          await doc.clearAll(false);
          const fv = await getFieldValues(doc, src.perMonthField, src.perMonthMax || 500);
          const months = (fv.values || []).map((v) => String(v ?? "").trim()).filter(Boolean);
          const columns = [src.perMonthField, "PY", ...measTitles];
          const allRows = [];
          for (const mv of months) {
            try {
              await doc.clearAll(false);
              const sel = await selectExact(doc, src.perMonthField, mv);
              if (!sel.selected) continue;
              const lay = await obj.getLayout();
              const h = Math.min(lay.qHyperCube?.qSize?.qcy || 0, 1000);
              if (!h) continue;
              const pages = await obj.getHyperCubePivotData("/qHyperCubeDef", [{ qTop: 0, qLeft: 0, qWidth: Math.max(1, width), qHeight: h }]);
              const p = pages?.[0] || {};
              const left = (p.qLeft || []).map((n) => n.qText);   // PY adları (en dış sol boyut)
              const data = (p.qData || []).map((r) => r.map((c) => c.qText)); // ölçü değerleri
              for (let i = 0; i < data.length; i++) allRows.push([mv, (left[i] != null ? left[i] : ""), ...data[i]]);
            } catch (e) { /* tek ay hata verirse diğerlerini bozma */ }
          }
          await doc.clearAll(false);
          return { columns, rows: allRows, monthsSeen: months.length };
        });
        const sheet = await overwriteSheetTab([res.columns, ...res.rows], { tab: src.tab });
        out[src.key] = { mode: "per_month_pivot", monthsSeen: res.monthsSeen, rows: res.rows.length, columns: res.columns.length, tab: src.tab, sheetUrl: sheet.sheetUrl };
        continue;
      }

      // ── TAM YAZMA (overwrite): kaynağın tamamını çekip sekmenin üzerine yaz ────
      const data = await withPooledDoc(src.appId, async ({ doc }) => {
        // Paylaşılan doc'ta önceki kaynağın seçimi sızmasın diye HER ZAMAN temiz başla
        // (ör. onboarding'in seçimi yok; eski davranışta clearAll atlanıyordu — havuzda şart).
        await doc.clearAll(false);
        // En güncel snapshot'a sabitle (kararsız satır sayısını önler).
        if (src.latestDateField) await selectLatestDate(doc, src.latestDateField);
        if (src.selections?.length) {
          for (const sel of src.selections) await selectExact(doc, sel.field, sel.value);
        }
        return fetchObjectData(doc, src.objectId, { withNum: !!src.numeric });
      });

      // numeric kaynak: saf sayı hücrelerini ham qNum ile yaz (biçimli "11,332" → 11332),
      // böylece dashboard num() 1000× hatası yapmaz. Tarih ("2026-07-01") ve yüzdeli
      // ("73 (44.24%)") değerler qText kalır (parseTarih/getDonusOran için).
      let rows = data.rows;
      if (src.numeric && data.rowsNum) {
        const NUMLIKE = /^-?[\d.,]+$/;
        rows = data.rows.map((row, ri) =>
          row.map((text, ci) => {
            const n = data.rowsNum[ri]?.[ci];
            // Saf sayı → ham qNum (2 ondalığa yuvarla: temiz görünüm, doğru matematik).
            return Number.isFinite(n) && NUMLIKE.test(String(text ?? "").trim())
              ? Math.round(n * 100) / 100
              : text;
          })
        );
      }

      // ── ALAN JOIN (joinFields): başka bir app'ten 2 alanı çek, anahtar kolonla
      // eşleyip EK KOLON olarak ekle. Örn: provider_segment → Dashboard_Firma (ayrı sheet yok).
      let columns = data.columns;
      if (src.joinFields) {
        const jf = src.joinFields;
        const lookup = await withPooledDoc(jf.appId, async ({ doc }) => {
          await doc.clearAll(false);
          if (jf.selections?.length) {
            for (const sel of jf.selections) await selectExact(doc, sel.field, sel.value);
          }
          const fd = await fetchFieldsData(doc, [jf.keyField, jf.valueField]);
          const map = {};
          for (const r of fd.rows) {
            const k = String(r[0] ?? "").trim().replace(/\.0+$/, "");
            if (k) map[k] = r[1];
          }
          return map;
        });
        const keyIdx = columns.indexOf(jf.joinOn);
        columns = [...columns, jf.asColumn];
        rows = rows.map((row) => {
          const k = keyIdx >= 0 ? String(row[keyIdx] ?? "").trim().replace(/\.0+$/, "") : "";
          return [...row, k && lookup[k] != null ? lookup[k] : ""];
        });
      }

      // ── ÜYELİK JOIN (joinMembership): başka app'ten SEÇİMLİ bir alanın DEĞER KÜMESİNİ
      // çek, anahtar kolonla üyelik testi yap → presentValue/absentValue kolonu. Örn: aktif
      // özel fiyatlı provider_id kümesi (Executive Dashboard: en güncel date + has_special_offer=1)
      // → RÇİ ∈ küme ? "Var" : "Yok" = "Aktif Özel Fiyat" kolonu. joinFields (key→value) yerine
      // küme-üyeliği; ayrıca latestDateField ile en güncel snapshot'a sabitlenir.
      if (src.joinMembership) {
        const jm = src.joinMembership;
        const set = await withPooledDoc(jm.appId, async ({ doc }) => {
          await doc.clearAll(false);
          if (jm.latestDateField) await selectLatestDate(doc, jm.latestDateField);
          if (jm.selections?.length) { for (const sel of jm.selections) await selectExact(doc, sel.field, sel.value); }
          const fd = await fetchFieldsData(doc, [jm.keyField]);
          return new Set(fd.rows.map((r) => String(r[0] ?? "").trim().replace(/\.0+$/, "")).filter(Boolean));
        });
        const mIdx = columns.indexOf(jm.joinOn);
        columns = [...columns, jm.asColumn];
        rows = rows.map((row) => {
          const k = mIdx >= 0 ? String(row[mIdx] ?? "").trim().replace(/\.0+$/, "") : "";
          return [...row, (k && set.has(k)) ? jm.presentValue : jm.absentValue];
        });
      }

      // HIZ: kullanılmayan kolonları Sheet'e yazmadan düş (join kolonları eklendikten SONRA,
      // ki provider_segment/Aktif Özel Fiyat korunsun). Arşiv de bu kırpılmış columns/rows'u kullanır.
      const wTrim = applyWriteTrim(columns, rows, src);
      columns = wTrim.columns; rows = wTrim.rows;

      const sheet = await overwriteSheetTab([columns, ...rows], { tab: src.tab });
      out[src.key] = {
        rows: rows.length,
        columns: columns.length,
        tab: src.tab,
        sheetUrl: sheet.sheetUrl,
      };

      // ── AY 15'İ ARŞİVİ: güncel flag snapshot'ını Provider_Flag_Old'a tarihi veri olarak ekle.
      // Koşul: bugün ≥ ayın 15'i VE bu ayın snapshot'ı Old'da YOK (idempotent). Aylar cellMonth ile.
      if (src.archiveToOld) {
        try {
          const now = new Date();
          if (now.getDate() >= 15) {
            const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            let old = [];
            try { old = await readMatrixFromSheet({ tab: src.archiveToOld }); } catch { old = []; }
            const oldHdr = old.length ? old[0].map((h) => String(h ?? "").trim()) : columns;
            const dIdx = oldHdr.findIndex((h) => /date|tarih/i.test(h));
            const monthsInOld = new Set();
            if (old.length && dIdx >= 0) {
              for (let r = 1; r < old.length; r++) {
                const mo = cellMonth(old[r]?.[dIdx]);
                if (mo) monthsInOld.add(mo);
              }
            }
            if (!old.length) {
              out[src.key].archived = { month: curMonth, skipped: "Old sekmesi boş (başlık elle kurulmalı)" };
            } else if (monthsInOld.has(curMonth)) {
              out[src.key].archived = { month: curMonth, skipped: "zaten arşivlenmiş" };
            } else {
              const colIdx = oldHdr.map((h) => columns.indexOf(h));
              const aligned = rows.map((row) => colIdx.map((ci) => (ci >= 0 ? row[ci] : "")));
              if (aligned.length) await writeMatrixToSheet(aligned, { tab: src.archiveToOld });
              out[src.key].archived = { month: curMonth, rows: aligned.length, tab: src.archiveToOld };
            }
          }
        } catch (e) {
          out[src.key].archiveError = String(e?.message ?? e);
        }
      }
    }
    // Son sync (çekim) zamanını Dashboard_Meta'ya yaz → dashboard "son güncelleme" gösterir.
    try {
      await overwriteSheetTab([["updated_at"], [out.updatedAt]], { tab: "Dashboard_Meta" });
    } catch {
      // meta yazımı kritik değil; başarısızlığı yut
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  } finally {
    // Havuzdaki tüm Qlik oturumlarını topluca kapat (başarı VEYA hata farketmez).
    await closePool();
  }
}

export const POST = withAccess(["updatedhq","ozelfiyat"], (request) => runPipeline(request));
export const GET = withAccess(["updatedhq","ozelfiyat"], (request) => runPipeline(request));
