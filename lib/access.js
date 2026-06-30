// lib/access.js
// ───────────────────────────────────────────────────────────────────────────
// ERİŞİM MATRİSİ (per-kullanıcı × per-araç) — YALNIZCA sunucu tarafı.
// Kaynak: Google Sheet'te "Erişim" sekmesi. Satır = e-posta, sütun = araç.
// Hücre dolu/işaretli (✓, 1, x, evet, true…) ise o kullanıcı o araca erişebilir.
//
// Güvenlik tasarımı:
//  - Kimlik DOĞRULAMA (kim giriş yapabilir) izinli-mailler.js + auth ile yapılır.
//  - Bu modül yalnız YETKİLENDİRME (hangi araçlar) ile ilgilenir.
//  - ADMIN_EMAILS her zaman tüm araçlara erişir (Sheet boş/bozuk olsa bile kilitlenme yok).
//  - Matris kısa süreli (TTL) bellek içi cache'lenir; Sheet değişikliği ~1 dk içinde yansır.
// ───────────────────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readMatrixFromSheet } from "./sheets";
import { TOOLS, TOOL_KEYS } from "./registry";

export const ACCESS_TAB = "Erişim";
const CACHE_TTL_MS = 60 * 1000; // 1 dk

// Kilitlenmeyi önleyen admin listesi (her zaman tam erişim).
const ADMINS = new Set(
  (process.env.ADMIN_EMAILS || "ibrahim.kantarci@dugun.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const norm = (s) => String(s ?? "").trim().toLocaleLowerCase("tr");
const normEmail = (s) => String(s ?? "").trim().toLowerCase();

// Bir hücre "erişim var" anlamına mı geliyor?
function isGranted(v) {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  const t = norm(v);
  return ["1", "x", "✓", "✔", "evet", "true", "yes", "var", "e", "+"].includes(t);
}

// Sütun başlığını bir araç anahtarına çöz (başlık = araç adı VEYA key olabilir).
function headerToToolKey(header) {
  const h = norm(header);
  for (const t of TOOLS) {
    if (h === norm(t.title) || h === norm(t.key)) return t.key;
  }
  return null;
}

let _cache = { at: 0, matrix: null };

// Matrisi { emailLower: Set(toolKey) } olarak döndürür (cache'li).
async function loadMatrix() {
  const now = Date.now();
  if (_cache.matrix && now - _cache.at < CACHE_TTL_MS) return _cache.matrix;

  const matrix = {};
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: ACCESS_TAB });
  } catch {
    values = []; // sekme yoksa: yalnız adminler erişir
  }

  if (values.length >= 2) {
    const header = values[0] || [];
    // E-posta sütununu bul (başlığı e-posta benzeri; yoksa 0. sütun).
    let emailCol = header.findIndex((h) => ["e-posta", "eposta", "email", "mail", "e-mail"].includes(norm(h)));
    if (emailCol < 0) emailCol = 0;
    // Diğer sütunları araç anahtarlarına eşle.
    const colTool = header.map((h, i) => (i === emailCol ? null : headerToToolKey(h)));

    for (let r = 1; r < values.length; r++) {
      const row = values[r] || [];
      const email = normEmail(row[emailCol]);
      if (!email) continue;
      const set = matrix[email] || (matrix[email] = new Set());
      colTool.forEach((key, i) => {
        if (key && isGranted(row[i])) set.add(key);
      });
    }
  }

  _cache = { at: now, matrix };
  return matrix;
}

// Bir e-postanın erişebildiği araç anahtarları (admin → hepsi).
export async function allowedToolKeys(email) {
  const e = normEmail(email);
  if (ADMINS.has(e)) return new Set(TOOL_KEYS);
  const matrix = await loadMatrix();
  return matrix[e] || new Set();
}

export async function canAccessTool(email, toolKey) {
  if (!toolKey) return true; // araca bağlı olmayan genel rota
  const set = await allowedToolKeys(email);
  return set.has(toolKey);
}

export function isAdmin(email) {
  return ADMINS.has(normEmail(email));
}

// Sunucu sayfaları için kapı: oturum + araç erişimi yoksa hub'a yönlendir.
// Erişim varsa session'ı döndürür.
export async function requireToolAccess(toolKey) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const ok = await canAccessTool(session.user.email, toolKey);
  if (!ok) redirect("/?denied=" + encodeURIComponent(toolKey));
  return session;
}
