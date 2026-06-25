import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import ExportTool from "./export-tool";

export const runtime = "nodejs";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login"); // middleware'e ek emniyet kemeri

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          maxWidth: 640,
          margin: "0 auto",
          padding: "14px 20px 0",
          fontSize: 13,
          color: "#5b6675",
        }}
      >
        <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
          {session.user.email}
        </span>
        <form action={doSignOut}>
          <button
            type="submit"
            style={{
              border: "1px solid #e3e7ec",
              background: "#fff",
              color: "#5b6675",
              font: "inherit",
              fontSize: 12.5,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Çıkış
          </button>
        </form>
      </header>
      <ExportTool />
    </>
  );
}
