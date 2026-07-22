// app/api/qlik/probe/route.js — KAPSAMLI TEŞHİS (salt-okunur). withAccess("erce").
// Objenin hypercube meta'sını (mod/boyut/ölçü başlıkları/sıra), pivot verisini,
// property tree'deki ölçü ifadelerini ve PY alan değerlerini döker.
import { withQlikDoc, getFieldValues } from "@/lib/qlik";
import { withAccess } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_APP = "c1b56893-6c64-45fe-8624-2d4891707f5b";
const DEFAULT_OBJECT = "172835cd-6a60-4ee6-bfd1-de34fd985d37";

export const GET = withAccess("erce", async (request) => {
  const { searchParams } = new URL(request.url);
  const app = searchParams.get("app") || DEFAULT_APP;
  const object = searchParams.get("object") || DEFAULT_OBJECT;
  try {
    const r = await withQlikDoc(app, async ({ doc }) => {
      const obj = await doc.getObject(object);
      const out = {};

      // 1) LAYOUT hypercube meta
      try {
        const lay = await obj.getLayout();
        const hc = lay.qHyperCube || {};
        out.layout = {
          qType: lay?.qInfo?.qType,
          qMode: hc.qMode,
          qSize: hc.qSize,
          qNoOfLeftDims: hc.qNoOfLeftDims,
          qColumnOrder: hc.qColumnOrder,
          qEffectiveInterColumnSortOrder: hc.qEffectiveInterColumnSortOrder,
          dimTitles: (hc.qDimensionInfo || []).map((d) => ({ t: d.qFallbackTitle, err: d.qError || null })),
          measTitles: (hc.qMeasureInfo || []).map((m) => ({ t: m.qFallbackTitle, err: m.qError || null })),
        };
      } catch (e) { out.layout = { error: String(e?.message ?? e) }; }

      // 2) PIVOT verisi (ilk 3 satır) — pivot ise düz okuma bozuluyordu
      try {
        const pv = await obj.getHyperCubePivotData("/qHyperCubeDef", [{ qTop: 0, qLeft: 0, qWidth: 20, qHeight: 8 }]);
        const p = pv?.[0];
        out.pivot = {
          left: (p?.qLeft || []).map((n) => n.qText),
          top: (p?.qTop || []).map((n) => n.qText),
          data: (p?.qData || []).slice(0, 3).map((row) => row.map((c) => c.qText)),
        };
      } catch (e) { out.pivot = { error: String(e?.message ?? e) }; }

      // 3) PROPERTY TREE — gerçek ölçü ifadeleri / boyut alanları
      try {
        const tree = await obj.getFullPropertyTree();
        const q = tree?.qProperty || {};
        const hcd = q.qHyperCubeDef || {};
        out.def = {
          extendsId: q.qExtendsId || null,
          dims: (hcd.qDimensions || []).map((d) => ({ fieldDefs: d?.qDef?.qFieldDefs, lib: d?.qLibraryId || null })),
          measures: (hcd.qMeasures || []).map((m) => ({ expr: m?.qDef?.qDef, label: m?.qDef?.qLabel, lib: m?.qLibraryId || null })),
          childCount: (tree?.qChildren || []).length,
        };
      } catch (e) { out.def = { error: String(e?.message ?? e) }; }

      // 4) PY alan adayları
      out.pyFields = {};
      for (const f of ["account_manager", "account_manager_selected", "py_account_manager_key"]) {
        try { out.pyFields[f] = (await getFieldValues(doc, f, 10)).values; } catch (e) {}
      }
      return out;
    });
    return Response.json({ ok: true, app, object, ...r });
  } catch (err) {
    return Response.json({ ok: false, app, object, error: String(err?.message ?? err) }, { status: 500 });
  }
});
