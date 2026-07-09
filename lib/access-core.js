// lib/access-core.js
// ───────────────────────────────────────────────────────────────────────────
// ERİŞİM MATRİSİ çekirdeği (auth'tan BAĞIMSIZ) — YALNIZCA sunucu tarafı.
// Kaynak: Google Sheet "Erişim" sekmesi. Satır = e-posta, sütun = araç VEYA "Ana Sayfa".
// Hücre dolu/işaretli (✓, 1, x, evet…) ise o kullanıcı o araca/ana-sayfaya erişebilir.
//
// Bu dosya auth'u İÇE AKTARMAZ (auth.js ↔ access.js dairesel importunu kırmak için ayrıldı):
//   auth.js  → buradan canAccessHome/isAdmin okur (Node giriş kontrolü).
//   access.js → buradan re-export + requireToolAccess (auth'a bağlı sayfa kapısı).
//
// Güvenlik tasarımı:
//  - "Ana Sayfa" (giriş) + araç yetkileri aynı matriste; hepsi Sheet'ten.
//  - ADMIN_EMAILS (env, Sheet DIŞINDA) her zaman tam erişir (Sheet boş/bozuk olsa bile kilitlenme yok).
//  - Matris kısa süreli (TTL) bellek içi cache'lenir; Sheet değişikliği ~TTL içinde yansır (iptal dahil).
// ───────────────────────────────────────────────────────────────────────────
import { readMatrixFromSheet } from "./sheets";
import { TOOLS, TOOL_KEYS } from "./registry";

export const ACCESS_TAB = "Erişim";
const CACHE_TTL_MS = 30 * 1000; // 30 sn — erişim/iptal değişikliği en geç bu sürede yansır.

// Ana Sayfa (giriş) = sözde-araç anahtarı. "Erişim" sekmesinde bir kolon; işaretliyse giriş+hub açık.
export const HOME_KEY = "home";
const HOME_HEADERS = ["ana sayfa", "anasayfa", "giriş", "giris", "home", "login", "giriş yetkisi"];

// Kilitlenmeyi önleyen admin listesi (env — Sheet DIŞINDA; her zaman tam erişim + giriş).
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

// Sütun başlığını bir anahtara çöz: "Ana Sayfa" → HOME_KEY; diğerleri araç adı/key ile eşleşir.
function headerToToolKey(header) {
  const h = norm(header);
  if (HOME_HEADERS.includes(h)) return HOME_KEY;
  for (const t of TOOLS) {
    if (h === norm(t.title) || h === norm(t.key)) return t.key;
  }
  return null;
}

let _cache = { at: 0, matrix: null, homeCol: false };

// Matrisi { emailLower: Set(toolKey | HOME_KEY) } olarak döndürür (cache'li).
// Ayrıca _cache.homeCol = "Ana Sayfa" kolonu sekmede VAR mı (geçiş fallback'i için).
async function loadMatrix() {
  const now = Date.now();
  if (_cache.matrix && now - _cache.at < CACHE_TTL_MS) return _cache.matrix;

  const matrix = {};
  let homeCol = false;
  let values = [];
  try {
    values = await readMatrixFromSheet({ tab: ACCESS_TAB });
  } catch {
    values = []; // sekme okunamazsa: yalnız adminler erişir (fail-closed)
  }

  if (values.length >= 2) {
    const header = values[0] || [];
    // E-posta sütununu bul (başlığı e-posta benzeri; yoksa 0. sütun).
    let emailCol = header.findIndex((h) => ["e-posta", "eposta", "email", "mail", "e-mail"].includes(norm(h)));
    if (emailCol < 0) emailCol = 0;
    // Diğer sütunları anahtarlara eşle (araç key'leri + HOME_KEY).
    const colTool = header.map((h, i) => (i === emailCol ? null : headerToToolKey(h)));
    homeCol = colTool.some((k) => k === HOME_KEY);

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

  _cache = { at: now, matrix, homeCol };
  return matrix;
}

// Bir e-postanın erişebildiği araç anahtarları (admin → hepsi). HOME_KEY dahil edilmez (araç değil).
export async function allowedToolKeys(email) {
  const e = normEmail(email);
  if (ADMINS.has(e)) return new Set(TOOL_KEYS);
  const matrix = await loadMatrix();
  const set = matrix[e] || new Set();
  // HOME_KEY bir araç değil → hub kartı listesine sızmasın diye ayıkla.
  return new Set([...set].filter((k) => k !== HOME_KEY));
}

export async function canAccessTool(email, toolKey) {
  if (!toolKey) return true; // araca bağlı olmayan genel rota
  const set = await allowedToolKeys(email);
  return set.has(toolKey);
}

// Ana sayfa (giriş + hub) erişimi.
//  - Admin → her zaman (env fail-safe).
//  - Sheet okunamaz / e-posta listede yok → false (fail-closed).
//  - GEÇİŞ FALLBACK'İ: "Ana Sayfa" kolonu sekmede henüz YOKSA, listede satırı olan herkes girer
//    (kolon eklenene kadar kimse kilitlenmesin). Kolon eklenince kolon değeri YETKİLİ olur.
export async function canAccessHome(email) {
  const e = normEmail(email);
  if (ADMINS.has(e)) return true;
  const matrix = await loadMatrix();
  const row = matrix[e];
  if (!row) return false;            // listede yok / sheet okunamadı → giremez
  if (!_cache.homeCol) return true;  // "Ana Sayfa" kolonu henüz yok → geçiş: listelenen girer
  return row.has(HOME_KEY);
}

export function isAdmin(email) {
  return ADMINS.has(normEmail(email));
}
