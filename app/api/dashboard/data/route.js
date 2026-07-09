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

// HIZ (payload diyeti): yalnız istenen kolonları bırak (sekmede tümü durur; yanıt küçülür).
// İstenen kolonlardan hiçbiri başlıkta yoksa dokunmaz (eski/farklı başlıklı sekme bozulmasın).
function trimColumns(values, wanted) {
  if (!Array.isArray(values) || !values.length || !Array.isArray(wanted) || !wanted.length) return values;
  const hdr = (values[0] || []).map((h) => String(h ?? "").trim());
  const idx = wanted.map((w) => hdr.indexOf(w)).filter((i) => i >= 0);
  if (!idx.length) return values;
  return values.map((r) => idx.map((i) => (Array.isArray(r) && r[i] != null ? r[i] : "")));
}

export const GET = withAccess(["updatedhq","ozelfiyat"], async () => {
  const out = { ok: true };
  try {
    // HIZ: tüm kaynaklar PARALEL okunur (sıralı ~8sn → ~1.5-2sn).
    const results = await Promise.all(
      DASHBOARD_SOURCES.map(async (src) => {
        // Canlı URL kaynağı: önce cache sekmesi (run route yazar), boşsa canlı fetch.
        if (src.urlEnv) {
          if (src.cacheTab) {
            try {
              const cached = toObjects(await readMatrixFromSheet({ tab: src.cacheTab }));
              if (cached.length) return [src.key, cached];
            } catch {
              // cache sekmesi henüz yok → canlıya düş
            }
          }
          try {
            return [src.key, await fetchExternalRows(src)];
          } catch {
            return [src.key, []];
          }
        }
        let values = [];
        try {
          values = await readMatrixFromSheet({ tab: src.tab });
        } catch {
          values = []; // sekme henüz yoksa boş dön
        }
        if (src.sendCols) values = trimColumns(values, src.sendCols);
        return [src.key, toObjects(values)];
      })
    );
    for (const [k, v] of results) out[k] = v;
    return Response.json(out);
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
});
