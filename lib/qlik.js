// Qlik Cloud bağlantısı — YALNIZCA sunucu tarafı.
// API key bu modülde okunur ve hiçbir zaman tarayıcıya gönderilmez.

import enigma from "enigma.js";
import WebSocket from "ws";
import schema from "enigma.js/schemas/12.2015.0.json";
import { QLIK_SOURCES } from "./qlik-sources";

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

// appId verilmezse varsayılan ana uygulama (QLIK_SOURCES.main.appId) kullanılır.
// İkinci uygulama (engagement) için appId açıkça geçilir; host + apiKey aynıdır.
// host + apiKey env'den (gerçek sırlar); app/object ID'leri lib/qlik-sources.js'ten.
export function getQlikConfig(appId = QLIK_SOURCES.main.appId) {
  const host = (process.env.QLIK_TENANT_HOST || "")
    .trim()
    .replace(/^(https?:\/\/|wss?:\/\/)/i, "")
    .replace(/\/+$/, "");
  // trim: Vercel/env kutusuna yapıştırırken kaçan görünmez boşluk/satır sonu Authorization
  // header'ını bozar (401). Host zaten trim'liydi; anahtar da olmalı.
  const apiKey = (process.env.QLIK_API_KEY || "").trim();

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

// TEŞHİS: Qlik anahtarının PARMAK İZİ — anahtarı SIZDIRMADAN (yalnız uzunluk + maskeli uçlar).
// Amaç: prod (Vercel) ile lokal (.env.local) değerinin AYNI olup olmadığını karşılaştırmak;
// Vercel'e yapıştırırken kırpılma/boşluk olup olmadığını kesin görmek. Yalnız yetkili uçtan döner.
export function qlikKeyFingerprint() {
  const raw = process.env.QLIK_API_KEY || "";
  const k = raw.trim();
  return {
    rawLen: raw.length,          // trim ÖNCESİ uzunluk
    len: k.length,               // trim SONRASI uzunluk (lokalde 473 olmalı)
    head: k.slice(0, 8),         // lokalde "eyJhbGci"
    tail: k.slice(-6),           // lokalde "_U-qLX"
    dots: (k.match(/\./g) || []).length, // JWT'de 2
    jwt: /^eyJ/.test(k),
    hadWhitespace: raw !== k,    // true ise Vercel değerinde boşluk/newline vardı
    host: (process.env.QLIK_TENANT_HOST || "").trim(),
  };
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

  // İç sütun sırası: boyutlar + ölçüler. Her biri için HATA bayrağı da tutulur.
  // ⚠️ KRİTİK: Qlik'te bozuk bir boyut/ölçü (qError, ör. qErrorCode 7005 = geçersiz alan)
  // hypercube VERİSİNDE yer ALMAZ — qSize.qcx onu saymaz — ama qDimensionInfo'da görünür.
  // Başlık listesinden ayıklanmazsa başlıklar veriye göre KAYAR ve tüm kolon eşlemeleri bozulur.
  // (2026-07: katalog objesine bozuk boyut eklenince Fiyat Tutarlılık'ta "hepsi Karşılaştırılamaz"
  //  oldu — Provider Id kolonundan Provider Name okunuyordu.)
  const allCols = [
    ...(hc.qDimensionInfo || []).map((d) => ({ title: d.qFallbackTitle, bad: !!d.qError })),
    ...(hc.qMeasureInfo || []).map((m) => ({ title: m.qFallbackTitle, bad: !!m.qError })),
  ];
  // ÖNEMLİ: getHyperCubeData veriyi GÖRSEL (qColumnOrder) sırada döndürüyor.
  // Bu yüzden BAŞLIKLARI görsel sıraya çeviriyoruz; VERİYE DOKUNMUYORUZ.
  // (Veriyi de yeniden sıralarsak ikinci kez kayar — eski hatanın sebebi buydu.)
  const order =
    Array.isArray(hc.qColumnOrder) && hc.qColumnOrder.length === allCols.length
      ? hc.qColumnOrder
      : allCols.map((_, i) => i);
  let columns = order.map((i) => allCols[i]).filter((c) => c && !c.bad).map((c) => c.title);
  if (columns.length !== totalCols) {
    // Beklenmedik uyuşmazlık: sessiz kaymayı önle — veriyle aynı genişliğe hizala + uyar.
    console.warn(
      `[qlik] ${objectId}: başlık sayısı (${columns.length}) veri kolonu (${totalCols}) ile uyuşmuyor — hizalanıyor.`
    );
    columns = columns.slice(0, totalCols);
    while (columns.length < totalCols) columns.push(`Kolon ${columns.length + 1}`);
  }

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

// Bir NESNE yerine, veri modelinden doğrudan BELİRLİ ALANLARI okur (geçici session
// hypercube). Bir Qlik objesi olmayan "sadece şu 2 alanı ver" ihtiyacı için: her alan
// bir boyut olur, aktif seçimler (ör. is_currently_listing=1) uygulanmış haliyle döner.
// Kolon başlıkları = alan adları (qFallbackTitle). Sayfalı okur (10000 hücre/istek).
export async function fetchFieldsData(doc, fields, { maxRows = Infinity } = {}) {
  const so = await doc.createSessionObject({
    qInfo: { qType: "field-fetch" },
    qHyperCubeDef: {
      qDimensions: fields.map((f) => ({ qDef: { qFieldDefs: [f] } })),
      qInitialDataFetch: [],
    },
  });
  const layout = await so.getLayout();
  const hc = layout.qHyperCube;
  const totalRows = hc.qSize.qcy;
  const totalCols = hc.qSize.qcx;
  const columns = (hc.qDimensionInfo || []).map((d) => d.qFallbackTitle);
  const CELL_LIMIT = 10000;
  const rowsPerPage = Math.max(1, Math.floor(CELL_LIMIT / Math.max(1, totalCols)));
  const wanted = Math.min(totalRows, maxRows);
  const rows = [];
  let top = 0;
  while (top < wanted) {
    const height = Math.min(rowsPerPage, wanted - top);
    const pages = await so.getHyperCubeData("/qHyperCubeDef", [
      { qTop: top, qLeft: 0, qWidth: totalCols, qHeight: height },
    ]);
    const matrix = pages?.[0]?.qMatrix ?? [];
    if (matrix.length === 0) break;
    for (const r of matrix) rows.push(r.map((cell) => cell.qText));
    top += height;
  }
  try { await doc.destroySessionObject(layout.qInfo.qId); } catch (e) {}
  return { columns, totalRows, rows };
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
export const FIYAT_CAMPAIGN_VALIDUNTIL_FIELD = "campaign_valid_until"; // bugün-ve-sonrası filtresi
export const FIYAT_CATALOG_EXPIRE_FIELD = "catalog_expire_date"; // bugün-ve-sonrası filtresi

export async function readFiyatCatalog(doc, objectId) {
  await doc.clearAll(false);
  await selectExact(doc, FIYAT_LISTING_FIELD, "1");
  // Yalnız bugünden itibaren (dahil) geçerli katalog fiyatları — süresi geçmiş olanlar hariç.
  // Süre tarihi boş/NULL olanlar da hariç kalır (Qlik değer seçimi NULL'ı kapsamaz).
  await selectFieldFromToday(doc, FIYAT_CATALOG_EXPIRE_FIELD);
  return fetchObjectData(doc, objectId, { withNum: true });
}

export async function readFiyatCampaign(doc, objectId) {
  await doc.clearAll(false);
  await selectExact(doc, FIYAT_LISTING_FIELD, "1");
  await selectExact(doc, FIYAT_CAMPAIGN_STATUS_FIELD, "1");
  await selectExact(doc, FIYAT_CAMPAIGN_TYPE_FIELD, "İndirim");
  // Yalnız bugünden itibaren (dahil) geçerli kampanyalar — geçmiş kampanyalar hariç.
  // Geçerlilik tarihi boş/NULL olanlar da hariç kalır (Qlik değer seçimi NULL'ı kapsamaz).
  await selectFieldFromToday(doc, FIYAT_CAMPAIGN_VALIDUNTIL_FIELD);
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

// Bir TARİH alanında bugünden (dahil) geleceğe olan değerleri seçer.
// Qlik tarihleri qNum'da Excel seri numarası olarak tutulur; karşılaştırma onunla
// yapılır (format bağımsız, güvenilir). Tarihi olmayan (NULL/boş) satırlar HARİÇ kalır.
export async function selectFieldFromToday(doc, fieldName) {
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const now = new Date();
  const todaySerial = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EXCEL_EPOCH) / 86400000
  );

  const lb = await doc.createSessionObject({
    qInfo: { qType: "selbox" },
    qListObjectDef: {
      qDef: { qFieldDefs: [fieldName] },
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 10000 }],
    },
  });

  let qId = null;
  let selected = false;
  let matched = 0;
  let total = 0;
  try {
    const layout = await lb.getLayout();
    qId = layout.qInfo.qId;
    const lo = layout.qListObject;
    total = lo?.qSize?.qcy ?? 0;

    const elems = [];
    const collect = (matrix) => {
      for (const r of matrix) {
        const c = r[0];
        if (typeof c.qNum === "number" && Number.isFinite(c.qNum) && c.qNum >= todaySerial) {
          elems.push(c.qElemNumber);
        }
      }
    };

    let matrix = lo?.qDataPages?.[0]?.qMatrix || [];
    collect(matrix);
    let fetched = matrix.length;
    while (fetched < total) {
      const pages = await lb.getListObjectData("/qListObjectDef", [
        { qTop: fetched, qLeft: 0, qWidth: 1, qHeight: Math.min(10000, total - fetched) },
      ]);
      matrix = pages?.[0]?.qMatrix || [];
      if (!matrix.length) break;
      collect(matrix);
      fetched += matrix.length;
    }

    matched = elems.length;
    if (elems.length) {
      selected = await lb.selectListObjectValues("/qListObjectDef", elems, false);
    }
  } finally {
    if (qId) {
      try { await doc.destroySessionObject(qId); } catch (e) {}
    }
  }
  return { field: fieldName, todaySerial, total, matched, selected: Boolean(selected) };
}

