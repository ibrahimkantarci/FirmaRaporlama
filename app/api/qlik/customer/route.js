import { withQlikDoc, getCustomerProviders } from "../../../../lib/qlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/qlik/customer?id=58367
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const objectId = process.env.QLIK_OBJECT_ID;

  if (!id) {
    return Response.json(
      { ok: false, error: "customer id gerekli. Örnek: /api/qlik/customer?id=58367" },
      { status: 400 }
    );
  }
  if (!objectId) {
    return Response.json(
      { ok: false, error: "QLIK_OBJECT_ID tanımlı değil." },
      { status: 400 }
    );
  }

  try {
    const data = await withQlikDoc(({ doc }) => getCustomerProviders(doc, objectId, id));
    return Response.json({ ok: true, stage: "customer-providers", ...data });
  } catch (err) {
    return Response.json(
      { ok: false, stage: "customer-providers", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
