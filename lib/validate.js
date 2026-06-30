// lib/validate.js
// Saf (bağımsız) girdi doğrulayıcılar — hem sunucu (güvenlik sınırı) hem client (UX) kullanır.
// Sözleşme: her doğrulayıcı { ok:true, value } veya { ok:false, error } döndürür.

// Müşteri/Provider ID — Qlik'te sayısal (ör. 58367, 6872). Yalnız rakam, 1-12 hane.
export function validateCustomerId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "Müşteri ID gerekli." };
  if (!/^\d{1,12}$/.test(s)) {
    return { ok: false, error: "Müşteri ID yalnızca rakamlardan oluşmalıdır (örn. 58367)." };
  }
  return { ok: true, value: s };
}
