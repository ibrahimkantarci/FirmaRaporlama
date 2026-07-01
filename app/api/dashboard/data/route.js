// app/api/dashboard/data/route.js
// Dashboard pipeline (okuma): yazılmış Sheet sekmelerini JSON satır nesnelerine çevirir.
// Dashboard açılışta bunu çeker; her kaynak ham başlık adlarıyla döner (mapRow ile eşlenir).
import { withAccess } from "../../../../lib/api";
import { readMatrixFromSheet } from "../../../../lib/sheets";
import { DASHBOARD_SOURCES } from "../../../../lib/dashboard-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Canlı URL kaynağı (ör. RENEWAL_DATA Apps Script deploy'u): satır nesnelerini çeker.
// Apps Script { ok, data: { <extract>: [ {...} ] } } döndürür.
async function fetchExternalRows(src) {
  const base = process.env[src.urlEnv];
  if (!base) return []; // env tanımlı değil (ör. lokal) → boş
  const sep = base.includes("?") ? "&" : "?";
  const url = src.urlParams ? base + sep + src.urlParams : base;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!j || j.ok === false) return [];
  const data = j.data || j;
  const rows = src.extract ? data[src.extract] : data;
  return Array.isArray(rows) ? rows : [];
}

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

export const GET = withAccess("dashboard", async () => {
  const out = { ok: true };
  try {
    for (const src of DASHBOARD_SOURCES) {
      // Canlı URL kaynağı → doğrudan çek (Sheet sekmesi yok).
      if (src.urlEnv) {
        try {
          out[src.key] = await fetchExternalRows(src);
        } catch {
          out[src.key] = [];
        }
        continue;
      }
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
});
