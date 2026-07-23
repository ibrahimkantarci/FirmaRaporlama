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
    // NOT: eski legacy "dashboard" aracı (public/b2b-dashboard.html + /dashboard) 2026-07-09'da
    // kaldırıldı. Bu araç (key "updatedhq", rota /updated-hq) artık TEK ve asıl Dashboard.
    // Erişim: "Erişim" sekmesinde başlık ("Dashboard") VEYA key ("updatedhq") ile eşleşen kolon.
    key: "updatedhq",
    href: "/updated-hq",
    title: "Dashboard",
    desc: "B2B yaşam döngüsü panoları: onboarding, performans, yenileme, çağrı analizi ve alarmlar.",
    accent: "#7c3aed",
    soft: "#f5f3ff",
  },
  {
    key: "ozelfiyat",
    href: "/ozel-fiyat",
    title: "Özel Fiyat Dinamik - Pelda İçin",
    desc: "Aktif özel fiyatlı firmaların şehir, kategori, paket bitiş ve value dağılımları ile Pelda çağrı trendi. Canlı Qlik verisiyle beslenir.",
    accent: "#e6197d",
    soft: "#fdeef5",
  },
  {
    key: "erce",
    href: "/erce",
    title: "Erce İçin",
    desc: "Verimlilik, yenileme yüzdesi, dokunma oranı, flag durumu ve decay board'ları. Canlı Qlik verisiyle beslenir.",
    accent: "#185fa5",
    soft: "#ecf3fb",
  },
  {
    key: "mvpcall",
    href: "/mvp-call-query",
    title: "Mvp Call Query",
    desc: "MVP çağrı sorguları için bağımsız panel. Kendi erişim anahtarıyla (mvpcall) korunur.",
    accent: "#0f766e",
    soft: "#ecfdf5",
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
  { prefix: "/updated-hq", key: "updatedhq" },
  { prefix: "/api/dashboard", key: "updatedhq" },
  { prefix: "/ozel-fiyat", key: "ozelfiyat" },
  { prefix: "/api/ozel-fiyat", key: "ozelfiyat" },
  { prefix: "/erce", key: "erce" },
  { prefix: "/mvp-call-query", key: "mvpcall" },
  { prefix: "/api/mvp-call-query", key: "mvpcall" },
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
