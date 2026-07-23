/** @type {import('next').NextConfig} */
const nextConfig = {
  // enigma.js ve ws sunucu tarafında çalışır; Next'in bunları bundle'a
  // sıkıştırmasını engelliyoruz ki Vercel'de doğru çalışsınlar.
  experimental: {
    serverComponentsExternalPackages: ["enigma.js", "ws", "googleapis"],
  },

  // CACHE: public/ altındaki standalone panel HTML'leri Vercel CDN'i ve tarayıcı
  // tarafından uzun süre cache'lenir. Panelde yapılan bir değişiklik kullanıcıya
  // günlerce yansımayabiliyordu (kaldırılan kolonlar ekranda kalmaya devam etti).
  // Bu dosyalar küçük ve iframe içinde açılıyor; her açılışta taze gelmeleri
  // doğru davranış. Statik varlıklar (logo, /_next/*) bundan ETKİLENMEZ.
  async headers() {
    return [
      {
        source: "/:file(mvp-call-query-standalone|erce-standalone|b2b-dashboard-updated|ozel-fiyat-standalone).html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/dashboard-pipeline.js",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
