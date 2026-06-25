import "./globals.css";

export const metadata = {
  title: "Provider Aktarımı",
  description: "Qlik'ten müşteri provider verisini bu yıl + geçen yıl olarak Google Sheet'e aktarır",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
