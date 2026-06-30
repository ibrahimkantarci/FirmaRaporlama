// app/api/fiyat/data/route.js
// Sayfa açılışında mevcut (son çalıştırılmış) Kıyas verisini ve güncelleme tarihini döndürür.
import { withAccess } from "../../../../lib/api";
import { readMatrixFromSheet } from "../../../../lib/sheets";
import { parseKiyasSheet, summarize } from "../../../../lib/fiyat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB_KIYAS = "Fiyat_Tutarlılık_Kıyas";

export const GET = withAccess("fiyat", async () => {
  try {
    let values = [];
    try {
      values = await readMatrixFromSheet({ tab: TAB_KIYAS });
    } catch {
      // Sekme henüz yok → ilk kez çalıştırılmamış.
      return Response.json({ ok: true, empty: true });
    }

    const parsed = parseKiyasSheet(values);
    if (!parsed || parsed.rows.length === 0) {
      return Response.json({ ok: true, empty: true });
    }

    return Response.json({
      ok: true,
      updatedAt: parsed.updatedAt,
      catalogRows: parsed.catalogRows,
      campaignRows: parsed.campaignRows,
      summaryMax: summarize(parsed.rows, "max"),
      rows: parsed.rows,
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
});
