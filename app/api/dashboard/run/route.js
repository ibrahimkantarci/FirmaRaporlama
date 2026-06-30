// app/api/dashboard/run/route.js
// Dashboard pipeline (yazma): yapılandırılmış Qlik objelerini oku → Sheet sekmelerine yaz.
// Tek tek (?only=onboarding) veya tümü çalıştırılabilir. /api/fiyat/run ile aynı desen.
import { withAccess } from "../../../../lib/api";
import { withQlikDoc, fetchObjectData, selectExact } from "../../../../lib/qlik";
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
        if (src.selections?.length) {
          await doc.clearAll(false);
          for (const sel of src.selections) await selectExact(doc, sel.field, sel.value);
        }
        return fetchObjectData(doc, src.objectId);
      });
      const sheet = await overwriteSheetTab([data.columns, ...data.rows], { tab: src.tab });
      out[src.key] = {
        rows: data.rows.length,
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
