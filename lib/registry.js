// lib/registry.js
// ───────────────────────────────────────────────────────────────────────────
// TEK GERÇEK KAYNAK (single source of truth) — portaldaki araçların tanımı.
// Hub kartları, erişim matrisi sütunları ve rota koruması hep buradan okur.
// Yeni araç eklemek için: buraya bir kayıt ekle + (varsa) ICONS'a ikon ekle.
// ───────────────────────────────────────────────────────────────────────────

// Bir aracın tanımı:
//   key    — kararlı kimlik (erişim matrisinde ve rota eşlemesinde kullanılır)
//   href   — aracın giriş rotası
//   title  — görünen ad (Erişim sekmesinde sütun başlığı olarak da kabul edilir)
//   desc   — hub kartı açıklaması
//   accent/soft — kurumsal renk vurgusu (kart başına)
export const TOOLS = [
  {
    key: "provider",
    href: "/provider",
    title: "Firma Raporlama",
    desc: "Müşteri verisini Qlik'ten Google Sheet'e aktar; oradan düzenleyip PowerPoint sunum üret.",
    accent: "#e6197d",
    soft: "#fdeef5",
  },
  {
    key: "fiyat",
    href: "/fiyat-tutarlilik",
    title: "Fiyat Tutarlılık",
    desc: "Katalog ve kampanya fiyatlarını eşleştirip kampanyaların katalogla tutarlı olup olmadığını denetler.",
    accent: "#185fa5",
    soft: "#ecf3fb",
  },
  {
    key: "dashboard",
    href: "/dashboard",
    title: "Dashboard",
    desc: "B2B yaşam döngüsü panoları: onboarding, performans, yenileme, çağrı analizi ve alarmlar.",
    accent: "#7c3aed",
    soft: "#f5f3ff",
  },
  {
    key: "updatedhq",
    href: "/updated-hq",
    title: "Updated HQ",
    desc: "Dashboard'un üzerinde çalışılan sandbox kopyası — canlı /dashboard'u etkilemeden güncellemeleri gözden geçir.",
    accent: "#0f766e",
    soft: "#ecfdf5",
  },
  {
    key: "ozelfiyat",
    href: "/ozel-fiyat",
    title: "Özel Fiyat Dinamik - Pelda İçin",
    desc: "Aktif özel fiyatlı firmaların şehir, kategori, paket bitiş ve value dağılımları ile Pelda çağrı trendi. Canlı Qlik verisiyle beslenir.",
    accent: "#e6197d",
    soft: "#fdeef5",
  },
];

export const TOOL_KEYS = TOOLS.map((t) => t.key);
export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t]));

// Rota → araç anahtarı eşlemesi (en uzun önek kazanır).
// Bir araç birden çok rotadan oluşabilir (ör. Firma Raporlama = /provider + /rapor;
// ve onların API uçları). Hem sayfa hem API rotaları buradan araca bağlanır.
const ROUTE_MAP = [
  { prefix: "/provider", key: "provider" },
  { prefix: "/rapor", key: "provider" },
  { prefix: "/api/qlik", key: "provider" },
  { prefix: "/api/sheet", key: "provider" },
  { prefix: "/fiyat-tutarlilik", key: "fiyat" },
  { prefix: "/api/fiyat", key: "fiyat" },
  { prefix: "/dashboard", key: "dashboard" },
  { prefix: "/api/dashboard", key: "dashboard" },
  { prefix: "/updated-hq", key: "updatedhq" },
  { prefix: "/ozel-fiyat", key: "ozelfiyat" },
  { prefix: "/api/ozel-fiyat", key: "ozelfiyat" },
];

// Bir yol (pathname) hangi araca ait? Bilinmiyorsa null (korumasız/genel).
export function toolKeyForPath(pathname) {
  const p = String(pathname || "");
  let best = null;
  for (const r of ROUTE_MAP) {
    if (p === r.prefix || p.startsWith(r.prefix + "/")) {
      if (!best || r.prefix.length > best.prefix.length) best = r;
    }
  }
  return best ? best.key : null;
}
