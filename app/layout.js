import "./globals.css";

export const metadata = {
  title: "Performans Yönetimi — düğün.com",
  description: "düğün.com iç araç: firma raporlama, fiyat tutarlılık ve performans panoları.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
