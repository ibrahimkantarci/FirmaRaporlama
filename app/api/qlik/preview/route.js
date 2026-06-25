// app/api/qlik/preview/route.js
// Önizleme/düzenleme ekranını besler: müşterinin YoY verisini Qlik'ten okur,
// matrisi yapısal JSON'a (venue -> kategoriler) çevirir. Auth korumalı.
import { auth } from "@/auth";
import { withQlikDoc, getCustomerYoYFull } from "../../../../lib/qlik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Düzenleme ekranının ihtiyaç duyduğu sütun adları (lib/qlik.js ile aynı mantık).
const NEED = {
  must: "Müşteri Adı",
  rci: "RÇİ Adı",
  kat: "Kategori Adı",
  urun: "Ürün Adı",
  sayfa: "Sayfa Ziyareti",
  teklif: "Teklif",
  donus: "Ortalama Dönüş Süresi (Saat)",
  profil: "Profil Puanı",
};

// US-stili sayı: virgül = binlik, nokta = ondalık → float.
function num(s) {
  const f = parseFloat(String(s ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(f) ? f : 0;
}

export async function POST(request) {
  // Auth (middleware'e ek güvenlik).
  const session = await auth();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let customerId;
  try {
    ({ customerId } = await request.json());
  } catch {
    customerId = null;
  }
  if (!customerId) {
    return Response.json({ ok: false, error: "customerId gerekli" }, { status: 400 });
  }

  const objectId = process.env.QLIK_OBJECT_ID;
  if (!objectId) {
    return Response.json({ ok: false, error: "QLIK_OBJECT_ID tanımlı değil" }, { status: 500 });
  }

  try {
    const res = await withQlikDoc(({ doc }) =>
      getCustomerYoYFull(doc, objectId, String(customerId))
    );

    const matrix = res.matrix || [];
    const header = matrix[1] || [];
    const rows = matrix.slice(2);

    const idx = (name) => header.indexOf(name);
    const C = {
      must: idx(NEED.must),
      rci: idx(NEED.rci),
      kat: idx(NEED.kat),
      urun: idx(NEED.urun),
      sayfa: idx(NEED.sayfa),
      teklif: idx(NEED.teklif),
      donus: idx(NEED.donus),
      profil: idx(NEED.profil),
      sayfaGy: idx(`${NEED.sayfa} (GY)`),
      teklifGy: idx(`${NEED.teklif} (GY)`),
      donusGy: idx(`${NEED.donus} (GY)`),
      profilGy: idx(`${NEED.profil} (GY)`),
    };

    // Eksik sütun kontrolü (hizalama hatası uyarısıyla aynı ruh):
    // boş olmalı; doluysa Sheet/Qlik etiket adı düzeltilecek.
    const missing = Object.entries(C)
      .filter(([, i]) => i < 0)
      .map(([k]) => k);

    if (!res.customerFound || rows.length === 0) {
      return Response.json({
        ok: false,
        error: "Müşteri bulunamadı veya satır yok.",
        customerFound: res.customerFound,
        missing,
      });
    }

    // Kapak adı: Müşteri Adı'nın ilk kelimesi.
    const mustFull = String(rows[0][C.must] ?? "");
    const coverName = mustFull.split(/\s+/)[0] || "Firma";

    // RÇİ Adı'na göre grupla, sırayı koru.
    const order = [];
    const map = new Map();
    for (const r of rows) {
      const v = String(r[C.rci] ?? "");
      if (!map.has(v)) {
        map.set(v, []);
        order.push(v);
      }
      map.get(v).push({
        urun: String(r[C.urun] ?? ""),
        kategori: String(r[C.kat] ?? ""),
        sayfa: num(r[C.sayfa]),
        teklif: num(r[C.teklif]),
        donus: num(r[C.donus]),
        profil: num(r[C.profil]),
        sayfaGy: num(r[C.sayfaGy]),
        teklifGy: num(r[C.teklifGy]),
        donusGy: num(r[C.donusGy]),
        profilGy: num(r[C.profilGy]),
      });
    }

    const venues = order.map((v) => ({
      rci: v,
      categories: map.get(v),
      bannerBullets: ["", "", ""], // statik nitelik maddeleri — kullanıcı doldurur
    }));

    return Response.json({
      ok: true,
      customerId: String(customerId),
      coverName,
      thisDate: res.currentDate,
      lastDate: res.lastYearUsedDate,
      gapDays: res.lastYearGapDays,
      venueCount: venues.length,
      missing,
      venues,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
