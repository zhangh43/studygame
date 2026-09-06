"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export type PublicComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type PublicGame = {
  id: string;
  title: string;
  publicSlug: string;
  creatorId: string;
  creatorName: string;
  starCount: number;
  commentCount: number;
  viewerStarred: boolean;
};

export function SocialGame({ game: initialGame, initialComments, signedIn }: { game: PublicGame; initialComments: PublicComment[]; signedIn: boolean }) {
  const router = useRouter();
  const [game, setGame] = useState(initialGame);
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleStar() {
    if (!signedIn) { router.push("/login"); return; }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/social/games/${game.id}/star`, { method: game.viewerStarred ? "DELETE" : "POST" });
    const result = await response.json().catch(() => ({}));
    if (response.ok) setGame((current) => ({ ...current, viewerStarred: result.starred, starCount: result.starCount }));
    else setError(result.error ?? "Could not update your star.");
    setBusy(false);
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!signedIn) { router.push("/login"); return; }
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/social/games/${game.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setComments((current) => [result.comment, ...current]);
      setGame((current) => ({ ...current, commentCount: current.commentCount + 1 }));
      setBody("");
    } else setError(result.error ?? "Could not post your comment.");
    setBusy(false);
  }

  return (
    <main className="play-layout">
      <section className="public-game-stage">
        <div className="public-game-heading">
          <div><p className="eyebrow">Community game</p><h1>{game.title}</h1><p>Created by <Link href={`/creators/${game.creatorId}`}>{game.creatorName}</Link></p></div>
          <button className={`star-button ${game.viewerStarred ? "starred" : ""}`} disabled={busy} onClick={toggleStar}>★ {game.starCount}</button>
        </div>
        <div className="public-game-frame"><iframe src={`/g/${game.publicSlug}`} title={game.title} sandbox="allow-scripts" /></div>
      </section>
      <aside className="comments-panel">
        <div className="comments-heading"><h2>Comments</h2><span>{game.commentCount}</span></div>
        <form className="comment-form" onSubmit={addComment}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} placeholder={signedIn ? "Share a thought…" : "Sign in to comment"} disabled={busy || !signedIn} />
          <button className="primary-button" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post"}</button>
        </form>
        {!signedIn && <p className="sign-in-note"><Link href="/login">Sign in</Link> to star and comment.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="comment-list">
          {comments.length === 0 ? <p className="muted">No comments yet. Start the conversation.</p> : comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <div><Link href={`/creators/${comment.authorId}`}>{comment.authorName}</Link><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time></div>
              <p>{comment.body}</p>
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
}
