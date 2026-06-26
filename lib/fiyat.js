// Fiyat Tutarlılık — katalog vs kampanya fiyat eşleştirme/kıyas mantığı (saf fonksiyonlar).
// Excel verisiyle doğrulandı: birim (Kişi Başı/Paket) Intro'dan, eşleştirme provider_id + birim + para birimi.

// Bir tablodaki kolonu aday başlık listesinden bulur (dostça başlık VEYA alan adı).
export function findCol(columns, candidates) {
  const norm = (s) => String(s ?? "").trim().toLocaleLowerCase("tr");
  const cols = columns.map(norm);
  for (const cand of candidates) {
    const i = cols.indexOf(norm(cand));
    if (i >= 0) return i;
  }
  return -1;
}

// Metinden sayı (YEDEK — asıl güvenilir kaynak qNum). "1.234,56" TR, "1,234.56" US,
// "1.000" (binlik), "8,5" (ondalık), "0.95" (ondalık), "-" → null.
export function parseNum(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (t === "" || t === "-") return null;
  t = t.replace(/[^\d.,-]/g, "");
  if (t === "" || t === "-" || t === ".") return null;
  const hasC = t.includes(","), hasD = t.includes(".");
  if (hasC && hasD) {
    // son görülen ayraç ondalıktır.
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (hasC) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasD) {
    const dots = (t.match(/\./g) || []).length;
    const last = t.match(/\.(\d+)$/);
    // tek nokta + 1-2 hane → ondalık; aksi halde (çok nokta veya 3 hane) → binlik
    if (!(dots === 1 && last && last[1].length <= 2)) t = t.replace(/\./g, "");
  }
  const f = parseFloat(t);
  return Number.isFinite(f) ? f : null;
}

// Önce qNum (rowsNum), yoksa metinden parse — sayısal alanlar için güvenilir okuma.
function numCell(table, ri, ci, raw) {
  const n = table.rowsNum?.[ri]?.[ci];
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return parseNum(raw);
}

const lc = (s) => String(s ?? "").toLocaleLowerCase("tr");

// Birim: "kişi" geçiyorsa per-kişi, değilse paket (analizle doğrulandı: kişi medyan ~1.000, paket ~70.000).
function unitOfText(s) {
  return /ki[şs]i/.test(lc(s)) ? "kisi" : "paket";
}
// Kampanya birimi: Intro'da "kişi başı" → kisi; değilse paket.
function unitOfIntro(intro) {
  return /ki[şs]i\s*ba[şs]/.test(lc(intro)) ? "kisi" : "paket";
}

const COL = {
  cat: {
    provider: ["Provider Id", "catalog_provider_id"],
    unit: ["Option Type Name", "cat_item_opt_type"],
    price: ["Price", "catalog_price"],
    currency: ["Currency", "c_catalog_currency"],
    period: ["Price Period", "c_catalog_price_week_period"],
    isMain: ["Is Main", "is_catalog_main"],
    name: ["Catalog Name", "catalog_name"],
    category: ["Category", "provider_category_name"],
    providerName: ["Provider Name", "provider_name"],
    city: ["City", "city"],
  },
  camp: {
    provider: ["Provider ID", "provider_id"],
    type: ["Type", "campaign_type"],
    intro: ["Intro", "campaing_intro", "campaign_intro"],
    priceAfter: ["Price After", "campaign_price_after"],
    priceBefore: ["Price Before", "campaign_price_before"],
    currency: ["Currency", "campaing_currency", "campaign_currency"],
    category: ["Category", "provider_category_name"],
    campaignId: ["Campaign ID", "campaign_id"],
    providerName: ["Provider Name", "provider_name"],
    label: ["Label", "campaign_label"],
    city: ["City", "city"],
  },
};

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Katalog tablosundan provider→birim→paraBirimi→{prices, mainPrices} indeksi kurar.
function buildCatalogIndex(catalog) {
  const c = catalog.columns;
  const C = {};
  for (const k in COL.cat) C[k] = findCol(c, COL.cat[k]);
  const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);

  const idx = {};
  catalog.rows.forEach((r, ri) => {
    const price = numCell(catalog, ri, C.price, r[C.price]);
    if (price == null) return;
    const pid = String(r[C.provider] ?? "").trim();
    if (!pid) return;
    const unit = unitOfText(r[C.unit]);
    const cur = String(r[C.currency] ?? "").trim() || "?";
    const isMain = String(r[C.isMain] ?? "").trim() === "1";
    ((idx[pid] ||= {})[unit] ||= {})[cur] ||= { prices: [], mainPrices: [] };
    idx[pid][unit][cur].prices.push(price);
    if (isMain) idx[pid][unit][cur].mainPrices.push(price);
  });
  return { idx, C, missing };
}

