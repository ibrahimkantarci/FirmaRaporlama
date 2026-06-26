// app/api/fiyat/run/route.js
// Fiyat Tutarlılık pipeline: katalog + kampanya objelerini (aktif provider filtreli) oku,
// 3 sekmeye yaz (Catalog / Campaign / Kıyas), kıyas satırlarını sayfaya döndür.
import { auth } from "@/auth";
import { withQlikDoc, readFiyatCatalog, readFiyatCampaign } from "../../../../lib/qlik";
import { overwriteSheetTab } from "../../../../lib/sheets";
import { buildComparison, kiyasMatrix, summarize } from "../../../../lib/fiyat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TAB_CATALOG = "Fiyat_Tutarlılık_Catalog";
const TAB_CAMPAIGN = "Fiyat_Tutarlılık_Campaign";
const TAB_KIYAS = "Fiyat_Tutarlılık_Kıyas";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const appId = process.env.FIYAT_APP_ID || process.env.ENGAGEMENT_APP_ID;
  const catObj = process.env.FIYAT_CATALOG_OBJECT_ID;
  const campObj = process.env.FIYAT_CAMPAIGN_OBJECT_ID;
  if (!appId || !catObj || !campObj) {
    return Response.json(
      { ok: false, error: "FIYAT_APP_ID / FIYAT_CATALOG_OBJECT_ID / FIYAT_CAMPAIGN_OBJECT_ID tanımlı değil." },
      { status: 400 }
    );
  }

  try {
    // Her iki obje aynı uygulamada — tek oturumda, aralarında clearAll ile oku.
    const { catalog, campaign } = await withQlikDoc(appId, async ({ doc }) => {
      const catalog = await readFiyatCatalog(doc, catObj);
      const campaign = await readFiyatCampaign(doc, campObj);
      return { catalog, campaign };
    });

    const { rows, catMissing, campMissing } = buildComparison(catalog, campaign);

    const updatedAt = new Date().toISOString();
    const metaRow = [
      `Güncelleme: ${updatedAt}`,
      `Katalog satır: ${catalog.rows.length}`,
      `Kampanya satır: ${campaign.rows.length}`,
    ];

    // 3 sekmeyi sıfırdan yaz (Kıyas'a en üste meta/güncelleme satırı).
    const catSheet = await overwriteSheetTab([catalog.columns, ...catalog.rows], { tab: TAB_CATALOG });
    const campSheet = await overwriteSheetTab([campaign.columns, ...campaign.rows], { tab: TAB_CAMPAIGN });
    const kiyasSheet = await overwriteSheetTab([metaRow, ...kiyasMatrix(rows, "max")], { tab: TAB_KIYAS });

    return Response.json({
      ok: true,
      updatedAt,
      catalogRows: catalog.rows.length,
      campaignRows: campaign.rows.length,
      catMissing,
      campMissing,
      summaryMax: summarize(rows, "max"),
      rows, // sayfa stratejiyi canlı değiştirip yeniden hesaplar
      sheets: { catalog: catSheet, campaign: campSheet, kiyas: kiyasSheet },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