// Bir tarih alanının EN YENİ değerini seçer (en güncel snapshot'ı sabitlemek için).
// Snapshot tabloları seçimsizken kararsız satır sayısı verebilir; bu, export'un
// getCustomerYoYFull'da yaptığı gibi tek bir (en yeni) load_date'e sabitler.
export async function selectLatestDate(doc, fieldName, max = 5000) {
  const fv = await getFieldValues(doc, fieldName, max);
  const parsed = (fv.values || [])
    .map((v) => ({ v, ms: Date.parse(v) }))
    .filter((x) => !Number.isNaN(x.ms))
    .sort((a, b) => a.ms - b.ms);
  const latest = parsed[parsed.length - 1];
  if (!latest) return { field: fieldName, value: null, selected: false };
  const sel = await selectExact(doc, fieldName, latest.v);
  return { field: fieldName, value: latest.v, selected: Boolean(sel.selected) };
}

// Bir SAYISAL alanda değeri threshold'dan BÜYÜK olan değerleri seçer (artımlı çekim).
// Yalnız o alanı (tek kolon) tarar; ağır tam-satır okumasını new satırlara indirger.
export async function selectFieldGreaterThan(doc, fieldName, threshold) {
  const lb = await doc.createSessionObject({
    qInfo: { qType: "selbox" },
    qListObjectDef: {
      qDef: { qFieldDefs: [fieldName] },
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 10000 }],
    },
  });

  let qId = null;
  let selected = false;
  let matched = 0;
  let total = 0;
  try {
    const layout = await lb.getLayout();
    qId = layout.qInfo.qId;
    const lo = layout.qListObject;
    total = lo?.qSize?.qcy ?? 0;

    const elems = [];
    const collect = (matrix) => {
      for (const r of matrix) {
        const c = r[0];
        if (typeof c.qNum === "number" && Number.isFinite(c.qNum) && c.qNum > threshold) {
          elems.push(c.qElemNumber);
        }
      }
    };

    let matrix = lo?.qDataPages?.[0]?.qMatrix || [];
    collect(matrix);
    let fetched = matrix.length;
    while (fetched < total) {
      const pages = await lb.getListObjectData("/qListObjectDef", [
        { qTop: fetched, qLeft: 0, qWidth: 1, qHeight: Math.min(10000, total - fetched) },
      ]);
      matrix = pages?.[0]?.qMatrix || [];
      if (!matrix.length) break;
      collect(matrix);
      fetched += matrix.length;
    }

    matched = elems.length;
    if (elems.length) {
      selected = await lb.selectListObjectValues("/qListObjectDef", elems, false);
    }
  } finally {
    if (qId) {
      try { await doc.destroySessionObject(qId); } catch (e) {}
    }
  }
  return { field: fieldName, threshold, total, matched, selected: Boolean(selected) };
}

// Bir alanda BİRDEN ÇOK değeri TEK seferde (additive) seçer. selectExact tek değeri
// replace ederdi; bu, bilinen bir küme (ör. onboarding provider_id'leri) için doğru yol.
// field.selectValues qFieldValues ile doğrudan değerle seçer (element no gerekmez).
export async function selectMultiple(doc, fieldName, values) {
  const uniq = [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
  if (!uniq.length) return { field: fieldName, count: 0, selected: false };
  const field = await doc.getField(fieldName);
  const qFieldValues = uniq.map((s) => {
    const n = Number(s);
    return Number.isFinite(n) && s !== "" ? { qText: s, qIsNumeric: true, qNumber: n } : { qText: s };
  });
  const selected = await field.selectValues({ qFieldValues, qToggleMode: false, qSoftLock: false });
  return { field: fieldName, count: uniq.length, selected: Boolean(selected) };
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
