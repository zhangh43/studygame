"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError } from "@/lib/i18n";

export type GameSummary = {
  id: string;
  title: string;
  status: "draft" | "published";
  publicSlug: string;
  draftRevision: number;
  publishedRevision: number | null;
  starCount: number;
  updatedAt: string;
};

export function DashboardClient({ initialGames, displayName }: { initialGames: GameSummary[]; displayName: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [games, setGames] = useState(initialGames);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const totalStars = games.reduce((sum, game) => sum + game.starCount, 0);

  async function createGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const result = await response.json();
    if (response.ok) {
      router.push(`/games/${result.id}`);
      return;
    }
    setError(translateApiError(locale, result.error, t("dashboard.createError")));
    setBusy(false);
  }

  async function setPublished(game: GameSummary, publish: boolean) {
    setError("");
    const response = await fetch(`/api/games/${game.id}/publish`, { method: publish ? "POST" : "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(translateApiError(locale, result.error, t("dashboard.publishError")));
    setGames((current) => current.map((item) => item.id === game.id ? {
      ...item,
      status: publish ? "published" : "draft",
      publishedRevision: publish ? item.draftRevision : item.publishedRevision,
    } : item));
    router.refresh();
  }

  return (
    <section className="dashboard-content">
      <div className="dashboard-heading">
        <div><p className="eyebrow">{t("dashboard.eyebrow")}</p><h1>{t("dashboard.welcome", { name: displayName })}</h1><p className="muted">{t("dashboard.summary", { games: games.length, gameWord: t(games.length === 1 ? "dashboard.game" : "dashboard.games"), stars: totalStars, starWord: t(totalStars === 1 ? "dashboard.star" : "dashboard.stars") })}</p></div>
        <form className="new-game-form" onSubmit={createGame}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder={t("dashboard.nameGame")} required />
          <button className="primary-button" disabled={busy}>{busy ? t("dashboard.creating") : t("dashboard.newGame")}</button>
        </form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {games.length === 0 ? (
        <div className="empty-state"><span>✦</span><h2>{t("dashboard.emptyTitle")}</h2><p>{t("dashboard.emptyText")}</p></div>
      ) : (
        <div className="game-grid">
          {games.map((game) => (
            <article className="game-card" key={game.id}>
              <div className="game-thumb"><span>{game.title.slice(0, 2).toUpperCase()}</span></div>
              <div className="game-card-body">
                <div className="card-title-row"><h2>{game.title}</h2><span className={`status ${game.status}`}>{t(game.status === "published" ? "common.published" : "common.draft")}</span></div>
                <p>{t("dashboard.draftRevision", { revision: game.draftRevision })}{game.publishedRevision !== null ? ` · ${t("dashboard.publishedRevision", { revision: game.publishedRevision })}` : ""} · ★ {game.starCount}</p>
                <div className="card-actions">
                  <Link className="secondary-button" href={`/games/${game.id}`}>{t("dashboard.openStudio")}</Link>
                  {game.status === "published" ? (
                    <><Link className="text-link" href={`/play/${game.publicSlug}`}>{t("common.play")}</Link><button className="text-button" onClick={() => setPublished(game, false)}>{t("common.unpublish")}</button></>
                  ) : (
                    <button className="text-button" onClick={() => setPublished(game, true)}>{t("common.publish")}</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
