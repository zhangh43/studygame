import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">AF</div>
        <p className="eyebrow">Arcade Forge</p>
        <h1>Open your studio.</h1>
        <p className="muted">Create, refine, and publish small browser games.</p>
        <AuthForm mode="register" />
        <p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
