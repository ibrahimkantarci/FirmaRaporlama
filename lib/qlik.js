// Qlik Cloud bağlantısı — YALNIZCA sunucu tarafı.
// API key bu modülde okunur ve hiçbir zaman tarayıcıya gönderilmez.

import enigma from "enigma.js";
import WebSocket from "ws";
import schema from "enigma.js/schemas/12.2015.0.json";

// --- Alan/kolon adları (gerekirse tek yerden değiştir) ---
export const CUSTOMER_FIELD = "customer_id";
export const LOADDATE_FIELD = "load_date";
export const MATCH_COLUMN = "RÇİ"; // bu yıl/geçen yıl eşleme anahtarı
export const WANTED_COLUMNS = [
  "Ürün Adı",
  "RÇİ Adı",
  "Kategori Adı",
  "Sayfa Ziyareti",
  "Teklif",
  "Ortalama Dönüş Süresi (Saat)",
  "Profil Puanı",
];

export function getQlikConfig() {
  const host = (process.env.QLIK_TENANT_HOST || "")
    .trim()
    .replace(/^(https?:\/\/|wss?:\/\/)/i, "")
    .replace(/\/+$/, "");
  const appId = process.env.QLIK_APP_ID;
  const apiKey = process.env.QLIK_API_KEY;
  const objectId = process.env.QLIK_OBJECT_ID;

  const missing = [];
  if (!host) missing.push("QLIK_TENANT_HOST");
  if (!appId) missing.push("QLIK_APP_ID");
  if (!apiKey) missing.push("QLIK_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Eksik Qlik yapılandırması: ${missing.join(", ")}. .env.local dosyasını doldurun.`
    );
  }
  return { host, appId, apiKey, objectId, engineUrl: `wss://${host}/app/${appId}` };
}

export function isQlikConfigured() {
  return (
    Boolean(process.env.QLIK_TENANT_HOST) &&
    Boolean(process.env.QLIK_APP_ID) &&
    Boolean(process.env.QLIK_API_KEY)
  );
}

export async function openQlikDoc() {
  const { appId, apiKey, engineUrl } = getQlikConfig();
  const session = enigma.create({
    schema,
    url: engineUrl,
    createSocket: (url) =>
      new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  const global = await session.open();
  const doc = await global.openDoc(appId);
  return { session, global, doc };
}

export async function withQlikDoc(callback) {
  const { session, global, doc } = await openQlikDoc();
  try {
    return await callback({ global, doc });
  } finally {
    await session.close();
  }
}

export async function fetchObjectData(doc, objectId, { maxRows = Infinity } = {}) {
  const obj = await doc.getObject(objectId);
  const layout = await obj.getLayout();
  const hc = layout.qHyperCube;
  if (!hc) {
    throw new Error(`Nesne ${objectId} bir hypercube içermiyor. qType: ${layout?.qInfo?.qType}`);
  }
  const totalRows = hc.qSize.qcy;
  const totalCols = hc.qSize.qcx;

  // İç sütun sırası: boyutlar + ölçüler
  const internalCols = [
    ...(hc.qDimensionInfo || []).map((d) => d.qFallbackTitle),
    ...(hc.qMeasureInfo || []).map((m) => m.qFallbackTitle),
  ];
  // Ekrandaki görsel sırayı uygula (qColumnOrder). Yoksa iç sırayı kullan.
  const order =
    Array.isArray(hc.qColumnOrder) && hc.qColumnOrder.length === internalCols.length
      ? hc.qColumnOrder
      : internalCols.map((_, i) => i);
  const columns = order.map((i) => internalCols[i]);

  const CELL_LIMIT = 10000;
  const rowsPerPage = Math.max(1, Math.floor(CELL_LIMIT / Math.max(1, totalCols)));
  const wanted = Math.min(totalRows, maxRows);
  const rows = [];
  let top = 0;
  while (top < wanted) {
    const height = Math.min(rowsPerPage, wanted - top);
    const pages = await obj.getHyperCubeData("/qHyperCubeDef", [
      { qTop: top, qLeft: 0, qWidth: totalCols, qHeight: height },
    ]);
    const matrix = pages?.[0]?.qMatrix ?? [];
    if (matrix.length === 0) break;
    for (const r of matrix) rows.push(order.map((i) => r[i].qText));
    top += height;
  }
  return { objectType: layout?.qInfo?.qType ?? null, columns, totalRows, returnedRows: rows.length, rows };
}

// --- Alan kâşifi ---
export async function getFieldList(doc) {
  const obj = await doc.createSessionObject({
    qInfo: { qType: "FieldList" },
    qFieldListDef: { qShowSystem: false, qShowHidden: false, qShowSemantic: true, qShowSrcTables: true },
  });
  const layout = await obj.getLayout();
  return (layout.qFieldList?.qItems || []).map((f) => ({ name: f.qName, tables: f.qSrcTables || [] }));
}

export async function getFieldValues(doc, fieldName, max = 200) {
  const obj = await doc.createSessionObject({
    qInfo: { qType: "list" },
    qListObjectDef: {
      qDef: { qFieldDefs: [fieldName] },
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: max }],
    },
  });
  const layout = await obj.getLayout();
  const lo = layout.qListObject;
  const matrix = lo?.qDataPages?.[0]?.qMatrix || [];
  return {
    field: fieldName,
    total: lo?.qSize?.qcy ?? matrix.length,
    shown: matrix.length,
    values: matrix.map((r) => r[0].qText),
  };
}

