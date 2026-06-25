// Google Sheets'e yazma — YALNIZCA sunucu tarafı (Service Account).
// Kimlik bilgileri env'de durur, tarayıcıya asla gönderilmez.

import { google } from "googleapis";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private key env'de tek satır olarak "\n" kaçışlarıyla tutulur; geri çeviriyoruz.
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

// 2B diziyi hedef sekmeye yazar (önce sekmeyi temizler).
export async function writeMatrixToSheet(matrix, { tab } = {}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheetTab = tab || process.env.GOOGLE_SHEET_TAB || "Sheet1";

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Eski içeriği temizle
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetTab}'`,
  });

  // Yeni içeriği yaz
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: matrix },
  });

  return {
    spreadsheetId,
    tab: sheetTab,
    updatedRows: res.data.updatedRows ?? null,
    updatedColumns: res.data.updatedColumns ?? null,
    updatedCells: res.data.updatedCells ?? null,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}
