// app/api/planlar/route.js
// ───────────────────────────────────────────────────────────────────────────
// Black hole plan uygulaması (Notion tarzı, basit) — sayfa listesi oku / kaydet / sil.
// Depo: Google Sheet "Planlar" sekmesi. Her satır bir sayfa:
//   A: id · B: başlık · C: bloklar (JSON) · D: son düzenleyen · E: ISO zaman
// Bloklar: [{ t: "p"|"h"|"todo", x: "metin", c: true|false }]
//
// Erişim: not kağıdıyla aynı anahtar ("notlar") — kağıdı gören plan uygulamasını da görür.
// Yazma stratejisi: sekme küçük (ekip içi birkaç düzine sayfa) → oku-değiştir-tamamını yaz.
// Eşzamanlı düzenlemede son kaydeden kazanır (not kağıdıyla aynı kabul).
// ───────────────────────────────────────────────────────────────────────────
import { withAccess, apiOk, apiError } from "../../../lib/api";
import { readMatrixFromSheet, overwriteSheetTab } from "../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB = "Planlar";
const HEADER = ["id", "baslik", "bloklar", "guncelleyen", "guncelleme"];
const MAX_BLOCKS_JSON = 40000; // Sheets hücre sınırı 50k — pay bırak.
const MAX_PAGES = 200;

async function readPages() {
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: TAB });
  } catch {
    return []; // sekme henüz yok
  }
  const out = [];
  for (let i = 1; i < (values || []).length; i++) {
    const r = values[i] || [];
    const id = String(r[0] ?? "").trim();
    if (!id) continue;
    let blocks = [];
    try {
      blocks = JSON.parse(String(r[2] || "[]"));
      if (!Array.isArray(blocks)) blocks = [];
    } catch {
      blocks = [];
    }
    out.push({
      id,
      title: String(r[1] ?? ""),
      blocks,
      updatedBy: String(r[3] ?? ""),
      updatedAt: String(r[4] ?? ""),
    });
  }
  return out;
}

async function writePages(pages) {
  const matrix = [HEADER];
  for (const p of pages) {
    matrix.push([p.id, p.title, JSON.stringify(p.blocks || []), p.updatedBy || "", p.updatedAt || ""]);
  }
  await overwriteSheetTab(matrix, { tab: TAB });
}

// Blok dizisini güvenli şekle indir: bilinmeyen tipler "p" olur, fazlalık alanlar atılır.
function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 500).map((b) => ({
    t: b?.t === "h" || b?.t === "todo" ? b.t : "p",
    x: typeof b?.x === "string" ? b.x.slice(0, 2000) : "",
    ...(b?.t === "todo" ? { c: !!b?.c } : {}),
  }));
}

export const GET = withAccess("notlar", async () => {
  const pages = await readPages();
  return apiOk({ pages });
});

export const POST = withAccess("notlar", async (request, { session }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Geçersiz istek gövdesi.");
  }
  const page = body?.page;
  const id = String(page?.id ?? "").trim();
  if (!id || !/^[a-z0-9-]{4,40}$/.test(id)) return apiError(400, "Geçersiz sayfa id.");

  const clean = {
    id,
    title: String(page?.title ?? "").slice(0, 200),
    blocks: sanitizeBlocks(page?.blocks),
    updatedBy: session.user.email,
    updatedAt: new Date().toISOString(),
  };
  if (JSON.stringify(clean.blocks).length > MAX_BLOCKS_JSON)
    return apiError(413, "Sayfa çok uzun — bölmeyi düşünün.");

  const pages = await readPages();
  const i = pages.findIndex((p) => p.id === id);
  if (i >= 0) pages[i] = clean;
  else {
    if (pages.length >= MAX_PAGES) return apiError(409, `Sayfa sınırına ulaşıldı (${MAX_PAGES}).`);
    pages.push(clean);
  }
  await writePages(pages);
  return apiOk({ page: clean });
});

export const DELETE = withAccess("notlar", async (request) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError(400, "id gerekli.");
  const pages = await readPages();
  const next = pages.filter((p) => p.id !== id);
  if (next.length === pages.length) return apiError(404, "Sayfa bulunamadı.");
  await writePages(next);
  return apiOk({ deleted: id });
});
