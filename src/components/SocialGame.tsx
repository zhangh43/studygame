"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { translateApiError } from "@/lib/i18n";

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
  const { locale, t } = useI18n();
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
    else setError(translateApiError(locale, result.error, t("social.starError")));
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
    } else setError(translateApiError(locale, result.error, t("social.commentError")));
    setBusy(false);
  }

  return (
    <main className="play-layout">
      <section className="public-game-stage">
        <div className="public-game-heading">
          <div><p className="eyebrow">{t("social.game")}</p><h1>{game.title}</h1><p>{t("social.createdBy")} <Link href={`/creators/${game.creatorId}`}>{game.creatorName}</Link></p></div>
          <button className={`star-button ${game.viewerStarred ? "starred" : ""}`} disabled={busy} onClick={toggleStar}>★ {game.starCount}</button>
        </div>
        <div className="public-game-frame"><iframe src={`/g/${game.publicSlug}`} title={game.title} sandbox="allow-scripts" /></div>
      </section>
      <aside className="comments-panel">
        <div className="comments-heading"><h2>{t("social.comments")}</h2><span>{game.commentCount}</span></div>
        <form className="comment-form" onSubmit={addComment}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} placeholder={signedIn ? t("social.share") : t("social.signInComment")} disabled={busy || !signedIn} />
          <button className="primary-button" disabled={busy || !body.trim()}>{busy ? t("social.posting") : t("social.post")}</button>
        </form>
        {!signedIn && <p className="sign-in-note"><Link href="/login">{t("social.signIn")}</Link> {t("social.signInSuffix")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="comment-list">
          {comments.length === 0 ? <p className="muted">{t("social.noComments")}</p> : comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <div><Link href={`/creators/${comment.authorId}`}>{comment.authorName}</Link><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}</time></div>
              <p>{comment.body}</p>
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
}
