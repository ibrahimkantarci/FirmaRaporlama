import {
  withQlikDoc,
  getEngagementData,
  getCustomerYoYFull,
  injectResponseTimes,
} from "../../../../lib/qlik";
import { writeMatrixToSheet } from "../../../../lib/sheets";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: uzun Qlik okumalari icin

const DAY_MS = 86400000;

// /api/qlik/export?id=58367
// 1) Engagement uygulamasından sözleşme verisini çek → "Sozlesme" sekmesine yaz,
//    önceki sözleşme bitişini ve provider dönüş sürelerini (ort/medyan) türet.
// 2) Ana uygulamadan bu yıl + (bitiş - 7 gün) geçen yıl tüm sütunları çek,
//    dönüş sürelerini engagement'tan bas, ana sekmeye yaz.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const objectId = process.env.QLIK_OBJECT_ID;
  const engAppId = process.env.ENGAGEMENT_APP_ID;
  const engObjectId = process.env.ENGAGEMENT_OBJECT_ID;

  if (!id) {
    return Response.json(
      { ok: false, error: "customer id gerekli. Örnek: /api/qlik/export?id=58367" },
      { status: 400 }
    );
  }
  if (!objectId) {
    return Response.json({ ok: false, error: "QLIK_OBJECT_ID tanımlı değil." }, { status: 400 });
  }
  if (!engAppId || !engObjectId) {
    return Response.json(
      { ok: false, error: "ENGAGEMENT_APP_ID / ENGAGEMENT_OBJECT_ID tanımlı değil." },
      { status: 400 }
    );
  }

  try {
    // 1) Engagement (ikinci uygulama) → sözleşme verisi
    const eng = await withQlikDoc(engAppId, ({ doc }) =>
      getEngagementData(doc, engObjectId, id)
    );

    // "Sozlesme" sekmesine blok olarak ekle (üzerine yazmaz; manuel silinir).
    const sozMeta = [
      `Müşteri: ${id}`,
      `Önceki sözleşme bitiş: ${eng.previousContractEnd ?? "-"}`,
      `Aktif provider sayısı: ${eng.activeProviderIds.length}`,
    ];
    const sozMatrix = [sozMeta, eng.table.columns, ...eng.table.rows];
    const sozSheet = await writeMatrixToSheet(sozMatrix, { tab: "Sozlesme" });

    // 2) Ana uygulama → YoY. Geçen yıl = (önceki sözleşme bitişi - 7 gün)'e en yakın.
    const opts =
      eng.previousContractEndMs != null
        ? { lastYearTargetMs: eng.previousContractEndMs - 7 * DAY_MS }
        : { skipLastYear: true };

    const data = await withQlikDoc(({ doc }) =>
      getCustomerYoYFull(doc, objectId, id, opts)
    );
    injectResponseTimes(data, eng.responseByProvider);

    // Dönem toplamlarını (gerçek Qlik grand total) meta satırına göm — rapor okur.
    const fmt = (v) => (v == null ? "" : String(v));
    data.matrix[0].push(
      `EngMedyanBu: ${fmt(eng.totals?.current?.median)}`,
      `EngMedyanGy: ${fmt(eng.totals?.previous?.median)}`,
      `EngOrtBu: ${fmt(eng.totals?.current?.avg)}`,
      `EngOrtGy: ${fmt(eng.totals?.previous?.avg)}`
    );

    const sheet = await writeMatrixToSheet(data.matrix);

    const { matrix, ...summary } = data; // büyük matris'i cevaba koymuyoruz
    return Response.json({
      ok: true,
      stage: "export",
      ...summary,
      previousContractEnd: eng.previousContractEnd,
      currentContractEnd: eng.currentContractEnd,
      activeProviderCount: eng.activeProviderIds.length,
      engagementTotals: eng.totals,
      engagementMissingColumns: eng.missingColumns,
      sheet,
      sozlesme: sozSheet,
    });
  } catch (err) {
    return Response.json(
      { ok: false, stage: "export", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
