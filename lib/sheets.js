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
