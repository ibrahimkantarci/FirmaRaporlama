import { withQlikDoc, fetchObjectData } from "../../../lib/qlik";

// Node.js runtime şart: enigma.js + ws (header'lı WebSocket) Edge'de çalışmaz.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const objectId = process.env.QLIK_OBJECT_ID;
  if (!objectId) {
    return Response.json(
      {
        ok: false,
        stage: "object-data",
        error: "QLIK_OBJECT_ID tanımlı değil. .env.local dosyasına ekleyin.",
      },
      { status: 400 }
    );
  }

  // Önizleme limiti: /api/qlik?limit=10  veya  /api/qlik?limit=all
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const maxRows =
    limitParam === "all" ? Infinity : Number(limitParam) > 0 ? Number(limitParam) : 50;

  try {
    const data = await withQlikDoc(({ doc }) =>
      fetchObjectData(doc, objectId, { maxRows })
    );

    return Response.json({
      ok: true,
      stage: "object-data",
      objectId,
      ...data,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        stage: "object-data",
        error: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}
