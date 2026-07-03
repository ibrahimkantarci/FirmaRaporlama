// app/api/dashboard/run/route.js
// Dashboard pipeline (yazma): yapılandırılmış Qlik objelerini oku → Sheet sekmelerine yaz.
// Tek tek (?only=onboarding) veya tümü çalıştırılabilir. /api/fiyat/run ile aynı desen.
import { withAccess } from "../../../../lib/api";
import {
  withQlikDoc,
  fetchObjectData,
  fetchFieldsData,
  selectExact,
  selectLatestDate,
  selectFieldGreaterThan,
  selectMultiple,
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
  const only = searchParams.get("only");
  const sources = only
    ? DASHBOARD_SOURCES.filter((s) => s.key === only)
    : DASHBOARD_SOURCES;
  if (!sources.length) {
    return Response.json({ ok: false, error: `Kaynak bulunamadı: ${only || "(boş)"}` }, { status: 400 });
  }

  const out = { ok: true, updatedAt: new Date().toISOString() };
  try {
    for (const src of sources) {
      // ── CANLI URL kaynağı (ör. RENEWAL_DATA): Sheet'e yazılmaz, data route canlı çeker.
      if (src.urlEnv) {
        out[src.key] = { mode: "live", tab: null };
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
        const fresh = await withQlikDoc(src.appId, async ({ doc }) => {
          await doc.clearAll(false);
          if (maxId > 0) {
            const sel = await selectFieldGreaterThan(doc, src.appendById, maxId);
            if (!sel.selected) return { columns: [], rows: [] }; // yeni satır yok
          }
          return fetchObjectData(doc, src.objectId);
        });

        if (!header) {
          // Sekme boş/yok → başlık + tüm satırlar (overwrite ile kur).
          const sheet = await overwriteSheetTab([fresh.columns, ...fresh.rows], { tab: src.tab });
          out[src.key] = { mode: "full", rows: fresh.rows.length, tab: src.tab, sheetUrl: sheet.sheetUrl };
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
        const cdata = await withQlikDoc(src.appId, async ({ doc }) => {
          await doc.clearAll(false);
          await selectMultiple(doc, fb.field, ids);
          return fetchObjectData(doc, src.objectId);
        });
        const csheet = await overwriteSheetTab([cdata.columns, ...cdata.rows], { tab: src.tab });
        out[src.key] = { rows: cdata.rows.length, columns: cdata.columns.length, tab: src.tab, sheetUrl: csheet.sheetUrl, providers: ids.length };
        continue;
      }

      // ── TAM YAZMA (overwrite): kaynağın tamamını çekip sekmenin üzerine yaz ────
      const data = await withQlikDoc(src.appId, async ({ doc }) => {
        // Temiz durumdan başla: clearAll işaretliyse, seçim VEYA en-yeni-tarih varsa.
        if (src.clearAll || src.selections?.length || src.latestDateField) {
          await doc.clearAll(false);
        }
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
        const lookup = await withQlikDoc(jf.appId, async ({ doc }) => {
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
  }
}

export const POST = withAccess("dashboard", (request) => runPipeline(request));
export const GET = withAccess("dashboard", (request) => runPipeline(request));
