"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
    setError(result.error ?? "Could not create the game.");
    setBusy(false);
  }

  async function setPublished(game: GameSummary, publish: boolean) {
    setError("");
    const response = await fetch(`/api/games/${game.id}/publish`, { method: publish ? "POST" : "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not update publication.");
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
        <div><p className="eyebrow">Your workshop</p><h1>Welcome back, {displayName}.</h1><p className="muted">{games.length} {games.length === 1 ? "game" : "games"} · ★ {totalStars} community {totalStars === 1 ? "star" : "stars"}</p></div>
        <form className="new-game-form" onSubmit={createGame}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Name your next game" required />
          <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "New game"}</button>
        </form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {games.length === 0 ? (
        <div className="empty-state"><span>✦</span><h2>No games yet</h2><p>Give your first game a name, then describe what you want to play.</p></div>
      ) : (
        <div className="game-grid">
          {games.map((game) => (
            <article className="game-card" key={game.id}>
              <div className="game-thumb"><span>{game.title.slice(0, 2).toUpperCase()}</span></div>
              <div className="game-card-body">
                <div className="card-title-row"><h2>{game.title}</h2><span className={`status ${game.status}`}>{game.status}</span></div>
                <p>Draft revision {game.draftRevision}{game.publishedRevision !== null ? ` · Published ${game.publishedRevision}` : ""} · ★ {game.starCount}</p>
                <div className="card-actions">
                  <Link className="secondary-button" href={`/games/${game.id}`}>Open studio</Link>
                  {game.status === "published" ? (
                    <><Link className="text-link" href={`/play/${game.publicSlug}`}>Play</Link><button className="text-button" onClick={() => setPublished(game, false)}>Unpublish</button></>
                  ) : (
                    <button className="text-button" onClick={() => setPublished(game, true)}>Publish</button>
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
