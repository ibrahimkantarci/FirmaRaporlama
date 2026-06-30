"use server";
// Ortak sunucu aksiyonları (server actions). Tek yerde tanımlanır, her sayfa kullanır.
import { signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
