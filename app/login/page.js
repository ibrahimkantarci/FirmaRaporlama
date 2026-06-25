import { signIn } from "@/auth";

export const runtime = "nodejs";

export default function LoginPage() {
  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Qlik &rarr; Google Sheets</p>
      <h1 className="title">Provider Aktarımı</h1>
      <p className="lede">Devam etmek için izinli bir Google hesabıyla giriş yap.</p>
      <div className="card">
        <form action={googleSignIn}>
          <button className="btn" type="submit" style={{ width: "100%", height: 46 }}>
            Google ile giriş yap
          </button>
        </form>
      </div>
    </main>
  );
}
