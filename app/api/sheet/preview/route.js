// app/api/sheet/preview/route.js
// Önizleme/düzenleme ekranını GOOGLE SHEET'ten besler (Qlik'e GİTMEZ).
// Müşteri ID → Sheet'teki en son blok → yapısal JSON (venue -> kategoriler).
// Veri akışı: Qlik → Sheets (export) → BURADA Sheet'ten okunur → düzenleme → pptx.
import { auth } from "@/auth";
import { readMatrixFromSheet, findCustomerBlock } from "../../../../lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Düzenleme ekranının ihtiyaç duyduğu sütun adları (Qlik preview ile aynı).
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

// US-stili sayı: virgül = binlik, nokta = ondalık → float (Qlik preview ile aynı).
function num(s) {
  const f = parseFloat(String(s ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(f) ? f : 0;
}

// Meta satırından ("Bu yıl: ...", "Gün farkı: ...") değer çeker.
function metaVal(meta, prefix) {
  const cell = (meta || []).find((c) => String(c ?? "").trim().startsWith(prefix));
  return cell ? String(cell).slice(prefix.length).trim() : null;
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

  try {
    const values = await readMatrixFromSheet();
    const block = findCustomerBlock(values, String(customerId));
    if (!block) {
      return Response.json({
        ok: false,
        error:
          "Bu müşteri Sheet'te bulunamadı. Önce 'Provider Aktarımı' ekranından bu müşteriyi aktar.",
      });
    }

    const { meta, header, rows } = block;
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

    // Eksik sütun kontrolü: boş olmalı; doluysa Sheet başlık adı düzeltilecek.
    const missing = Object.entries(C)
      .filter(([, i]) => i < 0)
      .map(([k]) => k);

    if (rows.length === 0) {
      return Response.json({
        ok: false,
        error: "Müşteri bloğu boş (veri satırı yok).",
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

    // Dönem bilgisi meta satırından gelir.
    const gapRaw = metaVal(meta, "Gün farkı:");

    return Response.json({
      ok: true,
      source: "sheet",
      customerId: String(customerId),
      coverName,
      thisDate: metaVal(meta, "Bu yıl:"),
      lastDate: metaVal(meta, "Geçen yıl:"),
      gapDays: gapRaw != null ? Number(gapRaw) : null,
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
