/** @type {import('next').NextConfig} */
const nextConfig = {
  // enigma.js ve ws sunucu tarafında çalışır; Next'in bunları bundle'a
  // sıkıştırmasını engelliyoruz ki Vercel'de doğru çalışsınlar.
  experimental: {
    serverComponentsExternalPackages: ["enigma.js", "ws", "googleapis"],
  },
};

module.exports = nextConfig;
