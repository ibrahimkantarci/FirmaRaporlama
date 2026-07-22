// app/api/qlik/probe/route.js
// KEŞİF UCU (salt-okunur). Bir Qlik objesinin hypercube TANIMINI (boyut alanları +
// ölçü ifadeleri, master item'ler çözülerek) döker — böylece objeyi doğrudan okumak
// yerine aynı boyut/ölçüyle temiz bir session hypercube kurabiliriz. withAccess("erce").
// /api/qlik/probe            (varsayılan: verimlilik objesi)
// /api/qlik/probe?app=<id>&object=<id>
import { withQlikDoc, getFieldValues } from "@/lib/qlik";
import { withAccess } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_APP = "c1b56893-6c64-45fe-8624-2d4891707f5b";
const DEFAULT_OBJECT = "172835cd-6a60-4ee6-bfd1-de34fd985d37";

async function resolveDim(doc, d) {
  if (d?.qLibraryId) {
    try {
      const md = await doc.getDimension(d.qLibraryId);
      const ml = await md.getLayout();
      return { libraryId: d.qLibraryId, fieldDefs: ml?.qDim?.qFieldDefs, labels: ml?.qDim?.qFieldLabels, title: ml?.qMeta?.title };
    } catch (e) { return { libraryId: d.qLibraryId, error: String(e?.message ?? e) }; }
  }
  return { fieldDefs: d?.qDef?.qFieldDefs, labels: d?.qDef?.qFieldLabels };
}
async function resolveMeas(doc, m) {
  if (m?.qLibraryId) {
    try {
      const mm = await doc.getMeasure(m.qLibraryId);
      const ml = await mm.getLayout();
      return { libraryId: m.qLibraryId, expr: ml?.qMeasure?.qDef, label: ml?.qMeasure?.qLabel || ml?.qMeta?.title };
    } catch (e) { return { libraryId: m.qLibraryId, error: String(e?.message ?? e) }; }
  }
  return { expr: m?.qDef?.qDef, label: m?.qDef?.qLabel };
}

export const GET = withAccess("erce", async (request) => {
  const { searchParams } = new URL(request.url);
  const app = searchParams.get("app") || DEFAULT_APP;
  const object = searchParams.get("object") || DEFAULT_OBJECT;
  try {
    const result = await withQlikDoc(app, async ({ doc }) => {
      const obj = await doc.getObject(object);
      let props = null;
      try { props = await obj.getProperties(); }
      catch (e) { try { props = await obj.getEffectiveProperties(); } catch (e2) { props = { error: String(e2?.message ?? e2) }; } }
      const hcd = props?.qHyperCubeDef || {};
      const dims = [];
      for (const d of (hcd.qDimensions || [])) dims.push(await resolveDim(doc, d));
      const meas = [];
      for (const m of (hcd.qMeasures || [])) meas.push(await resolveMeas(doc, m));
      // ay alanları örneği
      let ym = null, ymNum = null;
      try { ym = (await getFieldValues(doc, "yearMonth", 24)).values; } catch (e) {}
      try { ymNum = (await getFieldValues(doc, "%year_month_num", 24)).values; } catch (e) {}
      return { objectType: props?.qInfo?.qType, dimensions: dims, measures: meas, yearMonth: ym, year_month_num: ymNum };
    });
    return Response.json({ ok: true, app, object, ...result });
  } catch (err) {
    return Response.json({ ok: false, app, object, error: String(err?.message ?? err) }, { status: 500 });
  }
});
