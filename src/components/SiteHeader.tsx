import Link from "next/link";
import type { Session } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export function SiteHeader({ session }: { session: Session | null }) {
  return (
    <header className="topbar social-topbar">
      <Link className="site-brand" href="/discover"><span className="brand-mark small">AF</span><strong>Arcade Forge</strong></Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/discover">Discover</Link>
        <Link href="/leaderboards">Leaderboards</Link>
        {session && <Link href="/dashboard">My workshop</Link>}
      </nav>
      <div className="topbar-user">
        {session ? <><span>{session.displayName}</span><LogoutButton /></> : <><Link href="/login">Sign in</Link><Link className="primary-button compact" href="/register">Join</Link></>}
      </div>
    </header>
  );
}
