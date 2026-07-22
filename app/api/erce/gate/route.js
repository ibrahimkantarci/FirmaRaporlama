// app/api/erce/gate/route.js
// /erce parola kapısı. Parola sunucuda scrypt ile doğrulanır; hash asla client'a
// gönderilmez. İlk kurulum (action:"set") yalnız parola HENÜZ belirlenmemişse
// mümkündür — böylece sonradan kimse üstüne yazamaz. Erişim withAccess("erce").
import crypto from "crypto";
import { withAccess } from "@/lib/api";
import { readGate, saveGate } from "@/lib/erce-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashPw(password, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

export const GET = withAccess("erce", async () => {
  const gate = await readGate();
  return Response.json({ ok: true, set: !!gate });
});

export const POST = withAccess("erce", async (request) => {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const action = body?.action;
  const password = body?.password;
  if (typeof password !== "string" || password.length < 1) {
    return Response.json({ ok: false, error: "Parola gerekli." }, { status: 400 });
  }

  const gate = await readGate();

  if (action === "set") {
    if (gate) return Response.json({ ok: false, error: "Parola zaten belirlenmiş." }, { status: 409 });
    if (password.length < 6) return Response.json({ ok: false, error: "En az 6 karakter." }, { status: 400 });
    const saltHex = crypto.randomBytes(16).toString("hex");
    await saveGate({ salt: saltHex, hash: hashPw(password, saltHex) });
    return Response.json({ ok: true, unlocked: true });
  }

  // action === "verify"
  if (!gate) return Response.json({ ok: false, error: "Parola henüz belirlenmemiş." }, { status: 409 });
  const candidate = hashPw(password, gate.salt);
  const match =
    candidate.length === gate.hash.length &&
    crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(gate.hash, "hex"));
  return Response.json({ ok: true, unlocked: match });
});
