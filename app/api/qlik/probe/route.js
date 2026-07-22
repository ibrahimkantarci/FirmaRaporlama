// app/api/qlik/probe/route.js
// KEŞİF UCU (salt-okunur). Bir Qlik objesinin kolonları + örnek satırları, AYRICA
// app'in alan adları ve "yıl/ay/dönem" içeren alanların değerleri. Amaç: yeni kaynağı
// bağlamadan gerçek kolon/alan adlarını görmek. withAccess("erce").
// Kullanım:  /api/qlik/probe            (varsayılan: verimlilik objesi + ay-alan taraması)
//            /api/qlik/probe?app=<id>&object=<id>&rows=5
import { withQlikDoc, fetchObjectData, getFieldValues } from "@/lib/qlik";
import { withAccess } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_APP = "c1b56893-6c64-45fe-8624-2d4891707f5b";
const DEFAULT_OBJECT = "172835cd-6a60-4ee6-bfd1-de34fd985d37";

async function listFields(doc) {
  const o = await doc.createSessionObject({
    qInfo: { qType: "FieldList" },
    qFieldListDef: { qShowSystem: false, qShowHidden: false, qShowSemantic: true, qShowSrcTables: true },
  });
  const lay = await o.getLayout();
  const names = (lay?.qFieldList?.qItems || []).map((it) => it.qName);
  try { await doc.destroySessionObject(lay.qInfo.qId); } catch (e) {}
  return names;
}

export const GET = withAccess("erce", async (request) => {
  const { searchParams } = new URL(request.url);
  const app = searchParams.get("app") || DEFAULT_APP;
  const object = searchParams.get("object") || DEFAULT_OBJECT;
  const rows = Math.min(50, Math.max(1, parseInt(searchParams.get("rows") || "5", 10)));
  try {
    const result = await withQlikDoc(app, async ({ doc }) => {
      const out = {};
      // 1) obje: kolonlar + örnek satırlar
      try {
        const ft = await fetchObjectData(doc, object, { maxRows: rows, withNum: false });
        out.object = { objectType: ft.objectType, columns: ft.columns, totalRows: ft.totalRows, sampleRows: ft.rows };
      } catch (e) {
        out.object = { error: String(e?.message ?? e) };
      }
      // 2) app alan adları
      let fields = [];
      try { fields = await listFields(doc); out.fields = fields; }
      catch (e) { out.fields = { error: String(e?.message ?? e) }; }
      // 3) "yıl/ay/dönem/month" içeren alanların değerleri (ay-alanı adını bulmak için)
      const monthLike = (Array.isArray(fields) ? fields : []).filter((f) => /y[ıi]l|(^|[^a-z])ay|month|d[öo]nem/i.test(String(f)));
      out.monthLikeFields = {};
      for (const f of monthLike.slice(0, 8)) {
        try { const fv = await getFieldValues(doc, f, 24); out.monthLikeFields[f] = fv.values; }
        catch (e) { out.monthLikeFields[f] = { error: String(e?.message ?? e) }; }
      }
      return out;
    });
    return Response.json({ ok: true, app, object, ...result });
  } catch (err) {
    return Response.json({ ok: false, app, object, error: String(err?.message ?? err) }, { status: 500 });
  }
});
