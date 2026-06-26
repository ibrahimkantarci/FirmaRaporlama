// Qlik Cloud bağlantısı — YALNIZCA sunucu tarafı.
// API key bu modülde okunur ve hiçbir zaman tarayıcıya gönderilmez.

import enigma from "enigma.js";
import WebSocket from "ws";
import schema from "enigma.js/schemas/12.2015.0.json";

// --- Alan/kolon adları (gerekirse tek yerden değiştir) ---
export const CUSTOMER_FIELD = "customer_id";
export const LOADDATE_FIELD = "load_date";
export const MATCH_COLUMN = "RÇİ"; // bu yıl/geçen yıl eşleme anahtarı

// Ana tablodaki dönüş süresi kolonları (engagement'tan gelen değerlerle ezilir/eklenir).
export const AVG_COLUMN = "Ortalama Dönüş Süresi (Saat)";
export const MEDIAN_COLUMN = "Medyan Dönüş Süresi (Saat)";

// --- İkinci uygulama: "Provider Engagement - History" objesi kolon başlıkları ---
export const ENG_PROVIDER_COL = "Provider Id";   // = ana tablodaki "RÇİ" (eşleme anahtarı)
export const ENG_ISCURRENT_COL = "Is Current Product"; // 1 = aktif sözleşme, 0 = geçmiş
export const ENG_PRODUCTEND_COL = "Product End"; // sözleşme bitiş tarihi (kolon başlığı)
export const ENG_END_FIELD = "product_price_ends_on"; // sözleşme bitişi SEÇİLEBİLİR alan adı
export const ENG_AVG_COL = "Response Time";      // ortalama dönüş süresi
export const ENG_MEDIAN_COL = "Median Response Time"; // medyan dönüş süresi

// appId verilmezse varsayılan ana uygulama (QLIK_APP_ID) kullanılır.
// İkinci uygulama (engagement) için appId açıkça geçilir; host + apiKey aynıdır.
export function getQlikConfig(appId = process.env.QLIK_APP_ID) {
  const host = (process.env.QLIK_TENANT_HOST || "")
    .trim()
    .replace(/^(https?:\/\/|wss?:\/\/)/i, "")
    .replace(/\/+$/, "");
  const apiKey = process.env.QLIK_API_KEY;

  const missing = [];
  if (!host) missing.push("QLIK_TENANT_HOST");
  if (!appId) missing.push("QLIK_APP_ID");
  if (!apiKey) missing.push("QLIK_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Eksik Qlik yapılandırması: ${missing.join(", ")}. .env.local dosyasını doldurun.`
    );
  }
  return { host, appId, apiKey, engineUrl: `wss://${host}/app/${appId}` };
}

