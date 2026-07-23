// app/api/rutinler/route.js
// ───────────────────────────────────────────────────────────────────────────
// Rutin (tekrarlayan) görevler — oku / kaydet / sil.
// Depo: Google Sheet "Rutinler" sekmesi. Her satır bir rutin TANIMI:
//   A id · B başlık · C not · D tekrar(gun|hafta|ay) · E aralık · F günler(0-6,Pzt=0)
//   G ayGünü · H başlangıç · I bitiş · J saat · K aktif · L tamamlanan(JSON tarih dizisi)
//   M son düzenleyen · N ISO zaman
//
// Tekrarlar SATIR OLARAK ÇOĞALTILMAZ: tanım tek satır, görünen tarihler istemcide
// hesaplanır. Böylece "her gün" bir rutin yıllarca satır şişirmez ve aralık
// değiştirmek geçmişi bozmaz. Tamamlananlar yalnız tarih listesi olarak tutulur.
//
// Erişim: not kağıdı/planlarla aynı anahtar ("notlar").
// ───────────────────────────────────────────────────────────────────────────
import { withAccess, apiOk, apiError } from "../../../lib/api";
import { readMatrixFromSheet, overwriteSheetTab } from "../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAB = "Rutinler";
const HEADER = [
  "id", "baslik", "not", "tekrar", "aralik", "gunler", "ayGunu",
  "baslangic", "bitis", "saat", "aktif", "tamamlanan", "guncelleyen", "guncelleme",
];
const MAX_ROUTINES = 200;
const MAX_DONE = 1500; // ~4 yıl günlük rutin
const ISO_D = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseRow(r) {
  const id = String(r[0] ?? "").trim();
  if (!id) return null;
  let done = [];
  try {
    const p = JSON.parse(String(r[11] || "[]"));
    if (Array.isArray(p)) done = p.filter((x) => typeof x === "string" && ISO_D.test(x));
  } catch {
    done = [];
  }
  const days = String(r[5] ?? "")
    .split(",")
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return {
    id,
    x: String(r[1] ?? ""),
    n: String(r[2] ?? ""),
    freq: ["gun", "hafta", "ay"].includes(String(r[3] ?? "")) ? String(r[3]) : "hafta",
    every: Math.min(Math.max(parseInt(r[4], 10) || 1, 1), 60),
    days,
    dom: Math.min(Math.max(parseInt(r[6], 10) || 1, 1), 31),
    start: ISO_D.test(String(r[7] ?? "")) ? String(r[7]) : "",
    end: ISO_D.test(String(r[8] ?? "")) ? String(r[8]) : "",
    time: HHMM.test(String(r[9] ?? "")) ? String(r[9]) : "",
    active: String(r[10] ?? "").toLowerCase() !== "false",
    done,
    updatedBy: String(r[12] ?? ""),
    updatedAt: String(r[13] ?? ""),
  };
}

async function readRoutines() {
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: TAB });
  } catch {
    return []; // sekme henüz yok
  }
  const out = [];
  for (let i = 1; i < (values || []).length; i++) {
    const p = parseRow(values[i] || []);
    if (p) out.push(p);
  }
  return out;
}

async function writeRoutines(list) {
  const matrix = [HEADER];
  for (const r of list) {
    matrix.push([
      r.id, r.x, r.n, r.freq, String(r.every), (r.days || []).join(","), String(r.dom),
      r.start, r.end, r.time, r.active ? "true" : "false", JSON.stringify(r.done || []),
      r.updatedBy || "", r.updatedAt || "",
    ]);
  }
  await overwriteSheetTab(matrix, { tab: TAB });
}

function sanitize(body, email) {
  const id = String(body?.id ?? "").trim();
  if (!id || !/^[a-z0-9-]{4,40}$/.test(id)) return { err: "Geçersiz rutin id." };
  const x = String(body?.x ?? "").trim().slice(0, 300);
  if (!x) return { err: "Başlık gerekli." };

  const freq = ["gun", "hafta", "ay"].includes(body?.freq) ? body.freq : "hafta";
  const days = Array.isArray(body?.days)
    ? [...new Set(body.days.map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : [];
  // Haftalık seçilip hiç gün işaretlenmediyse boşta kalmasın: başlangıç gününü kullan.
  const start = ISO_D.test(String(body?.start ?? "")) ? String(body.start) : new Date().toISOString().slice(0, 10);
  if (freq === "hafta" && days.length === 0) {
    const d = new Date(start + "T00:00:00");
    days.push((d.getDay() + 6) % 7);
  }
  const done = Array.isArray(body?.done)
    ? [...new Set(body.done.filter((s) => typeof s === "string" && ISO_D.test(s)))].slice(-MAX_DONE)
    : [];

  return {
    ok: {
      id,
      x,
      n: String(body?.n ?? "").slice(0, 1000),
      freq,
      every: Math.min(Math.max(parseInt(body?.every, 10) || 1, 1), 60),
      days,
      dom: Math.min(Math.max(parseInt(body?.dom, 10) || 1, 1), 31),
      start,
      end: ISO_D.test(String(body?.end ?? "")) ? String(body.end) : "",
      time: HHMM.test(String(body?.time ?? "")) ? String(body.time) : "",
      active: body?.active !== false,
      done,
      updatedBy: email,
      updatedAt: new Date().toISOString(),
    },
  };
}

export const GET = withAccess("notlar", async () => {
  const routines = await readRoutines();
  return apiOk({ routines });
});

export const POST = withAccess("notlar", async (request, { session }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Geçersiz istek gövdesi.");
  }
  const { ok: clean, err } = sanitize(body?.routine, session.user.email);
  if (err) return apiError(400, err);

  const list = await readRoutines();
  const i = list.findIndex((r) => r.id === clean.id);
  if (i >= 0) list[i] = clean;
  else {
    if (list.length >= MAX_ROUTINES) return apiError(409, `Rutin sınırına ulaşıldı (${MAX_ROUTINES}).`);
    list.push(clean);
  }
  await writeRoutines(list);
  return apiOk({ routine: clean });
});

export const DELETE = withAccess("notlar", async (request) => {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError(400, "id gerekli.");
  const list = await readRoutines();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return apiError(404, "Rutin bulunamadı.");
  await writeRoutines(next);
  return apiOk({ deleted: id });
});