// --- Aşama 4: müşteri provider'ları (bu yıl + geçen yıl) ---

// Bir alanda TEK bir değeri birebir seçer.
// Yöntem: alanı arayıp (çok değer olsa bile bulmak için) birebir eşleşeni
// element numarasıyla seçeriz. Format (sayı/metin/tarih) fark etmez.
export async function selectExact(doc, fieldName, value) {
  const want = String(value).trim();
  const lb = await doc.createSessionObject({
    qInfo: { qType: "selbox" },
    qListObjectDef: {
      qDef: { qFieldDefs: [fieldName] },
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 200 }],
    },
  });

  let qId = null;
  let selected = false;
  let reason = null;
  let searchHits = 0;
  try {
    await lb.searchListObjectFor("/qListObjectDef", want);
    const layout = await lb.getLayout();
    qId = layout.qInfo.qId;
    const matrix = layout.qListObject?.qDataPages?.[0]?.qMatrix || [];
    searchHits = matrix.length;

    const isNum = want !== "" && !Number.isNaN(Number(want));
    const hit = matrix.find((r) => {
      const c = r[0];
      if (String(c.qText).trim() === want) return true;
      if (isNum && c.qNum !== undefined && c.qNum !== "NaN") {
        return Number(c.qNum) === Number(want);
      }
      return false;
    });

    if (hit) {
      selected = await lb.selectListObjectValues("/qListObjectDef", [hit[0].qElemNumber], false);
    } else {
      reason = "value-not-found";
    }
  } finally {
    if (qId) {
      try { await doc.destroySessionObject(qId); } catch (e) {}
    }
  }
  return { field: fieldName, value: want, selected: Boolean(selected), reason, searchHits };
}

// Tablodan istenen kolonları, eşleme anahtarına göre {key -> {kolon: değer}} haritasına çevirir.
function pickColumns(table, matchCol, wantedCols) {
  const keyIdx = table.columns.indexOf(matchCol);
  const wantedIdx = wantedCols.map((c) => [c, table.columns.indexOf(c)]);
  const missing = wantedIdx.filter(([, i]) => i < 0).map(([c]) => c);
  const map = {};
  for (const row of table.rows) {
    const key = keyIdx >= 0 ? row[keyIdx] : null;
    if (key == null) continue;
    const obj = {};
    for (const [label, i] of wantedIdx) obj[label] = i >= 0 ? row[i] : null;
    map[key] = obj;
  }
  return { map, missing, keyFound: keyIdx >= 0 };
}

