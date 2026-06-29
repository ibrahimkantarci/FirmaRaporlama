// Google Sheets'e yazma — YALNIZCA sunucu tarafı (Service Account).
// Kimlik bilgileri env'de durur, tarayıcıya asla gönderilmez.

import { google } from "googleapis";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Eksik Google yapılandırması: GOOGLE_SERVICE_ACCOUNT_EMAIL ve GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY gerekli."
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// 2B diziyi sekmenin SONUNA ekler (mevcut veriyi silmez).
// append: tablodaki son dolu satırı bulup bir altına yazar.
export async function writeMatrixToSheet(matrix, { tab } = {}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheetTab = tab || process.env.GOOGLE_SHEET_TAB || "Sheet1";

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetTab}'!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS", // mevcut satırların üstüne yazmaz, yeni satır ekler
    requestBody: { values: matrix },
  });

  const updates = res.data.updates || {};
  return {
    spreadsheetId,
    tab: sheetTab,
    updatedRange: updates.updatedRange ?? null,
    updatedRows: updates.updatedRows ?? null,
    updatedColumns: updates.updatedColumns ?? null,
    updatedCells: updates.updatedCells ?? null,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

// Bir sekmeyi sıfırdan yazar: yoksa oluşturur, varsa içeriği temizleyip yeniden yazar.
export async function overwriteSheetTab(matrix, { tab }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  if (!tab) throw new Error("tab gerekli.");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Sekme var mı?
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
  } else {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'` });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: matrix },
  });

  return {
    spreadsheetId,
    tab,
    rows: matrix.length,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

// --- Kullanıcı bazlı ayarlar (kolon seçimi/sırası vb.) — "Fiyat_Ayarlar" sekmesi ---
const SETTINGS_TAB = "Fiyat_Ayarlar";

export async function readUserSettings(email) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  let values = [];
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${SETTINGS_TAB}'!A:B` });
    values = res.data.values || [];
  } catch {
    return null; // sekme yok
  }
  const e = String(email).trim().toLowerCase();
  for (const row of values) {
    if (String(row[0] ?? "").trim().toLowerCase() === e) {
      try { return JSON.parse(row[1] ?? "null"); } catch { return null; }
    }
  }
  return null;
}

export async function saveUserSettings(email, settings) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === SETTINGS_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: SETTINGS_TAB } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${SETTINGS_TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [["Email", "Ayarlar"]] } });
  }

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${SETTINGS_TAB}'!A:B` });
  const values = res.data.values || [];
  const e = String(email).trim().toLowerCase();
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] ?? "").trim().toLowerCase() === e) { rowIndex = i; break; }
  }
  const payload = [[String(email), JSON.stringify(settings)]];
  if (rowIndex >= 0) {
    const r1 = rowIndex + 1;
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${SETTINGS_TAB}'!A${r1}:B${r1}`, valueInputOption: "RAW", requestBody: { values: payload } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `'${SETTINGS_TAB}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: payload } });
  }
  return { ok: true };
}

// Sekmenin tüm değerlerini 2B dizi olarak okur.
export async function readMatrixFromSheet({ tab } = {}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheetTab = tab || process.env.GOOGLE_SHEET_TAB || "Sheet1";

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTab}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return res.data.values || [];
}

// Export sırasında her müşteri için yazılan blok şu yapıdadır:
//   [0] meta satırı  -> ilk hücre "Müşteri: <id>" ile başlar
//   [1] başlık satırı -> sütun adları (+ "(GY)" kolonları)
//   [2..] veri satırları (bir sonraki meta satırına kadar)
// Bir müşteri için EN SON (en alttaki) bloğu döndürür.
const META_PREFIX = "Müşteri:";

function parseMetaId(cell) {
  const s = String(cell ?? "").trim();
  if (!s.startsWith(META_PREFIX)) return null;
  return s.slice(META_PREFIX.length).trim();
}

export function findCustomerBlock(values, customerId) {
  const want = String(customerId).trim();

  // Tüm meta satırlarının indekslerini bul.
  const metaRows = [];
  for (let i = 0; i < values.length; i++) {
    const id = parseMetaId(values[i]?.[0]);
    if (id !== null) metaRows.push({ index: i, id });
  }
  if (metaRows.length === 0) return null;

  // İstenen müşterinin EN SON bloğunu seç.
  let start = -1;
  let blockEnd = values.length;
  for (let k = metaRows.length - 1; k >= 0; k--) {
    if (metaRows[k].id === want) {
      start = metaRows[k].index;
      blockEnd = k + 1 < metaRows.length ? metaRows[k + 1].index : values.length;
      break;
    }
  }
  if (start < 0) return null;

  const meta = values[start] || [];
  const header = values[start + 1] || [];
  const rows = values.slice(start + 2, blockEnd);
  return { meta, header, rows };
}
