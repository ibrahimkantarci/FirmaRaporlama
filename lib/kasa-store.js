// lib/kasa-store.js
// Kişisel şifreli kasa deposu — YALNIZCA sunucu tarafı (Service Account).
// Sunucu burada SADECE şifreli metni (ciphertext) saklar; içeriği ÇÖZEMEZ.
// Çözme yalnız kullanıcının tarayıcısında, kullanıcının parolasıyla yapılır.
// Depo düzeni "Fiyat_Ayarlar" ile aynı: A=Email, B=JSON blob. Sekme: "Kasa".
import { google } from "googleapis";

const KASA_TAB = "Kasa";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Eksik Google yapılandırması: GOOGLE_SERVICE_ACCOUNT_EMAIL ve GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY gerekli.");
  }
  return new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
}

// Kullanıcının şifreli blob'unu döndürür (yoksa null).
export async function readKasa(email) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  let values = [];
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${KASA_TAB}'!A:B` });
    values = res.data.values || [];
  } catch {
    return null; // sekme henüz yok
  }
  const e = String(email).trim().toLowerCase();
  for (const row of values) {
    if (String(row[0] ?? "").trim().toLowerCase() === e) {
      try { return JSON.parse(row[1] ?? "null"); } catch { return null; }
    }
  }
  return null;
}

// Kullanıcının şifreli blob'unu kaydeder (kendi satırına; başkasınınkine dokunmaz).
export async function saveKasa(email, blob) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === KASA_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: KASA_TAB } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${KASA_TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [["Email", "Sifreli"]] } });
  }

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${KASA_TAB}'!A:B` });
  const values = res.data.values || [];
  const e = String(email).trim().toLowerCase();
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] ?? "").trim().toLowerCase() === e) { rowIndex = i; break; }
  }
  const payload = [[String(email), JSON.stringify(blob)]];
  if (rowIndex >= 0) {
    const r1 = rowIndex + 1;
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${KASA_TAB}'!A${r1}:B${r1}`, valueInputOption: "RAW", requestBody: { values: payload } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `'${KASA_TAB}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: payload } });
  }
  return { ok: true };
}