export async function getCustomerProviders(doc, objectId, customerId) {
  // 1) Mevcut load_date değerleri → güncel (max) ve ~1 yıl öncesi
  const ld = await getFieldValues(doc, LOADDATE_FIELD, 5000);
  const parsed = ld.values
    .map((d) => ({ raw: d, t: Date.parse(d) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  if (parsed.length === 0) throw new Error("load_date değerleri okunamadı/parse edilemedi.");

  const current = parsed[parsed.length - 1];
  const target = new Date(current.t);
  target.setFullYear(target.getFullYear() - 1);
  let lastYear = parsed[0];
  let best = Infinity;
  for (const p of parsed) {
    const diff = Math.abs(p.t - target.getTime());
    if (diff < best) { best = diff; lastYear = p; }
  }
  const gapDays = Math.round(Math.abs(lastYear.t - target.getTime()) / 86400000);

  // 2) Bu yıl (güncel)
  await doc.clearAll(false);
  const selDateNow = await selectExact(doc, LOADDATE_FIELD, current.raw);
  const selCustNow = await selectExact(doc, CUSTOMER_FIELD, customerId);
  const thisYearTable = await fetchObjectData(doc, objectId);
  const thisYear = pickColumns(thisYearTable, MATCH_COLUMN, WANTED_COLUMNS);

  // 3) Geçen yıl
  await doc.clearAll(false);
  const selDateLast = await selectExact(doc, LOADDATE_FIELD, lastYear.raw);
  const selCustLast = await selectExact(doc, CUSTOMER_FIELD, customerId);
  const lastYearTable = await fetchObjectData(doc, objectId);
  const lastYearPicked = pickColumns(lastYearTable, MATCH_COLUMN, WANTED_COLUMNS);

  // 4) Bu yılın provider'larına göre birleştir
  const providers = Object.keys(thisYear.map).map((key) => ({
    key,
    thisYear: thisYear.map[key],
    lastYear: lastYearPicked.map[key] || null,
  }));

  return {
    customerId,
    selections: {
      thisYear: { loadDate: selDateNow, customer: selCustNow },
      lastYear: { loadDate: selDateLast, customer: selCustLast },
    },
    thisYearTotalRows: thisYearTable.totalRows,
    lastYearTotalRows: lastYearTable.totalRows,
    matchColumn: MATCH_COLUMN,
    columns: WANTED_COLUMNS,
    missingColumns: thisYear.missing, // boş olmalı; doluysa etiket adı düzeltilecek
    currentDate: current.raw,
    lastYearTargetDate: target.toISOString().slice(0, 10),
    lastYearUsedDate: lastYear.raw,
    lastYearGapDays: gapDays, // büyükse gerçek "1 yıl önce" snapshot'ı yok demektir
    providerCount: providers.length,
    lastYearMatchedCount: providers.filter((p) => p.lastYear).length,
    providers,
  };
}

// --- Aşama: YoY tam döküm (tüm sütunlar, bu yıl + geçen yıl yan yana) ---
export async function getCustomerYoYFull(doc, objectId, customerId) {
  const ld = await getFieldValues(doc, LOADDATE_FIELD, 5000);
  const parsed = ld.values
    .map((d) => ({ raw: d, t: Date.parse(d) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  if (parsed.length === 0) throw new Error("load_date değerleri okunamadı/parse edilemedi.");

  const current = parsed[parsed.length - 1];
  const target = new Date(current.t);
  target.setFullYear(target.getFullYear() - 1);
  let lastYear = parsed[0];
  let best = Infinity;
  for (const p of parsed) {
    const diff = Math.abs(p.t - target.getTime());
    if (diff < best) { best = diff; lastYear = p; }
  }
  const gapDays = Math.round(Math.abs(lastYear.t - target.getTime()) / 86400000);

  // Bu yıl
  await doc.clearAll(false);
  await selectExact(doc, LOADDATE_FIELD, current.raw);
  const selCust = await selectExact(doc, CUSTOMER_FIELD, customerId);
  const thisT = await fetchObjectData(doc, objectId);

  // Geçen yıl
  await doc.clearAll(false);
  await selectExact(doc, LOADDATE_FIELD, lastYear.raw);
  await selectExact(doc, CUSTOMER_FIELD, customerId);
  const lastT = await fetchObjectData(doc, objectId);

  // Eşleme (RÇİ) — bu yılın provider'ları anchor
  const cols = thisT.columns;
  const keyIdx = cols.indexOf(MATCH_COLUMN);
  const lastKeyIdx = lastT.columns.indexOf(MATCH_COLUMN);
  const lastMap = {};
  for (const r of lastT.rows) {
    const k = lastKeyIdx >= 0 ? r[lastKeyIdx] : null;
    if (k != null) lastMap[k] = r;
  }

  const blank = lastT.columns.map(() => "");
  const meta = [
    `Müşteri: ${customerId}`,
    `Bu yıl: ${current.raw}`,
    `Geçen yıl: ${lastYear.raw}`,
    `Hedef (1 yıl önce): ${target.toISOString().slice(0, 10)}`,
    `Gün farkı: ${gapDays}`,
  ];
  const header = [...cols, ...lastT.columns.map((c) => `${c} (GY)`)];

  let matched = 0;
  const dataRows = [];
  for (const r of thisT.rows) {
    const k = keyIdx >= 0 ? r[keyIdx] : null;
    const lr = k != null && lastMap[k] ? lastMap[k] : null;
    if (lr) matched++;
    dataRows.push([...r, ...(lr || blank)]);
  }

  const matrix = [meta, header, ...dataRows];

  return {
    customerId,
    customerFound: Boolean(selCust.selected),
    currentDate: current.raw,
    lastYearUsedDate: lastYear.raw,
    lastYearTargetDate: target.toISOString().slice(0, 10),
    lastYearGapDays: gapDays,
    columnsCount: cols.length,
    providerCount: thisT.rows.length,
    lastYearMatchedCount: matched,
    matrix,
  };
}