export async function openQlikDoc(appId) {
  const cfg = getQlikConfig(appId);
  const session = enigma.create({
    schema,
    url: cfg.engineUrl,
    createSocket: (url) =>
      new WebSocket(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` } }),
  });
  const global = await session.open();
  const doc = await global.openDoc(cfg.appId);
  return { session, global, doc };
}

// İki kullanım biçimi:
//   withQlikDoc(cb)          -> varsayılan ana uygulama (QLIK_APP_ID)
//   withQlikDoc(appId, cb)   -> belirli bir uygulama (örn. ENGAGEMENT_APP_ID)
export async function withQlikDoc(appId, callback) {
  if (typeof appId === "function") {
    callback = appId;
    appId = undefined;
  }
  const { session, global, doc } = await openQlikDoc(appId);
  try {
    return await callback({ global, doc });
  } finally {
    await session.close();
  }
}

export async function fetchObjectData(doc, objectId, { maxRows = Infinity, withNum = false } = {}) {
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
  // ÖNEMLİ: getHyperCubeData veriyi GÖRSEL (qColumnOrder) sırada döndürüyor.
  // Bu yüzden BAŞLIKLARI görsel sıraya çeviriyoruz; VERİYE DOKUNMUYORUZ.
  // (Veriyi de yeniden sıralarsak ikinci kez kayar — eski hatanın sebebi buydu.)
  const order =
    Array.isArray(hc.qColumnOrder) && hc.qColumnOrder.length === internalCols.length
      ? hc.qColumnOrder
      : internalCols.map((_, i) => i);
  const columns = order.map((i) => internalCols[i]);

  const CELL_LIMIT = 10000;
  const rowsPerPage = Math.max(1, Math.floor(CELL_LIMIT / Math.max(1, totalCols)));
  const wanted = Math.min(totalRows, maxRows);
  const rows = [];
  const rowsNum = []; // withNum: hücre qNum değerleri (sayısal alanlar için güvenilir)
  let top = 0;
  while (top < wanted) {
    const height = Math.min(rowsPerPage, wanted - top);
    const pages = await obj.getHyperCubeData("/qHyperCubeDef", [
      { qTop: top, qLeft: 0, qWidth: totalCols, qHeight: height },
    ]);
    const matrix = pages?.[0]?.qMatrix ?? [];
    if (matrix.length === 0) break;
    // Veri ham (görsel) sırada bırakılır — başlıklar zaten görsel sıraya çevrildi.
    for (const r of matrix) {
      rows.push(r.map((cell) => cell.qText));
      if (withNum) rowsNum.push(r.map((cell) => cell.qNum));
    }
    top += height;
  }

  // Genel toplam satırı (Qlik "Totals"): ölçü başlığı -> { num, text }.
  // qGrandTotalRow ölçü sırasına göre indekslenir (qMeasureInfo ile aynı sıra).
  const grandTotals = {};
  const gtr = Array.isArray(hc.qGrandTotalRow) ? hc.qGrandTotalRow : [];
  (hc.qMeasureInfo || []).forEach((m, i) => {
    const cell = gtr[i];
    if (cell) grandTotals[m.qFallbackTitle] = { num: cell.qNum, text: cell.qText };
  });

  return {
    objectType: layout?.qInfo?.qType ?? null,
    columns,
    totalRows,
    returnedRows: rows.length,
    rows,
    rowsNum: withNum ? rowsNum : undefined,
    grandTotals,
  };
}

// Bir alanın ayrık değerlerini okur (load_date gibi alanları taramak için).
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

// --- Fiyat Tutarlılık: katalog + kampanya tabloları (aktif provider filtreli) ---
export const FIYAT_LISTING_FIELD = "is_currently_listing"; // 1 = aktif provider (her iki tablo)
export const FIYAT_CAMPAIGN_STATUS_FIELD = "campaign_status"; // 1 = geçerli kampanya
export const FIYAT_CAMPAIGN_TYPE_FIELD = "campaign_type"; // yalnız "İndirim" kampanyaları

export async function readFiyatCatalog(doc, objectId) {
  await doc.clearAll(false);
  await selectExact(doc, FIYAT_LISTING_FIELD, "1");
  return fetchObjectData(doc, objectId, { withNum: true });
}

export async function readFiyatCampaign(doc, objectId) {
  await doc.clearAll(false);
  await selectExact(doc, FIYAT_LISTING_FIELD, "1");
  await selectExact(doc, FIYAT_CAMPAIGN_STATUS_FIELD, "1");
  await selectExact(doc, FIYAT_CAMPAIGN_TYPE_FIELD, "İndirim");
  return fetchObjectData(doc, objectId, { withNum: true });
}

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

// --- İkinci uygulama: sözleşme/engagement verisi ---
// customer_id ile filtreler, "Sozlesme" tablosunu döndürür ve şunları türetir:
//  - previousContractEnd: Is Current Product = 0 satırları içinde en geç Product End
//    (müşteri seviyesi; tüm provider'lar aynı anda yenilendiği için ortaktır)
//  - responseByProvider: { providerId -> { current:{avg,median}, previous:{avg,median} } }
export async function getEngagementData(doc, objectId, customerId) {
  await doc.clearAll(false);
  const selCust = await selectExact(doc, CUSTOMER_FIELD, customerId);
  const table = await fetchObjectData(doc, objectId);

  const ci = {
    provider: table.columns.indexOf(ENG_PROVIDER_COL),
    isCur: table.columns.indexOf(ENG_ISCURRENT_COL),
    end: table.columns.indexOf(ENG_PRODUCTEND_COL),
    avg: table.columns.indexOf(ENG_AVG_COL),
    med: table.columns.indexOf(ENG_MEDIAN_COL),
  };
  const missingColumns = Object.entries(ci)
    .filter(([, i]) => i < 0)
    .map(([k]) => k);

  // Önceki sözleşme bitişi = Is Current Product = 0 satırlarında en geç Product End.
  let previousContractEnd = null;
  let previousContractEndMs = -Infinity;
  // Mevcut sözleşme bitişi = Is Current Product = 1 satırlarında en geç Product End.
  let currentContractEnd = null;
  let currentContractEndMs = -Infinity;
  for (const r of table.rows) {
    const isCur = String(r[ci.isCur]).trim();
    const t = Date.parse(r[ci.end]);
    if (Number.isNaN(t)) continue;
    if (isCur === "0" && t > previousContractEndMs) {
      previousContractEndMs = t;
      previousContractEnd = r[ci.end];
    } else if (isCur === "1" && t > currentContractEndMs) {
      currentContractEndMs = t;
      currentContractEnd = r[ci.end];
    }
  }
  if (previousContractEndMs === -Infinity) previousContractEndMs = null;
  if (currentContractEndMs === -Infinity) currentContractEnd = null;

  // Provider başına dönüş süreleri: aktif satır (=1) bu yıl, önceki sözleşme satırı geçen yıl.
  const responseByProvider = {};
  for (const r of table.rows) {
    const pid = String(r[ci.provider] ?? "").trim();
    if (!pid) continue;
    const entry =
      responseByProvider[pid] || (responseByProvider[pid] = { current: null, previous: null });
    const isCur = String(r[ci.isCur]).trim();
    if (isCur === "1") {
      entry.current = { avg: r[ci.avg], median: r[ci.med] };
    } else if (isCur === "0" && previousContractEnd && r[ci.end] === previousContractEnd) {
      entry.previous = { avg: r[ci.avg], median: r[ci.med] };
    }
  }

  const activeProviderIds = Object.keys(responseByProvider).filter(
    (p) => responseByProvider[p].current
  );

  // Dönem TOPLAMLARI (gerçek Qlik "Totals" satırı): sözleşmeyi seç, grand total oku.
  // Medyan toplamı, satır medyanlarının ortalaması DEĞİL — Qlik'in havuz medyanıdır.
  const pickNum = (cell) => {
    if (!cell) return null;
    if (Number.isFinite(cell.num)) return cell.num;
    const f = parseFloat(String(cell.text ?? "").replace(/,/g, "."));
    return Number.isFinite(f) ? f : null;
  };
  async function periodTotals(endValue) {
    if (!endValue) return null;
    await doc.clearAll(false);
    await selectExact(doc, CUSTOMER_FIELD, customerId);
    const sel = await selectExact(doc, ENG_END_FIELD, endValue);
    if (!sel.selected) return null;
    const t = await fetchObjectData(doc, objectId, { maxRows: 0 }); // sadece layout+totals
    const g = t.grandTotals || {};
    return { avg: pickNum(g[ENG_AVG_COL]), median: pickNum(g[ENG_MEDIAN_COL]) };
  }
  const totals = {
    current: await periodTotals(currentContractEnd),
    previous: await periodTotals(previousContractEnd),
  };

  return {
    customerId,
    customerFound: Boolean(selCust.selected),
    table, // { columns, rows, ... } — "Sozlesme" sekmesine yazılır
    previousContractEnd,
    previousContractEndMs,
    currentContractEnd,
    responseByProvider,
    activeProviderIds,
    totals, // { current:{avg,median}, previous:{avg,median} } (saat)
    missingColumns,
  };
}

// --- Aşama: YoY tam döküm (tüm sütunlar, bu yıl + geçen yıl yan yana) ---
// opts:
//   lastYearTargetMs?: number  -> geçen yıl için hedef tarih (en yakın load_date seçilir)
//   skipLastYear?: boolean     -> önceki sözleşme yoksa geçen yıl kolonları boş bırakılır
export async function getCustomerYoYFull(doc, objectId, customerId, opts = {}) {
  const ld = await getFieldValues(doc, LOADDATE_FIELD, 5000);
  const parsed = ld.values
    .map((d) => ({ raw: d, t: Date.parse(d) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  if (parsed.length === 0) throw new Error("load_date değerleri okunamadı/parse edilemedi.");

  const current = parsed[parsed.length - 1];

  // Bu yıl (güncel snapshot)
  await doc.clearAll(false);
  await selectExact(doc, LOADDATE_FIELD, current.raw);
  const selCust = await selectExact(doc, CUSTOMER_FIELD, customerId);
  const thisT = await fetchObjectData(doc, objectId);
  const cols = thisT.columns;
  const keyIdx = cols.indexOf(MATCH_COLUMN);

  // Geçen yıl hedef tarihi: sözleşmeden gelir (yoksa eski "1 yıl önce" sezgisi).
  let targetMs;
  if (opts.lastYearTargetMs != null) {
    targetMs = opts.lastYearTargetMs;
  } else {
    const t = new Date(current.t);
    t.setFullYear(t.getFullYear() - 1);
    targetMs = t.getTime();
  }

  // Geçen yıl — önceki sözleşme yoksa atlanır, kolonlar boş kalır.
  let lastT = null;
  let lastYear = null;
  let gapDays = null;
  if (!opts.skipLastYear) {
    let best = Infinity;
    lastYear = parsed[0];
    for (const p of parsed) {
      const diff = Math.abs(p.t - targetMs);
      if (diff < best) { best = diff; lastYear = p; }
    }
    gapDays = Math.round(Math.abs(lastYear.t - targetMs) / 86400000);

    await doc.clearAll(false);
    await selectExact(doc, LOADDATE_FIELD, lastYear.raw);
    await selectExact(doc, CUSTOMER_FIELD, customerId);
    lastT = await fetchObjectData(doc, objectId);
  }

  // Eşleme (RÇİ) — bu yılın provider'ları anchor. Anahtarlar string+trim normalize.
  const norm = (v) => (v == null ? null : String(v).trim());
  const lastCols = lastT ? lastT.columns : cols;
  const lastKeyIdx = lastT ? lastT.columns.indexOf(MATCH_COLUMN) : -1;
  const lastMap = {};
  if (lastT) {
    for (const r of lastT.rows) {
      const k = lastKeyIdx >= 0 ? norm(r[lastKeyIdx]) : null;
      if (k) lastMap[k] = r;
    }
  }

  const blank = lastCols.map(() => "");
  const meta = [
    `Müşteri: ${customerId}`,
    `Bu yıl: ${current.raw}`,
    `Geçen yıl: ${lastYear ? lastYear.raw : "-"}`,
    `Hedef tarih: ${new Date(targetMs).toISOString().slice(0, 10)}`,
    `Gün farkı: ${gapDays != null ? gapDays : "-"}`,
  ];
  const header = [...cols, ...lastCols.map((c) => `${c} (GY)`)];

  let matched = 0;
  const dataRows = [];
  for (const r of thisT.rows) {
    const k = keyIdx >= 0 ? norm(r[keyIdx]) : null;
    const lr = k && lastMap[k] ? lastMap[k] : null;
    if (lr) matched++;
    dataRows.push([...r, ...(lr || blank)]);
  }

  const matrix = [meta, header, ...dataRows];

  return {
    customerId,
    customerFound: Boolean(selCust.selected),
    currentDate: current.raw,
    lastYearUsedDate: lastYear ? lastYear.raw : null,
    lastYearTargetDate: new Date(targetMs).toISOString().slice(0, 10),
    lastYearGapDays: gapDays,
    columnsCount: cols.length,
    providerCount: thisT.rows.length,
    lastYearFetchedRows: lastT ? lastT.rows.length : 0, // teşhis: o tarihte müşteri satırı geldi mi?
    lastYearMatchedCount: matched,
    matrix,
  };
}

// Engagement'tan gelen dönüş sürelerini ana matrise basar:
//  - "Ortalama Dönüş Süresi (Saat)" ve "(GY)" kolonları engagement ORTALAMA ile EZİLİR
//  - "Medyan Dönüş Süresi (Saat)" ve "(GY)" kolonları SONA EKLENİR
// Eşleme RÇİ = Provider Id. Engagement'ta olmayan provider için hücre BOŞ bırakılır.
export function injectResponseTimes(result, responseByProvider) {
  const matrix = result.matrix;
  if (!Array.isArray(matrix) || matrix.length < 2) return result;

  const meta = matrix[0];
  const header = matrix[1];
  const keyIdx = header.indexOf(MATCH_COLUMN);
  const avgIdx = header.indexOf(AVG_COLUMN);
  const avgGyIdx = header.indexOf(`${AVG_COLUMN} (GY)`);

  // Yeni medyan kolon başlıkları (bu yıl + geçen yıl).
  header.push(MEDIAN_COLUMN, `${MEDIAN_COLUMN} (GY)`);
  meta.push("", ""); // meta satırını hizala

  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i];
    const key = keyIdx >= 0 ? String(row[keyIdx] ?? "").trim() : "";
    const rt = responseByProvider[key];
    if (avgIdx >= 0) row[avgIdx] = rt?.current?.avg ?? "";
    if (avgGyIdx >= 0) row[avgGyIdx] = rt?.previous?.avg ?? "";
    row.push(rt?.current?.median ?? "", rt?.previous?.median ?? "");
  }
  return result;
}
