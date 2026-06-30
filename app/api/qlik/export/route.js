import {
  withQlikDoc,
  getEngagementData,
  getCustomerYoYFull,
  injectResponseTimes,
} from "../../../../lib/qlik";
import { writeMatrixToSheet } from "../../../../lib/sheets";
import { withAccess } from "../../../../lib/api";
import { validateCustomerId } from "../../../../lib/validate";
import { QLIK_SOURCES } from "../../../../lib/qlik-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: uzun Qlik okumalari icin

const DAY_MS = 86400000;

// /api/qlik/export?id=58367
// 1) Engagement uygulamasından sözleşme verisini çek → "Sozlesme" sekmesine yaz,
//    önceki sözleşme bitişini ve provider dönüş sürelerini (ort/medyan) türet.
// 2) Ana uygulamadan bu yıl + (bitiş - 7 gün) geçen yıl tüm sütunları çek,
//    dönüş sürelerini engagement'tan bas, ana sekmeye yaz.
export const GET = withAccess("provider", async (request) => {
  const { searchParams } = new URL(request.url);
  const v = validateCustomerId(searchParams.get("id"));
  if (!v.ok) {
    return Response.json({ ok: false, stage: "export", error: v.error }, { status: 400 });
  }
  const id = v.value;
  // App/object ID'leri lib/qlik-sources.js'ten (env değil) — bkz. o dosya.
  const objectId = QLIK_SOURCES.main.objectId;
  const engAppId = QLIK_SOURCES.engagement.appId;
  const engObjectId = QLIK_SOURCES.engagement.objectId;

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

    const data = await withQlikDoc(QLIK_SOURCES.main.appId, ({ doc }) =>
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
});
