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
} from "../../../../lib/qlik";
import { overwriteSheetTab, readMatrixFromSheet, writeMatrixToSheet } from "../../../../lib/sheets";
import { DASHBOARD_SOURCES } from "../../../../lib/dashboard-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runPipeline(request) {
  const { searchParams } = new URL(request.url);
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

      // ── ALAN kaynağı (nesne değil): veri modelinden belirli ALANLARı çek.
      // Seçimleri uygula (ör. is_currently_listing=1) → 2 alanlık cube → sekmeye yaz.
      if (src.fields) {
        const data = await withQlikDoc(src.appId, async ({ doc }) => {
          await doc.clearAll(false);
          if (src.selections?.length) {
            for (const sel of src.selections) await selectExact(doc, sel.field, sel.value);
          }
          return fetchFieldsData(doc, src.fields);
        });
        const sheet = await overwriteSheetTab([data.columns, ...data.rows], { tab: src.tab });
        out[src.key] = {
          rows: data.rows.length,
          columns: data.columns.length,
          tab: src.tab,
          sheetUrl: sheet.sheetUrl,
        };
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

      const sheet = await overwriteSheetTab([data.columns, ...rows], { tab: src.tab });
      out[src.key] = {
        rows: rows.length,
        columns: data.columns.length,
        tab: src.tab,
        sheetUrl: sheet.sheetUrl,
      };
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

export const POST = withAccess("dashboard", (request) => runPipeline(request));
export const GET = withAccess("dashboard", (request) => runPipeline(request));
