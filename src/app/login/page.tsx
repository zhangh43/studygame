import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">AF</div>
        <p className="eyebrow">Arcade Forge</p>
        <h1>Continue building.</h1>
        <p className="muted">Sign in to your private game studio.</p>
        <AuthForm mode="login" />
        <p className="auth-switch">New here? <Link href="/register">Create a studio</Link></p>
      </section>
    </main>
  );
}
