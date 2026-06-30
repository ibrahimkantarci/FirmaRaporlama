// app/api/dashboard/data/route.js
// Dashboard pipeline (okuma): yazılmış Sheet sekmelerini JSON satır nesnelerine çevirir.
// Dashboard açılışta bunu çeker; her kaynak ham başlık adlarıyla döner (mapRow ile eşlenir).
import { auth } from "@/auth";
import { readMatrixFromSheet } from "../../../../lib/sheets";
import { DASHBOARD_SOURCES } from "../../../../lib/dashboard-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// [header, ...rows] → [{ header: value }]
function toObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const header = (values[0] || []).map((h) => String(h ?? "").trim());
  return values
    .slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => c !== "" && c != null))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => {
        if (h) o[h] = r[i] != null ? r[i] : "";
      });
      return o;
    });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }

  const out = { ok: true };
  try {
    for (const src of DASHBOARD_SOURCES) {
      let values = [];
      try {
        values = await readMatrixFromSheet({ tab: src.tab });
      } catch {
        values = []; // sekme henüz yoksa boş dön
      }
      out[src.key] = toObjects(values);
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
