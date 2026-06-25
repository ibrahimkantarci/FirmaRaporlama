import { withQlikDoc, getCustomerYoYFull } from "../../../../lib/qlik";
import { writeMatrixToSheet } from "../../../../lib/sheets";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: uzun Qlik okumalari icin

// /api/qlik/export?id=58367
// Seçili müşteri için bu yıl + geçen yıl tüm sütunları çeker ve Google Sheet'e yazar.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const objectId = process.env.QLIK_OBJECT_ID;

  if (!id) {
    return Response.json(
      { ok: false, error: "customer id gerekli. Örnek: /api/qlik/export?id=58367" },
      { status: 400 }
    );
  }
  if (!objectId) {
    return Response.json({ ok: false, error: "QLIK_OBJECT_ID tanımlı değil." }, { status: 400 });
  }

  try {
    const data = await withQlikDoc(({ doc }) => getCustomerYoYFull(doc, objectId, id));
    const sheet = await writeMatrixToSheet(data.matrix);
    const { matrix, ...summary } = data; // büyük matris'i cevaba koymuyoruz
    return Response.json({ ok: true, stage: "export", ...summary, sheet });
  } catch (err) {
    return Response.json(
      { ok: false, stage: "export", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
