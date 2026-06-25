import { withQlikDoc, getFieldList, getFieldValues } from "../../../../lib/qlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/qlik/fields            -> uygulamadaki alan adları
// /api/qlik/fields?name=Şehir -> o alanın ayrık değerleri
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  try {
    if (name) {
      const data = await withQlikDoc(({ doc }) => getFieldValues(doc, name, 200));
      return Response.json({ ok: true, stage: "field-values", ...data });
    }
    const fields = await withQlikDoc(({ doc }) => getFieldList(doc));
    return Response.json({ ok: true, stage: "field-list", count: fields.length, fields });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
