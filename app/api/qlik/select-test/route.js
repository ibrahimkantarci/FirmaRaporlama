import { withQlikDoc, selectExact, fetchObjectData } from "../../../../lib/qlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// İzole seçim testi:
//   /api/qlik/select-test?field=customer_id&value=58367
//   /api/qlik/select-test?field=load_date&value=2026-06-24
// Seçimi uygular ve tabloda KALAN satır sayısını döndürür.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");
  const value = searchParams.get("value");
  const objectId = process.env.QLIK_OBJECT_ID;

  if (!field || value === null) {
    return Response.json(
      { ok: false, error: "field ve value gerekli. Örn: ?field=customer_id&value=58367" },
      { status: 400 }
    );
  }

  try {
    const result = await withQlikDoc(async ({ doc }) => {
      const before = await fetchObjectData(doc, objectId, { maxRows: 1 });
      await doc.clearAll(false);
      const selection = await selectExact(doc, field, value);
      const after = await fetchObjectData(doc, objectId, { maxRows: 1 });
      return {
        selection,
        totalRowsBefore: before.totalRows,
        totalRowsAfter: after.totalRows,
      };
    });
    return Response.json({ ok: true, stage: "select-test", field, value, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, stage: "select-test", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
