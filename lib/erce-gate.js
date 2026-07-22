// lib/erce-gate.js
// /erce sayfası için tek (global) parola kapısı. Sunucuda YALNIZCA parolanın
// salt'lı hash'i saklanır — düz parola hiçbir yerde durmaz. "Erce_Gate" sekmesi,
// tek satır: A2=salt, B2=hash. Bu bir ERİŞİM kapısıdır (veri şifrelemesi değil):
// amaç, /erce'yi parolayı bilmeyen kullanıcılardan gizlemek.
import { google } from "googleapis";

const GATE_TAB = "Erce_Gate";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Eksik Google yapılandırması.");
  return new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
}

export async function readGate() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${GATE_TAB}'!A2:B2` });
    const row = (res.data.values || [])[0];
    if (row && row[0] && row[1]) return { salt: String(row[0]), hash: String(row[1]) };
    return null;
  } catch { return null; }
}

export async function saveGate({ salt, hash }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID tanımlı değil.");
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === GATE_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: GATE_TAB } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${GATE_TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [["salt", "hash"]] } });
  }
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${GATE_TAB}'!A2:B2`, valueInputOption: "RAW", requestBody: { values: [[salt, hash]] } });
  return { ok: true };
}
