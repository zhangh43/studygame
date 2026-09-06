import Link from "next/link";

export type PublishedGameSummary = {
  id: string;
  title: string;
  publicSlug: string;
  creatorId: string;
  creatorName: string;
  starCount: number;
  commentCount: number;
  publishedAt: string;
};

export function PublishedGameCard({ game, rank }: { game: PublishedGameSummary; rank?: number }) {
  return (
    <article className="game-card community-card">
      <Link className="game-thumb" href={`/play/${game.publicSlug}`}>
        {rank && <b className="rank-badge">#{rank}</b>}
        <span>{game.title.slice(0, 2).toUpperCase()}</span>
        <i>Play now</i>
      </Link>
      <div className="game-card-body">
        <h2><Link href={`/play/${game.publicSlug}`}>{game.title}</Link></h2>
        <p>by <Link className="text-link" href={`/creators/${game.creatorId}`}>{game.creatorName}</Link></p>
        <div className="social-counts"><span>★ {game.starCount}</span><span>● {game.commentCount}</span></div>
      </div>
    </article>
  );
}
