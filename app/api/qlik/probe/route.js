// app/api/qlik/probe/route.js
// KEŞİF UCU: bir Qlik objesinin kolon başlıklarını + birkaç örnek satırını döndürür.
// Amaç: yeni bir kaynağı DASHBOARD_SOURCES'a bağlamadan önce gerçek kolon adlarını
// görmek (eşleme uydurmamak). Salt-okunur; yalnız 5 satır çeker. withAccess("erce").
// Kullanım:  /api/qlik/probe            (varsayılan: verimlilik objesi)
//            /api/qlik/probe?app=<id>&object=<id>&rows=5
import { withQlikDoc, fetchObjectData } from "@/lib/qlik";
import { withAccess } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verimlilik dashboard'u (kullanıcı sağladı) — PY Sonitel app'i içinde bir tablo objesi.
const DEFAULT_APP = "c1b56893-6c64-45fe-8624-2d4891707f5b";
const DEFAULT_OBJECT = "172835cd-6a60-4ee6-bfd1-de34fd985d37";

export const GET = withAccess("erce", async (request) => {
  const { searchParams } = new URL(request.url);
  const app = searchParams.get("app") || DEFAULT_APP;
  const object = searchParams.get("object") || DEFAULT_OBJECT;
  const rows = Math.min(50, Math.max(1, parseInt(searchParams.get("rows") || "5", 10)));
  try {
    const res = await withQlikDoc(app, ({ doc }) => fetchObjectData(doc, object, { maxRows: rows, withNum: true }));
    return Response.json({
      ok: true,
      app,
      object,
      objectType: res.objectType,
      columns: res.columns,
      totalRows: res.totalRows,
      returnedRows: res.returnedRows,
      sampleRows: res.rows,
      grandTotals: res.grandTotals,
    });
  } catch (err) {
    return Response.json({ ok: false, app, object, error: String(err?.message ?? err) }, { status: 500 });
  }
});
