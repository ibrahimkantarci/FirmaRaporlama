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

// Kampanya dönemi: Intro'da "hafta sonu" → weekend, "hafta içi" → weekday,
// ikisi de varsa ya da hiçbiri yoksa → all (dönem ayrımı yok).
function periodOfIntro(intro) {
  const t = lc(intro);
  const wknd = /hafta\s*sonu|haftasonu/.test(t);
  const wkdy = /hafta\s*içi|haftaiçi/.test(t);
  if (wknd && wkdy) return "all";
  if (wknd) return "weekend";
  if (wkdy) return "weekday";
  return "all";
}
// Katalog dönemi: weekday/weekend; diğer her şey (all, "-", boş) → all.
function periodOfCatalog(s) {
  const t = lc(s).trim();
  if (t === "weekend" || t === "hafta sonu") return "weekend";
  if (t === "weekday" || t === "hafta içi") return "weekday";
  return "all";
}
// Kampanya dönemi katalog dönemiyle uyuşur mu? "all" kampanya her döneme uyar;
// weekend/weekday kampanya kendi dönemine VE dönem-bağımsız "all" kataloğa uyar.
function periodMatch(campP, catP) {
  if (campP === "all") return true;
  return catP === campP || catP === "all";
}

// --- Kademeli eşleşme: KALEM (menü adı) → TİP (Catalog Type) → REFERANS (birim havuzu) ---
// Seviye 1 — kalem: Intro'daki menü kalemi katalog adında geçerse o fiyatlar.
const ITEMS = [
  { key: "beyaz et", subs: ["beyaz et"] },
  { key: "kırmızı et", subs: ["kırmızı et", "kirmizi et"] },
  { key: "tavuk", subs: ["tavuk"] },
  { key: "ordövr", subs: ["ordövr", "ordovr"] },
  { key: "kokteyl", subs: ["kokteyl"] },
  { key: "pasta", subs: ["pasta"] },
  { key: "meşrubat", subs: ["meşrubat", "mesrubat"] },
];
function itemOfIntro(intro) {
  const t = lc(intro);
  for (const it of ITEMS) if (it.subs.some((s) => t.includes(s))) return it;
  return null;
}
function itemMatchesName(item, name) {
  const n = lc(name);
  return item.subs.some((s) => n.includes(s));
}
// Seviye 2 — tip: kokteyl / yemekli / salon.
function typeOfIntro(intro) {
  const t = lc(intro);
  const yem = /yemekli|beyaz et|kırmızı et|kirmizi et|tavuk|et men[uü]|her şey dahil|ordövr|ordovr/.test(t);
  const kok = t.includes("kokteyl");
  const sal = /salon kiralama|mekan kiralama|yemeksiz/.test(t);
  if (kok && !yem) return "kokteyl";
  if (yem && !kok) return "yemekli";
  if (sal) return "salon";
  return null; // karışık ya da belirsiz
}
function typeOfCatalog(catalogType) {
  const t = lc(catalogType);
  if (t.includes("kokteyl")) return "kokteyl";
  if (t.includes("yemekli")) return "yemekli";
  if (t.includes("salon") || t.includes("mekan")) return "salon";
  return "diger";
}
const TIER_LABEL = { kalem: "Kalem", tip: "Tip", referans: "Referans" };

