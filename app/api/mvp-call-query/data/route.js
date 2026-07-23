// app/api/mvp-call-query/data/route.js
// ───────────────────────────────────────────────────────────────────────────
// Mvp WP Call Query — okuma ucu. Dashboard pipeline'ının YAZDIĞI "Dashboard_Firma"
// sekmesini okur (kaynak: Providers-PY app / "Firmalar" objesi 4a681953…, en yeni
// load_date'e sabitli snapshot = AKTİF providerlar).
//
// Kendi erişim anahtarı ("mvpcall") ile korunur — /api/dashboard/data'ya bağlanmaz ki
// bu araca erişimi olan kişinin ayrıca Dashboard erişimine ihtiyacı olmasın.
// Veriyi TAZELEMEZ: tazeleme Dashboard'un /api/dashboard/run akışında yapılır.
// ───────────────────────────────────────────────────────────────────────────
import { withAccess } from "../../../../lib/api";
import { readMatrixFromSheet } from "../../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Payload diyeti: 36+ kolonun yalnız bu 9'u gerekiyor.
const WANTED = [
  "Müşteri İD",
  "Müşteri Adı",
  "RÇİ",
  "RÇİ Adı",
  "Bitiş Tarihi",
  "Satış Fiyatı",
  "Anlaşma Sayısı",
  "Kategori Adı",
  "Şehir",
  "Sorumlu PY",
];

// [header, ...rows] → [{ header: value }], yalnız istenen kolonlarla.
function toObjects(values, wanted) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const hdr = (values[0] || []).map((h) => String(h ?? "").trim());
  // İstenen kolonlardan sekmede BULUNANLARIN indeksi (bulunmayan sessizce atlanır:
  // FIRMA_DROP_COLS ileride değişirse uç patlamasın).
  const cols = wanted.map((w) => [w, hdr.indexOf(w)]).filter(([, i]) => i >= 0);
  if (!cols.length) return [];
  return values
    .slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => c !== "" && c != null))
    .map((r) => {
      const o = {};
      for (const [name, i] of cols) o[name] = r[i] != null ? r[i] : "";
      return o;
    });
}

export const GET = withAccess("mvpcall", async () => {
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: "Dashboard_Firma" });
  } catch {
    // Sekme henüz yazılmamış → boş dön, panel "veri yok" gösterir (sayfayı bozma).
    return Response.json({ ok: true, firma: [], missing: "Dashboard_Firma" });
  }
  const rows = toObjects(values, WANTED);
  return Response.json({ ok: true, firma: rows, count: rows.length });
});
