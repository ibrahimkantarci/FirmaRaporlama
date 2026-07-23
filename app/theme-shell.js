"use client";

import { useEffect, useState } from "react";

// Panel (iframe) içindeki koyu/açık tema seçimini SAYFA KABUĞUNA taşır:
// kullanıcı panelde koyu temayı seçtiğinde üst çubuk da koyulaşır, açık temada beyaz olur.
//
// İki kanal:
//   1) İlk yükleme — panel tercihi localStorage'da ("hq-theme") ve iframe aynı köken
//      olduğu için buradan doğrudan okunabilir. Böylece sayfa daha ilk karede doğru gelir.
//   2) Canlı değişim — panel applyTheme() içinde parent'a postMessage atar.
//
// Sunucuda "açık" render edilir, mount sonrası düzeltilir: değişen tek şey className
// olduğu için yapısal hydration uyuşmazlığı olmaz.
export default function ThemeShell({ children }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      setDark(localStorage.getItem("hq-theme") === "dark");
    } catch {
      /* localStorage kapalıysa açık tema ile devam */
    }
    function onMsg(e) {
      if (e.origin !== window.location.origin) return; // yalnız kendi panelimiz
      if (e.data && e.data.type === "dugun:theme") setDark(e.data.mode === "dark");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div
      className={dark ? "theme-dark" : undefined}
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      {children}
    </div>
  );
}