const COL = {
  cat: {
    provider: ["Provider Id", "catalog_provider_id"],
    unit: ["Option Type Name", "cat_item_opt_type"],
    price: ["Price", "catalog_price"],
    currency: ["Currency", "c_catalog_currency"],
    period: ["Price Period", "c_catalog_price_week_period"],
    isMain: ["Is Main", "is_catalog_main"],
    name: ["Catalog Name", "catalog_name"],
    catalogType: ["Catalog Type", "catalog_type"],
    category: ["Category", "provider_category_name"],
    providerName: ["Provider Name", "provider_name"],
    city: ["City", "city"],
    responsiblePY: ["Responsible PY", "responsible_py", "Sorumlu PY"],
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

// Katalog tablosundan provider→birim→paraBirimi→[{price, period, isMain}] indeksi kurar.
function buildCatalogIndex(catalog) {
  const c = catalog.columns;
  const C = {};
  for (const k in COL.cat) C[k] = findCol(c, COL.cat[k]);
  const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);

  const idx = {};
  const pyByProvider = {}; // provider → Responsible PY (katalogdan)
  catalog.rows.forEach((r, ri) => {
    const pid = String(r[C.provider] ?? "").trim();
    if (pid && pyByProvider[pid] == null) {
      const py = String(r[C.responsiblePY] ?? "").trim();
      if (py) pyByProvider[pid] = py;
    }
    const price = numCell(catalog, ri, C.price, r[C.price]);
    if (price == null || !pid) return;
    const unit = unitOfText(r[C.unit]);
    const cur = String(r[C.currency] ?? "").trim() || "?";
    const isMain = String(r[C.isMain] ?? "").trim() === "1";
    const period = periodOfCatalog(r[C.period]);
    const name = lc(r[C.name]);
    const typeBucket = typeOfCatalog(r[C.catalogType]);
    (((idx[pid] ||= {})[unit] ||= {})[cur] ||= []).push({ price, period, isMain, name, typeBucket });
  });
  return { idx, pyByProvider, C, missing };
}

// Referansları kademeli eşleşmeyle hesaplar:
//   dönem süz (fallback all) → KALEM (menü adı) varsa onu, yoksa TİP varsa onu,
//   yoksa tüm birim havuzunu (REFERANS) kullan. Seçilen havuzdan min/max/medyan/ana.
function refsFrom(entries, campPeriod, campItem, campType) {
  if (!entries || !entries.length) return null;
  let pool = entries.filter((e) => periodMatch(campPeriod, e.period));
  if (!pool.length) pool = entries; // dönem eşleşmedi → tüm dönemler

  let tier = "referans";
  let sel = pool;
  if (campItem) {
    const byItem = pool.filter((e) => itemMatchesName(campItem, e.name));
    if (byItem.length) { sel = byItem; tier = "kalem"; }
  }
  if (tier === "referans" && campType) {
    const byType = pool.filter((e) => e.typeBucket === campType);
    if (byType.length) { sel = byType; tier = "tip"; }
  }

  const prices = sel.map((e) => e.price);
  const mains = sel.filter((e) => e.isMain).map((e) => e.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    median: median(prices),
    isMain: mains.length ? median(mains) : null,
    count: prices.length,
    tier,
  };
}

// Ana fonksiyon: katalog + kampanya tablolarından kıyas satırları üretir.
export function buildComparison(catalog, campaign) {
  const { idx, pyByProvider, missing: catMissing } = buildCatalogIndex(catalog);

  const c = campaign.columns;
  const M = {};
  for (const k in COL.camp) M[k] = findCol(c, COL.camp[k]);
  const campMissing = Object.entries(M).filter(([, i]) => i < 0).map(([k]) => k);

  const rows = [];
  campaign.rows.forEach((r, ri) => {
    const type = String(r[M.type] ?? "").trim();
    if (type && type !== "İndirim") return; // yalnız İndirim kampanyaları
    const pid = String(r[M.provider] ?? "").trim();
    const intro = String(r[M.intro] ?? "");
    const cur = String(r[M.currency] ?? "").trim() || "?";
    const priceAfter = numCell(campaign, ri, M.priceAfter, r[M.priceAfter]);
    const unit = unitOfIntro(intro);
    const period = periodOfIntro(intro);
    const item = itemOfIntro(intro);
    const ctype = typeOfIntro(intro);

    const ref = refsFrom(idx[pid]?.[unit]?.[cur], period, item, ctype);

    let reason = null;
    if (priceAfter == null) reason = "Fiyat yok (Hediye/Taksit)";
    else if (!idx[pid]) reason = "Provider katalogda yok";
    else if (!ref) reason = "Aynı birim/para biriminde katalog fiyatı yok";

    rows.push({
      providerId: pid,
      providerName: String(r[M.providerName] ?? ""),
      category: String(r[M.category] ?? ""),
      city: String(r[M.city] ?? ""),
      responsiblePY: pyByProvider[pid] || "",
      campaignId: String(r[M.campaignId] ?? ""),
      type,
      label: String(r[M.label] ?? ""),
      intro,
      currency: cur,
      unit,
      period, // weekend / weekday / all (Intro'dan)
      matchTier: ref ? TIER_LABEL[ref.tier] : "", // Kalem / Tip / Referans
      priceBefore: numCell(campaign, ri, M.priceBefore, r[M.priceBefore]),
      priceAfter,
      ref, // { min, max, median, isMain, count, tier } | null
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

const KIYAS_HEADER = [
  "Provider Id", "Provider Adı", "Kategori", "Şehir", "Sorumlu PY", "Kampanya Id", "Tür", "Etiket",
  "Birim", "Dönem", "Para", "Fiyat Önce", "Fiyat Sonra",
  "Ref Min", "Ref Max", "Ref Medyan", "Ref Ana", "Ref Adet", "Eşleşme",
  "Sonuç", "Neden", "Intro",
];

// Kaydedilmiş Kıyas sekmesini (meta + başlık + veri) tekrar satır nesnelerine çevirir.
// Böylece sayfa, yeniden çalıştırmadan mevcut veriyi gösterip stratejiyi canlı değiştirebilir.
export function parseKiyasSheet(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  let i = 0;
  let updatedAt = null, catalogRows = null, campaignRows = null;
  const first = values[0] || [];
  const metaGet = (pfx) => {
    const c = first.find((x) => String(x ?? "").startsWith(pfx));
    return c != null ? String(c).slice(pfx.length).trim() : null;
  };
  if (String(first[0] ?? "").startsWith("Güncelleme:")) {
    updatedAt = metaGet("Güncelleme:");
    catalogRows = parseNum(metaGet("Katalog satır:"));
    campaignRows = parseNum(metaGet("Kampanya satır:"));
    i = 1;
  }
  const header = values[i] || [];
  const H = {}; header.forEach((h, idx) => (H[String(h)] = idx));
  const at = (r, name) => r[H[name]];
  const pn = (v) => {
    if (v == null || v === "") return null;
    const f = Number(v);
    return Number.isFinite(f) ? f : null;
  };
  const rows = values.slice(i + 1).filter((r) => r && r.length).map((r) => {
    const ref = {
      min: pn(at(r, "Ref Min")), max: pn(at(r, "Ref Max")),
      median: pn(at(r, "Ref Medyan")), isMain: pn(at(r, "Ref Ana")),
      count: pn(at(r, "Ref Adet")),
    };
    return {
      providerId: String(at(r, "Provider Id") ?? ""),
      providerName: String(at(r, "Provider Adı") ?? ""),
      category: String(at(r, "Kategori") ?? ""),
      city: String(at(r, "Şehir") ?? ""),
      responsiblePY: String(at(r, "Sorumlu PY") ?? ""),
      campaignId: String(at(r, "Kampanya Id") ?? ""),
      type: String(at(r, "Tür") ?? ""),
      label: String(at(r, "Etiket") ?? ""),
      unit: String(at(r, "Birim") ?? ""),
      period: String(at(r, "Dönem") ?? ""),
      matchTier: String(at(r, "Eşleşme") ?? ""),
      currency: String(at(r, "Para") ?? ""),
      priceBefore: pn(at(r, "Fiyat Önce")),
      priceAfter: pn(at(r, "Fiyat Sonra")),
      ref: ref.count != null && ref.count > 0 ? ref : null,
      reason: String(at(r, "Neden") ?? "") || null,
      intro: String(at(r, "Intro") ?? ""),
    };
  });
  return { updatedAt, catalogRows, campaignRows, rows };
}

// Kıyas tablosunu sheet matrisine çevirir (varsayılan strateji ile karar + tüm referanslar).
export function kiyasMatrix(rows, strategy = "max") {
  const header = KIYAS_HEADER;
  const data = rows.map((r) => {
    const v = verdictFor(r, strategy);
    return [
      r.providerId, r.providerName, r.category, r.city, r.responsiblePY ?? "", r.campaignId, r.type, r.label,
      r.unit, r.period ?? "", r.currency, r.priceBefore ?? "", r.priceAfter ?? "",
      r.ref?.min ?? "", r.ref?.max ?? "", r.ref?.median ?? "", r.ref?.isMain ?? "", r.ref?.count ?? "", r.matchTier ?? "",
      v.verdict, v.reason ?? "", r.intro,
    ];
  });
  return [header, ...data];
}
