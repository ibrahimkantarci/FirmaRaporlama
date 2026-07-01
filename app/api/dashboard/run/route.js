// app/api/dashboard/run/route.js
// Dashboard pipeline (yazma): yapılandırılmış Qlik objelerini oku → Sheet sekmelerine yaz.
// Tek tek (?only=onboarding) veya tümü çalıştırılabilir. /api/fiyat/run ile aynı desen.
import { withAccess } from "../../../../lib/api";
import { withQlikDoc, fetchObjectData, selectExact, selectLatestDate } from "../../../../lib/qlik";
import { overwriteSheetTab } from "../../../../lib/sheets";
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