function refsFrom(bucket) {
  if (!bucket || !bucket.prices.length) return null;
  return {
    min: Math.min(...bucket.prices),
    max: Math.max(...bucket.prices),
    median: median(bucket.prices),
    isMain: bucket.mainPrices.length ? median(bucket.mainPrices) : null,
    count: bucket.prices.length,
  };
}

// Ana fonksiyon: katalog + kampanya tablolarından kıyas satırları üretir.
export function buildComparison(catalog, campaign) {
  const { idx, missing: catMissing } = buildCatalogIndex(catalog);

  const c = campaign.columns;
  const M = {};
  for (const k in COL.camp) M[k] = findCol(c, COL.camp[k]);
  const campMissing = Object.entries(M).filter(([, i]) => i < 0).map(([k]) => k);

  const rows = [];
  campaign.rows.forEach((r, ri) => {
    const pid = String(r[M.provider] ?? "").trim();
    const intro = String(r[M.intro] ?? "");
    const type = String(r[M.type] ?? "").trim();
    const cur = String(r[M.currency] ?? "").trim() || "?";
    const priceAfter = numCell(campaign, ri, M.priceAfter, r[M.priceAfter]);
    const unit = unitOfIntro(intro);

    const ref = refsFrom(idx[pid]?.[unit]?.[cur]);

    let reason = null;
    if (priceAfter == null) reason = "Fiyat yok (Hediye/Taksit)";
    else if (!idx[pid]) reason = "Provider katalogda yok";
    else if (!ref) reason = "Aynı birim/para biriminde katalog fiyatı yok";

    rows.push({
      providerId: pid,
      providerName: String(r[M.providerName] ?? ""),
      category: String(r[M.category] ?? ""),
      city: String(r[M.city] ?? ""),
      campaignId: String(r[M.campaignId] ?? ""),
      type,
      label: String(r[M.label] ?? ""),
      intro,
      currency: cur,
      unit,
      priceBefore: numCell(campaign, ri, M.priceBefore, r[M.priceBefore]),
      priceAfter,
      ref, // { min, max, median, isMain, count } | null
      reason, // karşılaştırılamaz nedeni | null
    });
  });

  return { rows, catMissing, campMissing };
}

// Seçilen referans stratejisine göre tek satır kararı (client + server aynı mantık).
export function verdictFor(row, strategy = "max") {
  if (row.reason) return { verdict: "Karşılaştırılamaz", reason: row.reason, refValue: null };
  const R = row.ref ? row.ref[strategy] : null;
  if (R == null) return { verdict: "Karşılaştırılamaz", reason: "Referans fiyat yok", refValue: null };
  return {
    verdict: row.priceAfter < R ? "Tutarlı" : "Tutarsız",
    reason: null,
    refValue: R,
  };
}

export function summarize(rows, strategy = "max") {
  const s = { Tutarlı: 0, Tutarsız: 0, Karşılaştırılamaz: 0, total: rows.length };
  for (const r of rows) s[verdictFor(r, strategy).verdict]++;
  return s;
}

// Kıyas tablosunu sheet matrisine çevirir (varsayılan strateji ile karar + tüm referanslar).
export function kiyasMatrix(rows, strategy = "max") {
  const header = [
    "Provider Id", "Provider Adı", "Kategori", "Şehir", "Kampanya Id", "Tür", "Etiket",
    "Birim", "Para", "Fiyat Önce", "Fiyat Sonra",
    "Ref Min", "Ref Max", "Ref Medyan", "Ref Ana", "Ref Adet",
    `Sonuç (${strategy})`, "Neden", "Intro",
  ];
  const data = rows.map((r) => {
    const v = verdictFor(r, strategy);
    return [
      r.providerId, r.providerName, r.category, r.city, r.campaignId, r.type, r.label,
      r.unit, r.currency, r.priceBefore ?? "", r.priceAfter ?? "",
      r.ref?.min ?? "", r.ref?.max ?? "", r.ref?.median ?? "", r.ref?.isMain ?? "", r.ref?.count ?? "",
      v.verdict, v.reason ?? "", r.intro,
    ];
  });
  return [header, ...data];
}
